<script>
  import CutscenePreview from './CutscenePreview.svelte';
  import MobileFocusTabs from './MobileFocusTabs.svelte';

  let { studio } = $props();
  let mobilePanel = $state('canvas');
  let playhead = $state(0);
  let cutscene = $derived(studio.selectedCutscene);
  let track = $derived(studio.selectedTrack);
  let keyframe = $derived(studio.selectedKeyframe);
  const trackNames = { camera: 'Kamera', actor: 'Figur', object: 'Objekt', dialogue: 'Dialog' };
  const trackIcons = { camera: '◎', actor: 'FL', object: '◆', dialogue: '“' };
  function number(event) { return Number(event.currentTarget.value); }
  function selectCutscene(id) { studio.selectedCutsceneId = id; const selected = studio.level.cutscenes.find((entry) => entry.id === id); studio.selectedTrackId = selected?.tracks[0]?.id ?? ''; studio.selectedKeyframeId = selected?.tracks[0]?.keyframes[0]?.id ?? ''; playhead = 0; }
  function selectTrack(entry) { studio.selectedTrackId = entry.id; studio.selectedKeyframeId = entry.keyframes[0]?.id ?? ''; mobilePanel = 'inspector'; }
  function updateDialogue(language, value) {
    const frames = track.keyframes.map((frame) => frame.id === keyframe.id ? { ...frame, text: { ...frame.text, [language]: value } } : frame);
    studio.updateTrack(['keyframes'], frames);
  }
  function confirmDeleteTrack() { if (confirm('Diesen Track samt aller Keyframes löschen?')) studio.deleteTrack(); }
  function confirmDeleteCutscene() { if (confirm('Diese vollständige Cutscene löschen?')) studio.deleteCutscene(); }
</script>

