import { calculateCamera, projectWorldPoint, snapCameraToTexels, visibleWorldBounds } from './camera.js';
import { compileWallGrid, createLevelDocument } from '@franz-lola/content-model';
import { drawCat, drawWalker } from './painters/characters.js';
import { drawCollectibles, drawEasterEggs } from './painters/collectibles.js';
import { drawDecoration, drawEditorGrid, drawEnvironment, drawEnvironmentAnimation, drawEnvironmentBase, drawEnvironmentForeground, drawEnvironmentLandmarkAnimation, drawEnvironmentMidground } from './painters/environment.js';
import { drawWithVisualEffects } from './visual-effects.js';
import { resolvePostProcessProfile, resolveRendererQuality, rendererPixelRatioLimit } from './gpu/effect-profile.js';
import { resolveStableCropSize } from './gpu/crop-buffer.js';
import { createPresentationBackend, createSyncPresentationBackend } from './gpu/presentation-backend.js';
import { createPresentationFrame } from './presentation-frame.js';
import { createPresentationRenderResult } from './presentation-render-result.js';

const clampRatio = (value, maximum = 2) => Math.min(maximum, Math.max(1, Number(value) || 1));
const normalizeDisplayDimension = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(1, numeric) : 1;
};
const normalizeBufferDimension = (value) => {
  const rounded = Math.round(value);
  return Number.isFinite(rounded) ? Math.max(1, rounded) : 1;
};
const interpolate = (entity, alpha) => ({ ...entity, x: Number.isFinite(entity.previousX) ? entity.previousX + (entity.x - entity.previousX) * alpha : entity.x, y: Number.isFinite(entity.previousY) ? entity.previousY + (entity.y - entity.previousY) * alpha : entity.y });
const actorScale = (actor) => Math.max(0.5, Math.min(4, Number(actor?.scale) || 1));
const isDynamicText = (item) => item.type === 'text'
  && Boolean((item.animation?.type && item.animation.type !== 'none') || item.effects?.length);
const isStaticWorldDecoration = (item, frameControlled = false) => !frameControlled
  && item.type !== 'text'
  && !item.appearance
  && !item.spriteAnimation
  && (!item.animation?.type || item.animation.type === 'none')
  && !item.effects?.length;
const collectionSize = (items) => items?.size ?? items?.length ?? 0;
const isCanonicalString = (value) => typeof value === 'string' && value.length > 0 && value.trim() === value;
const environmentCadenceFrame = (backend, quality, elapsed) => {
  if (backend !== 'canvas2d') return 0;
  const framesPerSecond = quality === 'performance' ? 8 : quality === 'balanced' ? 15 : 20;
  return Math.floor(elapsed * framesPerSecond);
};

function drawScaledActor(context, actor, tileSize, draw) {
  const scale = actorScale(actor);
  if (scale === 1) return draw();
  const centerX = actor.x * tileSize + tileSize / 2;
  const centerY = actor.y * tileSize + tileSize / 2;
  context.save();
  context.translate(centerX, centerY);
  context.scale(scale, scale);
  context.translate(-centerX, -centerY);
  const result = draw();
  context.restore();
  return result;
}

export class PassauPixelRenderer {
  #frameId = 0;
  static async create(canvas, options = {}) {
    const presentationBackend = await createPresentationBackend(canvas, options);
    return new PassauPixelRenderer(canvas, { ...options, presentationBackend });
  }

