<script>
  import LevelCanvas from './LevelCanvas.svelte';
  import MobileFocusTabs from './MobileFocusTabs.svelte';
  import SelectionSummary from './SelectionSummary.svelte';
  import VisualEffectsEditor from './VisualEffectsEditor.svelte';

  let { studio } = $props();
  let mobilePanel = $state('canvas');
  let event = $derived(studio.selectedEvent);
  const slug = (value) => value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'ereignis';
  function number(input) { return Number(input.currentTarget.value); }
  function select(id) { studio.selectEntity('event', studio.level.events.findIndex((entry) => entry.id === id)); mobilePanel = 'inspector'; }
  function rename(value) { const id = slug(value); studio.updateEvent(['id'], id); studio.selectedEventId = id; }
  function updateZone(index, field, value) { studio.updateEvent(['trigger', 'zones'], event.trigger.zones.map((zone, zoneIndex) => zoneIndex === index ? { ...zone, [field]: Math.max(field === 'width' || field === 'height' ? 1 : 0, Number(value)) } : zone)); }
  function removeZone(index) { studio.updateEvent(['trigger', 'zones'], event.trigger.zones.filter((_, zoneIndex) => zoneIndex !== index)); }
  function appendDirection(direction) { studio.updateEvent(['trigger', 'sequence'], [...event.trigger.sequence, direction]); }
  function removeDirection() { studio.updateEvent(['trigger', 'sequence'], event.trigger.sequence.slice(0, -1)); }
  function testEvent() { studio.workspace = 'playtest'; studio.notify(`Testlauf für „${event.name.standard}“ gestartet.`); }
  function confirmDelete() { if (confirm(`Ereignis „${event.name.standard}“ wirklich löschen?`)) studio.deleteEvent(); }

  $effect(() => {
    studio.selectionRevision;
    if (studio.workspace === 'events' && studio.selection) mobilePanel = 'inspector';
  });
</script>

