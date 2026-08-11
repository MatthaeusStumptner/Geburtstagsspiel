<script>
  import { onMount } from 'svelte';
  import { PLAYER_STATES } from '../character-template.js';
  import { insertSpriteKeyframe, keyframeAtTime, prepareAppearanceForEditing } from '../animation-tools.js';
  import {
    applyTokenToSelection,
    copySelectedPixels,
    floodFillPixelKeys,
    invertPixelSelection,
    linePixelKeys,
    moveSelectedPixels,
    outlineRectanglePixelKeys,
    pasteSelectedPixels,
    selectPixelRectangle,
    selectPixelsByToken
  } from '../pixel-selection.js';
  import { resizeAppearance, SPRITE_SIZES } from '../sprite-appearance.js';
  import ActorThumbnail from './ActorThumbnail.svelte';

  let { appearance, title = 'Sprite-Sheet', showStates = true, onsave = () => {}, oncancel = () => {} } = $props();
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const fallbackRows = Array.from({ length: 24 }, () => '0'.repeat(24));
  function initialAppearance() { return prepareAppearanceForEditing(appearance ?? { width: 24, height: 24, palette: ['transparent', '#55d9dd'], pixels: fallbackRows, animations: [], stateAnimations: {} }); }
  const initialDraft = initialAppearance();
  const initialAnimationId = initialDraft.stateAnimations?.idle || initialDraft.animations?.[0]?.id || 'base';
  let draft = $state(initialDraft);
  let selectedState = $state('idle');
  let selectedAnimationId = $state(initialAnimationId);
  let selectedKeyframeId = $state(initialDraft.animations?.find((entry) => entry.id === initialAnimationId)?.keyframes?.[0]?.id || '');
  let paletteIndex = $state(1);
  let newColor = $state('#55d9dd');
  let newAnimationName = $state('animation');
  let painting = $state(false);
  let pixelTool = $state('paint');
  let pixelSelection = $state([]);
  let selectionAnchor = $state(null);
  let selectionBase = $state([]);
  let selecting = $state(false);
  let shapeStart = $state(null);
  let shapeBaseRows = $state.raw(null);
  let shapeFilled = $state(false);
  let pixelClipboard = $state.raw(null);
  let playhead = $state(0);
  let playing = $state(false);
  let history = $state([]);
  let future = $state([]);
  let lastTimestamp = 0;
  let animationFrame;
  let gestureSnapshot = null;
  let gestureChanged = false;
  let gestureToken = '0';

  let selectedAnimation = $derived(draft.animations.find((animation) => animation.id === selectedAnimationId) ?? null);
  let selectedKeyframe = $derived(selectedAnimation?.keyframes.find((frame) => frame.id === selectedKeyframeId) ?? selectedAnimation?.keyframes[0] ?? null);
  let rows = $derived(selectedKeyframe?.pixels ?? draft.pixels);
  let playbackFrame = $derived(selectedAnimation ? keyframeAtTime(selectedAnimation, playhead) : null);
  let previewRows = $derived(playbackFrame?.pixels ?? rows);
  let canUndo = $derived(history.length > 0);
  let canRedo = $derived(future.length > 0);

  function snapshot() {
    return clone({ draft, selectedState, selectedAnimationId, selectedKeyframeId, paletteIndex, pixelSelection, playhead });
  }
  function restore(entry) {
    draft = prepareAppearanceForEditing(clone(entry.draft));
    selectedState = entry.selectedState;
    selectedAnimationId = draft.animations.some((animation) => animation.id === entry.selectedAnimationId) ? entry.selectedAnimationId : draft.animations[0]?.id ?? 'base';
    const animation = draft.animations.find((item) => item.id === selectedAnimationId);
    selectedKeyframeId = animation?.keyframes.some((frame) => frame.id === entry.selectedKeyframeId) ? entry.selectedKeyframeId : animation?.keyframes[0]?.id ?? '';
    paletteIndex = Math.min(entry.paletteIndex ?? 1, draft.palette.length - 1);
    pixelSelection = [...(entry.pixelSelection ?? [])];
    playhead = Number(entry.playhead) || 0;
    playing = false;
  }
  function remember(label, before) {
    if (JSON.stringify(before.draft) === JSON.stringify(draft)) return false;
    history = [...history, { label, snapshot: before }].slice(-100);
    future = [];
    return true;
  }
  function edit(label, action) {
    const before = snapshot();
    action();
    remember(label, before);
  }
  function undo() {
    const entry = history.at(-1); if (!entry) return;
    future = [...future, { label: entry.label, snapshot: snapshot() }].slice(-100);
    history = history.slice(0, -1); restore(entry.snapshot);
  }
  function redo() {
    const entry = future.at(-1); if (!entry) return;
    history = [...history, { label: entry.label, snapshot: snapshot() }].slice(-100);
    future = future.slice(0, -1); restore(entry.snapshot);
  }

  function tick(timestamp) {
    if (playing && selectedAnimation) {
      if (lastTimestamp) playhead += (timestamp - lastTimestamp) / 1000;
      if (playhead >= selectedAnimation.duration) {
        if (selectedAnimation.loop) playhead %= selectedAnimation.duration;
        else { playhead = selectedAnimation.duration; playing = false; }
      }
    }
    lastTimestamp = timestamp; animationFrame = requestAnimationFrame(tick);
  }
  function tokenColor(token) { return draft.palette[Number.parseInt(token, 36)] || 'transparent'; }
  function selectAnimation(id) {
    selectedAnimationId = id; const animation = draft.animations.find((entry) => entry.id === id);
    selectedKeyframeId = animation?.keyframes[0]?.id ?? ''; playhead = animation?.keyframes[0]?.time ?? 0; playing = false;
  }
  function activateState(state) {
    selectedState = state;
    selectAnimation(draft.stateAnimations?.[state] || draft.animations.find((animation) => animation.id === state)?.id || draft.animations[0]?.id || 'base');
  }
  function setRows(nextRows) { if (selectedKeyframe) selectedKeyframe.pixels = nextRows; else draft.pixels = nextRows; }
  function paint(x, y, erase = false) {
    const next = [...rows]; const token = erase ? '0' : paletteIndex.toString(36);
    if (next[y]?.[x] === token) return;
    next[y] = `${next[y].slice(0, x)}${token}${next[y].slice(x + 1)}`; setRows(next);
    gestureChanged = true;
  }
  function applyShape(end) {
    if (!shapeStart || !shapeBaseRows) return;
    const keys = pixelTool === 'line'
      ? linePixelKeys(shapeStart, end, draft.width, draft.height)
      : outlineRectanglePixelKeys(shapeStart, end, draft.width, draft.height, shapeFilled);
    setRows(applyTokenToSelection(shapeBaseRows, keys, gestureToken));
    pixelSelection = keys;
    gestureChanged = keys.some((key) => {
      const [x, y] = key.split(':').map(Number);
      return shapeBaseRows[y]?.[x] !== gestureToken;
    });
  }
  function isPixelSelected(x, y) { return pixelSelection.includes(`${x}:${y}`); }
  function startPixelGesture(event, x, y) {
    event.preventDefault();
    if (pixelTool === 'paint' || pixelTool === 'erase') {
      painting = true; gestureSnapshot = snapshot(); gestureChanged = false;
      paint(x, y, pixelTool === 'erase' || event.button === 2); return;
    }
    if (pixelTool === 'fill') {
      const token = event.button === 2 ? '0' : paletteIndex.toString(36);
      edit('Fläche füllen', () => setRows(applyTokenToSelection(rows, floodFillPixelKeys(rows, x, y), token)));
      return;
    }
    if (pixelTool === 'picker') {
      paletteIndex = Math.max(0, Number.parseInt(rows[y]?.[x] ?? '0', 36));
      pixelTool = 'paint';
      return;
    }
    if (pixelTool === 'line' || pixelTool === 'rectangle') {
      gestureSnapshot = snapshot(); gestureChanged = false; gestureToken = event.button === 2 ? '0' : paletteIndex.toString(36);
      shapeStart = { x, y }; shapeBaseRows = [...rows]; applyShape({ x, y });
      return;
    }
    selecting = true; selectionAnchor = { x, y }; selectionBase = event.shiftKey ? [...pixelSelection] : [];
    pixelSelection = selectPixelRectangle(selectionBase, selectionAnchor, { x, y }, draft.width, draft.height, true);
  }
  function continuePixelGesture(event, x, y) {
    if (!event.buttons) return;
    if ((pixelTool === 'paint' || pixelTool === 'erase') && painting) paint(x, y, pixelTool === 'erase' || (event.buttons & 2) > 0);
    if ((pixelTool === 'line' || pixelTool === 'rectangle') && shapeStart) applyShape({ x, y });
    if (pixelTool === 'select' && selecting && selectionAnchor) pixelSelection = selectPixelRectangle(selectionBase, selectionAnchor, { x, y }, draft.width, draft.height, true);
  }
  function endPixelGesture() {
    if (painting && gestureSnapshot && gestureChanged) remember(pixelTool === 'erase' ? 'Pixel radieren' : 'Pixel malen', gestureSnapshot);
    if (shapeStart && gestureSnapshot && gestureChanged) remember(pixelTool === 'line' ? 'Linie zeichnen' : 'Rechteck zeichnen', gestureSnapshot);
    painting = false; selecting = false; shapeStart = null; shapeBaseRows = null; gestureSnapshot = null; gestureChanged = false;
  }
  function applySelection(erase = false) {
    if (!pixelSelection.length) return;
    edit(erase ? 'Auswahl löschen' : 'Auswahl einfärben', () => setRows(applyTokenToSelection(rows, pixelSelection, erase ? '0' : paletteIndex.toString(36))));
  }
  function selectSameColor() {
    const first = pixelSelection[0]; if (!first) return;
    const [x, y] = first.split(':').map(Number); pixelSelection = selectPixelsByToken(rows, rows[y]?.[x] ?? '0');
  }
  function moveSelection(dx, dy) {
    if (!pixelSelection.length) return;
    const result = moveSelectedPixels(rows, pixelSelection, dx, dy); if (!result.moved) return;
    edit('Pixelauswahl bewegen', () => { setRows(result.rows); pixelSelection = result.selection; });
  }
  function copySelection() {
    if (!pixelSelection.length) return;
    pixelClipboard = copySelectedPixels(rows, pixelSelection);
  }
  function pasteSelection() {
    if (!pixelClipboard) return;
    const origin = pixelSelection[0]?.split(':').map(Number) ?? [pixelClipboard.x, pixelClipboard.y];
    edit('Pixel einfügen', () => {
      const result = pasteSelectedPixels(rows, pixelClipboard, origin[0], origin[1]);
      setRows(result.rows); pixelSelection = result.selection; pixelTool = 'select';
    });
  }
  function pixelKeydown(event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') { event.preventDefault(); copySelection(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') { event.preventDefault(); pasteSelection(); return; }
    if (pixelTool !== 'select') return;
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); applySelection(true); return; }
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (direction) { event.preventDefault(); moveSelection(...direction); }
  }
  function addAnimation() {
    edit('Animation anlegen', () => {
      const base = newAnimationName.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'animation';
      let id = base; let suffix = 2; while (draft.animations.some((entry) => entry.id === id)) { id = `${base}-${suffix}`; suffix += 1; }
      draft.animations.push({ id, fps: 6, duration: 1, loop: true, keyframes: [{ id: 'keyframe-1', time: 0, easing: 'step', pixels: [...rows] }] });
      selectAnimation(id); if (showStates) { draft.stateAnimations ??= {}; draft.stateAnimations[selectedState] = id; }
    });
  }
  function deleteAnimation() {
    if (!selectedAnimation) return;
    edit('Animation löschen', () => {
      draft.animations = draft.animations.filter((entry) => entry.id !== selectedAnimationId);
      Object.keys(draft.stateAnimations ?? {}).forEach((state) => { if (draft.stateAnimations[state] === selectedAnimationId) draft.stateAnimations[state] = ''; });
      selectAnimation(draft.animations[0]?.id ?? 'base');
    });
  }
  function addKeyframeRaw() {
    if (!selectedAnimation || selectedAnimation.keyframes.length >= 64) return;
    const frame = insertSpriteKeyframe(selectedAnimation, rows, playhead);
    selectedKeyframeId = frame.id; playhead = frame.time; playing = false;
  }
  function addKeyframe() { edit('Keyframe anlegen', addKeyframeRaw); }
  function duplicateAfter() {
    if (!selectedAnimation) return;
    edit('Keyframe duplizieren', () => { playhead = Math.min(selectedAnimation.duration, (selectedKeyframe?.time ?? 0) + Math.max(0.05, 1 / selectedAnimation.fps)); addKeyframeRaw(); });
  }
  function deleteKeyframe() {
    if (selectedAnimation?.keyframes.length > 1) {
      edit('Keyframe löschen', () => {
        selectedAnimation.keyframes = selectedAnimation.keyframes.filter((entry) => entry.id !== selectedKeyframeId);
        selectedKeyframeId = selectedAnimation.keyframes[0].id; playhead = selectedAnimation.keyframes[0].time;
      });
    }
  }
  function moveKeyframeTime(event) {
    if (!selectedKeyframe || !selectedAnimation) return;
    edit('Keyframe verschieben', () => { selectedKeyframe.time = Number(event.currentTarget.value); selectedAnimation.keyframes.sort((left, right) => left.time - right.time); playhead = selectedKeyframe.time; });
  }
  function addColor() { edit('Farbe hinzufügen', () => { if (!draft.palette.includes(newColor) && draft.palette.length < 36) draft.palette.push(newColor); paletteIndex = draft.palette.indexOf(newColor); }); }
  function updatePaletteColor(value) {
    if (paletteIndex <= 0) return;
    edit('Palettenfarbe ändern', () => { draft.palette[paletteIndex] = value; newColor = value; });
  }
  function removePaletteColor() {
    if (paletteIndex <= 0 || draft.palette.length <= 2) return;
    edit('Palettenfarbe löschen', () => {
      const removed = paletteIndex;
      draft.palette.splice(removed, 1);
      const remap = (row) => [...row].map((token) => {
        const index = Number.parseInt(token, 36);
        if (index === removed) return '0';
        return (index > removed ? index - 1 : index).toString(36);
      }).join('');
      draft.pixels = draft.pixels.map(remap);
      draft.animations.forEach((animation) => animation.keyframes.forEach((frame) => frame.pixels = frame.pixels.map(remap)));
      paletteIndex = Math.min(removed, draft.palette.length - 1);
    });
  }
  function mapState(event) { const id = event.currentTarget.value; edit('State zuordnen', () => { draft.stateAnimations ??= {}; draft.stateAnimations[selectedState] = id; selectAnimation(id); }); }
  function resizeDraft(event) {
    const size = Number(event.currentTarget.value); if (size === draft.width && size === draft.height) return;
    edit(`Leinwand auf ${size} × ${size} skalieren`, () => { draft = prepareAppearanceForEditing(resizeAppearance(draft, size)); pixelSelection = []; });
  }
  function updateAnimation(field, value, label) { if (!selectedAnimation) return; edit(label, () => selectedAnimation[field] = value); }
  function updateKeyframe(field, value, label) { if (!selectedKeyframe) return; edit(label, () => selectedKeyframe[field] = value); }
  function editorKeyboard(event) {
    if (!(event.ctrlKey || event.metaKey) || !['z', 'y'].includes(event.key.toLowerCase())) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.key.toLowerCase() === 'y' || event.shiftKey) redo(); else undo();
  }
  function save() {
    if (!draft.animations.length) draft.animations.push({ id: 'idle', fps: 4, duration: 0.25, loop: true, keyframes: [{ id: 'keyframe-1', time: 0, easing: 'step', pixels: [...draft.pixels] }] });
    if (showStates) { draft.stateAnimations ??= {}; PLAYER_STATES.forEach((state) => { if (!draft.stateAnimations[state]) draft.stateAnimations[state] = draft.animations[0].id; }); }
    draft.animations.forEach((animation) => { animation.frames = animation.keyframes.map((frame) => ({ pixels: frame.pixels })); });
    onsave(clone(draft));
  }
  onMount(() => { animationFrame = requestAnimationFrame(tick); return () => cancelAnimationFrame(animationFrame); });
