<script>
  import { onMount } from 'svelte';
  import { tileKey } from '@franz-lola/content-model';
  import { PassauPixelRenderer } from '@franz-lola/pixel-renderer';
  import { worldPointFromScreen, worldTilePointFromScreen } from '../editor-tools.js';
  import { getLevelAnimationActivity } from '../render/studio-render-session.svelte.js';
  import { levelCanvasRenderInputs } from '../render/level-canvas-render-inputs.js';
  import { captureStudioPresentation } from '../render/studio-render-diagnostics.js';
  import { resolveStudioRendererBackend } from '../render/studio-render-backend.js';
  import { useRenderSurface } from '../render/use-render-surface.svelte.js';

  let { studio, compact = false, ariaLabel = 'Bearbeitbares Levelraster' } = $props();
  let canvas;
  let renderer;
  let renderResult;
  const diagnosticsEnabled = import.meta.env.DEV || import.meta.env.MODE === 'test';
  let panning = null;
  let spacePressed = $state(false);

  function characterBounds(character) {
    if (!character) return null;
    const scale = Math.max(0.5, Math.min(4, Number(character.scale) || 1));
    return { x: character.x + (1 - scale) / 2, y: character.y + (1 - scale) / 2, width: scale, height: scale };
  }

  function selectionCursor() {
    const selection = studio.selection;
    if (!selection) return null;
    if (studio.isSceneHidden(selection.kind, selection.index)) return null;
    if (selection.kind === 'player') return { x: studio.level.actors.player.x, y: studio.level.actors.player.y, color: 'rgba(245,197,77,.46)' };
    if (selection.kind === 'cat') { const cat = studio.level.actors.cats[selection.index]; return cat ? { x: cat.x, y: cat.y, color: 'rgba(245,197,77,.46)' } : null; }
    if (selection.kind === 'character') { const bounds = characterBounds(studio.level.actors.characters?.[selection.index]); return bounds ? { ...bounds, color: 'rgba(85,217,221,.5)' } : null; }
    if (selection.kind === 'decoration') { const item = studio.level.decorations[selection.index]; return item && studio.tool !== 'transform' ? { x: item.x, y: item.y, width: item.width, height: item.height, color: 'rgba(245,197,77,.32)' } : null; }
    if (selection.kind === 'wall') { const wall = studio.level.board.walls[selection.index]; return wall ? { x: wall.x, y: wall.y, width: wall.width, height: wall.height, color: 'rgba(245,197,77,.38)' } : null; }
    if (selection.kind === 'theme-element') return studio.specialElementBounds(studio.level.theme.elements?.[selection.index]?.id);
    if (selection.kind === 'event') { const event = studio.level.events[selection.index]; return event ? { x: Math.floor(event.visual.x), y: Math.floor(event.visual.y), color: 'rgba(245,197,77,.46)' } : null; }
    return null;
  }

  function selectionBounds(selection) {
    if (!selection || studio.isSceneHidden(selection.kind, selection.index)) return null;
    if (selection.kind === 'player') return { x: studio.level.actors.player.x, y: studio.level.actors.player.y };
    if (selection.kind === 'cat') return studio.level.actors.cats[selection.index] ?? null;
    if (selection.kind === 'character') return characterBounds(studio.level.actors.characters?.[selection.index]);
    if (selection.kind === 'decoration') return studio.level.decorations[selection.index] ?? null;
    if (selection.kind === 'wall') return studio.level.board.walls[selection.index] ?? null;
    if (selection.kind === 'theme-element') return studio.specialElementBounds(studio.level.theme.elements?.[selection.index]?.id);
    if (selection.kind === 'event') { const event = studio.level.events[selection.index]; return event ? { x: event.visual.x - 0.5, y: event.visual.y - 0.5 } : null; }
    return null;
  }

  function selectionOutlines() {
    return studio.selections.map((selection, index) => {
      const bounds = selectionBounds(selection);
      return bounds ? { x: bounds.x, y: bounds.y, width: bounds.width ?? 1, height: bounds.height ?? 1, primary: index === studio.selections.length - 1 } : null;
    }).filter(Boolean);
  }

  function draw({ timestamp, reason, renderCount, measurement }) {
    if (!renderer || !studio.level) return;
    renderer.resize(measurement);
    const level = studio.editorLevel;
    const pellets = studio.showGuttis ? studio.pellets : new Set();
    const powerUps = new Set(level.collectibles.powerUps.map((point) => tileKey(point.x, point.y)));
    const player = studio.isSceneHidden('player', 0) ? { ...level.actors.player, x: -100, y: -100 } : level.actors.player;
    const tileSize = studio.level.board.tileSize;
    renderResult = renderer.render({ level, player, cats: level.actors.cats, pellets, powerUps, elapsed: timestamp / 1000 }, {
      cameraEnabled: studio.viewportZoom > 1,
      cameraTarget: { x: studio.viewportCenter.x * tileSize, y: studio.viewportCenter.y * tileSize },
      zoom: studio.viewportZoom,
      language: studio.language,
      reducedMotion: surface.snapshot().reducedMotion,
      editor: { showGrid: studio.showGrid, showEvents: studio.showEvents, showEventZones: studio.showEvents, cursor: studio.cursor ?? selectionCursor(), selections: selectionOutlines(), transformSelection: studio.tool === 'transform' ? studio.transformSelection() : null },
    });
    canvas.dataset.rendererBackend = renderResult.renderer.backend;
    canvas.dataset.cameraViewportX = String(renderResult.camera.viewport.x);
    canvas.dataset.cameraViewportY = String(renderResult.camera.viewport.y);
    canvas.dataset.cameraViewportWidth = String(renderResult.camera.viewport.width);
    canvas.dataset.cameraViewportHeight = String(renderResult.camera.viewport.height);
    canvas.dataset.cameraSourceX = String(renderResult.camera.source.x);
    canvas.dataset.cameraSourceY = String(renderResult.camera.source.y);
    canvas.dataset.cameraSourceWidth = String(renderResult.camera.source.width);
    canvas.dataset.cameraSourceHeight = String(renderResult.camera.source.height);
    canvas.dataset.tileSize = String(tileSize);
    if (diagnosticsEnabled) {
      captureStudioPresentation('studio-level-canvas', renderResult, { renderCount: renderCount + 1, profile: 'editor' });
      canvas.dataset.renderCount = String(renderCount + 1);
      canvas.dataset.lastRenderReason = reason ?? 'unknown';
    }
  }

  const surface = useRenderSurface({
    id: 'studio-level-canvas',
    profile: 'editor',
    visible: () => ['level', 'objects', 'events'].includes(studio.workspace),
    render: draw,
  });
  const renderSurface = surface.action;

  function pointFromEvent(event) {
    if (!renderResult) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return worldPointFromScreen(renderResult.camera, { x: event.clientX, y: event.clientY }, { left: rect.left, top: rect.top }, studio.level);
  }

  function precisePointFromEvent(event) {
    if (!renderResult) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return worldTilePointFromScreen(renderResult.camera, { x: event.clientX, y: event.clientY }, { left: rect.left, top: rect.top }, studio.level);
  }

  function pointerDown(event) {
    if (![0, 1, 2].includes(event.button)) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    if (event.button === 1 || studio.tool === 'pan' || spacePressed) {
      if (studio.viewportZoom === 1) studio.setViewportZoom(1.5, precisePointFromEvent(event));
      panning = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      surface.invalidate('pointer:pan-start');
      return;
    }
    studio.pointerDown(pointFromEvent(event), event.pointerId, event.button === 2, precisePointFromEvent(event), { cycle: event.altKey, additive: event.shiftKey });

  }

  function pointerMove(event) {
    if (panning?.pointerId === event.pointerId && renderResult) {
      const rect = canvas.getBoundingClientRect();
      const density = canvas.width / Math.max(1, rect.width);
      const tileScale = renderResult.camera.scale * studio.level.board.tileSize;
      studio.panViewport(-(event.clientX - panning.x) * density / tileScale, -(event.clientY - panning.y) * density / tileScale);
      panning = { ...panning, x: event.clientX, y: event.clientY };
      surface.invalidate('pointer:pan');
      return;
    }
    studio.pointerMove(pointFromEvent(event), event.pointerId, precisePointFromEvent(event));
    surface.invalidate('pointer:move');
  }
  function pointerUp(event) {
    if (panning?.pointerId === event.pointerId) panning = null;
    else studio.pointerUp(pointFromEvent(event), event.pointerId);
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    surface.invalidate('pointer:' + studio.tool);
  }

  function zoomWheel(event) {
    event.preventDefault();
    const focus = precisePointFromEvent(event);
    const factor = event.deltaY < 0 ? 1.2 : 1 / 1.2;
    studio.setViewportZoom(studio.viewportZoom * factor, focus);
    surface.invalidate('pointer:zoom');
  }

  onMount(() => {
    let disposed = false;
    // Authoring text and transform handles must retain the device pixel ratio even
    // when CI or a low-core device would select the gameplay performance tier.
    PassauPixelRenderer.create(canvas, { zoom: 1, backend: resolveStudioRendererBackend(location.search, { development: import.meta.env.DEV }), preferWebGPU: true, quality: 'quality', powerPreference: 'low-power' }).then((instance) => {
      if (disposed) { instance.destroy(); return; }
      renderer = instance;
      renderer.setLevel(studio.editorLevel);
      surface.invalidate('renderer:ready');
    });
    return () => {
      disposed = true;
      renderer?.destroy();
      renderer = null;
    };
  });

  $effect(() => {
    const inputs = levelCanvasRenderInputs(studio);
    const level = inputs.editorLevel;
    const visibleLevel = inputs.playerHidden
      ? { ...level, actors: { ...level.actors, player: null } }
      : level;
    const visibleSelections = selectionOutlines();
    surface.setVisible(['level', 'objects', 'events'].includes(inputs.workspace));
    surface.setAnimationActivity(getLevelAnimationActivity(visibleLevel, { showEvents: inputs.showEvents, selections: visibleSelections }));
    if (renderer && level) renderer.setLevel(level);
    surface.invalidate('project:reactive');
  });
