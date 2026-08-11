<script>
  import { onMount } from 'svelte';
  import { sampleMotionAnimation } from '@franz-lola/pixel-renderer';
  import { prepareMotionForEditing } from '../animation-tools.js';
  import ObjectThumbnail from './ObjectThumbnail.svelte';

  let { animation, previewAsset, title = 'Bewegungsanimation', onsave = () => {}, oncancel = () => {} } = $props();
  function initialMotion() { return prepareMotionForEditing(animation); }
  let draft = $state(initialMotion());
  let selectedId = $state(draft.keyframes[0].id);
  let playhead = $state(0);
  let playing = $state(false);
  let lastTimestamp = 0;
  let frame;
  let selected = $derived(draft.keyframes.find((entry) => entry.id === selectedId) ?? draft.keyframes[0]);
  let sample = $derived(sampleMotionAnimation(draft, playhead));
  let preview = $derived({ ...previewAsset, animation: { type: 'none', speed: 1, amplitude: 0 }, x: 0, y: 0 });

  function tick(timestamp) {
    if (playing) {
      if (lastTimestamp) playhead += (timestamp - lastTimestamp) / 1000;
      if (playhead >= draft.duration) { if (draft.loop) playhead %= draft.duration; else { playhead = draft.duration; playing = false; } }
    }
    lastTimestamp = timestamp; frame = requestAnimationFrame(tick);
  }
  function addKeyframe() {
    let index = draft.keyframes.length + 1;
    while (draft.keyframes.some((entry) => entry.id === `motion-${index}`)) index += 1;
    const next = { id: `motion-${index}`, time: playhead, x: sample.x, y: sample.y, scale: sample.scale, rotation: sample.rotation, opacity: sample.opacity, easing: 'linear' };
    draft.keyframes.push(next); draft.keyframes.sort((left, right) => left.time - right.time); selectedId = next.id;
  }
  function removeKeyframe() { if (draft.keyframes.length > 1) { draft.keyframes = draft.keyframes.filter((entry) => entry.id !== selectedId); selectedId = draft.keyframes[0].id; } }
  function number(event) { return Number(event.currentTarget.value); }
  function sortKeyframes() { draft.keyframes.sort((left, right) => left.time - right.time); }
  onMount(() => { frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame); });
</script>

<section class="motion-studio">
  <header><div><span class="eyebrow">KEYFRAME-ANIMATOR</span><h3>{title}</h3><p>Position, Größe, Drehung und Sichtbarkeit werden auf einer gemeinsamen Timeline animiert.</p></div><div class="modal-actions"><button onclick={oncancel}>Abbrechen</button><button class="primary" onclick={() => onsave(JSON.parse(JSON.stringify(draft)))}>Animation übernehmen</button></div></header>
  <div class="motion-preview">
    <div class="motion-preview-object" style={`transform:translate(${sample.x * 30}px,${sample.y * 30}px) rotate(${sample.rotation}deg) scale(${sample.scale});opacity:${sample.opacity}`}><ObjectThumbnail asset={preview} /></div>
  </div>
  <div class="keyframe-transport"><button onclick={() => { playhead = 0; playing = false; }}>■</button><button class="primary" onclick={() => { if (playhead >= draft.duration) playhead = 0; playing = !playing; lastTimestamp = 0; }}>{playing ? 'Ⅱ Pause' : '▶ Playback'}</button><input type="range" min="0" max={draft.duration} step="0.01" bind:value={playhead} /><code>{playhead.toFixed(2)} / {draft.duration.toFixed(2)} s</code></div>
  <div class="keyframe-ruler" style={`--timeline-duration:${draft.duration}`}>
    <div class="timeline-playhead" style:left={`${playhead / draft.duration * 100}%`}></div>
    {#each draft.keyframes as keyframe}<button class:active={keyframe.id === selectedId} style:left={`${keyframe.time / draft.duration * 100}%`} onclick={() => { selectedId = keyframe.id; playhead = keyframe.time; }} title={`${keyframe.id} · ${keyframe.time.toFixed(2)} s`}></button>{/each}
  </div>
  <div class="motion-editor-grid">
    <aside><strong>Keyframes</strong>{#each draft.keyframes as keyframe, index}<button class:active={keyframe.id === selectedId} onclick={() => { selectedId = keyframe.id; playhead = keyframe.time; }}><span>{index + 1}</span><b>{keyframe.time.toFixed(2)} s</b></button>{/each}<button onclick={addKeyframe}>＋ Keyframe am Playhead</button></aside>
    <div class="property-panel">
      <div class="field-row"><label>Dauer<input type="number" min="0.1" max="120" step="0.1" bind:value={draft.duration} /></label><label class="switch"><input type="checkbox" bind:checked={draft.loop} /><span>Loop</span></label></div>
      {#if selected}
        <label>Zeit<input type="number" min="0" max={draft.duration} step="0.01" bind:value={selected.time} onchange={sortKeyframes} /></label>
        <div class="field-row"><label>X-Versatz<input type="number" min="-48" max="48" step="0.05" bind:value={selected.x} /></label><label>Y-Versatz<input type="number" min="-48" max="48" step="0.05" bind:value={selected.y} /></label></div>
        <div class="field-row"><label>Skalierung<input type="number" min="0.05" max="8" step="0.05" bind:value={selected.scale} /></label><label>Drehung<input type="number" min="-3600" max="3600" step="1" bind:value={selected.rotation} /></label></div>
        <label>Deckkraft<input type="range" min="0" max="1" step="0.01" bind:value={selected.opacity} /></label>
        <label>Easing<select bind:value={selected.easing}><option value="linear">Linear</option><option value="ease-in-out">Weich</option><option value="step">Sprung</option></select></label>
        <button class="danger-subtle" onclick={removeKeyframe} disabled={draft.keyframes.length <= 1}>Keyframe löschen</button>
      {/if}
    </div>
  </div>
</section>