<section class="workspace cutscene-workspace" aria-labelledby="cutscene-workspace-title">
  <header class="workspace-header">
    <div><span class="eyebrow">CUTSCENE-STUDIO</span><h2 id="cutscene-workspace-title">Übergang von Karte zu Level</h2><p>Cutscenes sind fest mit diesem Level verbunden. Kamera, Figuren, Objekte und Dialoge liegen gemeinsam auf einer Timeline.</p></div>
    <button class="primary" id="add-cutscene" onclick={() => studio.addCutscene()}>＋ Cutscene</button>
  </header>

  {#if !cutscene}
    <div class="empty-workspace"><span>▶</span><h3>Noch keine Cutscene</h3><p>Lege ein Intro an. Eine fertige Kamera- und Franz-&-Lola-Spur wird als Startpunkt erzeugt.</p><button class="primary" onclick={() => studio.addCutscene()}>Intro erstellen</button></div>
  {:else}
    <div class="cutscene-selector">
      {#each studio.level.cutscenes as entry}<button class:active={entry.id === cutscene.id} onclick={() => selectCutscene(entry.id)}><span>{entry.kind === 'intro' ? 'IN' : entry.kind === 'outro' ? 'OUT' : '→'}</span><strong>{entry.name.standard}</strong><small>{entry.duration}s</small></button>{/each}
    </div>
    <div class="cutscene-grid focus-layout">
      <aside class:mobile-active={mobilePanel === 'scene'} class="track-browser" data-focus-panel="scene">
        <div class="panel-title"><strong>Spuren</strong><span>{cutscene.tracks.length}</span></div>
        {#each cutscene.tracks as entry}
          <button class:active={entry.id === studio.selectedTrackId} onclick={() => selectTrack(entry)}><span>{trackIcons[entry.type]}</span><span><strong>{entry.id}</strong><small>{trackNames[entry.type]} · {entry.target}</small></span><em>{entry.keyframes.length}</em></button>
        {/each}
        <div class="track-add-grid"><button onclick={() => studio.addTrack('camera')}>◎ Kamera</button><button onclick={() => studio.addTrack('actor')}>FL Figur</button><button onclick={() => studio.addTrack('object')} disabled={!studio.level.decorations.length} title={!studio.level.decorations.length ? 'Platziere zuerst ein Objekt im Level' : 'Objekt-Track anlegen'}>◆ Objekt</button><button onclick={() => studio.addTrack('dialogue')}>“ Dialog</button></div>
        {#if !studio.level.decorations.length}<p class="inline-guidance">Objektspuren werden verfügbar, sobald im Level ein Objekt platziert ist.</p>{/if}
      </aside>

      <div class="cutscene-center mobile-active" data-focus-panel="canvas">
        <CutscenePreview {studio} {cutscene} bind:time={playhead} />
        <div class="timeline" style={`--timeline-duration:${cutscene.duration}`}>
          <header><strong>Timeline</strong><span>0 s</span><span>{(cutscene.duration / 2).toFixed(1)} s</span><span>{cutscene.duration.toFixed(1)} s</span></header>
          {#each cutscene.tracks as entry}
            <div class="timeline-row"><button onclick={() => selectTrack(entry)}>{trackIcons[entry.type]} {entry.id}</button><div class="timeline-lane">{#each entry.keyframes as frame}<button class:active={entry.id === studio.selectedTrackId && frame.id === studio.selectedKeyframeId} style:left={`${Math.min(100, frame.time / cutscene.duration * 100)}%`} onclick={() => { selectTrack(entry); studio.selectedKeyframeId = frame.id; playhead = frame.time; }} title={`${frame.time}s · ${frame.id}`}></button>{/each}</div></div>
          {/each}
        </div>
      </div>

      <aside class:mobile-active={mobilePanel === 'inspector'} class="property-panel cutscene-inspector" data-focus-panel="inspector">
        <div class="property-section"><span class="section-number">SCN</span><h3>{cutscene.name.standard}</h3></div>
        <label>Name<input value={cutscene.name.standard} onchange={(event) => studio.updateCutscene(['name', 'standard'], event.currentTarget.value)} /></label>
        <label>Name im Dialekt<input value={cutscene.name.dialect} onchange={(event) => studio.updateCutscene(['name', 'dialect'], event.currentTarget.value)} /></label>
        <div class="field-row"><label>Art<select value={cutscene.kind} onchange={(event) => studio.updateCutscene(['kind'], event.currentTarget.value)}><option value="intro">Intro</option><option value="transition">Übergang</option><option value="outro">Outro</option></select></label><label>Dauer<input type="number" min="0.5" max="120" step="0.5" value={cutscene.duration} onchange={(event) => studio.updateCutscene(['duration'], number(event))} /></label></div>
        <label class="switch"><input type="checkbox" checked={cutscene.skippable} onchange={(event) => studio.updateCutscene(['skippable'], event.currentTarget.checked)} /><span>Überspringbar</span></label>

        {#if track}
          <div class="property-section"><span class="section-number">TRK</span><h3>{trackNames[track.type]}</h3></div>
          <label>Track-ID<input value={track.id} onchange={(event) => studio.renameTrack(event.currentTarget.value)} /></label>
          {#if track.type === 'actor'}<label>Ziel<select value={track.target} onchange={(event) => studio.updateTrack(['target'], event.currentTarget.value)}><option value="player">Franz & Lola</option>{#each studio.level.actors.cats as cat, index}<option value={`cat:${cat.id ?? index}`}>Katze {index + 1}</option>{/each}{#each studio.level.actors.characters ?? [] as character, index}<option value={`character:${character.id ?? index}`}>{character.name || `Figur ${index + 1}`}</option>{/each}</select></label>{/if}
          {#if track.type === 'object'}<label>Zielobjekt<select value={track.target} onchange={(event) => studio.updateTrack(['target'], event.currentTarget.value)}>{#each studio.level.decorations as item}<option value={item.id}>{item.name || item.id}</option>{/each}</select></label>{/if}
          <button onclick={() => studio.addKeyframe(playhead)}>＋ Keyframe bei {playhead.toFixed(2)} s</button><button class="danger-subtle" onclick={confirmDeleteTrack}>Track löschen</button>
        {/if}

        {#if keyframe}
          <div class="property-section"><span class="section-number">KEY</span><h3>Keyframe</h3></div>
          <label>Zeit<input type="number" min="0" max={cutscene.duration} step="0.1" value={keyframe.time} onchange={(event) => studio.updateKeyframe('time', number(event))} /></label>
          {#if track.type === 'dialogue'}
            <label>Sprecher<input value={keyframe.speaker} onchange={(event) => studio.updateKeyframe('speaker', event.currentTarget.value)} /></label>
            <label>Text<textarea rows="2" value={keyframe.text.standard} onchange={(event) => updateDialogue('standard', event.currentTarget.value)}></textarea></label>
            <label>Text im Dialekt<textarea rows="2" value={keyframe.text.dialect} onchange={(event) => updateDialogue('dialect', event.currentTarget.value)}></textarea></label>
            <label>Anzeigedauer<input type="number" min="0.1" max="120" step="0.1" value={keyframe.duration} onchange={(event) => studio.updateKeyframe('duration', number(event))} /></label>
          {:else}
            <div class="field-row"><label>X<input type="number" step="0.125" value={keyframe.x} onchange={(event) => studio.updateKeyframe('x', number(event))} /></label><label>Y<input type="number" step="0.125" value={keyframe.y} onchange={(event) => studio.updateKeyframe('y', number(event))} /></label></div>
            {#if track.type === 'camera'}<label>Zoom<input type="number" min="0.25" max="4" step="0.05" value={keyframe.zoom} onchange={(event) => studio.updateKeyframe('zoom', number(event))} /></label>{/if}
            {#if track.type === 'actor' || track.type === 'object'}<div class="field-row"><label>Skalierung<input type="number" min="0.05" max="20" step="0.05" value={keyframe.scale ?? 1} oninput={(event) => studio.updateKeyframe('scale', number(event))} /></label><label>Drehung<input type="number" min="-360" max="360" step="1" value={keyframe.rotation ?? 0} oninput={(event) => studio.updateKeyframe('rotation', number(event))} /></label></div><label>Deckkraft<input type="range" min="0" max="1" step="0.01" value={keyframe.opacity ?? 1} oninput={(event) => studio.updateKeyframe('opacity', number(event))} /></label><label class="switch"><input type="checkbox" checked={keyframe.visible !== false} onchange={(event) => studio.updateKeyframe('visible', event.currentTarget.checked)} /><span>Sichtbar</span></label>{/if}
            {#if track.type === 'actor'}<label>Player State<select value={keyframe.state} onchange={(event) => studio.updateKeyframe('state', event.currentTarget.value)}><option value="idle">Idle</option><option value="up">Oben</option><option value="right">Rechts</option><option value="down">Unten</option><option value="left">Links</option></select></label>{/if}
          {/if}
          <label>Easing<select value={keyframe.easing} onchange={(event) => studio.updateKeyframe('easing', event.currentTarget.value)}><option value="linear">Linear</option><option value="ease-in-out">Weich</option><option value="step">Sprung</option></select></label>
          <button class="danger-subtle" onclick={() => studio.deleteKeyframe()} disabled={track.keyframes.length <= 1}>Keyframe löschen</button>
        {/if}
        <button class="danger" onclick={confirmDeleteCutscene}>Cutscene löschen</button>
      </aside>
      {#if mobilePanel !== 'canvas'}<button class="mobile-panel-scrim" aria-label="Mobile Seitenleiste schließen" onclick={() => mobilePanel = 'canvas'}></button>{/if}
      <MobileFocusTabs value={mobilePanel} options={[["scene", "☷", "Spuren"], ["canvas", "▶", "Timeline"], ["inspector", "☰", "Details"]]} onchange={(value) => mobilePanel = value} />
    </div>
  {/if}
</section>