</script>

<svelte:window
  onkeydown={(event) => { if (event.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) spacePressed = true; }}
  onkeyup={(event) => { if (event.code === 'Space') spacePressed = false; }}
/>

<div class:compact class="level-canvas-frame" data-viewport-zoom={studio.viewportZoom.toFixed(2)} data-viewport-center={`${studio.viewportCenter.x.toFixed(2)},${studio.viewportCenter.y.toFixed(2)}`} style:--board-ratio={`${studio.level.board.columns} / ${studio.level.board.rows}`}>
  <div class="canvas-viewport-controls" aria-label="Canvas-Ansicht">
    <button class:active={studio.tool === 'pan'} aria-pressed={studio.tool === 'pan'} onclick={() => studio.setTool(studio.tool === 'pan' ? 'select' : 'pan')} title="Handwerkzeug · Leertaste oder Mausrad gedrückt halten">✋</button>
    <button onclick={() => studio.setViewportZoom(studio.viewportZoom / 1.25)} aria-label="Ansicht verkleinern">−</button>
    <output>{Math.round(studio.viewportZoom * 100)}%</output>
    <button onclick={() => studio.setViewportZoom(studio.viewportZoom * 1.25)} aria-label="Ansicht vergrößern">＋</button>
    <button onclick={() => studio.fitViewport()} aria-label="Ganzes Level einpassen">Einpassen</button>
  </div>
  <canvas
    id="level-canvas"
    bind:this={canvas}
    use:renderSurface
    class:transform-tool={studio.tool === 'transform'}
    class:pan-tool={studio.tool === 'pan' || spacePressed}
    aria-label={ariaLabel}
    onpointerdown={pointerDown}
    onpointermove={pointerMove}
    onpointerup={pointerUp}
    onpointercancel={pointerUp}
    onpointerleave={() => { studio.leaveCanvas(); surface.invalidate('pointer:leave'); }}
    onwheel={zoomWheel}
    oncontextmenu={(event) => event.preventDefault()}
    data-selection-count={studio.selectionCount}
    data-selected-entity={studio.selection ? `${studio.selection.kind}:${studio.selection.index}` : ''}
  ></canvas>
</div>
