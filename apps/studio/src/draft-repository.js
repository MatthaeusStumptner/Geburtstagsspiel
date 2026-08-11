import { migrateLegacyLevel } from './level-migrations.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const normalizeSync = (value) => ({
  baseRevision: Number.isInteger(value?.baseRevision) ? value.baseRevision : null,
  dirty: value?.dirty === true,
  source: ['cloud', 'local'].includes(value?.source) ? value.source : 'legacy',
});

export class DraftRepository {
  constructor(storage = globalThis.localStorage, key = 'franz-lola-level-editor-workspace-v2') {
    this.storage = storage;
    this.key = key;
  }

  readWorkspace() {
    try {
      const parsed = JSON.parse(this.storage.getItem(this.key));
      return parsed && typeof parsed === 'object' ? parsed : { activeId: null, drafts: {} };
    } catch {
      return { activeId: null, drafts: {} };
    }
  }

  save(level, { activate = true, sync } = {}) {
    const workspace = this.readWorkspace();
    if (activate) workspace.activeId = level.id;
    const previous = workspace.drafts[level.id];
    workspace.drafts[level.id] = {
      savedAt: new Date().toISOString(),
      level: clone(level),
      sync: normalizeSync(sync ?? previous?.sync),
    };
    this.storage.setItem(this.key, JSON.stringify(workspace));
    return workspace.drafts[level.id];
  }

  load(id) {
    return this.entry(id)?.level ?? null;
  }

  entry(id) {
    const entry = this.readWorkspace().drafts[id];
    return entry?.level ? { ...clone(entry), level: migrateLegacyLevel(entry.level), sync: normalizeSync(entry.sync) } : null;
  }

  active() {
    const workspace = this.readWorkspace();
    return workspace.activeId ? this.load(workspace.activeId) : null;
  }

  activeEntry() {
    const workspace = this.readWorkspace();
    return workspace.activeId ? this.entry(workspace.activeId) : null;
  }

  list() {
    const workspace = this.readWorkspace();
    return Object.entries(workspace.drafts).map(([id, entry]) => ({ id, savedAt: entry.savedAt, name: entry.level?.name?.standard ?? id }));
  }

  remove(id) {
    const workspace = this.readWorkspace();
    if (!workspace.drafts[id]) return false;
    delete workspace.drafts[id];
    if (workspace.activeId === id) workspace.activeId = null;
    this.storage.setItem(this.key, JSON.stringify(workspace));
    return true;
  }
}