  constructor(canvas, { pixelRatio, zoom = 1.12, presentationBackend, quality = 'auto', ...backendOptions } = {}) {
    if (!canvas?.getContext) throw new TypeError('PassauPixelRenderer benötigt ein Canvas-Element.');
    this.canvas = canvas; this.document = canvas.ownerDocument ?? globalThis.document;
    this.quality = resolveRendererQuality(quality); this.pixelRatioLimit = rendererPixelRatioLimit(this.quality);
    this.presentation = presentationBackend ?? createSyncPresentationBackend(canvas, { ...backendOptions, quality });
    // The pixel world is already authored at native pixel resolution. GPU
    // backends upscale it with nearest-neighbour sampling, avoiding a 4x texture
    // upload while the Canvas2D fallback keeps its historical supersampling.
    this.sceneScale = this.presentation.kind === 'canvas2d'
      ? (this.quality === 'performance' ? 1 : this.quality === 'balanced' ? 1.5 : 2)
      : 1;
    this.scene = this.document.createElement('canvas'); this.sceneContext = this.scene.getContext('2d');
    this.environment = this.document.createElement('canvas'); this.environmentContext = this.environment.getContext('2d');
    this.environmentBase = this.presentation.kind === 'canvas2d' ? this.document.createElement('canvas') : null;
    this.environmentBaseContext = this.environmentBase?.getContext('2d') ?? null;
    this.environmentMidground = this.presentation.kind === 'canvas2d' ? this.document.createElement('canvas') : null;
    this.environmentMidgroundContext = this.environmentMidground?.getContext('2d') ?? null;
    this.environmentForeground = this.presentation.kind === 'canvas2d' ? this.document.createElement('canvas') : null;
    this.environmentForegroundContext = this.environmentForeground?.getContext('2d') ?? null;
    this.environmentCache = { board: null, theme: null, language: '', frame: -1 };
    this.staticWorld = this.document.createElement('canvas'); this.staticWorldContext = this.staticWorld.getContext('2d');
    this.staticWorldCache = { key: '', pellets: null, pelletSize: -1, decorations: null, frameControlledDecorations: null };
    this.staticWorldBuilds = 0;
    this.gpuScene = this.presentation.kind === 'canvas2d' ? null : this.document.createElement('canvas');
    this.gpuSceneContext = this.gpuScene?.getContext('2d') ?? null;
    this.overlay = this.document.createElement('canvas'); this.overlayContext = this.overlay.getContext('2d');
    this.worldOverlayScale = 2;
    this.worldOverlay = this.document.createElement('canvas'); this.worldOverlayContext = this.worldOverlay.getContext('2d');
    this.worldOverlayCache = { language: '', items: [], hasOverlay: false };
    this.context = this.overlayContext;
    this.overlayCache = { decorations: null, language: '', width: 0, height: 0, source: null, viewport: null, hasOverlay: false };
    this.gpuCropResizes = 0;
    this.gpuCropSignature = '';
    this.pixelRatio = clampRatio(pixelRatio ?? globalThis.devicePixelRatio, this.pixelRatioLimit); this.displayMetrics = null; this.zoom = zoom; this.level = null; this.grid = null;
  }

  setLevel(levelInput) {
    this.levelInput = levelInput;
    this.level = createLevelDocument(levelInput); this.grid = compileWallGrid(this.level);
    const width = this.level.board.columns * this.level.board.tileSize; const height = this.level.board.rows * this.level.board.tileSize;
    this.scene.width = Math.round(width * this.sceneScale); this.scene.height = Math.round(height * this.sceneScale); this.sceneContext.setTransform(this.sceneScale, 0, 0, this.sceneScale, 0, 0); this.sceneContext.imageSmoothingEnabled = false;
    this.environment.width = this.scene.width; this.environment.height = this.scene.height; this.environmentContext.setTransform(this.sceneScale, 0, 0, this.sceneScale, 0, 0); this.environmentContext.imageSmoothingEnabled = false;
    if (this.environmentBase && this.environmentBaseContext) {
      this.environmentBase.width = this.scene.width; this.environmentBase.height = this.scene.height;
      this.environmentBaseContext.setTransform(this.sceneScale, 0, 0, this.sceneScale, 0, 0); this.environmentBaseContext.imageSmoothingEnabled = false;
    }
    if (this.environmentMidground && this.environmentMidgroundContext) {
      this.environmentMidground.width = this.scene.width; this.environmentMidground.height = this.scene.height;
      this.environmentMidgroundContext.setTransform(this.sceneScale, 0, 0, this.sceneScale, 0, 0); this.environmentMidgroundContext.imageSmoothingEnabled = false;
    }
    if (this.environmentForeground && this.environmentForegroundContext) {
      this.environmentForeground.width = this.scene.width; this.environmentForeground.height = this.scene.height;
      this.environmentForegroundContext.setTransform(this.sceneScale, 0, 0, this.sceneScale, 0, 0); this.environmentForegroundContext.imageSmoothingEnabled = false;
    }
    this.staticWorld.width = this.scene.width; this.staticWorld.height = this.scene.height; this.staticWorldContext.setTransform(this.sceneScale, 0, 0, this.sceneScale, 0, 0); this.staticWorldContext.imageSmoothingEnabled = false;
    this.worldOverlay.width = Math.round(width * this.worldOverlayScale); this.worldOverlay.height = Math.round(height * this.worldOverlayScale); this.worldOverlayContext.setTransform(this.worldOverlayScale, 0, 0, this.worldOverlayScale, 0, 0); this.worldOverlayContext.imageSmoothingEnabled = false;
    this.environmentCache = { board: null, theme: null, language: '', frame: -1 };
    this.staticWorldCache = { key: '', pellets: null, pelletSize: -1, decorations: null, frameControlledDecorations: null };
    this.worldOverlayCache = { language: '', items: [], hasOverlay: false };
    this.overlayCache.decorations = null;
    this.gpuCropSignature = '';
    return this.level;
  }

