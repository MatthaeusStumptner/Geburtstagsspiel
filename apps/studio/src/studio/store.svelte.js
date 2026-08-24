import { createContentDocument, createLevelDocument, extractEmbeddedContentDocuments, tileKey, validateContentDocument, validateLevelDocument } from '@franz-lola/content-model';
import { catalogLevel, passauCatalog } from '../catalog.js';
import { DraftRepository } from '../draft-repository.js';
import { createStarterLevel, EditorState } from '../editor-state.js';
import { floodFillPoints, linePoints, moveRectangle, previewGuttis, rectangleContains, rectanglePoints, scaleRectangle, transformHandleAt } from '../editor-tools.js';
import { createFranzLolaAppearance } from '../character-template.js';
import { CharacterLibrary, characterPlacement, createBlankCharacterAsset } from '../character-library.js';
import { DEFAULT_OBJECT_ASSETS, ObjectLibrary, applyAssetToPlacement, createBlankObjectAsset, overridePlacementValue, placementFromAsset, recolorAppearance } from '../object-library.js';
import { chooseSceneCandidate, sceneCandidatesAt, sceneEntity, sceneGroups as buildSceneGroups, sceneSelectionKey, selectionContext as buildSelectionContext } from '../scene-model.js';
import { migrateLegacyLevel } from '../level-migrations.js';
import { planCloudDraftAdoption } from '../cloud-draft-policy.js';
import { StudioHistory } from './history.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const slug = (value, fallback = 'eintrag') => String(value || fallback)
  .normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/ß/g, 'ss')
  .toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;

function getAt(root, path) {
  return path.reduce((value, key) => value?.[key], root);
}

function setAt(root, path, value) {
  const parent = path.slice(0, -1).reduce((entry, key) => entry[key], root);
  parent[path.at(-1)] = value;
}

function actorScale(actor) {
  return Math.max(0.5, Math.min(4, Number(actor?.scale) || 1));
}

function characterRectangle(actor) {
  const scale = actorScale(actor);
  return actor ? { x: actor.x + (1 - scale) / 2, y: actor.y + (1 - scale) / 2, width: scale, height: scale } : null;
}

function uniqueId(baseValue, existing = new Set()) {
  const base = slug(baseValue);
  let candidate = base; let suffix = 2;
  while (existing.has(candidate)) { candidate = `${base}-${suffix}`; suffix += 1; }
  return candidate;
}

export class StudioState {
  workspace = $state('level');
  level = $state.raw(null);
  selection = $state.raw(null);
  selections = $state.raw([]);
  hiddenSceneNodes = $state.raw(new Set());
  sceneRevision = $state(0);
  selectionRevision = $state(0);
  tool = $state('select');
  difficulty = $state('easy');
  showGrid = $state(true);
  showGuttis = $state(true);
  showEvents = $state(true);
  viewportZoom = $state(1);
  viewportCenter = $state.raw({ x: 12.5, y: 12.5 });
  cursor = $state.raw(null);
  cursorCopy = $state('Feld —');
  saveStatus = $state('GESPEICHERT');
  toast = $state('');
  assets = $state.raw([]);
  assetCatalogReady = $state(false);
  selectedAssetId = $state('music-note');
  characterAssets = $state.raw([]);
  selectedCharacterId = $state('');
  selectedEventId = $state('');
  selectedCutsceneId = $state('');
  selectedTrackId = $state('');
  selectedKeyframeId = $state('');
  language = $state('standard');
  revision = $state(0);
  cloudStatus = $state('local');
  cloudDrafts = $state.raw([]);
  cloudItems = $state.raw([]);
  cloudUser = $state.raw(null);
  cloudError = $state('');
  levelSync = $state.raw({ baseRevision: null, dirty: false, source: 'legacy' });
  historyRevision = $state(0);

  validation = $derived.by(() => this.level ? validateLevelDocument(this.level) : { ok: false, errors: [], warnings: [], metrics: {} });
  pellets = $derived.by(() => this.level ? previewGuttis(this.level, this.difficulty) : new Set());
  canUndo = $derived(this.historyRevision >= 0 && Boolean(this.history?.canUndo));
  canRedo = $derived(this.historyRevision >= 0 && Boolean(this.history?.canRedo));
  selectedAsset = $derived.by(() => this.assets.find((asset) => asset.id === this.selectedAssetId) ?? this.assets[0] ?? null);
  selectedCharacterAsset = $derived.by(() => this.characterAssets.find((asset) => asset.id === this.selectedCharacterId) ?? null);
  selectedEvent = $derived.by(() => this.level?.events.find((event) => event.id === this.selectedEventId) ?? null);
  selectedCutscene = $derived.by(() => this.level?.cutscenes.find((cutscene) => cutscene.id === this.selectedCutsceneId) ?? null);
  selectionCount = $derived.by(() => this.selections.length);
  editorLevel = $derived.by(() => {
    this.sceneRevision;
    if (!this.level) return null;
    const visible = (kind, item, index) => !this.hiddenSceneNodes.has(sceneSelectionKey(this.level, { kind, index }));
    return {
      ...this.level,
      actors: {
        ...this.level.actors,
        cats: this.level.actors.cats.filter((item, index) => visible('cat', item, index)),
        characters: (this.level.actors.characters ?? []).filter((item, index) => visible('character', item, index)),
      },
      decorations: this.level.decorations.filter((item, index) => visible('decoration', item, index)),
      events: this.level.events.filter((item, index) => visible('event', item, index)),
    };
  });
  selectedTrack = $derived.by(() => this.selectedCutscene?.tracks.find((track) => track.id === this.selectedTrackId) ?? null);
  selectedKeyframe = $derived.by(() => this.selectedTrack?.keyframes.find((frame) => frame.id === this.selectedKeyframeId) ?? null);

  constructor({ storage = globalThis.localStorage } = {}) {
    this.drafts = new DraftRepository(storage);
    this.library = new ObjectLibrary(storage);
    this.assetCatalog = Promise.resolve()
      .then(() => this.library.list())
      .then((assets) => { this.assets = assets; }, () => { this.assets = []; })
      .finally(() => { this.assetCatalogReady = true; });
    this.characterLibrary = new CharacterLibrary(storage);
    this.characterAssets = this.characterLibrary.list();
    this.history = new StudioHistory();
    const activeDraft = this.drafts.activeEntry();
    this.engine = new EditorState(activeDraft?.level ?? createStarterLevel());
    this.levelSync = activeDraft?.sync ?? { baseRevision: null, dirty: false, source: 'legacy' };
    this.level = this.engine.toDocument();
    this.viewportCenter = { x: this.level.board.columns / 2, y: this.level.board.rows / 2 };
    this.selectedEventId = this.level.events[0]?.id ?? '';
    this.selectedCutsceneId = this.level.cutscenes[0]?.id ?? '';
    this.saveTimer = null;
    this.cloudSaveTimer = null;
    this.cloudPublisher = null;
    this.cloudRevisions = new Map();
    this.cloudHashes = new Map();
    this.cloudBlocked = new Set();
    this.cloudContentRevisions = new Map();
    this.cloudContentHashes = new Map();
    this.cloudContentBlocked = new Set();
    this.cloudContentOverrides = new Map();
    this.contentSaveTimers = new Map();
    this.cloudQueue = Promise.resolve();
    this.toastTimer = null;
    this.gesture = null;
    this.historySuppressed = false;
  }

  sync({ save = true, preserveSelection = true, cloud = true, markDirty = save } = {}) {
    this.level = this.engine.toDocument();
    if (!preserveSelection || this.engine.selected) {
      this.selection = clone(this.engine.selected);
      this.selections = this.selection ? [clone(this.selection)] : [];
    }
    if (!this.level.events.some((event) => event.id === this.selectedEventId)) this.selectedEventId = this.level.events[0]?.id ?? '';
    if (!this.level.cutscenes.some((cutscene) => cutscene.id === this.selectedCutsceneId)) this.selectedCutsceneId = this.level.cutscenes[0]?.id ?? '';
    this.revision += 1;
    if (markDirty) this.levelSync = { ...this.levelSync, dirty: true, source: 'local' };
    if (markDirty) this.cloudContentOverrides.clear();
    if (save) this.scheduleSave({ cloud });
  }

