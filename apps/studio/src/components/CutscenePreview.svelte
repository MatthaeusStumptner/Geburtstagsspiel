<script>
  import { onMount } from 'svelte';
  import { tileKey } from '@franz-lola/content-model';
  import { sampleCutscene } from '@franz-lola/game-core';
  import { PassauPixelRenderer } from '@franz-lola/pixel-renderer';
  import { useRenderSurface } from '../render/use-render-surface.svelte.js';

  let { studio, cutscene, time = $bindable(0) } = $props();
  let canvas;
  let renderer;
  let playing = $state(false);
  let lastTimestamp = 0;
  let presentationCount = $state(0);
  let presentedProfile = $state('editor');
  let sample = $derived(sampleCutscene(studio.level, cutscene, time, studio.language));

  function renderCurrent(measurement) {
    if (!renderer || !cutscene || !measurement) return;
    renderer.resize(measurement);
    const tile = studio.level.board.tileSize;
    const cameraTarget = sample.camera ? { x: sample.camera.x * tile + tile / 2, y: sample.camera.y * tile + tile / 2 } : undefined;
    const result = renderer.render({
      player: sample.player,
      cats: sample.cats,
      characters: sample.characters,
      decorations: sample.decorations,
      pellets: new Set(),
      powerUps: new Set(studio.level.collectibles.powerUps.map((point) => tileKey(point.x, point.y))),
      elapsed: time,
    }, {
      cameraEnabled: true,
      cameraTarget,
      zoom: sample.camera?.zoom ?? 1.12,
      language: studio.language,
      reducedMotion: surface.snapshot().reducedMotion,
      presentationTime: time,
    });
    canvas.dataset.rendererBackend = result.renderer.backend;
    canvas.dataset.presentationKind = result.kind;
    canvas.dataset.rendered = 'true';
  }

  function present({ timestamp, measurement, renderCount, profile }) {
    if (playing && cutscene) {
      const delta = lastTimestamp ? timestamp - lastTimestamp : 0;
      if (delta > 0 && delta <= 100) time = Math.min(cutscene.duration, time + delta / 1000);
      if (time >= cutscene.duration) playing = false;
    }
    lastTimestamp = timestamp;
    renderCurrent(measurement);
    presentationCount = renderCount + 1;
    presentedProfile = profile;
  }

  const surface = useRenderSurface({
    id: 'studio-cutscene-preview',
    profile: 'editor',
    render: present,
  });
  const renderSurface = surface.action;

  function toggle() {
    if (time >= cutscene.duration) time = 0;
    playing = !playing;
    lastTimestamp = 0;
    surface.setProfile(playing ? 'playtest' : 'editor');
    surface.setActive(playing);
    surface.invalidate(playing ? 'playback:start' : 'playback:pause');
  }

  onMount(() => {
    let disposed = false;
    PassauPixelRenderer.create(canvas, { zoom: 1.12, backend: 'auto', preferWebGPU: true, quality: 'auto', powerPreference: 'low-power' }).then((instance) => {
      if (disposed) { instance.destroy(); return; }
      renderer = instance;
      renderer.setLevel(studio.level);
      surface.invalidate('renderer:ready');
    });
    return () => { disposed = true; renderer?.destroy(); renderer = null; };
  });

  $effect(() => {
    studio.revision; cutscene; time; studio.language; playing;
    surface.setProfile(playing ? 'playtest' : 'editor');
    surface.setActive(playing);
    if (renderer) renderer.setLevel(studio.level);
    surface.invalidate('cutscene:reactive');
  });
</script>

<div class="cutscene-preview">
  <canvas
    bind:this={canvas}
    use:renderSurface
    aria-label="Cutscene-Vorschau"
    data-render-count={presentationCount}
    data-render-profile={presentedProfile}
  ></canvas>
  <div class="cutscene-preview-top"><span>MAP → LEVEL</span><strong>{cutscene.name[studio.language]}</strong><button onclick={() => studio.language = studio.language === 'standard' ? 'dialect' : 'standard'}>{studio.language === 'standard' ? 'DE · Schön' : 'BAY · Dialekt*'}</button></div>
  {#if sample.dialogue}<div class="dialogue-card"><strong>{sample.dialogue.speaker}</strong><span>{sample.dialogue.text}</span></div>{/if}
  <div class="cutscene-transport"><button class="primary" onclick={toggle}>{playing ? 'Ⅱ Pause' : '▶ Abspielen'}</button><input type="range" min="0" max={cutscene.duration} step="0.01" bind:value={time} aria-label="Cutscene-Zeit" /><code>{time.toFixed(2)} / {cutscene.duration.toFixed(2)} s</code></div>
</div>
