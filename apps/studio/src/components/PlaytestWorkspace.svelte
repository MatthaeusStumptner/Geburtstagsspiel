<script>
  import { onMount } from 'svelte';
  import { DirectionalSwipeInput, FixedStepLoop, PassauPixelRenderer, cutsceneById, sampleCutscene, tileKey } from '@franz-lola/pixel-renderer';
  import { PlaytestEngine } from '../playtest-engine.js';

  let { studio } = $props();
  let canvas;
  let stage;
  let renderer;
  let rendererReady = $state(false);
  let pendingStart = $state(false);
  let engine = $state.raw(null);
  let loop = $state.raw(null);
  let frame;
  let mode = $state('stopped');
  let paused = $state(false);
  let cameraEnabled = $state(true);
  let cutsceneTime = $state(0);
  let lastTimestamp = 0;
  let snapshot = $state.raw(null);
  let dialogue = $state.raw(null);
  const swipe = new DirectionalSwipeInput({ activationDistance: 4, dominanceRatio: 1.08 });
  let intro = $derived(cutsceneById(studio.level, 'intro'));

  function start() {
    if (!studio.validation.ok) { studio.notify('Bitte zuerst die Level-Fehler beheben'); studio.workspace = 'level'; return; }
    if (!renderer) { pendingStart = true; studio.notify('Grafik wird vorbereitet · der Test startet gleich automatisch'); return; }
    pendingStart = false;
    renderer.setLevel(studio.level); paused = false; lastTimestamp = 0; cutsceneTime = 0;
    if (intro) mode = 'cutscene'; else startGame();
  }
  function startGame() {
    engine = new PlaytestEngine(studio.level, studio.difficulty); loop = new FixedStepLoop({ updatesPerSecond: 120 }); loop.reset(); mode = 'game'; snapshot = engine.snapshot(); dialogue = null; lastTimestamp = 0;
  }
  function reset() { start(); }
  function stop() { mode = 'stopped'; engine = null; loop = null; snapshot = null; dialogue = null; swipe.cancel(); }
  function direction(name) { if (engine && mode === 'game') engine.setDirection(name); }

  function renderCutscene() {
    const sample = sampleCutscene(studio.level, intro, cutsceneTime, studio.language); const tile = studio.level.board.tileSize;
    dialogue = sample.dialogue;
    const result = renderer.render({ player: sample.player, cats: sample.cats, characters: sample.characters, decorations: sample.decorations, pellets: new Set(), powerUps: new Set(studio.level.collectibles.powerUps.map((point) => tileKey(point.x, point.y))), elapsed: cutsceneTime }, {
      cameraEnabled: true,
      cameraTarget: sample.camera ? { x: sample.camera.x * tile + tile / 2, y: sample.camera.y * tile + tile / 2 } : undefined,
      zoom: sample.camera?.zoom ?? 1.12,
    });
    canvas.dataset.rendererBackend = result.renderer.backend;
  }
  function renderGame() {
    if (!snapshot) return;
    const result = renderer.render(snapshot, { cameraEnabled, zoom: 1.12, alpha: loop?.interpolationAlpha ?? 1 });
    canvas.dataset.rendererBackend = result.renderer.backend;
    canvas.dataset.playerDirection = snapshot.player.dir.name; canvas.dataset.playerNextDirection = snapshot.player.nextDir.name;
  }
  function tick(timestamp) {
    if (mode !== 'stopped' && !paused) {
      if (mode === 'cutscene') {
        if (lastTimestamp) cutsceneTime += (timestamp - lastTimestamp) / 1000;
        if (cutsceneTime >= intro.duration) startGame(); else renderCutscene();
      } else if (mode === 'game') {
        loop.advance(timestamp, (dt) => engine.step(dt)); snapshot = engine.snapshot(); renderGame();
      }
    } else if (mode === 'cutscene') renderCutscene(); else if (mode === 'game') renderGame();
    lastTimestamp = timestamp; frame = requestAnimationFrame(tick);
  }
  async function fullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await stage.requestFullscreen(); } catch { stage.classList.toggle('immersive'); }
    renderer?.resize();
  }
  function pointerDown(event) { if (event.target.closest('button') || mode !== 'game') return; event.preventDefault(); swipe.begin({ x: event.clientX, y: event.clientY, pointerId: event.pointerId }); stage.setPointerCapture?.(event.pointerId); }
  function pointerMove(event) { if (swipe.pointerId !== event.pointerId) return; event.preventDefault(); const next = swipe.update({ x: event.clientX, y: event.clientY, pointerId: event.pointerId }); if (next) direction(next); }
  function pointerUp(event) { if (swipe.pointerId !== event.pointerId) return; const next = swipe.end({ x: event.clientX, y: event.clientY, pointerId: event.pointerId }); if (next) direction(next); }
  function keyboard(event) { const names = { ArrowUp: 'up', w: 'up', ArrowRight: 'right', d: 'right', ArrowDown: 'down', s: 'down', ArrowLeft: 'left', a: 'left' }; if (names[event.key]) { event.preventDefault(); direction(names[event.key]); } }

  onMount(() => {
    let disposed = false;
    window.addEventListener('keydown', keyboard); const resize = new ResizeObserver(() => renderer?.resize()); resize.observe(stage);
    PassauPixelRenderer.create(canvas, { zoom: 1.12, backend: 'auto', preferWebGPU: true, quality: 'auto', powerPreference: 'low-power' }).then((instance) => {
      if (disposed) { instance.destroy(); return; }
      renderer = instance; rendererReady = true; renderer.setLevel(studio.level); frame = requestAnimationFrame(tick);
      if (pendingStart) queueMicrotask(start);
    });
    return () => { disposed = true; cancelAnimationFrame(frame); window.removeEventListener('keydown', keyboard); resize.disconnect(); renderer?.destroy(); };
  });
  $effect(() => { studio.revision; if (renderer && mode === 'stopped') renderer.setLevel(studio.level); });