  resize(metrics) {
    const legacy = !metrics;
    const bounds = legacy ? this.canvas.getBoundingClientRect() : metrics;
    const width = normalizeDisplayDimension(legacy ? bounds.width || this.canvas.clientWidth : bounds.width);
    const height = normalizeDisplayDimension(legacy ? bounds.height || this.canvas.clientHeight : bounds.height);
    const actualPixelRatio = Math.max(1, Number(metrics?.devicePixelRatio ?? globalThis.devicePixelRatio ?? this.pixelRatio) || 1);
    const pixelRatio = clampRatio(actualPixelRatio, this.pixelRatioLimit);
    const bufferWidth = normalizeBufferDimension(width * pixelRatio);
    const bufferHeight = normalizeBufferDimension(height * pixelRatio);
    const changed = !this.displayMetrics || this.displayMetrics.bufferWidth !== bufferWidth || this.displayMetrics.bufferHeight !== bufferHeight;
    if (changed) this.presentation.resize(bufferWidth, bufferHeight);
    if (this.overlay.width !== bufferWidth) this.overlay.width = bufferWidth; if (this.overlay.height !== bufferHeight) this.overlay.height = bufferHeight;
    this.pixelRatio = pixelRatio;
    const reason = metrics?.reason ?? (legacy ? 'legacy' : undefined);
    this.displayMetrics = { width, height, actualPixelRatio, pixelRatio, bufferWidth, bufferHeight, ...(reason === undefined ? {} : { reason }) };
    return { width, height, pixelRatio, bufferWidth, bufferHeight, changed, ...(reason === undefined ? {} : { reason }) };
  }