</script>

<svelte:window onkeydown={editorKeyboard} />

<section class="sprite-studio" aria-label={title}>
  <header><div><span class="eyebrow">SPRITE-SHEET · KEYFRAMES</span><h3>{title}</h3><p>Zustand → Animation → Keyframe → Pixel. Mit echter 24×24-Arbeitsfläche, Timeline und Playback.</p></div><div class="modal-actions sprite-studio-actions"><div class="history-actions" aria-label="Änderungsverlauf"><button onclick={undo} disabled={!canUndo} aria-label="Sprite-Änderung rückgängig" title={history.at(-1)?.label ?? 'Nichts rückgängig zu machen'}>↶</button><button onclick={redo} disabled={!canRedo} aria-label="Sprite-Änderung wiederholen" title={future.at(-1)?.label ?? 'Nichts zu wiederholen'}>↷</button></div><button onclick={oncancel}>Abbrechen</button><button class="primary" onclick={save}>Sprite übernehmen</button></div></header>
  <div class="sprite-playback-stage">
    <ActorThumbnail appearance={draft} kind="player" state={selectedState} animationId={selectedAnimationId === 'base' ? '' : selectedAnimationId} elapsed={playhead} class="sprite-playback-preview" label={`${title} Playback-Vorschau`} />
    <div class="keyframe-transport"><button onclick={() => { playhead = 0; playing = false; }}>■</button><button class="primary" disabled={!selectedAnimation} onclick={() => { if (playhead >= selectedAnimation.duration) playhead = 0; playing = !playing; lastTimestamp = 0; }}>{playing ? 'Ⅱ Pause' : '▶ Playback'}</button><input type="range" min="0" max={selectedAnimation?.duration ?? 1} step="0.01" bind:value={playhead} disabled={!selectedAnimation} /><code>{playhead.toFixed(2)} / {(selectedAnimation?.duration ?? 0).toFixed(2)} s</code></div>
    {#if selectedAnimation}<div class="keyframe-ruler"><div class="timeline-playhead" style:left={`${playhead / selectedAnimation.duration * 100}%`}></div>{#each selectedAnimation.keyframes as frame}<button class:active={frame.id === selectedKeyframeId} style:left={`${frame.time / selectedAnimation.duration * 100}%`} onclick={() => { selectedKeyframeId = frame.id; playhead = frame.time; playing = false; }} title={`${frame.id} · ${frame.time.toFixed(2)} s`}></button>{/each}</div>{/if}
  </div>
  <div class="sprite-layout" data-pixel-tool={pixelTool} data-pixel-selection-count={pixelSelection.length}>
    <aside class="sprite-sheet-strip">
      {#if showStates}<strong>Player States</strong><div class="state-tabs">{#each PLAYER_STATES as state}<button class:active={selectedState === state} onclick={() => activateState(state)}>{state === 'idle' ? '•' : state === 'up' ? '↑' : state === 'right' ? '→' : state === 'down' ? '↓' : '←'}<span>{state}</span></button>{/each}</div><label>Verwendete Animation<select value={draft.stateAnimations?.[selectedState] || selectedAnimationId} onchange={mapState}>{#each draft.animations as animation}<option value={animation.id}>{animation.id}</option>{/each}</select></label>{/if}
      <strong>Animationen</strong><div class="animation-list"><button class:active={selectedAnimationId === 'base'} onclick={() => selectAnimation('base')}>Basisbild</button>{#each draft.animations as animation}<button class:active={selectedAnimationId === animation.id} onclick={() => selectAnimation(animation.id)}>{animation.id}<small>{animation.keyframes.length} Keyframes · {animation.duration.toFixed(2)} s</small></button>{/each}</div>
      <div class="inline-create"><input bind:value={newAnimationName} aria-label="Name der neuen Animation" /><button onclick={addAnimation}>＋</button></div><button class="danger-subtle" onclick={deleteAnimation} disabled={!selectedAnimation}>Animation löschen</button>
    </aside>
    <div class="pixel-editor-column">
      <div class="frame-toolbar"><strong>{selectedKeyframe ? `${selectedAnimation.id} · ${selectedKeyframe.id}` : 'Basisbild'}</strong><div class="sprite-resolution"><span>{pixelSelection.length ? `${pixelSelection.length} ausgewählt` : 'keine Auswahl'}</span><label>Leinwand<select aria-label="Sprite-Auflösung" value={draft.width} onchange={resizeDraft}>{#each SPRITE_SIZES as size}<option value={size}>{size} × {size}</option>{/each}</select></label></div></div>
      <div class="pixel-toolbox" role="toolbar" aria-label="Pixelwerkzeuge">
        <button class:active={pixelTool === 'paint'} aria-pressed={pixelTool === 'paint'} onclick={() => pixelTool = 'paint'}>✎ Malen</button>
        <button class:active={pixelTool === 'line'} aria-pressed={pixelTool === 'line'} onclick={() => pixelTool = 'line'}>╱ Linie</button>
        <button class:active={pixelTool === 'rectangle'} aria-pressed={pixelTool === 'rectangle'} onclick={() => pixelTool = 'rectangle'}>▭ Rechteck</button>
        <button class:active={pixelTool === 'fill'} aria-pressed={pixelTool === 'fill'} onclick={() => pixelTool = 'fill'}>▨ Füllen</button>
        <button class:active={pixelTool === 'picker'} aria-pressed={pixelTool === 'picker'} onclick={() => pixelTool = 'picker'}>◉ Pipette</button>
        <button class:active={pixelTool === 'erase'} aria-pressed={pixelTool === 'erase'} onclick={() => pixelTool = 'erase'}>◇ Radieren</button>
        <button class:active={pixelTool === 'select'} aria-pressed={pixelTool === 'select'} onclick={() => pixelTool = 'select'}>⬚ Auswählen</button>
        {#if pixelTool === 'rectangle'}<label class="compact-switch"><input type="checkbox" bind:checked={shapeFilled} /> Gefüllt</label>{/if}
        <button disabled={!pixelSelection.length} onclick={selectSameColor}>Gleiche Farbe</button>
        <button disabled={!pixelSelection.length} onclick={() => applySelection(false)}>Farbe anwenden</button>
        <button disabled={!pixelSelection.length} onclick={() => applySelection(true)}>Auswahl löschen</button>
        <button disabled={!pixelSelection.length} onclick={copySelection}>Kopieren</button>
        <button disabled={!pixelClipboard} onclick={pasteSelection}>Einfügen</button>
        <button onclick={() => pixelSelection = Array.from({ length: draft.height }, (_, y) => Array.from({ length: draft.width }, (_, x) => `${x}:${y}`)).flat()}>Alles</button>
        <button onclick={() => pixelSelection = invertPixelSelection(pixelSelection, draft.width, draft.height)}>Umkehren</button>
        <button onclick={() => pixelSelection = []}>Aufheben</button>
      </div>
      <div class="pixel-grid" role="grid" tabindex="0" aria-label="Pixelraster" style={`--sprite-columns:${draft.width}; --sprite-rows:${draft.height}`} onkeydown={pixelKeydown} onpointerleave={endPixelGesture}>
        {#each rows as row, y}{#each [...row] as token, x}<button class:selected-pixel={isPixelSelected(x, y)} data-x={x} data-y={y} aria-label={`Pixel ${x}, ${y}`} aria-pressed={isPixelSelected(x, y)} style:background={tokenColor(token) === 'transparent' ? 'transparent' : tokenColor(token)} onpointerdown={(event) => startPixelGesture(event, x, y)} onpointerenter={(event) => continuePixelGesture(event, x, y)} onpointerup={endPixelGesture} oncontextmenu={(event) => event.preventDefault()}></button>{/each}{/each}
      </div>
      <div class="frame-actions"><button onclick={() => edit('Frame spiegeln', () => setRows(rows.map((row) => [...row].reverse().join(''))))}>⇆ Spiegeln</button>{#if pixelSelection.length}<button aria-label="Auswahl nach links" onclick={() => moveSelection(-1, 0)}>←</button><button aria-label="Auswahl nach oben" onclick={() => moveSelection(0, -1)}>↑</button><button aria-label="Auswahl nach unten" onclick={() => moveSelection(0, 1)}>↓</button><button aria-label="Auswahl nach rechts" onclick={() => moveSelection(1, 0)}>→</button>{/if}<button onclick={() => edit('Frame leeren', () => setRows(Array.from({ length: draft.height }, () => '0'.repeat(draft.width))))}>Leeren</button>{#if selectedAnimation}<button onclick={duplicateAfter}>＋ Keyframe duplizieren</button><button onclick={addKeyframe}>＋ Am Playhead</button><button onclick={deleteKeyframe} disabled={selectedAnimation.keyframes.length <= 1}>− Keyframe</button>{/if}</div>
    </div>
    <aside class="sprite-properties">
      <strong>Keyframes</strong><div class="sheet-grid">{#each selectedAnimation?.keyframes ?? [{ id: 'base', time: 0, pixels: draft.pixels }] as frame}<button class:active={frame.id === selectedKeyframeId} onclick={() => { selectedKeyframeId = frame.id; playhead = frame.time; playing = false; }} title={`${frame.time.toFixed(2)} s`}><span class="sprite-thumbnail" style={`--thumb-columns:${draft.width}`}>{#each frame.pixels as row}{#each [...row] as token}<i style:background={tokenColor(token) === 'transparent' ? 'transparent' : tokenColor(token)}></i>{/each}{/each}</span><small>{frame.time.toFixed(2)}s</small></button>{/each}</div>
      {#if selectedAnimation}<div class="field-row"><label>Dauer<input type="number" min="0.1" max="120" step="0.05" value={selectedAnimation.duration} onchange={(event) => updateAnimation('duration', Number(event.currentTarget.value), 'Animationsdauer ändern')} /></label><label class="switch"><input type="checkbox" checked={selectedAnimation.loop} onchange={(event) => updateAnimation('loop', event.currentTarget.checked, 'Loop ändern')} /><span>Loop</span></label></div>{/if}
      {#if selectedKeyframe}<label>Keyframe-Zeit<input type="number" min="0" max={selectedAnimation.duration} step="0.01" value={selectedKeyframe.time} onchange={moveKeyframeTime} /></label><label>Übergang<select value={selectedKeyframe.easing} onchange={(event) => updateKeyframe('easing', event.currentTarget.value, 'Übergang ändern')}><option value="step">Harter Framewechsel</option><option value="linear">Linear</option><option value="ease-in-out">Weich</option></select></label>{/if}
      <strong>Palette</strong><div class="palette-grid">{#each draft.palette as color, index}<button class:active={paletteIndex === index} style:background={color === 'transparent' ? 'transparent' : color} onclick={() => { paletteIndex = index; if (index > 0) newColor = color; }} title={color}></button>{/each}</div>
      {#if paletteIndex > 0}<label>Ausgewählte Farbe<input type="color" value={draft.palette[paletteIndex]} oninput={(event) => updatePaletteColor(event.currentTarget.value)} /></label><button class="danger-subtle" onclick={removePaletteColor} disabled={draft.palette.length <= 2}>Farbe entfernen</button>{/if}
      <div class="inline-create"><input type="color" bind:value={newColor} aria-label="Neue Farbe" /><button onclick={addColor}>Farbe hinzufügen</button></div>
    </aside>
  </div>
</section>
