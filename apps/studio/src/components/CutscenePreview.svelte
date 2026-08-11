<script>
  import { onMount } from 'svelte';
  import { PassauPixelRenderer, sampleCutscene, tileKey } from '@franz-lola/pixel-renderer';

  let { studio, cutscene, time = $bindable(0) } = $props();
  let canvas;
  let renderer;
  let playing = $state(false);
  let lastTimestamp = 0;
  let frame;
  let sample = $derived(sampleCutscene(studio.level, cutscene, time, studio.language));

  function render() {
    if (!renderer || !cutscene) return;
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
    }, { cameraEnabled: true, cameraTarget, zoom: sample.camera?.zoom ?? 1.12, language: studio.language });
    canvas.dataset.rendererBackend = result.renderer.backend;
    canvas.dataset.rendered = 'true';
  }

  function tick(timestamp) {
    if (playing && cutscene) {
      if (lastTimestamp) time = Math.min(cutscene.duration, time + (timestamp - lastTimestamp) / 1000);
      if (time >= cutscene.duration) playing = false;
    }
    lastTimestamp = timestamp; render(); frame = requestAnimationFrame(tick);
  }

  function toggle() { if (time >= cutscene.duration) time = 0; playing = !playing; lastTimestamp = 0; }

  onMount(() => {
    let disposed = false;
    const resize = new ResizeObserver(render); resize.observe(canvas);
    PassauPixelRenderer.create(canvas, { zoom: 1.12, backend: 'auto', preferWebGPU: true, quality: 'auto', powerPreference: 'low-power' }).then((instance) => {
      if (disposed) { instance.destroy(); return; }
      renderer = instance; renderer.setLevel(studio.level); frame = requestAnimationFrame(tick);
    });
    return () => { disposed = true; cancelAnimationFrame(frame); resize.disconnect(); renderer?.destroy(); };
  });

  $effect(() => { studio.revision; cutscene; time; studio.language; if (renderer) { renderer.setLevel(studio.level); render(); } });
</script>

<div class="cutscene-preview">
  <canvas bind:this={canvas} aria-label="Cutscene-Vorschau"></canvas>
  <div class="cutscene-preview-top"><span>MAP → LEVEL</span><strong>{cutscene.name[studio.language]}</strong><button onclick={() => studio.language = studio.language === 'standard' ? 'dialect' : 'standard'}>{studio.language === 'standard' ? 'DE · Schön' : 'BAY · Dialekt*'}</button></div>
  {#if sample.dialogue}<div class="dialogue-card"><strong>{sample.dialogue.speaker}</strong><span>{sample.dialogue.text}</span></div>{/if}
  <div class="cutscene-transport"><button class="primary" onclick={toggle}>{playing ? 'Ⅱ Pause' : '▶ Abspielen'}</button><input type="range" min="0" max={cutscene.duration} step="0.01" bind:value={time} aria-label="Cutscene-Zeit" /><code>{time.toFixed(2)} / {cutscene.duration.toFixed(2)} s</code></div>
</div>