  render(snapshot, options = {}) {
    const frameId = this.#frameId += 1;
    const level = snapshot.level ? this.setLevelIfChanged(snapshot.level) : this.level;
    if (!level) throw new Error('Vor dem Rendern muss ein Level gesetzt sein.');
    const alpha = Math.min(1, Math.max(0, Number(options.alpha) || 0));
    const player = interpolate({ ...level.actors.player, ...(snapshot.player ?? {}) }, alpha);
    const cats = (snapshot.cats ?? level.actors.cats).map((cat, index) => interpolate({ ...(level.actors.cats[index] ?? {}), ...cat }, alpha)); const elapsed = Number.isFinite(snapshot.elapsed) ? snapshot.elapsed : 0; const presentationTime = options.presentationTime ?? elapsed;
    const characters = (snapshot.characters ?? level.actors.characters ?? []).map((character, index) => interpolate({ ...(level.actors.characters?.[index] ?? {}), ...character }, alpha));
    const renderLevel = snapshot.decorations ? { ...level, decorations: snapshot.decorations } : level;
    const frameControlledDecorations = snapshot.decorations != null;
    const renderLanguage = options.language ?? 'standard';
    const worldWidth = level.board.columns * level.board.tileSize; const worldHeight = level.board.rows * level.board.tileSize; const scene = this.sceneContext;
    scene.clearRect(0, 0, worldWidth, worldHeight);
    if (this.presentation.kind === 'canvas2d') this.prepareEnvironment(renderLevel, elapsed, renderLanguage);
    this.prepareStaticWorld(renderLevel, snapshot.pellets, elapsed, renderLanguage, options.staticRevision, frameControlledDecorations);
    scene.save(); scene.setTransform(1, 0, 0, 1, 0, 0);
    if (this.presentation.kind === 'canvas2d') scene.drawImage(this.environment, 0, 0);
    scene.drawImage(this.staticWorld, 0, 0); scene.restore();
    renderLevel.decorations.forEach((item) => {
      if (item.type !== 'text' && !isStaticWorldDecoration(item, frameControlledDecorations)) drawDecoration(scene, item, level.board.tileSize, elapsed, renderLanguage);
    });
    drawCollectibles(scene, { powerUps: snapshot.powerUps }, level.board.tileSize, elapsed);
    drawEasterEggs(scene, renderLevel, snapshot.levelEvents ?? (level.events?.length ? { unlocked: snapshot.unlockedEvents, active: snapshot.activeEventId, showAll: Boolean(options.editor?.showEvents), showZones: Boolean(options.editor?.showEventZones) } : snapshot.easterEggs), elapsed);
    cats.forEach((cat) => {
      if ((cat.respawnTimer ?? 0) > 0) return;
      drawWithVisualEffects(scene, cat.effects, { left: cat.x * level.board.tileSize, top: cat.y * level.board.tileSize, width: level.board.tileSize, height: level.board.tileSize }, elapsed,
        () => drawCat(scene, { ...cat, elapsed }, level.board.tileSize, { frightened: (snapshot.powerTimer ?? 0) > 0, frightenedTime: snapshot.powerTimer ?? 0 }));
    });
    characters.forEach((character) => {
      const scale = actorScale(character); const size = level.board.tileSize * scale;
      drawWithVisualEffects(scene, character.effects, { left: character.x * level.board.tileSize + (level.board.tileSize - size) / 2, top: character.y * level.board.tileSize + (level.board.tileSize - size) / 2, width: size, height: size }, elapsed,
        () => drawScaledActor(scene, character, level.board.tileSize, () => drawWalker(scene, { ...character, direction: character.state, elapsed }, level.board.tileSize, { elapsed, hitTimer: 0 })));
    });
    drawWithVisualEffects(scene, player.effects, { left: player.x * level.board.tileSize, top: player.y * level.board.tileSize, width: level.board.tileSize, height: level.board.tileSize }, elapsed,
      () => drawWalker(scene, player, level.board.tileSize, { elapsed, hitTimer: snapshot.hitTimer }));
    if (options.editor?.showGrid) drawEditorGrid(scene, level);
    if (options.editor?.cursor) {
      const { x, y, width = 1, height = 1, color = 'rgba(245, 196, 81, 0.5)' } = options.editor.cursor;
      scene.fillStyle = color;
      scene.fillRect(x * level.board.tileSize + 2, y * level.board.tileSize + 2, width * level.board.tileSize - 4, height * level.board.tileSize - 4);
    }
    if (!this.displayMetrics) this.resize();
    const display = this.displayMetrics; const viewport = options.viewport ?? { x: 0, y: 0, width: display.width, height: display.height };
    const cameraTarget = options.cameraTarget ?? { x: player.x * level.board.tileSize + level.board.tileSize / 2, y: player.y * level.board.tileSize + level.board.tileSize / 2 };
    const calculatedCamera = calculateCamera({ worldWidth, worldHeight, viewport, target: cameraTarget, zoom: options.zoom ?? this.zoom, enabled: options.cameraEnabled !== false });
    const camera = snapCameraToTexels(calculatedCamera, this.sceneScale, worldWidth, worldHeight);
    const worldTextOverlay = this.prepareWorldText(renderLevel, renderLanguage);
    this.overlayContext.setTransform(1, 0, 0, 1, 0, 0); this.overlayContext.clearRect(0, 0, this.overlay.width, this.overlay.height);
    const textOverlay = this.presentText(renderLevel, camera, elapsed, renderLanguage);
    const hasEditorOverlay = Boolean(options.editor?.selections?.length || options.editor?.transformSelection);
    if (options.editor?.selections?.length) this.presentEditorSelections(options.editor.selections, camera, level.board.tileSize, elapsed);
    if (options.editor?.transformSelection) this.presentTransformSelection(options.editor.transformSelection, camera, level.board.tileSize);
    const profile = resolvePostProcessProfile(level, snapshot, {
      quality: options.quality ?? this.quality,
      reducedMotion: options.reducedMotion,
      actualPixelRatio: display.actualPixelRatio,
      effectivePixelRatio: this.pixelRatio,
    });
    this.lastPostProcessProfile = profile;
    const hasOverlay = textOverlay.visible || hasEditorOverlay;
    const overlayCache = this.overlayCache;
    const overlayChanged = textOverlay.animated || hasEditorOverlay
      || overlayCache.decorations !== renderLevel.decorations || overlayCache.language !== renderLanguage
      || overlayCache.width !== this.overlay.width || overlayCache.height !== this.overlay.height
      || overlayCache.sourceX !== camera.source.x || overlayCache.sourceY !== camera.source.y
      || overlayCache.sourceWidth !== camera.source.width || overlayCache.sourceHeight !== camera.source.height
      || overlayCache.viewportX !== camera.viewport.x || overlayCache.viewportY !== camera.viewport.y
      || overlayCache.viewportWidth !== camera.viewport.width || overlayCache.viewportHeight !== camera.viewport.height
      || overlayCache.hasOverlay !== hasOverlay;
    Object.assign(overlayCache, {
      decorations: renderLevel.decorations, language: renderLanguage,
      width: this.overlay.width, height: this.overlay.height,
      sourceX: camera.source.x, sourceY: camera.source.y, sourceWidth: camera.source.width, sourceHeight: camera.source.height,
      viewportX: camera.viewport.x, viewportY: camera.viewport.y, viewportWidth: camera.viewport.width, viewportHeight: camera.viewport.height,
      hasOverlay,
    });
    this.present(camera, profile, elapsed, hasOverlay, overlayChanged, worldTextOverlay, options.sceneChanged !== false);
    const tile = level.board.tileSize;
    const playerWorld = { x: player.x * tile + tile / 2, y: player.y * tile + tile / 2 };
    const bounds = visibleWorldBounds(camera);
    const onScreen = (world) => world.x >= bounds.left && world.x <= bounds.right && world.y >= bounds.top && world.y <= bounds.bottom;
    const playerPresentation = {
      id: player.id ?? 'player',
      world: playerWorld,
      screen: projectWorldPoint(camera, playerWorld),
    };
    const catPresentations = cats.map((cat, index) => {
      const world = { x: cat.x * tile + tile / 2, y: cat.y * tile + tile / 2 };
      return {
        id: cat.id ?? `cat-${index + 1}`,
        index,
        world,
        screen: projectWorldPoint(camera, world),
        onScreen: onScreen(world),
        distance: Math.hypot(player.x - cat.x, player.y - cat.y),
        color: isCanonicalString(cat.color) ? cat.color : '#ff6b5f',
        respawnTimer: Number.isFinite(cat.respawnTimer) ? Math.max(0, cat.respawnTimer) : 0,
      };
    });
    const characterPresentations = characters.map((character, index) => {
      const world = { x: character.x * tile + tile / 2, y: character.y * tile + tile / 2 };
      return {
        id: character.id ?? `character-${index + 1}`,
        index,
        world,
        screen: projectWorldPoint(camera, world),
        onScreen: onScreen(world),
        distance: Math.hypot(player.x - character.x, player.y - character.y),
        color: character.color,
      };
    });
    const rendererInfo = this.rendererInfo();
    const frame = createPresentationFrame({
      frameId,
      presentationTime,
      camera,
      player: playerPresentation,
      cats: catPresentations,
      characters: characterPresentations,
      display,
      renderer: {
        ...rendererInfo,
        requestedBackend: rendererInfo.requestedBackend ?? this.presentation.kind,
        backend: rendererInfo.backend ?? this.presentation.kind,
        fallbackReason: rendererInfo.fallbackReason ?? null,
        contextLost: rendererInfo.contextLost ?? false,
      },
    });
    return createPresentationRenderResult(frame);

  }