</script>

<section class="workspace playtest-workspace" aria-labelledby="playtest-workspace-title">
  <header class="workspace-header"><div><span class="eyebrow">GAME-SIMULATION · 120 TICKS</span><h2 id="playtest-workspace-title">Testspiel</h2><p>Dieselbe Simulation, Kamera, Cutscene und Steuerung wie im fertigen Spiel.</p></div><div><select bind:value={studio.difficulty}><option value="easy">Spaziergang</option><option value="normal">Gassirunde</option><option value="hard">Abenteuer</option></select><button class="primary" id="start-playtest" onclick={start}>{pendingStart ? '◌ Start wird vorbereitet …' : '▶ Mit Intro starten'}</button></div></header>
  <div class="playtest-stage" bind:this={stage} class:running={mode !== 'stopped'} role="application" aria-label="Interaktive Spielsimulation" data-renderer-ready={rendererReady} onpointerdown={pointerDown} onpointermove={pointerMove} onpointerup={pointerUp} onpointercancel={() => swipe.cancel()}>
    <canvas bind:this={canvas} id="playtest-canvas" aria-label="Spielbare Levelvorschau"></canvas>
    {#if mode === 'stopped'}<div class="playtest-empty"><span>▶</span><h3>Bereit für die echte Spielerfahrung</h3><p>{intro ? `Intro „${intro.name.standard}“ wird vor dem Level abgespielt.` : 'Dieses Level besitzt noch kein Intro. Der Test startet direkt.'}</p><button class="primary" onclick={start}>Testlauf starten</button></div>{/if}
    {#if mode !== 'stopped'}
      <div class="playtest-top-overlay"><span>{mode === 'cutscene' ? 'CUTSCENE' : 'TESTLAUF'}</span><strong>{studio.level.name[studio.language]}</strong><div><button onclick={() => studio.language = studio.language === 'standard' ? 'dialect' : 'standard'}>{studio.language === 'standard' ? 'DE · Schön' : 'BAY · Dialekt*'}</button><button aria-pressed={cameraEnabled} onclick={() => cameraEnabled = !cameraEnabled}>◎ Kamera</button><button onclick={fullscreen}>⛶ Vollbild</button></div></div>
      {#if dialogue}<div class="dialogue-card play-dialogue"><strong>{dialogue.speaker}</strong><span>{dialogue.text}</span></div>{/if}
      <div class="playtest-hud"><span>GUTTIS <strong>{snapshot?.collected ?? 0} / {engine?.initialPellets.size ?? 0}</strong></span><span>PUNKTE <strong>{snapshot?.score ?? 0}</strong></span><span>LEBEN <strong>{snapshot?.lives ?? studio.level.gameplay.difficulties[studio.difficulty].lives}</strong></span><span class="play-state">{mode === 'cutscene' ? `INTRO ${cutsceneTime.toFixed(1)}s` : paused ? 'PAUSE' : snapshot?.state === 'won' ? 'LEVEL GESCHAFFT' : 'PFEILTASTEN · WASD · WISCHEN'}</span><button onclick={() => paused = !paused}>{paused ? '▶ Weiter' : 'Ⅱ Pause'}</button><button onclick={reset}>↺ Neu</button><button onclick={stop}>× Ende</button></div>
      {#if mode === 'cutscene' && intro?.skippable}<button class="skip-cutscene" onclick={startGame}>Intro überspringen →</button>{/if}
      {#if mode === 'game'}<div class="mobile-dpad"><button onpointerdown={() => direction('up')}>▲</button><button onpointerdown={() => direction('left')}>◀</button><button onpointerdown={() => direction('down')}>▼</button><button onpointerdown={() => direction('right')}>▶</button></div>{/if}
    {/if}
  </div>
</section>