<section class="workspace event-workspace" aria-labelledby="event-workspace-title">
  <header class="workspace-header"><div><span class="eyebrow">EREIGNISREGIE</span><h2 id="event-workspace-title">Eastereggs & Ereignisse</h2><p>Trigger, sichtbares Symbol, Hochdeutsch und Niederbairisch gehören zu einem klaren Ereignis.</p></div><button class="primary" id="add-event" onclick={() => studio.addEvent()}>＋ Ereignis</button></header>
  <div class="event-grid focus-layout">
    <aside class:mobile-active={mobilePanel === 'scene'} class="event-browser" data-focus-panel="scene">
      <strong>Ereignisse im Level</strong>
      {#each studio.level.events as entry}<button class:active={entry.id === studio.selectedEventId} onclick={() => select(entry.id)}><span>{entry.visual.type === 'kingfisher' ? '◆' : entry.visual.type === 'bell' ? '♜' : entry.visual.label || '!'}</span><span><b>{entry.name.standard}</b><small>{entry.trigger.type} · {entry.reward >= 0 ? '+' : ''}{entry.reward}</small></span></button>{/each}
      {#if !studio.level.events.length}<p class="hint">Noch kein Ereignis in diesem Level.</p>{/if}
    </aside>
    <div class="canvas-column mobile-active" data-focus-panel="canvas">
      <div class="canvas-toolbar"><button class:active={studio.tool === 'select'} onclick={() => studio.setTool('select')}>↖ Auswählen</button><button class:active={studio.tool === 'event-zone'} onclick={() => studio.setTool('event-zone')} disabled={!event}>▧ Triggerzone zeichnen</button><button class:active={studio.tool === 'event-visual'} onclick={() => studio.setTool('event-visual')} disabled={!event}>! Symbol setzen</button></div>
      <LevelCanvas {studio} />
      {#if event}<div class="event-message-preview"><span class="eyebrow">LIVE-TEXT</span><strong>{event.name[studio.language]}</strong><p>{event.message[studio.language]}</p><button onclick={() => studio.language = studio.language === 'standard' ? 'dialect' : 'standard'}>{studio.language === 'standard' ? 'Schöne Sprache' : 'Niederbairisch*'}</button></div>{/if}
    </div>
    <aside class:mobile-active={mobilePanel === 'inspector'} class="property-panel" data-focus-panel="inspector">
      <SelectionSummary {studio} />
      {#if event}
        <div class="property-section"><span class="section-number">EVT</span><h3>{event.name.standard}</h3></div>
        <label>ID<input value={event.id} onchange={(input) => rename(input.currentTarget.value)} /></label>
        <label>Name<input value={event.name.standard} onchange={(input) => studio.updateEvent(['name', 'standard'], input.currentTarget.value)} /></label>
        <label>Name im Dialekt<input value={event.name.dialect} onchange={(input) => studio.updateEvent(['name', 'dialect'], input.currentTarget.value)} /></label>
        <label>Meldung<textarea rows="2" value={event.message.standard} onchange={(input) => studio.updateEvent(['message', 'standard'], input.currentTarget.value)}></textarea></label>
        <label>Meldung im Dialekt<textarea rows="2" value={event.message.dialect} onchange={(input) => studio.updateEvent(['message', 'dialect'], input.currentTarget.value)}></textarea></label>
        <div class="field-row"><label>Bonus<input type="number" min="-9999" max="9999" value={event.reward} onchange={(input) => studio.updateEvent(['reward'], number(input))} /></label><label>Gültigkeit<select value={event.scope} onchange={(input) => studio.updateEvent(['scope'], input.currentTarget.value)}><option value="run">Pro Runde</option><option value="level">Pro Level</option><option value="global">Einmal global</option></select></label></div>
        <div class="property-section"><span class="section-number">TRG</span><h3>Auslöser</h3></div>
        <label>Auslösertyp<select value={event.trigger.type} onchange={(input) => studio.updateEvent(['trigger', 'type'], input.currentTarget.value)}><option value="zone">Triggerzone</option><option value="direction-sequence">Richtungsfolge</option><option value="time">Zeit</option></select></label>
        {#if event.trigger.type === 'zone'}<div class="zone-list editable-zones">{#each event.trigger.zones as zone, index}<fieldset><legend>Zone {index + 1}</legend><div class="zone-fields"><label>X<input aria-label={`Zone ${index + 1} X`} type="number" min="0" step="1" value={zone.x} onchange={(input) => updateZone(index, 'x', input.currentTarget.value)} /></label><label>Y<input aria-label={`Zone ${index + 1} Y`} type="number" min="0" step="1" value={zone.y} onchange={(input) => updateZone(index, 'y', input.currentTarget.value)} /></label><label>Breite<input aria-label={`Zone ${index + 1} Breite`} type="number" min="1" step="1" value={zone.width} onchange={(input) => updateZone(index, 'width', input.currentTarget.value)} /></label><label>Höhe<input aria-label={`Zone ${index + 1} Höhe`} type="number" min="1" step="1" value={zone.height} onchange={(input) => updateZone(index, 'height', input.currentTarget.value)} /></label><button class="danger-subtle" aria-label={`Zone ${index + 1} löschen`} onclick={() => removeZone(index)}>×</button></div></fieldset>{/each}</div><button onclick={() => studio.setTool('event-zone')}>＋ Zone im Canvas zeichnen</button>{#if !event.trigger.zones.length}<p class="inline-guidance">Noch keine Zone. Aktiviere das Werkzeug und ziehe sie direkt im Level auf.</p>{/if}{/if}
        {#if event.trigger.type === 'direction-sequence'}<div class="direction-sequence-editor"><output aria-label="Richtungsfolge">{event.trigger.sequence.length ? event.trigger.sequence.map((direction) => ({ up: '↑', right: '→', down: '↓', left: '←' }[direction] ?? direction)).join(' ') : 'Noch keine Eingabe'}</output><div role="group" aria-label="Richtung hinzufügen"><button onclick={() => appendDirection('up')} aria-label="Oben hinzufügen">↑</button><button onclick={() => appendDirection('right')} aria-label="Rechts hinzufügen">→</button><button onclick={() => appendDirection('down')} aria-label="Unten hinzufügen">↓</button><button onclick={() => appendDirection('left')} aria-label="Links hinzufügen">←</button><button onclick={removeDirection} disabled={!event.trigger.sequence.length}>Rückgängig</button><button onclick={() => studio.updateEvent(['trigger', 'sequence'], [])} disabled={!event.trigger.sequence.length}>Leeren</button></div></div>{/if}
        {#if event.trigger.type === 'time'}<label>Nach Sekunden<input type="number" min="0" max="3600" step="0.5" value={event.trigger.seconds} onchange={(input) => studio.updateEvent(['trigger', 'seconds'], number(input))} /></label>{/if}
        <div class="property-section"><span class="section-number">VIS</span><h3>Darstellung</h3></div>
        <label>Symboltyp<select value={event.visual.type} onchange={(input) => studio.updateEvent(['visual', 'type'], input.currentTarget.value)}><option value="kingfisher">Eisvogel</option><option value="paw">Pfote</option><option value="bell">Glocke</option><option value="custom">Freies Symbol</option><option value="none">Unsichtbar</option></select></label>
        <label>Objekt aus Bibliothek<select value={event.visual.assetId || ''} onchange={(input) => studio.setEventVisualAsset(input.currentTarget.value)}><option value="">Kein Sprite-Objekt</option>{#each studio.assets.filter((asset) => asset.appearance) as asset}<option value={asset.id}>{asset.name}</option>{/each}</select></label>
        <div class="field-row"><label>X<input type="number" step="0.125" value={event.visual.x} onchange={(input) => studio.updateEvent(['visual', 'x'], number(input))} /></label><label>Y<input type="number" step="0.125" value={event.visual.y} onchange={(input) => studio.updateEvent(['visual', 'y'], number(input))} /></label></div>
        <div class="field-row"><label>Farbe<input type="color" value={event.visual.color} oninput={(input) => studio.updateEvent(['visual', 'color'], input.currentTarget.value)} /></label><label>Akzent<input type="color" value={event.visual.accent} oninput={(input) => studio.updateEvent(['visual', 'accent'], input.currentTarget.value)} /></label></div>
        <label>Freies Symbol<input value={event.visual.label} maxlength="8" onchange={(input) => studio.updateEvent(['visual', 'label'], input.currentTarget.value)} /></label>
        <VisualEffectsEditor effects={event.visual.effects ?? []} title="Ereigniseffekte" onchange={(effects) => studio.updateEvent(['visual', 'effects'], effects)} />
        {#if event.visual.type === 'none'}<button onclick={() => studio.updateEvent(['visual', 'type'], 'custom')}>Symbol wieder einblenden</button>{:else}<button class="danger subtle" onclick={() => studio.updateEvent(['visual', 'type'], 'none')}>Nur Ereignissymbol aus dem Level entfernen</button>{/if}
        <button class="primary" onclick={testEvent}>▶ Im Testlauf prüfen</button>
        <button class="danger" onclick={confirmDelete}>Ereignis löschen</button>
      {:else}<div class="empty-inspector"><span>!</span><strong>Ereignis auswählen</strong><p>Oder lege ein neues Ereignis an.</p></div>{/if}
    </aside>
    {#if mobilePanel !== 'canvas'}<button class="mobile-panel-scrim" aria-label="Mobile Seitenleiste schließen" onclick={() => mobilePanel = 'canvas'}></button>{/if}
    <MobileFocusTabs value={mobilePanel} options={[["scene", "!", "Ereignisse"], ["canvas", "▦", "Canvas"], ["inspector", "☰", "Details"]]} onchange={(value) => mobilePanel = value} />
  </div>
</section>