  setLevelIfChanged(levelInput) {
    if (this.levelInput === levelInput) return this.level;
    return this.setLevel(levelInput);
  }

  drawVignette(width, height) {
    const context = this.sceneContext; const gradient = context.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.32, width / 2, height / 2, Math.max(width, height) * 0.72);
    gradient.addColorStop(0, 'rgba(2, 8, 12, 0)'); gradient.addColorStop(1, 'rgba(2, 8, 12, 0.28)'); context.fillStyle = gradient; context.fillRect(0, 0, width, height);
  }

  present(camera, profile, elapsed, hasOverlay, overlayChanged = true, worldOverlayState = { visible: false, changed: false }, sceneChanged = true) {
    let scene = this.scene;
    let presentationCamera = camera;
    let cropChanged = false;
    if (this.gpuScene && this.gpuSceneContext) {
      const scale = this.sceneScale;
      const sourceLeft = camera.source.x * scale;
      const sourceTop = camera.source.y * scale;
      const sourceWidth = camera.source.width * scale;
      const sourceHeight = camera.source.height * scale;
      const { width, height } = resolveStableCropSize({
        sceneWidth: this.scene.width, sceneHeight: this.scene.height,
        sourceWidth, sourceHeight,
        currentWidth: this.gpuScene.width, currentHeight: this.gpuScene.height,
      });
      const left = Math.max(0, Math.min(this.scene.width - width, Math.floor(sourceLeft - (width - sourceWidth) / 2)));
      const top = Math.max(0, Math.min(this.scene.height - height, Math.floor(sourceTop - (height - sourceHeight) / 2)));
      if (width * height < this.scene.width * this.scene.height * 0.88) {
        const cropSignature = `${left}|${top}|${width}|${height}`;
        cropChanged = this.gpuCropSignature !== cropSignature;
        this.gpuCropSignature = cropSignature;
        if (this.gpuScene.width !== width || this.gpuScene.height !== height) {
          this.gpuScene.width = width;
          this.gpuScene.height = height;
          this.gpuCropResizes += 1;
        }
        this.gpuSceneContext.setTransform(1, 0, 0, 1, 0, 0);
        this.gpuSceneContext.imageSmoothingEnabled = false;
        this.gpuSceneContext.clearRect(0, 0, width, height);
        this.gpuSceneContext.drawImage(this.scene, left, top, width, height, 0, 0, width, height);
        scene = this.gpuScene;
        presentationCamera = {
          ...camera,
          source: {
            x: (sourceLeft - left) / scale,
            y: (sourceTop - top) / scale,
            width: camera.source.width,
            height: camera.source.height,
          },
        };
      } else {
        this.gpuCropSignature = '';
      }
    }
    this.presentation.present({
      scene, sceneChanged: sceneChanged || cropChanged, overlay: this.overlay, hasOverlay, overlayChanged,
      worldOverlay: this.worldOverlay, hasWorldOverlay: worldOverlayState.visible, worldOverlayChanged: worldOverlayState.changed,
      camera: presentationCamera, worldCamera: camera, profile, elapsed, pixelRatio: this.pixelRatio,
      sceneScale: this.sceneScale, worldOverlayScale: this.worldOverlayScale,
    });
  }

  prepareStaticWorld(level, pellets, elapsed, language, staticRevision, frameControlledDecorations = false) {
    const pelletSize = collectionSize(pellets);
    const key = `${level.id}|${staticRevision ?? 'legacy'}|${language}`;
    const legacy = staticRevision == null;
    const cache = this.staticWorldCache;
    const unchanged = cache.key === key && cache.frameControlledDecorations === frameControlledDecorations && (!legacy
      || (cache.pellets === pellets && cache.pelletSize === pelletSize && cache.decorations === level.decorations));
    if (unchanged) return false;
    const includesEnvironment = this.presentation.kind !== 'canvas2d';
    if (includesEnvironment) this.prepareEnvironment(level, elapsed, language);
    const context = this.staticWorldContext;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.staticWorld.width, this.staticWorld.height);
    if (includesEnvironment) context.drawImage(this.environment, 0, 0);
    context.setTransform(this.sceneScale, 0, 0, this.sceneScale, 0, 0);
    level.decorations.forEach((item) => {
      if (isStaticWorldDecoration(item, frameControlledDecorations)) drawDecoration(context, item, level.board.tileSize, 0, language);
    });
    drawCollectibles(context, { pellets }, level.board.tileSize, 0);
    this.staticWorldCache = { key, pellets, pelletSize, decorations: level.decorations, frameControlledDecorations };
    this.staticWorldBuilds += 1;
    return true;
  }

  prepareEnvironment(level, elapsed, language) {
    // Ambient scenery intentionally runs at a lower cadence than actors. The
    // Canvas2D path retains static tiles and landmarks separately so cadence
    // frames repaint only authored wall, edge, and landmark animation.
    // GPU backends keep their original single resident environment frame.
    const frame = environmentCadenceFrame(this.presentation.kind, this.quality, elapsed);
    const cache = this.environmentCache;
    const unchanged = cache.board === level.board && cache.theme === level.theme && cache.language === language && cache.frame === frame;
    if (unchanged) return false;
    const width = level.board.columns * level.board.tileSize; const height = level.board.rows * level.board.tileSize;
    const context = this.environmentContext;

    if (this.presentation.kind !== 'canvas2d') {
      context.setTransform(this.sceneScale, 0, 0, this.sceneScale, 0, 0);
      context.clearRect(0, 0, width, height);
      drawEnvironment(context, level, this.grid, elapsed, { language, excludeText: true, excludeDecorations: true });
      const gradient = context.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.32, width / 2, height / 2, Math.max(width, height) * 0.72);
      gradient.addColorStop(0, 'rgba(2, 8, 12, 0)'); gradient.addColorStop(1, 'rgba(2, 8, 12, 0.28)'); context.fillStyle = gradient; context.fillRect(0, 0, width, height);
    } else {
      const staticChanged = cache.board !== level.board || cache.theme !== level.theme;
      if (staticChanged) {
        const base = this.environmentBaseContext;
        base.setTransform(this.sceneScale, 0, 0, this.sceneScale, 0, 0);
        base.clearRect(0, 0, width, height);
        drawEnvironmentBase(base, level, this.grid);

        const midground = this.environmentMidgroundContext;
        midground.setTransform(this.sceneScale, 0, 0, this.sceneScale, 0, 0);
        midground.clearRect(0, 0, width, height);
        drawEnvironmentMidground(midground, level, this.grid);

        const foreground = this.environmentForegroundContext;
        foreground.setTransform(this.sceneScale, 0, 0, this.sceneScale, 0, 0);
        foreground.clearRect(0, 0, width, height);
        drawEnvironmentForeground(foreground, level);
        const gradient = foreground.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.32, width / 2, height / 2, Math.max(width, height) * 0.72);
        gradient.addColorStop(0, 'rgba(2, 8, 12, 0)'); gradient.addColorStop(1, 'rgba(2, 8, 12, 0.28)'); foreground.fillStyle = gradient; foreground.fillRect(0, 0, width, height);
      }

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, this.environment.width, this.environment.height);
      context.drawImage(this.environmentBase, 0, 0);
      context.setTransform(this.sceneScale, 0, 0, this.sceneScale, 0, 0);
      drawEnvironmentAnimation(context, level, this.grid, elapsed);
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.drawImage(this.environmentMidground, 0, 0);
      context.setTransform(this.sceneScale, 0, 0, this.sceneScale, 0, 0);
      drawEnvironmentLandmarkAnimation(context, level, elapsed);
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.drawImage(this.environmentForeground, 0, 0);
      context.setTransform(this.sceneScale, 0, 0, this.sceneScale, 0, 0);
    }

    this.environmentCache = { board: level.board, theme: level.theme, language, frame };
    return true;
  }

  prepareWorldText(level, language) {
    const items = level.decorations.filter((item) => item.type === 'text' && !isDynamicText(item));
    const cache = this.worldOverlayCache;
    const unchanged = cache.language === language && cache.items.length === items.length && items.every((item, index) => {
      const previous = cache.items[index];
      return previous.id === item.id && previous.x === item.x && previous.y === item.y
        && previous.width === item.width && previous.height === item.height && previous.color === item.color
        && previous.label === item.label && previous.content === item.content && previous.textStyle === item.textStyle;
    });
    if (unchanged) return { visible: cache.hasOverlay, changed: false };
    const context = this.worldOverlayContext;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.worldOverlay.width, this.worldOverlay.height);
    context.setTransform(this.worldOverlayScale, 0, 0, this.worldOverlayScale, 0, 0);
    context.imageSmoothingEnabled = false;
    for (const item of items) drawDecoration(context, item, level.board.tileSize, 0, language);
    cache.language = language;
    cache.hasOverlay = items.length > 0;
    cache.items = items.map((item) => ({
      id: item.id, x: item.x, y: item.y, width: item.width, height: item.height,
      color: item.color, label: item.label, content: item.content, textStyle: item.textStyle,
    }));
    return { visible: cache.hasOverlay, changed: true };
  }

  presentText(level, camera, elapsed, language) {
    const tile = level.board.tileSize;
    const bounds = visibleWorldBounds(camera);
    const items = level.decorations.filter((item) => isDynamicText(item)
      && item.x * tile < bounds.right
      && (item.x + item.width) * tile > bounds.left
      && item.y * tile < bounds.bottom
      && (item.y + item.height) * tile > bounds.top);
    if (!items.length) return { visible: false, animated: false };
    const animated = items.some((item) => (item.animation?.type && item.animation.type !== 'none') || item.effects?.length);
    const context = this.overlayContext; const ratio = this.pixelRatio;
    const scale = camera.viewport.width / camera.source.width * ratio;
    const screenTile = tile * scale;
    const viewport = {
      x: camera.viewport.x * ratio,
      y: camera.viewport.y * ratio,
      width: camera.viewport.width * ratio,
      height: camera.viewport.height * ratio,
    };
    context.save(); context.beginPath(); context.rect(viewport.x, viewport.y, viewport.width, viewport.height); context.clip();
    items.forEach((item) => {
      const left = (camera.viewport.x + (item.x * tile - camera.source.x) / camera.source.width * camera.viewport.width) * ratio;
      const top = (camera.viewport.y + (item.y * tile - camera.source.y) / camera.source.height * camera.viewport.height) * ratio;
      const width = item.width * screenTile; const height = item.height * screenTile;
      drawDecoration(context, {
        ...item,
        x: Math.round(left) / screenTile,
        y: Math.round(top) / screenTile,
        width: Math.max(1, Math.round(width)) / screenTile,
        height: Math.max(1, Math.round(height)) / screenTile,
      }, screenTile, elapsed, language);
    });
    context.restore();
    return { visible: true, animated };
  }

  presentTransformSelection(selection, camera, tile) {
    const ratio = this.pixelRatio; const context = this.overlayContext;
    const project = (x, y) => ({
      x: (camera.viewport.x + (x * tile - camera.source.x) / camera.source.width * camera.viewport.width) * ratio,
      y: (camera.viewport.y + (y * tile - camera.source.y) / camera.source.height * camera.viewport.height) * ratio,
    });
    const start = project(selection.x, selection.y); const end = project(selection.x + selection.width, selection.y + selection.height);
    const left = Math.round(start.x) + 0.5; const top = Math.round(start.y) + 0.5;
    const width = Math.round(end.x - start.x); const height = Math.round(end.y - start.y);
    const handle = Math.max(8 * ratio, Math.min(14 * ratio, Math.min(width, height) * 0.24));
    context.save(); context.strokeStyle = '#f5c451'; context.lineWidth = Math.max(2, ratio * 1.5); context.setLineDash([6 * ratio, 3 * ratio]);
    context.strokeRect(left, top, width, height); context.setLineDash([]);
    [[left, top], [left + width, top], [left + width, top + height], [left, top + height]].forEach(([x, y]) => {
      context.fillStyle = '#071016'; context.fillRect(x - handle / 2, y - handle / 2, handle, handle);
      context.strokeStyle = '#55d9dd'; context.lineWidth = Math.max(2, ratio); context.strokeRect(x - handle / 2, y - handle / 2, handle, handle);
    });
    context.restore();
  }

  presentEditorSelections(selections, camera, tile, elapsed = 0) {
    const ratio = this.pixelRatio; const context = this.overlayContext;
    const project = (x, y) => ({
      x: (camera.viewport.x + (x * tile - camera.source.x) / camera.source.width * camera.viewport.width) * ratio,
      y: (camera.viewport.y + (y * tile - camera.source.y) / camera.source.height * camera.viewport.height) * ratio,
    });
    context.save();
    selections.forEach((selection, index) => {
      const start = project(selection.x, selection.y); const end = project(selection.x + (selection.width ?? 1), selection.y + (selection.height ?? 1));
      const inset = Math.max(2, ratio * 1.5); const left = Math.round(start.x) + inset; const top = Math.round(start.y) + inset;
      const width = Math.max(4, Math.round(end.x - start.x) - inset * 2); const height = Math.max(4, Math.round(end.y - start.y) - inset * 2);
      const primary = selection.primary !== false && index === selections.length - 1;
      context.strokeStyle = primary ? '#f5c451' : '#55d9dd';
      context.lineWidth = Math.max(primary ? 3 : 2, ratio * (primary ? 2 : 1.4));
      context.globalAlpha = primary ? 0.82 + Math.sin(elapsed * 5) * 0.14 : 0.78;
      context.shadowColor = context.strokeStyle; context.shadowBlur = primary ? 8 * ratio : 3 * ratio;
      context.setLineDash(primary ? [] : [5 * ratio, 3 * ratio]);
      context.strokeRect(left, top, width, height);
      context.setLineDash([]); context.shadowBlur = 0; context.globalAlpha = 1;
    });
    context.restore();
    return true;
  }

  rendererInfo() {
    return {
      ...this.presentation.snapshot(),
      quality: this.quality,
      pixelRatio: this.pixelRatio,
      display: this.displayMetrics ? {
        width: this.displayMetrics.width,
        height: this.displayMetrics.height,
        actualPixelRatio: this.displayMetrics.actualPixelRatio,
        pixelRatio: this.displayMetrics.pixelRatio,
        bufferWidth: this.displayMetrics.bufferWidth,
        bufferHeight: this.displayMetrics.bufferHeight,
        ...(Object.hasOwn(this.displayMetrics, 'reason') ? { reason: this.displayMetrics.reason } : {}),
      } : null,
      ...(this.presentation.kind === 'canvas2d' ? {} : { gpuCropResizes: this.gpuCropResizes }),
      staticWorldBuilds: this.staticWorldBuilds,
      postProcess: this.lastPostProcessProfile ? {
        scanlines: this.lastPostProcessProfile.scanlines,
        scanlinePeriod: this.lastPostProcessProfile.scanlinePeriod,
        rgbSplitTexels: this.lastPostProcessProfile.rgbSplitTexels,
      } : null,
    };
  }

  finish() { return this.presentation.finish?.(); }

  destroy() { this.presentation.destroy?.(); }
}
