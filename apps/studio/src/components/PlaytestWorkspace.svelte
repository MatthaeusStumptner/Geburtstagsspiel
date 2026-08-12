<script>
  import { onMount } from 'svelte';
  import { tileKey } from '@franz-lola/content-model';
  import { cutsceneById, sampleCutscene } from '@franz-lola/game-core';
  import { DirectionalSwipeInput, PassauPixelRenderer } from '@franz-lola/pixel-renderer';
  import { PlaytestEngine, createPlaytestPresentation, playtestFrameDelta } from '../playtest-engine.js';
  import { useRenderSurface } from '../render/use-render-surface.svelte.js';

  let { studio } = $props();
  let canvas;
  let stage;
  let renderer;
  let rendererReady = $state(false);
  let pendingStart = $state(false);
  let engine = $state.raw(null);
  let mode = $state('stopped');
  let paused = $state(false);
  let cameraEnabled = $state(true);
  let cutsceneTime = $state(0);
  let lastTimestamp = null;
  let snapshot = $state.raw(null);
  let dialogue = $state.raw(null);
  let presentationCount = $state(0);
  let presentedProfile = $state('editor');
  const swipe = new DirectionalSwipeInput({ activationDistance: 4, dominanceRatio: 1.08 });
  let intro = $derived(cutsceneById(studio.level, 'intro'));

  function syncSurface(reason) {
    const active = mode !== 'stopped' && !paused;
    surface.setProfile(active ? 'playtest' : 'editor');
    surface.setActive(active);
    surface.invalidate(reason);
  }
  function start() {
    if (!studio.validation.ok) { studio.notify('Bitte zuerst die Level-Fehler beheben'); studio.workspace = 'level'; return; }
    if (!renderer) { pendingStart = true; studio.notify('Grafik wird vorbereitet · der Test startet gleich automatisch'); return; }
    pendingStart = false;
    renderer.setLevel(studio.level); paused = false; lastTimestamp = null; cutsceneTime = 0;
    if (intro) mode = 'cutscene'; else startGame();
    syncSurface('playtest:start');
  }
  function startGame() {
    engine = new PlaytestEngine(studio.level, studio.difficulty); mode = 'game'; snapshot = engine.snapshot(); dialogue = null; lastTimestamp = null;
    syncSurface('playtest:game');
  }
  function reset() { start(); }
  function stop() { mode = 'stopped'; engine = null; snapshot = null; dialogue = null; swipe.cancel(); syncSurface('playtest:stop'); }
  function togglePause() { paused = !paused; lastTimestamp = null; syncSurface(paused ? 'playtest:pause' : 'playtest:resume'); }
  function direction(name) { if (engine && mode === 'game') engine.setDirection(name); }

  function renderCutscene() {
    const sample = sampleCutscene(studio.level, intro, cutsceneTime, studio.language); const tile = studio.level.board.tileSize;
    dialogue = sample.dialogue;
    return renderer.render({ player: sample.player, cats: sample.cats, characters: sample.characters, decorations: sample.decorations, pellets: new Set(), powerUps: new Set(studio.level.collectibles.powerUps.map((point) => tileKey(point.x, point.y))), elapsed: cutsceneTime }, {
      cameraEnabled: true,
      cameraTarget: sample.camera ? { x: sample.camera.x * tile + tile / 2, y: sample.camera.y * tile + tile / 2 } : undefined,
      zoom: sample.camera?.zoom ?? 1.12,
      language: studio.language,
      reducedMotion: surface.snapshot().reducedMotion,
      presentationTime: cutsceneTime,
    });
  }
  function renderGame() {
    if (!snapshot) return null;
    const presentation = createPlaytestPresentation(snapshot, {
      cameraEnabled,
      zoom: 1.12,
      reducedMotion: surface.snapshot().reducedMotion,
    });
    const result = renderer.render(presentation.snapshot, presentation.options);
    const tile = studio.level.board.tileSize;
    canvas.dataset.playerDirection = snapshot.player.dir.name;
    canvas.dataset.playerNextDirection = snapshot.player.nextDir.name;
    canvas.dataset.snapshotPlayer = JSON.stringify({ x: snapshot.player.x, y: snapshot.player.y });
    canvas.dataset.snapshotPreviousPlayer = JSON.stringify(snapshot.previousPositions.player);
    canvas.dataset.snapshotCats = JSON.stringify(snapshot.cats.map(({ x, y }) => ({ x, y })));
    canvas.dataset.snapshotPreviousCats = JSON.stringify(snapshot.previousPositions.cats);
    canvas.dataset.presentedPlayer = JSON.stringify({ x: result.player.world.x / tile - 0.5, y: result.player.world.y / tile - 0.5 });
    canvas.dataset.presentedCats = JSON.stringify(result.cats.map((cat) => ({ x: cat.world.x / tile - 0.5, y: cat.world.y / tile - 0.5 })));
    canvas.dataset.interpolationAlpha = String(snapshot.interpolationAlpha);
    return result;
  }
  function recordPresentation(result, { renderCount, profile, measurement }) {
    if (!result) return;
    canvas.dataset.rendererBackend = result.renderer.backend;
    canvas.dataset.presentationKind = result.kind;
    canvas.dataset.displayWidth = String(result.display.width);
    canvas.dataset.displayHeight = String(result.display.height);
    canvas.dataset.displayBufferWidth = String(result.display.bufferWidth);
    canvas.dataset.displayBufferHeight = String(result.display.bufferHeight);
    canvas.dataset.measuredWidth = String(measurement.width);
    canvas.dataset.measuredHeight = String(measurement.height);
    canvas.dataset.cameraSource = JSON.stringify(result.camera.source);
    canvas.dataset.cameraViewport = JSON.stringify(result.camera.viewport);
    presentationCount = renderCount + 1;
    presentedProfile = profile;
  }
  function present(frame) {
    const { timestamp, measurement } = frame;
    if (!renderer || !measurement) return;
    renderer.resize(measurement);
    let result = null;
    if (mode !== 'stopped' && !paused) {
      const seconds = playtestFrameDelta(lastTimestamp, timestamp, { resume: frame.visibilityResume });
      canvas.dataset.frameDelta = String(seconds);
      if (mode === 'cutscene') {
        cutsceneTime += seconds;
        if (cutsceneTime >= intro.duration) startGame();
        result = mode === 'game' ? renderGame() : renderCutscene();
      } else if (mode === 'game') {
        if (seconds > 0) snapshot = engine.step(seconds);
        result = renderGame();
      }
    } else if (mode === 'cutscene') result = renderCutscene();
    else if (mode === 'game') result = renderGame();
    lastTimestamp = timestamp;
    recordPresentation(result, frame);
  }

  const surface = useRenderSurface({
    id: 'studio-playtest-workspace',
    profile: 'editor',
    render: present,
  });
  const renderSurface = surface.action;

  async function fullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await stage.requestFullscreen(); } catch { stage.classList.toggle('immersive'); }
    surface.invalidate('layout:fullscreen');
  }
  function pointerDown(event) { if (event.target.closest('button') || mode !== 'game') return; event.preventDefault(); swipe.begin({ x: event.clientX, y: event.clientY, pointerId: event.pointerId }); stage.setPointerCapture?.(event.pointerId); }
  function pointerMove(event) { if (swipe.pointerId !== event.pointerId) return; event.preventDefault(); const next = swipe.update({ x: event.clientX, y: event.clientY, pointerId: event.pointerId }); if (next) direction(next); }
  function pointerUp(event) { if (swipe.pointerId !== event.pointerId) return; const next = swipe.end({ x: event.clientX, y: event.clientY, pointerId: event.pointerId }); if (next) direction(next); }
  function keyboard(event) { const names = { ArrowUp: 'up', w: 'up', ArrowRight: 'right', d: 'right', ArrowDown: 'down', s: 'down', ArrowLeft: 'left', a: 'left' }; if (names[event.key]) { event.preventDefault(); direction(names[event.key]); } }

  onMount(() => {
    let disposed = false;
    window.addEventListener('keydown', keyboard);
    PassauPixelRenderer.create(canvas, { zoom: 1.12, backend: 'auto', preferWebGPU: true, quality: 'auto', powerPreference: 'low-power' }).then((instance) => {
      if (disposed) { instance.destroy(); return; }
      renderer = instance; rendererReady = true; renderer.setLevel(studio.level); surface.invalidate('renderer:ready');
      if (pendingStart) queueMicrotask(start);
    });
    return () => { disposed = true; window.removeEventListener('keydown', keyboard); renderer?.destroy(); renderer = null; };
  });
  $effect(() => {
    studio.revision; mode; paused; cameraEnabled; studio.language;
    if (renderer && mode === 'stopped') renderer.setLevel(studio.level);
    const active = mode !== 'stopped' && !paused;
    surface.setProfile(active ? 'playtest' : 'editor');
    surface.setActive(active);
    surface.invalidate('playtest:reactive');
  });