  scheduleSave({ cloud = true } = {}) {
    this.saveStatus = 'SPEICHERT …';
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.drafts.save(this.engine.toDocument(), { sync: this.levelSync });
      this.saveStatus = this.cloudPublisher ? 'LOKAL GESPEICHERT' : 'GESPEICHERT';
    }, 180);
    if (cloud && this.cloudPublisher && !this.cloudBlocked.has(this.level.id)) {
      clearTimeout(this.cloudSaveTimer);
      this.cloudSaveTimer = setTimeout(() => {
        const level = this.engine.toDocument();
        this.cloudQueue = this.cloudQueue.then(() => this.saveLevelToCloud(level)).catch(() => null);
      }, 900);
    }
  }

  notify(message) {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toast = ''; }, 2800);
  }

  studioSnapshot() {
    return {
      level: this.engine.toDocument(),
      objects: this.library.readCustom(),
      characters: this.characterLibrary.list(),
      selection: clone(this.selection),
      selections: clone(this.selections),
      selectedAssetId: this.selectedAssetId,
      selectedCharacterId: this.selectedCharacterId,
      selectedEventId: this.selectedEventId,
      selectedCutsceneId: this.selectedCutsceneId,
      selectedTrackId: this.selectedTrackId,
      selectedKeyframeId: this.selectedKeyframeId,
    };
  }

  recordStudioChange(label, before, { key = '', coalesce } = {}) {
    const context = this.selection ? `${this.selection.kind}:${this.selection.index}` : this.selectedAssetId || this.selectedCharacterId || this.selectedEventId || this.selectedCutsceneId || 'document';
    const shouldCoalesce = coalesce ?? /(bearbeiten|eigenschaft|aktualisieren|farbe|tempo|grÃ¶ÃŸe|name|beschreibung)/i.test(label);
    if (this.history.record(label, before, this.studioSnapshot(), { key: key || `${label}:${context}`, coalesce: shouldCoalesce })) this.historyRevision += 1;
  }

  restoreStudioSnapshot(snapshot) {
    if (!snapshot?.level) return false;
    this.library.replaceCustom(snapshot.objects);
    this.characterLibrary.replace(snapshot.characters);
    this.assets = this.library.list();
    this.characterAssets = this.characterLibrary.list();
    this.engine = new EditorState(createLevelDocument(migrateLegacyLevel(snapshot.level)));
    this.level = this.engine.toDocument();
    this.selection = clone(snapshot.selection);
    this.selections = clone(snapshot.selections ?? (snapshot.selection ? [snapshot.selection] : []));
    this.selectedAssetId = this.assets.some((entry) => entry.id === snapshot.selectedAssetId) ? snapshot.selectedAssetId : this.assets[0]?.id ?? '';
    this.selectedCharacterId = this.characterAssets.some((entry) => entry.id === snapshot.selectedCharacterId) ? snapshot.selectedCharacterId : '';
    this.selectedEventId = this.level.events.some((entry) => entry.id === snapshot.selectedEventId) ? snapshot.selectedEventId : this.level.events[0]?.id ?? '';
    this.selectedCutsceneId = this.level.cutscenes.some((entry) => entry.id === snapshot.selectedCutsceneId) ? snapshot.selectedCutsceneId : this.level.cutscenes[0]?.id ?? '';
    this.selectedTrackId = this.selectedCutscene?.tracks.some((entry) => entry.id === snapshot.selectedTrackId) ? snapshot.selectedTrackId : this.selectedCutscene?.tracks[0]?.id ?? '';
    this.selectedKeyframeId = this.selectedTrack?.keyframes.some((entry) => entry.id === snapshot.selectedKeyframeId) ? snapshot.selectedKeyframeId : this.selectedTrack?.keyframes[0]?.id ?? '';
    this.revision += 1;
    this.selectionRevision += 1;
    this.scheduleSave();
    return true;
  }

  mutate(label, mutator, options) {
    const before = this.historySuppressed ? null : this.studioSnapshot();
    this.engine.mutate(label, mutator);
    this.sync(options);
    if (before) this.recordStudioChange(label, before);
  }

  update(path, value, label = 'Eigenschaft ändern') {
    if (value === undefined) return;
    this.mutate(label, (draft) => setAt(draft.document, path, value), { preserveSelection: true });
  }

  value(path) { return getAt(this.level, path); }

  load(level, message = 'Level geladen', { cloud = false, sync = { baseRevision: null, dirty: false, source: 'local' } } = {}) {
    this.engine = new EditorState(createLevelDocument(migrateLegacyLevel(level)));
    this.selection = null;
    this.selections = [];
    this.hiddenSceneNodes = new Set();
    this.sceneRevision += 1;
    this.selectedEventId = this.engine.document.events[0]?.id ?? '';
    this.selectedCutsceneId = this.engine.document.cutscenes[0]?.id ?? '';
    this.selectedTrackId = '';
    this.selectedKeyframeId = '';
    this.levelSync = sync;
    this.viewportZoom = 1;
    this.viewportCenter = { x: this.engine.document.board.columns / 2, y: this.engine.document.board.rows / 2 };
    this.history.clear();
    this.historyRevision += 1;
    this.sync({ cloud, markDirty: false });
    this.notify(message);
  }

  newLevel() { this.load(createStarterLevel(), 'Neues Level angelegt'); }
  loadTemplate(id) { const level = catalogLevel(id); if (level) this.load(level, `${level.name.standard} geladen`); }
  loadDraft(id) { const entry = this.drafts.entry(id); if (entry) this.load(entry.level, 'Entwurf geladen', { sync: entry.sync }); }

  async enableCloudDrafts(publisher, user = null) {
    this.cloudPublisher = publisher;
    this.cloudUser = user;
    this.cloudStatus = 'connecting';
    this.cloudError = '';
    try {
      const result = await publisher.bootstrapDrafts();
      this.applyCloudDraftList(result.drafts ?? []);
      const contentResult = await publisher.bootstrapContent();
      this.applyCloudContentList(contentResult.items ?? []);
      const current = this.cloudDrafts.find((draft) => draft.id === this.level.id);
      if (current) {
        const remote = await publisher.draft(current.id);
        this.cloudRevisions.set(remote.id, remote.revision);
        this.cloudHashes.set(remote.id, JSON.stringify(remote.level));
        const adoption = planCloudDraftAdoption(this.level, remote, this.levelSync);
        const backup = adoption.preserveLocalBackup ? this.saveLocalConflictBackup(this.level) : null;
        this.cloudBlocked.delete(remote.id);
        this.load(adoption.level, backup
          ? `Gemeinsamer Stand geladen · ${backup.name} bleibt als lokale Sicherung erhalten`
          : `Gemeinsamer Stand automatisch übernommen · Revision ${remote.revision}`, {
          cloud: false,
          sync: adoption.sync,
        });
      }
      this.cloudStatus = 'shared';
      return this.cloudDrafts;
    } catch (error) {
      this.cloudStatus = 'offline';
      this.cloudError = error.message;
      throw error;
    }
  }

  disableCloudDrafts() {
    clearTimeout(this.cloudSaveTimer);
    this.contentSaveTimers.forEach((timer) => clearTimeout(timer));
    this.contentSaveTimers.clear();
    this.cloudPublisher = null;
    this.cloudUser = null;
    this.cloudStatus = 'local';
    this.cloudError = '';
  }

  applyCloudContentList(items) {
    this.cloudItems = items;
    items.forEach((item) => {
      const key = `${item.type}:${item.id}`;
      this.cloudContentRevisions.set(key, item.revision);
      if (item.content) this.cloudContentHashes.set(key, JSON.stringify(item.content));
      if (!['character', 'object'].includes(item.type) || !item.content?.document) return;
      const library = item.type === 'character' ? this.characterLibrary : this.library;
      const localEntries = item.type === 'character' ? library.list() : library.readCustom();
      const local = localEntries.find((entry) => entry.id === item.id);
      if (!local) library.save(item.content.document);
      else if (JSON.stringify(createContentDocument(item.type, local)) !== JSON.stringify(item.content)) {
        library.save({ ...local, id: `${item.id}-lokale-kopie`, name: `${local.name} · lokale Kopie` });
        library.save(item.content.document);
        this.notify(`${item.name}: Cloud-Stand geladen · lokale Variante als Kopie erhalten`);
      }
    });
    this.assets = this.library.list();
    this.characterAssets = this.characterLibrary.list();
    this.revision += 1;
  }

  adoptUnknownCloudContentBaselines(items) {
    let changed = false;
    items.forEach((item) => {
      const key = `${item.type}:${item.id}`;
      if (this.cloudContentRevisions.has(key) && this.cloudContentHashes.has(key)) return;
      this.cloudContentRevisions.set(key, item.revision);
      if (item.content) this.cloudContentHashes.set(key, JSON.stringify(item.content));
      this.cloudContentBlocked.delete(key);
      this.cloudItems = [item, ...this.cloudItems.filter((entry) => `${entry.type}:${entry.id}` !== key)];
      changed = true;
    });
    if (changed) this.revision += 1;
  }

  applyCloudDraftList(drafts) {
    this.cloudDrafts = drafts;
    drafts.forEach((draft) => this.cloudRevisions.set(draft.id, draft.revision));
    this.revision += 1;
  }

  async refreshCloudDrafts() {
    if (!this.cloudPublisher) return [];
    const result = await this.cloudPublisher.listDrafts();
    this.applyCloudDraftList(result.drafts ?? []);
    this.cloudStatus = 'shared';
    return this.cloudDrafts;
  }

  cloudDraftsList() { return this.cloudDrafts; }
  hasCloudConflict(id = this.level?.id) { return Boolean(id && this.cloudBlocked.has(id)); }
  hasCloudContentConflict(type, id) { return this.cloudContentBlocked.has(`${type}:${id}`); }

  saveLocalConflictBackup(level = this.level) {
    const taken = new Set(this.drafts.list().map((entry) => entry.id));
    const base = `${String(level.id || 'level').slice(0, 42)}-lokale-sicherung`;
    let id = base; let suffix = 2;
    while (taken.has(id)) { id = `${base.slice(0, 60 - String(suffix).length)}-${suffix}`; suffix += 1; }
    const backup = clone(level);
    const standardName = backup.name.standard;
    const dialectName = backup.name.dialect || standardName;
    backup.id = id;
    backup.name.standard = `${standardName} · lokale Sicherung`;
    backup.name.dialect = `${dialectName} · lokale Sicherung`;
    this.drafts.save(backup, { activate: false });
    this.revision += 1;
    return { id, name: backup.name.standard };
  }

  async resolveCloudConflict(strategy) {
    if (!this.cloudPublisher) throw new Error('Bitte zuerst mit GitHub verbinden.');
    const id = this.level.id;
    if (!this.cloudBlocked.has(id)) return { resolved: false, strategy };
    if (!['remote', 'local'].includes(strategy)) throw new Error('Unbekannte Konfliktauflösung.');
    clearTimeout(this.cloudSaveTimer);
    clearTimeout(this.saveTimer);
    const local = clone(this.level);
    const remote = await this.cloudPublisher.draft(id);
    this.cloudRevisions.set(id, remote.revision);
    this.cloudHashes.set(id, JSON.stringify(remote.level));

    if (strategy === 'remote') {
      const backup = this.saveLocalConflictBackup(local);
      this.cloudBlocked.delete(id);
      this.cloudStatus = 'shared';
      this.cloudError = '';
      this.load(remote.level, `Gemeinsamer Stand geladen · ${backup.name} bleibt auf diesem Gerät`, {
        sync: { baseRevision: remote.revision, dirty: false, source: 'cloud' },
      });
      return { resolved: true, strategy, revision: remote.revision, backup };
    }

    this.cloudBlocked.delete(id);
    this.cloudStatus = 'syncing';
    this.cloudError = '';
    try {
      const saved = await this.saveLevelToCloud(local);
      this.notify(`Deine Fassung ist jetzt gemeinsamer Stand · Revision ${saved.revision}`);
      return { resolved: true, strategy, revision: saved.revision };
    } catch (error) {
      if (!this.cloudBlocked.has(id)) this.cloudBlocked.add(id);
      this.cloudStatus = 'conflict';
      throw error;
    }
  }

  async loadCloudDraft(id) {
    if (!this.cloudPublisher) return false;
    const remote = await this.cloudPublisher.draft(id);
    this.cloudRevisions.set(remote.id, remote.revision);
    this.cloudHashes.set(remote.id, JSON.stringify(remote.level));
    this.cloudBlocked.delete(remote.id);
    this.cloudStatus = 'shared';
    this.cloudError = '';
    this.load(remote.level, `Gemeinsamer Entwurf · Revision ${remote.revision}`, {
      sync: { baseRevision: remote.revision, dirty: false, source: 'cloud' },
    });
    return true;
  }

  async deleteCloudDraft(id) {
    if (!this.cloudPublisher) return false;
    const revision = this.cloudRevisions.get(id);
    if (!Number.isInteger(revision)) throw new Error('Die Revision des gemeinsamen Entwurfs ist unbekannt. Bitte aktualisieren.');
    await this.cloudPublisher.deleteDraft(id, revision);
    this.cloudRevisions.delete(id);
    this.cloudHashes.delete(id);
    this.cloudBlocked.delete(id);
    await this.refreshCloudDrafts();
    this.notify('Gemeinsamer Entwurf gelöscht · lokale Kopien bleiben erhalten');
    return true;
  }

  async saveLevelToCloud(level) {
    if (!this.cloudPublisher) throw new Error('Bitte zuerst mit GitHub verbinden.');
    if (this.cloudBlocked.has(level.id)) throw new Error('Dieser Entwurf hat einen ungelösten Versionskonflikt. Entscheide unter „Live“, welche Fassung gelten soll.');
    const hash = JSON.stringify(level);
    if (this.cloudHashes.get(level.id) === hash) {
      const sync = { baseRevision: this.cloudRevisions.get(level.id) ?? null, dirty: false, source: 'cloud' };
      if (level.id === this.level.id) this.levelSync = sync;
      this.drafts.save(level, { activate: level.id === this.level.id, sync });
      return { id: level.id, revision: this.cloudRevisions.get(level.id) };
    }
    this.cloudStatus = 'syncing';
    try {
      const saved = await this.cloudPublisher.saveDraft(level, this.cloudRevisions.get(level.id) ?? 0);
      this.cloudRevisions.set(saved.id, saved.revision);
      this.cloudHashes.set(saved.id, JSON.stringify(saved.level));
      this.cloudDrafts = [saved, ...this.cloudDrafts.filter((draft) => draft.id !== saved.id)];
      this.cloudStatus = 'shared';
      this.cloudError = '';
      this.saveStatus = 'CLOUD GESPEICHERT';
      const sync = { baseRevision: saved.revision, dirty: false, source: 'cloud' };
      if (saved.id === this.level.id) this.levelSync = sync;
      this.drafts.save(saved.level, { activate: saved.id === this.level.id, sync });
      this.revision += 1;
      return { id: saved.id, revision: saved.revision };
    } catch (error) {
      if (error.status === 409) {
        this.cloudBlocked.add(level.id);
        if (error.current?.revision) this.cloudRevisions.set(level.id, error.current.revision);
        this.cloudStatus = 'conflict';
        this.cloudError = error.message;
        this.saveStatus = 'VERSIONSKONFLIKT';
        this.notify('Cloud-Konflikt · bitte gemeinsamen Entwurf neu öffnen');
      } else {
        this.cloudStatus = 'offline';
        this.cloudError = error.message;
        this.saveStatus = 'LOKAL GESPEICHERT';
      }
      throw error;
    }
  }

  queueContentSave(type, asset) {
    if (!this.cloudPublisher) return;
    const content = createContentDocument(type, asset);
    const key = `${type}:${content.id}`;
    this.cloudContentOverrides.delete(key);
    if (this.cloudContentBlocked.has(key)) return;
    clearTimeout(this.contentSaveTimers.get(key));
    this.contentSaveTimers.set(key, setTimeout(() => {
      this.contentSaveTimers.delete(key);
      this.cloudQueue = this.cloudQueue.then(() => this.saveContentToCloud(content)).catch(() => null);
    }, 650));
  }

  async saveContentToCloud(content) {
    if (!this.cloudPublisher) throw new Error('Bitte zuerst mit GitHub verbinden.');
    const key = `${content.type}:${content.id}`;
    if (this.cloudContentBlocked.has(key)) throw new Error(`Der Inhalt ${key} hat einen ungelösten Versionskonflikt.`);
    const hash = JSON.stringify(content);
    if (this.cloudContentHashes.get(key) === hash) return { type: content.type, id: content.id, revision: this.cloudContentRevisions.get(key) };
    this.cloudStatus = 'syncing';
    try {
      const saved = await this.cloudPublisher.saveContent(content, this.cloudContentRevisions.get(key) ?? 0);
      this.cloudContentOverrides.delete(key);
      this.cloudContentRevisions.set(key, saved.revision);
      this.cloudContentHashes.set(key, JSON.stringify(saved.content));
      this.cloudItems = [saved, ...this.cloudItems.filter((item) => `${item.type}:${item.id}` !== key)];
      this.cloudStatus = 'shared';
      this.cloudError = '';
      this.saveStatus = 'CLOUD GESPEICHERT';
      this.revision += 1;
      return { type: saved.type, id: saved.id, revision: saved.revision };
    } catch (error) {
      if (error.status === 409) {
        this.cloudContentOverrides.delete(key);
        this.cloudContentBlocked.add(key);
        if (error.current?.revision) this.cloudContentRevisions.set(key, error.current.revision);
        this.cloudStatus = 'conflict';
        this.cloudError = error.message;
        this.saveStatus = 'VERSIONSKONFLIKT';
        this.notify(`Cloud-Konflikt bei ${content.name}`);
      } else {
        this.cloudStatus = 'offline';
        this.cloudError = error.message;
      }
      throw error;
    }
  }

  async resolveCloudContentConflict(strategy, input) {
    if (!this.cloudPublisher) throw new Error('Bitte zuerst mit GitHub verbinden.');
    if (!['remote', 'local'].includes(strategy)) throw new Error('Unbekannte Konfliktauflösung.');
    const validation = validateContentDocument(input);
    if (!validation.ok) throw new Error(validation.errors.join(' '));
    const local = validation.value;
    const key = `${local.type}:${local.id}`;
    if (!this.cloudContentBlocked.has(key)) return { resolved: false, strategy };
    clearTimeout(this.contentSaveTimers.get(key));
    this.contentSaveTimers.delete(key);
    const remote = await this.cloudPublisher.content(local.type, local.id);
    this.cloudContentRevisions.set(key, remote.revision);
    this.cloudContentHashes.set(key, JSON.stringify(remote.content));
    this.cloudItems = [remote, ...this.cloudItems.filter((item) => `${item.type}:${item.id}` !== key)];
    this.cloudContentBlocked.delete(key);

    if (strategy === 'remote') {
      this.cloudContentOverrides.set(key, remote);
      this.cloudStatus = this.cloudBlocked.size || this.cloudContentBlocked.size ? 'conflict' : 'shared';
      this.cloudError = '';
      this.revision += 1;
      this.notify(`${remote.name}: Cloud-Fassung für die Veröffentlichung gewählt`);
      return { resolved: true, strategy, revision: remote.revision };
    }

    try {
      this.cloudContentOverrides.delete(key);
      const saved = await this.saveContentToCloud(local);
      this.notify(`${local.name}: Arbeitsstand ist jetzt gemeinsame Revision ${saved.revision}`);
      return { resolved: true, strategy, revision: saved.revision };
    } catch (error) {
      this.cloudContentBlocked.add(key);
      this.cloudStatus = 'conflict';
      throw error;
    }
  }

  async prepareCloudPublication(candidates) {
    if (!this.cloudPublisher) throw new Error('Bitte zuerst mit GitHub verbinden.');
    clearTimeout(this.cloudSaveTimer);
    await this.cloudQueue;
    const contentResult = await this.cloudPublisher.bootstrapContent();
    this.adoptUnknownCloudContentBaselines(contentResult.items ?? []);
    const drafts = [];
    const items = [];
    for (const candidate of candidates) {
      if (candidate.type === 'level') drafts.push(await this.saveLevelToCloud(candidate.level));
      else if (candidate.cloudChoice === 'remote' && Number.isInteger(candidate.remoteRevision)) items.push({ type: candidate.type, id: candidate.id, revision: candidate.remoteRevision });
      else items.push(await this.saveContentToCloud(candidate.content));
    }
    return { drafts, items };
  }

  undo() {
    const entry = this.history.undo();
    if (entry && this.restoreStudioSnapshot(entry.snapshot)) {
      this.historyRevision += 1;
      this.notify(`RÃ¼ckgÃ¤ngig: ${entry.label}`);
    }
  }

  redo() {
    const entry = this.history.redo();
    if (entry && this.restoreStudioSnapshot(entry.snapshot)) {
      this.historyRevision += 1;
      this.notify(`Wiederholt: ${entry.label}`);
    }
  }

  setViewportZoom(value, focus = this.viewportCenter) {
    this.viewportZoom = Math.max(1, Math.min(6, Number(value) || 1));
    this.viewportCenter = {
      x: Math.max(0, Math.min(this.level.board.columns, Number(focus?.x) || this.level.board.columns / 2)),
      y: Math.max(0, Math.min(this.level.board.rows, Number(focus?.y) || this.level.board.rows / 2)),
    };
  }

  panViewport(dx, dy) {
    this.viewportCenter = {
      x: Math.max(0, Math.min(this.level.board.columns, this.viewportCenter.x + dx)),
      y: Math.max(0, Math.min(this.level.board.rows, this.viewportCenter.y + dy)),
    };
  }

  fitViewport() { this.setViewportZoom(1, { x: this.level.board.columns / 2, y: this.level.board.rows / 2 }); }

  setTool(tool) {
    this.tool = tool;
  }

  specialElementBounds(id) {
    const middle = this.level.board.columns / 2;
    if (id === 'stage-note') return { x: middle - 1, y: 7, width: 2, height: 2 };
    if (id === 'stage-lights') return { x: middle - 5, y: 5, width: 10, height: 7 };
    return null;
  }

  sceneGroups() { return buildSceneGroups(this.level); }
  sceneKey(kind, index) { return sceneSelectionKey(this.level, { kind, index }); }
  isSceneHidden(kind, index) { return this.hiddenSceneNodes.has(this.sceneKey(kind, index)); }
  isSelected(kind, index) { const key = this.sceneKey(kind, index); return this.selections.some((selection) => sceneSelectionKey(this.level, selection) === key); }

  clearSelection() {
    this.selection = null;
    this.selections = [];
    this.engine.selected = null;
    this.selectionRevision += 1;
  }

  selectAt(point, { cycle = false, additive = false, reveal = false } = {}) {
    const candidates = sceneCandidatesAt(this.level, point, { hidden: this.hiddenSceneNodes, themeBounds: (id) => this.specialElementBounds(id) });
    const selected = chooseSceneCandidate(this.level, candidates, this.selection, cycle);
    if (selected) this.selectEntity(selected.kind, selected.index, { additive, reveal });
    else if (!additive) this.clearSelection();
    return selected;
  }

  selectedEntity(selection = this.selection) { return sceneEntity(this.level, selection); }
  selectionContext(selection = this.selection) { return buildSelectionContext(this.level, selection); }

  selectEntity(kind, index, { additive = false, reveal = false } = {}) {
    const next = { kind, index };
    if (!this.selectedEntity(next)) return;
    const key = sceneSelectionKey(this.level, next);
    if (additive) {
      const existing = this.selections.findIndex((selection) => sceneSelectionKey(this.level, selection) === key);
      const selections = existing >= 0 ? this.selections.filter((_, selectionIndex) => selectionIndex !== existing) : [...this.selections, next];
      this.selections = selections.map(clone);
      this.selection = clone(selections.at(-1) ?? null);
    } else {
      this.selection = next;
      this.selections = [clone(next)];
    }
    this.engine.selected = this.selection && ['player', 'cat', 'character', 'decoration', 'wall'].includes(this.selection.kind) ? clone(this.selection) : null;
    if (kind === 'event') this.selectedEventId = this.level.events[index]?.id ?? '';
    this.selectionRevision += 1;
    if (reveal && !additive) this.revealSelection();
  }

  revealSelection() {
    const context = this.selectionContext();
    if (!context) return null;
    this.workspace = context.workspace;
    return context;
  }

  openSelectionWorkspace() { return this.revealSelection(); }

  showSelectionInLevel() {
    if (!this.selection) return;
    this.workspace = 'level';
    this.tool = 'select';
  }

  transformSelectedInLevel() {
    if (!this.selection || !['character', 'decoration'].includes(this.selection.kind)) return false;
    this.workspace = 'level';
    this.tool = 'transform';
    this.notify(this.selection.kind === 'character' ? 'Figur ziehen · Eckgriff skaliert sie' : 'Objekt ziehen · Eckgriff skaliert es');
    return true;
  }

  activateSelectionTool() {
    const context = this.selectionContext();
    if (!context?.primaryTool) return;
    this.workspace = context.primaryTool === 'transform' && context.selection.kind === 'character' ? 'level' : context.workspace;
    this.tool = context.primaryTool;
  }

  selectionLabel() {
    return this.selectionContext()?.label ?? '';
  }

  toggleSceneVisibility(kind, index) {
    if (kind === 'theme-element') return;
    const key = this.sceneKey(kind, index); const hidden = new Set(this.hiddenSceneNodes);
    if (hidden.has(key)) hidden.delete(key); else hidden.add(key);
    this.hiddenSceneNodes = hidden; this.sceneRevision += 1;
  }

  setSceneLocked(kind, index, locked) {
    if (kind !== 'decoration') return;
    const id = this.level.decorations[index]?.id; if (!id) return;
    this.mutate(locked ? 'Objekt sperren' : 'Objekt entsperren', (draft) => {
      const item = draft.document.decorations.find((entry) => entry.id === id); if (item) item.locked = locked;
    }, { preserveSelection: true });
  }

  moveSceneNode(kind, index, direction) {
    if (kind !== 'decoration') return;
    const item = this.level.decorations[index]; const target = Math.max(0, Math.min(this.level.decorations.length - 1, index + direction));
    if (!item || target === index) return;
    this.mutate(direction > 0 ? 'Objekt nach vorne' : 'Objekt nach hinten', (draft) => {
      const current = draft.document.decorations.findIndex((entry) => entry.id === item.id);
      const [moved] = draft.document.decorations.splice(current, 1); draft.document.decorations.splice(target, 0, moved);
    }, { preserveSelection: true });
    const nextIndex = this.level.decorations.findIndex((entry) => entry.id === item.id);
    this.selectEntity('decoration', nextIndex);
  }

  transformSelection() {
    if (this.selection?.kind === 'character') return characterRectangle(this.level.actors.characters?.[this.selection.index]);
    if (this.selection?.kind === 'decoration') {
      const item = this.level.decorations[this.selection.index];
      return item ? { x: item.x, y: item.y, width: item.width, height: item.height } : null;
    }
    return null;
  }

  decorationAt(point) {
    for (let index = this.level.decorations.length - 1; index >= 0; index -= 1) {
      if (rectangleContains(this.level.decorations[index], point)) return index;
    }
    return -1;
  }

  characterAt(point) {
    for (let index = (this.level.actors.characters?.length ?? 0) - 1; index >= 0; index -= 1) {
      if (rectangleContains(characterRectangle(this.level.actors.characters[index]), point)) return index;
    }
    return -1;
  }

  beginTransform(point, pointerId) {
    const before = this.studioSnapshot();
    let kind = ['character', 'decoration'].includes(this.selection?.kind) ? this.selection.kind : '';
    let index = kind ? this.selection.index : -1;
    let item = kind === 'character' ? this.level.actors.characters?.[index] : kind === 'decoration' ? this.level.decorations[index] : null;
    let rectangle = kind === 'character' ? characterRectangle(item) : item;
    let handle = rectangle ? transformHandleAt(rectangle, point) : null;
    if (!handle && (!rectangle || !rectangleContains(rectangle, point))) {
      const characterIndex = this.characterAt(point);
      const decorationIndex = this.decorationAt(point);
      kind = characterIndex >= 0 ? 'character' : decorationIndex >= 0 ? 'decoration' : '';
      index = kind === 'character' ? characterIndex : decorationIndex;
      item = kind === 'character' ? this.level.actors.characters[index] : kind === 'decoration' ? this.level.decorations[index] : null;
      rectangle = kind === 'character' ? characterRectangle(item) : item;
      if (item) this.selectEntity(kind, index);
    }
    if (!item) { this.selection = null; return; }
    if (kind === 'decoration' && item.locked) { this.notify('Dieses Objekt ist gesperrt'); return; }
    handle ??= transformHandleAt(rectangle, point);
    const historyLabel = kind === 'character' ? 'Figur transformieren' : item.type === 'text' ? 'Textblock transformieren' : 'Objekt transformieren';
    this.engine.beginTransaction(historyLabel);
    this.gesture = { pointerId, start: point, last: point, mode: 'transform', action: handle ? 'scale' : 'move', handle, kind, index, original: clone(item), originalRectangle: clone(rectangle), before, historyLabel };
    this.cursor = null;
  }

  pointerDown(point, pointerId, erase = false, precisePoint = point, modifiers = {}) {
    const mode = erase ? 'erase' : this.tool;
    if (mode === 'select') { this.selectAt(point, { ...modifiers, reveal: !modifiers.additive }); return; }
    if (mode === 'transform') { this.beginTransform(precisePoint, pointerId); return; }
    if (mode === 'wall' || mode === 'erase') {
      const historyLabel = mode === 'wall' ? 'Wände zeichnen' : 'Wände radieren';
      const before = this.studioSnapshot();
      this.engine.beginTransaction(historyLabel);
      this.engine.setWall(point.x, point.y, mode === 'wall');
      this.gesture = { pointerId, start: point, last: point, mode, before, historyLabel };
    } else if (['line', 'rectangle', 'event-zone'].includes(mode)) {
      if (mode === 'event-zone' && !this.selectedEvent) { this.notify('Bitte zuerst ein Ereignis auswählen'); return; }
      const historyLabel = mode === 'line' ? 'Wandlinie' : mode === 'rectangle' ? 'Wandrechteck' : 'Triggerzone zeichnen';
      this.gesture = { pointerId, start: point, last: point, mode, before: this.studioSnapshot(), historyLabel };
    } else if (mode === 'fill') {
      const before = this.studioSnapshot();
      this.engine.beginTransaction('Fläche füllen');
      const points = floodFillPoints(point, this.engine.wallCells, this.level.board.columns, this.level.board.rows);
      this.engine.applyWallPoints(points, !this.engine.wallCells.has(tileKey(point.x, point.y)));
      this.engine.endTransaction(); this.sync(); this.recordStudioChange('Fläche füllen', before, { coalesce: false });
    } else if (mode === 'player') { this.mutate('Startpunkt setzen', (draft) => draft.setPlayer(point));
    } else if (mode === 'cat') { this.mutate('Katze setzen', (draft) => draft.addCat(point));
    } else if (mode === 'character' && this.selectedCharacterAsset) {
      const placement = characterPlacement(this.selectedCharacterAsset, point, this.level.actors.characters?.length ?? 0);
      this.mutate('Figur platzieren', (draft) => draft.addCharacter(point, placement));
      const index = this.level.actors.characters.findIndex((character) => character.id === placement.id);
      this.selectEntity('character', index);
      this.tool = 'transform';
      this.workspace = 'level';
      this.notify(`${this.selectedCharacterAsset.name} platziert · jetzt direkt ziehen oder am Eckgriff skalieren`);
    } else if (mode === 'power') { this.mutate('Power-Up setzen', (draft) => draft.togglePowerUp(point));
    } else if (mode === 'object' && this.selectedAsset) {
      const placement = placementFromAsset(this.selectedAsset, point, this.level.decorations.length);
      this.mutate('Objekt platzieren', (draft) => draft.addDecoration(point, placement));
      this.tool = 'select';
      this.selectEntity('decoration', this.level.decorations.findIndex((entry) => entry.id === placement.id), { reveal: true });
    } else if (mode === 'event-visual' && this.selectedEvent) {
      this.mutate('Ereignissymbol setzen', (draft) => { const visual = draft.document.events.find((event) => event.id === this.selectedEventId).visual; visual.x = point.x + 0.5; visual.y = point.y + 0.5; });
    }
    this.cursor = this.cursorFor(point);
  }

  pointerMove(point, pointerId, precisePoint = point) {
    this.cursorCopy = this.tool === 'transform' ? `Position ${precisePoint.x.toFixed(2)}, ${precisePoint.y.toFixed(2)}` : `Feld ${point.x}, ${point.y}`;
    if (this.gesture?.pointerId === pointerId) {
      if (this.gesture.mode === 'transform') {
        const gesture = this.gesture;
        const target = gesture.kind === 'character' ? this.engine.document.actors.characters?.[gesture.index] : this.engine.document.decorations[gesture.index];
        if (!target) return;
        if (gesture.action === 'move') {
          const rectangle = moveRectangle(gesture.originalRectangle, gesture.start, precisePoint, this.level.board);
          if (gesture.kind === 'character') {
            target.x = rectangle.x + (rectangle.width - 1) / 2; target.y = rectangle.y + (rectangle.height - 1) / 2;
          } else { target.x = rectangle.x; target.y = rectangle.y; }
        }
        else {
          const originalFontSize = Number(gesture.original.textStyle?.fontSize) || 0.5;
          const maximumScale = gesture.kind === 'character' ? 4 / gesture.originalRectangle.width : target.type === 'text' ? 4 / originalFontSize : Infinity;
          const result = scaleRectangle(gesture.originalRectangle, gesture.handle, precisePoint, this.level.board, { minimumSize: gesture.kind === 'character' ? 0.5 : 0.25, maximumScale });
          if (gesture.kind === 'character') {
            target.scale = result.rectangle.width;
            target.x = result.rectangle.x + (result.rectangle.width - 1) / 2; target.y = result.rectangle.y + (result.rectangle.height - 1) / 2;
          } else {
            target.x = result.rectangle.x; target.y = result.rectangle.y; target.width = result.rectangle.width; target.height = result.rectangle.height;
          }
          if (gesture.kind === 'decoration' && target.type === 'text') {
            target.textStyle.fontSize = Math.round(Math.max(0.15, Math.min(4, originalFontSize * result.scale)) * 1000) / 1000;
            target.textStyle.padding = Math.round(Math.max(0, Math.min(2, (Number(gesture.original.textStyle.padding) || 0) * result.scale)) * 1000) / 1000;
          }
        }
        this.engine.markChanged(); gesture.last = precisePoint;
        this.level = this.engine.toDocument(); this.revision += 1;
      } else if (['wall', 'erase'].includes(this.gesture.mode) && (point.x !== this.gesture.last.x || point.y !== this.gesture.last.y)) {
        this.engine.applyWallPoints(linePoints(this.gesture.last, point), this.gesture.mode === 'wall');
        this.gesture.last = point;
        this.level = this.engine.toDocument(); this.revision += 1;
      } else this.gesture.last = point;
    }
    this.cursor = this.cursorFor(point);
  }

  pointerUp(point, pointerId) {
    if (!this.gesture || this.gesture.pointerId !== pointerId) return;
    const gesture = this.gesture;
    if (gesture.mode === 'transform') this.engine.endTransaction();
    else if (gesture.mode === 'line') { this.engine.beginTransaction('Wandlinie'); this.engine.applyWallPoints(linePoints(gesture.start, point), true); this.engine.endTransaction(); }
    else if (gesture.mode === 'rectangle') { this.engine.beginTransaction('Wandrechteck'); this.engine.applyWallPoints(rectanglePoints(gesture.start, point), true); this.engine.endTransaction(); }
    else if (gesture.mode === 'event-zone') {
      const zone = { x: Math.min(gesture.start.x, point.x), y: Math.min(gesture.start.y, point.y), width: Math.abs(point.x - gesture.start.x) + 1, height: Math.abs(point.y - gesture.start.y) + 1 };
      this.engine.mutate('Triggerzone zeichnen', (draft) => { const event = draft.document.events.find((entry) => entry.id === this.selectedEventId); event.trigger.type = 'zone'; event.trigger.zones.push(zone); });
    } else this.engine.endTransaction();
    this.gesture = null; this.cursor = { ...point }; this.sync();
    this.recordStudioChange(gesture.historyLabel, gesture.before, { coalesce: false });
  }

  cursorFor(point) {
    if (!this.gesture || !['line', 'rectangle', 'event-zone'].includes(this.gesture.mode)) return { ...point };
    return { x: Math.min(this.gesture.start.x, point.x), y: Math.min(this.gesture.start.y, point.y), width: Math.abs(point.x - this.gesture.start.x) + 1, height: Math.abs(point.y - this.gesture.start.y) + 1, color: 'rgba(85,217,221,.34)' };
  }

  leaveCanvas() { if (!this.gesture) { this.cursor = null; this.cursorCopy = 'Feld —'; } }

  deleteSelection() {
    const selected = this.selections.length ? this.selections : this.selection ? [this.selection] : [];
    const cats = selected.filter((entry) => entry.kind === 'cat').map((entry) => entry.index).sort((a, b) => b - a);
    const characters = selected.filter((entry) => entry.kind === 'character').map((entry) => entry.index).sort((a, b) => b - a);
    const decorations = selected.filter((entry) => entry.kind === 'decoration').map((entry) => entry.index).sort((a, b) => b - a);
    const events = selected.filter((entry) => entry.kind === 'event').map((entry) => entry.index).sort((a, b) => b - a);
    const walls = selected.filter((entry) => entry.kind === 'wall').map((entry) => entry.index).sort((a, b) => b - a);
    if (!cats.length && !characters.length && !decorations.length && !events.length && !walls.length) return;
    this.engine.selected = null;
    this.mutate(selected.length > 1 ? 'Elemente löschen' : 'Element löschen', (draft) => {
      cats.forEach((index) => draft.document.actors.cats.splice(index, 1));
      characters.forEach((index) => draft.document.actors.characters.splice(index, 1));
      decorations.forEach((index) => draft.document.decorations.splice(index, 1));
      events.forEach((index) => draft.document.events.splice(index, 1));
      walls.forEach((index) => draft.document.board.walls.splice(index, 1));
      if (walls.length) draft.refreshWallCells();
    }, { preserveSelection: false });
    this.clearSelection();
  }

  updateSelected(path, value, label = 'Objekt bearbeiten') {
    if (value === undefined) return;
    const selection = clone(this.selection);
    if (!selection) return;
    this.mutate(label, (draft) => {
      let target = null;
      if (selection.kind === 'player') target = draft.document.actors.player;
      if (selection.kind === 'cat') target = draft.document.actors.cats[selection.index];
      if (selection.kind === 'character') target = draft.document.actors.characters[selection.index];
      if (selection.kind === 'decoration') target = draft.document.decorations[selection.index];
      if (selection.kind === 'theme-element') target = draft.document.theme.elements?.[selection.index];
      if (selection.kind === 'wall') target = draft.document.board.walls[selection.index];
      if (target && selection.kind === 'decoration') Object.assign(target, overridePlacementValue(target, path, value));
      else if (target) setAt(target, path, value);
      if (selection.kind === 'wall') draft.refreshWallCells();
    }, { preserveSelection: true });
    this.selection = selection;
  }

  updateSelectedWalls(path, value, label = 'Wände gemeinsam bearbeiten') {
    const selections = (this.selections.length ? this.selections : this.selection ? [this.selection] : [])
      .filter((selection) => selection.kind === 'wall');
    if (!selections.length) return;
    this.mutate(label, (draft) => {
      selections.forEach((selection) => {
        const target = draft.document.board.walls[selection.index];
        if (target) setAt(target, path, value);
      });
      draft.refreshWallCells();
    }, { preserveSelection: true });
  }

  saveAsset(asset, label = 'Objektvorlage bearbeiten') {
    const before = this.studioSnapshot();
    const previous = this.assets.find((entry) => entry.id === asset.id);
    const prepared = asset.color !== previous?.color && asset.appearance === previous?.appearance
      ? { ...asset, appearance: recolorAppearance(asset.appearance, previous?.color, asset.color) }
      : asset;
    const saved = this.library.save(prepared);
    this.assets = this.library.list(); this.selectedAssetId = saved.id;
    const hasInstances = this.level.decorations.some((entry) => entry.assetId === saved.id);
    if (hasInstances) {
      this.historySuppressed = true;
      try {
        this.mutate('Globale Objektvorlage aktualisieren', (draft) => {
          draft.document.decorations.forEach((entry, index) => {
            if (entry.assetId === saved.id) draft.document.decorations[index] = applyAssetToPlacement(entry, saved);
          });
        }, { preserveSelection: true });
      } finally { this.historySuppressed = false; }
    }
    this.queueContentSave('object', saved);
    this.recordStudioChange(label, before, { key: `${label}:object:${saved.id}` });
    this.notify(hasInstances ? 'Objektvorlage und verknüpfte Instanzen sofort aktualisiert' : 'Objekt in der Bibliothek gespeichert');
    return saved;
  }

  updateAsset(path, value) {
    if (!this.selectedAsset || value === undefined) return null;
    const asset = clone(this.selectedAsset);
    const previousColor = asset.color;
    setAt(asset, path, value);
    if (path[0] === 'color') asset.appearance = recolorAppearance(asset.appearance, previousColor, value);
    return this.saveAsset(asset, `Objektvorlage ${path.join('.')} bearbeiten`);
  }

  resetSelectedAssetOverride(field) {
    if (this.selection?.kind !== 'decoration') return false;
    const selected = this.level.decorations[this.selection.index];
    const asset = this.assets.find((entry) => entry.id === selected?.assetId);
    if (!asset || !(selected.assetOverrides ?? []).includes(field)) return false;
    this.mutate('Objektwert wieder mit Vorlage verknüpfen', (draft) => {
      const target = draft.document.decorations[this.selection.index];
      target.assetOverrides = (target.assetOverrides ?? []).filter((entry) => entry !== field);
      draft.document.decorations[this.selection.index] = applyAssetToPlacement(target, asset);
    }, { preserveSelection: true });
    return true;
  }

  createObjectDraft(name, resolution = 24, category = 'Eigene Objekte') {
    const asset = createBlankObjectAsset(name, resolution, category);
    asset.id = uniqueId(asset.id, new Set(this.assets.map((entry) => entry.id)));
    return asset;
  }

  duplicateAsset(id) {
    const source = this.assets.find((entry) => entry.id === id);
    if (!source) return null;
    const copy = clone(source);
    copy.id = uniqueId(`${source.id}-kopie`, new Set(this.assets.map((entry) => entry.id)));
    copy.name = `${source.name} · Kopie`;
    return this.saveAsset(copy, 'Objektvorlage duplizieren');
  }

  isCustomAsset(id) { return this.library.readCustom().some((entry) => entry.id === id); }
  isBuiltInAsset(id) { return DEFAULT_OBJECT_ASSETS.some((entry) => entry.id === id); }

  exportAsset(id) {
    const asset = this.assets.find((entry) => entry.id === id);
    if (asset) this.download(createContentDocument('object', asset), `${asset.id}.object.json`);
  }

  removeAssetDefinition(id) {
    const before = this.studioSnapshot();
    const builtIn = DEFAULT_OBJECT_ASSETS.some((entry) => entry.id === id);
    const custom = this.library.readCustom().some((entry) => entry.id === id);
    if (!custom) return false;
    this.library.remove(id);
    this.assets = this.library.list();
    this.selectedAssetId = builtIn ? id : this.assets[0]?.id ?? '';
    this.recordStudioChange(builtIn ? 'Objektvorlage zurücksetzen' : 'Objektvorlage löschen', before, { coalesce: false });
    this.notify(builtIn ? 'Objektvorlage auf den mitgelieferten Stand zurückgesetzt' : 'Objektvorlage gelöscht · platzierte Instanzen bleiben erhalten');
    return true;
  }

  createCharacterDraft(name, template = 'pixel', resolution = 24) {
    return createBlankCharacterAsset(name, template, resolution);
  }

  saveCharacterDefinition(asset, label = 'Figurenvorlage bearbeiten') {
    const before = this.studioSnapshot();
    const saved = this.characterLibrary.save(asset);
    this.characterAssets = this.characterLibrary.list();
    this.selectedCharacterId = saved.id;
    this.queueContentSave('character', saved);
    const hasInstances = (this.level.actors.characters ?? []).some((character) => character.characterId === saved.id);
    if (hasInstances) {
      this.historySuppressed = true;
      try {
        this.mutate('Globale Figur aktualisieren', (draft) => {
          draft.document.actors.characters.forEach((character) => {
            if (character.characterId !== saved.id) return;
            character.name = saved.name;
            character.color = saved.color;
            character.accent = saved.accent;
            character.appearance = clone(saved.appearance);
            character.effects = clone(saved.effects ?? []);
            character.behavior = clone(saved.behavior ?? { controller: 'stationary', speedMultiplier: 1 });
          });
        }, { preserveSelection: true });
      } finally { this.historySuppressed = false; }
    }
    this.recordStudioChange(label, before, { key: `${label}:character:${saved.id}` });
    this.notify(hasInstances ? 'Globale Figur und ihre Levelinstanzen aktualisiert' : 'Figur global gespeichert');
    return saved;
  }

  removeCharacterDefinition(id) {
    const before = this.studioSnapshot();
    this.characterLibrary.remove(id);
    this.characterAssets = this.characterLibrary.list();
    if (this.selectedCharacterId === id) this.selectedCharacterId = '';
    if (this.cloudPublisher) {
      const key = `character:${id}`;
      const revision = this.cloudContentRevisions.get(key);
      if (Number.isInteger(revision)) this.cloudQueue = this.cloudQueue
        .then(() => this.cloudPublisher.deleteContent('character', id, revision))
        .then(() => {
          this.cloudContentRevisions.delete(key);
          this.cloudContentHashes.delete(key);
          this.cloudContentBlocked.delete(key);
          this.cloudItems = this.cloudItems.filter((item) => `${item.type}:${item.id}` !== key);
        }).catch((error) => { this.cloudError = error.message; });
    }
    this.recordStudioChange('Figurenvorlage löschen', before, { coalesce: false });
    this.notify('Figur aus der globalen Bibliothek entfernt · Levelinstanzen bleiben erhalten');
  }

  duplicateCharacterDefinition(id) {
    const source = this.characterAssets.find((entry) => entry.id === id);
    if (!source) return null;
    const copy = clone(source);
    copy.id = uniqueId(`${source.id}-kopie`, new Set(this.characterAssets.map((entry) => entry.id)));
    copy.name = `${source.name} · Kopie`;
    return this.saveCharacterDefinition(copy, 'Figurenvorlage duplizieren');
  }

  exportCharacterDefinition(id) {
    const asset = this.characterAssets.find((entry) => entry.id === id);
    if (asset) this.download(createContentDocument('character', asset), `${asset.id}.character.json`);
  }

  placeCharacter(id) {
    const asset = this.characterAssets.find((entry) => entry.id === id);
    if (!asset) return false;
    this.selectedCharacterId = id;
    this.tool = 'character';
    this.workspace = 'level';
    this.clearSelection();
    this.notify(`${asset.name}: jetzt ein freies Feld im Level anklicken`);
    return true;
  }

  setActorAppearance(kind, index, appearance) {
    this.mutate('Sprite-Sheet speichern', (draft) => {
      const actor = kind === 'player' ? draft.document.actors.player : kind === 'cat' ? draft.document.actors.cats[index] : draft.document.actors.characters[index];
      actor.appearance = clone(appearance); actor.renderer = 'pixel-art'; actor.animation = '';
    }, { preserveSelection: true });
    this.notify('Sprite-Sheet übernommen');
  }

  resetPlayerAppearance() {
    this.mutate('Franz und Lola zurücksetzen', (draft) => { draft.document.actors.player.appearance = createFranzLolaAppearance(); draft.document.actors.player.renderer = 'pixel-art'; }, { preserveSelection: true });
  }

  addEvent() {
    const id = slug(`ereignis-${this.level.events.length + 1}`);
    this.mutate('Ereignis anlegen', (draft) => draft.document.events.push({
      id, name: { standard: 'Neues Ereignis', dialect: 'Neis Ereignis' }, message: { standard: 'Etwas wurde entdeckt!', dialect: 'Do host wos gfundn!' }, reward: 100, scope: 'level',
      trigger: { type: 'zone', zones: [{ x: 1, y: 1, width: 1, height: 1 }], sequence: [], seconds: 10 },
      visual: { type: 'custom', x: 1.5, y: 1.5, color: '#55d9dd', accent: '#f5c451', label: '!', visibility: 'always' },
    }), { preserveSelection: true });
    this.selectedEventId = id;
  }

  updateEvent(path, value) {
    const id = this.selectedEventId;
    this.mutate('Ereignis bearbeiten', (draft) => { const event = draft.document.events.find((entry) => entry.id === id); if (event) setAt(event, path, value); }, { preserveSelection: true });
  }

  setEventVisualAsset(assetId) {
    const asset = this.assets.find((entry) => entry.id === assetId);
    if (!asset) return;
    const id = this.selectedEventId;
    this.mutate('Ereignisobjekt wählen', (draft) => {
      const event = draft.document.events.find((entry) => entry.id === id);
      if (!event) return;
      event.visual.type = 'custom'; event.visual.assetId = asset.id;
      event.visual.appearance = clone(asset.appearance); event.visual.spriteAnimation = asset.appearance?.animations?.[0]?.id ?? '';
      event.visual.animation = clone(asset.animation); event.visual.color = asset.color; event.visual.label = asset.label;
      event.visual.effects = clone(asset.effects ?? []);
    }, { preserveSelection: true });
  }

  deleteEvent() {
    const id = this.selectedEventId;
    this.mutate('Ereignis löschen', (draft) => { draft.document.events = draft.document.events.filter((event) => event.id !== id); }, { preserveSelection: true });
  }

  addCutscene() {
    const id = this.level.cutscenes.length ? `cutscene-${this.level.cutscenes.length + 1}` : 'intro';
    const player = this.level.actors.player;
    this.mutate('Cutscene anlegen', (draft) => draft.document.cutscenes.push({
      id, kind: this.level.cutscenes.length ? 'transition' : 'intro', name: { standard: 'Ankunft im Level', dialect: 'Oikemma im Level' }, duration: 4, skippable: true,
      tracks: [
        { id: 'camera', type: 'camera', target: 'camera', keyframes: [{ id: 'camera-start', time: 0, x: player.x, y: player.y, zoom: 1.35, easing: 'linear' }, { id: 'camera-end', time: 4, x: player.x, y: player.y, zoom: 1.12, easing: 'ease-in-out' }] },
        { id: 'franz-lola', type: 'actor', target: 'player', keyframes: [{ id: 'walk-in', time: 0, x: Math.max(0, player.x - 3), y: player.y, state: 'right', easing: 'linear' }, { id: 'ready', time: 4, x: player.x, y: player.y, state: 'idle', easing: 'ease-in-out' }] },
      ],
    }), { preserveSelection: true });
    this.selectedCutsceneId = id; this.selectedTrackId = 'camera'; this.selectedKeyframeId = 'camera-start';
  }

  updateCutscene(path, value) {
    const id = this.selectedCutsceneId;
    this.mutate('Cutscene bearbeiten', (draft) => { const cutscene = draft.document.cutscenes.find((entry) => entry.id === id); if (cutscene) setAt(cutscene, path, value); }, { preserveSelection: true });
  }

  deleteCutscene() {
    const id = this.selectedCutsceneId;
    this.mutate('Cutscene löschen', (draft) => { draft.document.cutscenes = draft.document.cutscenes.filter((entry) => entry.id !== id); }, { preserveSelection: true });
    this.selectedCutsceneId = this.level.cutscenes[0]?.id ?? ''; this.selectedTrackId = ''; this.selectedKeyframeId = '';
  }

  addTrack(type = 'actor') {
    const cutsceneId = this.selectedCutsceneId;
    if (type === 'object' && !this.level.decorations.length) {
      this.notify('Objekt-Track nicht angelegt: Platziere zuerst ein Objekt im Level.');
      return false;
    }
    const index = (this.selectedCutscene?.tracks.length ?? 0) + 1;
    const target = type === 'object' ? this.level.decorations[0]?.id ?? '' : type === 'camera' ? 'camera' : type === 'dialogue' ? 'dialogue' : 'player';
    const keyframe = type === 'dialogue'
      ? { id: `text-${index}`, time: 0, duration: 2.5, speaker: 'Franz', text: { standard: 'Servus Passau!', dialect: 'Hawedere Passau!' }, easing: 'step' }
      : { id: `start-${index}`, time: 0, x: this.level.actors.player.x, y: this.level.actors.player.y, zoom: 1.12, scale: 1, rotation: 0, opacity: 1, state: 'idle', visible: true, easing: 'linear' };
    let trackId = `${type}-${index}`;
    let suffix = index + 1;
    while (this.selectedCutscene?.tracks.some((entry) => entry.id === trackId)) { trackId = `${type}-${suffix}`; suffix += 1; }
    this.mutate('Cutscene-Track anlegen', (draft) => draft.document.cutscenes.find((entry) => entry.id === cutsceneId).tracks.push({ id: trackId, type, target, keyframes: [keyframe] }), { preserveSelection: true });
    this.selectedTrackId = trackId; this.selectedKeyframeId = keyframe.id;
    return true;
  }

  updateTrack(path, value) {
    const cutsceneId = this.selectedCutsceneId; const trackId = this.selectedTrackId;
    this.mutate('Track bearbeiten', (draft) => { const track = draft.document.cutscenes.find((entry) => entry.id === cutsceneId)?.tracks.find((entry) => entry.id === trackId); if (track) setAt(track, path, value); }, { preserveSelection: true });
  }

  renameTrack(nextId) {
    const cutsceneId = this.selectedCutsceneId; const currentId = this.selectedTrackId;
    const clean = String(nextId).trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!clean || clean === currentId) return;
    if (this.selectedCutscene?.tracks.some((entry) => entry.id === clean)) { this.notify('Track-ID ist bereits vergeben.'); return; }
    this.mutate('Track umbenennen', (draft) => {
      const track = draft.document.cutscenes.find((entry) => entry.id === cutsceneId)?.tracks.find((entry) => entry.id === currentId);
      if (track) track.id = clean;
    }, { preserveSelection: true });
    this.selectedTrackId = clean;
  }

  deleteTrack() {
    const cutsceneId = this.selectedCutsceneId; const trackId = this.selectedTrackId;
    this.mutate('Track löschen', (draft) => { const cutscene = draft.document.cutscenes.find((entry) => entry.id === cutsceneId); cutscene.tracks = cutscene.tracks.filter((entry) => entry.id !== trackId); }, { preserveSelection: true });
    this.selectedTrackId = this.selectedCutscene?.tracks[0]?.id ?? ''; this.selectedKeyframeId = this.selectedTrack?.keyframes[0]?.id ?? '';
  }

  addKeyframe(requestedTime = null) {
    const track = this.selectedTrack; if (!track || !this.selectedCutscene) return;
    const byTime = [...track.keyframes].sort((a, b) => a.time - b.time);
    const fallbackTime = Math.min(this.selectedCutscene.duration, (byTime.at(-1)?.time ?? -1) + 1);
    const time = Math.max(0, Math.min(this.selectedCutscene.duration, requestedTime == null ? fallbackTime : Number(requestedTime)));
    const previous = [...byTime].reverse().find((entry) => entry.time <= time) ?? byTime[0];
    const frame = { ...clone(previous), id: uniqueId('keyframe'), time };
    this.updateTrack(['keyframes'], [...track.keyframes, frame].sort((a, b) => a.time - b.time));
    this.selectedKeyframeId = frame.id;
  }

  updateKeyframe(path, value) {
    const frames = this.selectedTrack?.keyframes.map((frame) => frame.id === this.selectedKeyframeId ? { ...frame, [path]: value } : frame) ?? [];
    this.updateTrack(['keyframes'], frames.sort((a, b) => a.time - b.time));
  }

  deleteKeyframe() {
    if (!this.selectedTrack || this.selectedTrack.keyframes.length <= 1) return;
    const frames = this.selectedTrack.keyframes.filter((frame) => frame.id !== this.selectedKeyframeId);
    this.updateTrack(['keyframes'], frames); this.selectedKeyframeId = frames[0]?.id ?? '';
  }

  importLevel(source) {
    try { this.load(JSON.parse(source), 'Level importiert'); } catch (error) { this.notify(`Import fehlgeschlagen: ${error.message}`); }
  }

  download(value, filename) {
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  exportLevel() {
    if (!this.validation.ok) { this.workspace = 'level'; this.notify('Export blockiert: Level enthält Fehler'); return; }
    this.download(this.level, `${this.level.id}.level.json`);
  }

  templates() { return passauCatalog; }
  draftsList() { return this.drafts.list(); }

  publishCandidates() {
    const levelMap = new Map();
    this.cloudDrafts.filter((entry) => entry.level).forEach((entry) => levelMap.set(entry.id, { ...entry, savedAt: entry.updatedAt, current: entry.id === this.level.id }));
    this.drafts.list().forEach((entry) => levelMap.set(entry.id, { ...entry, level: this.drafts.load(entry.id), current: entry.id === this.level.id }));
    const current = { id: this.level.id, name: this.level.name.standard, savedAt: '', level: clone(this.level), current: true };
    levelMap.set(current.id, current);
    const levels = [...levelMap.values()]
      .sort((left, right) => Number(right.current) - Number(left.current) || String(left.name).localeCompare(String(right.name), 'de'))
      .map((entry) => ({
        ...entry,
        key: `level:${entry.id}`,
        type: 'level',
        typeLabel: 'Level',
        icon: entry.level.icon,
        detail: `${entry.level.board.columns}×${entry.level.board.rows} Felder`,
        validation: validateLevelDocument(entry.level),
      }));
    const labels = { character: 'Figur', tileset: 'Tileset', block: 'Block', animation: 'Animation', cutscene: 'Cutscene', object: 'Objekt', event: 'Ereignis' };
    const icons = { character: 'FIG', tileset: 'SET', block: 'BLK', animation: 'ANI', cutscene: 'CUT', object: 'OBJ', event: 'EVT' };
    const contentCandidate = (input, metadata = {}) => {
      const content = input?.kind === 'franz-lola-content' ? clone(input) : createContentDocument(input.type, input.document, input);
      const key = `${content.type}:${content.id}`;
      const remote = this.cloudItems.find((item) => `${item.type}:${item.id}` === key);
      return {
        key,
        type: content.type,
        id: content.id,
        name: content.name,
        content,
        typeLabel: labels[content.type],
        icon: icons[content.type],
        detail: content.description || 'Wiederverwendbarer Inhalt',
        validation: validateContentDocument(content),
        conflict: this.cloudContentBlocked.has(key),
        remoteRevision: this.cloudContentRevisions.get(key) ?? remote?.revision ?? null,
        remoteUpdatedAt: remote?.updatedAt ?? '',
        ...metadata,
      };
    };
    const content = new Map();
    const addContent = (document, metadata) => content.set(`${document.type}:${document.id}`, contentCandidate(document, metadata));
    this.cloudItems.forEach((item) => { if (item.content) addContent(item.content, { remoteRevision: item.revision, remoteUpdatedAt: item.updatedAt }); });
    levels.forEach((entry) => { if (entry.validation.ok) extractEmbeddedContentDocuments(entry.level).forEach(addContent); });
    this.characterAssets.forEach((asset) => addContent(createContentDocument('character', asset)));
    this.library.readCustom().forEach((asset) => addContent(createContentDocument('object', asset)));
    this.cloudContentOverrides.forEach((item) => addContent(item.content, { cloudChoice: 'remote', remoteRevision: item.revision, remoteUpdatedAt: item.updatedAt }));
    return [...levels, ...content.values()];
  }
  deleteDraft(id) {
    if (id === this.level.id) clearTimeout(this.saveTimer);
    if (!this.drafts.remove(id)) return false;
    this.revision += 1;
    this.notify(id === this.level.id ? 'Entwurf gelöscht · das geöffnete Level bleibt erhalten' : 'Entwurf gelöscht');
    return true;
  }
}