</script>

<section class="workspace playtest-workspace" aria-labelledby="playtest-workspace-title">
  <header class="workspace-header"><div><span class="eyebrow">GAME-SIMULATION · 120 TICKS</span><h2 id="playtest-workspace-title">Testspiel</h2><p>Dieselbe Simulation, Kamera, Cutscene und Steuerung wie im fertigen Spiel.</p></div><div><select bind:value={studio.difficulty}><option value="easy">Spaziergang</option><option value="normal">Gassirunde</option><option value="hard">Abenteuer</option></select><button class="primary" id="start-playtest" onclick={start}>{pendingStart ? '◌ Start wird vorbereitet …' : '▶ Mit Intro starten'}</button></div></header>
  <div class="playtest-stage" bind:this={stage} class:running={mode !== 'stopped'} role="application" aria-label="Interaktive Spielsimulation" data-renderer-ready={rendererReady} onpointerdown={pointerDown} onpointermove={pointerMove} onpointerup={pointerUp} onpointercancel={() => swipe.cancel()}>
    <canvas
      bind:this={canvas}
      use:renderSurface
      id="playtest-canvas"
      aria-label="Spielbare Levelvorschau"
      data-render-count={presentationCount}
      data-render-profile={presentedProfile}
      data-playtest-mode={mode}
      data-paused={paused}
    ></canvas>
    {#if mode === 'stopped'}<div class="playtest-empty"><span>▶</span><h3>Bereit für die echte Spielerfahrung</h3><p>{intro ? `Intro „${intro.name.standard}“ wird vor dem Level abgespielt.` : 'Dieses Level besitzt noch kein Intro. Der Test startet direkt.'}</p><button class="primary" onclick={start}>Testlauf starten</button></div>{/if}
    {#if mode !== 'stopped'}
      <div class="playtest-top-overlay"><span>{mode === 'cutscene' ? 'CUTSCENE' : 'TESTLAUF'}</span><strong>{studio.level.name[studio.language]}</strong><div><button onclick={() => studio.language = studio.language === 'standard' ? 'dialect' : 'standard'}>{studio.language === 'standard' ? 'DE · Schön' : 'BAY · Dialekt*'}</button><button aria-pressed={cameraEnabled} onclick={() => cameraEnabled = !cameraEnabled}>◎ Kamera</button><button onclick={fullscreen}>⛶ Vollbild</button></div></div>
      {#if dialogue}<div class="dialogue-card play-dialogue"><strong>{dialogue.speaker}</strong><span>{dialogue.text}</span></div>{/if}
      <div class="playtest-hud"><span>GUTTIS <strong>{snapshot?.collected ?? 0} / {engine?.initialPellets.size ?? 0}</strong></span><span>PUNKTE <strong>{snapshot?.score ?? 0}</strong></span><span>LEBEN <strong>{snapshot?.lives ?? studio.level.gameplay.difficulties[studio.difficulty].lives}</strong></span><span class="play-state">{mode === 'cutscene' ? `INTRO ${cutsceneTime.toFixed(1)}s` : paused ? 'PAUSE' : snapshot?.state === 'won' ? 'LEVEL GESCHAFFT' : 'PFEILTASTEN · WASD · WISCHEN'}</span><button onclick={togglePause}>{paused ? '▶ Weiter' : 'Ⅱ Pause'}</button><button onclick={reset}>↺ Neu</button><button onclick={stop}>× Ende</button></div>
      {#if mode === 'cutscene' && intro?.skippable}<button class="skip-cutscene" onclick={startGame}>Intro überspringen →</button>{/if}
      {#if mode === 'game'}<div class="mobile-dpad"><button onpointerdown={() => direction('up')}>▲</button><button onpointerdown={() => direction('left')}>◀</button><button onpointerdown={() => direction('down')}>▼</button><button onpointerdown={() => direction('right')}>▶</button></div>{/if}
    {/if}
  </div>
</section>
