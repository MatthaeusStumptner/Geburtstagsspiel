<script>
  import EdgeEffectsEditor from './EdgeEffectsEditor.svelte';
  import LevelCanvas from './LevelCanvas.svelte';
  import VisualEffectsEditor from './VisualEffectsEditor.svelte';
  import MobileFocusTabs from './MobileFocusTabs.svelte';
  import MotionTimelineEditor from './MotionTimelineEditor.svelte';
  import ObjectThumbnail from './ObjectThumbnail.svelte';
  import SceneTree from './SceneTree.svelte';
  import SelectionSummary from './SelectionSummary.svelte';
  import SpriteSheetEditor from './SpriteSheetEditor.svelte';
  import { resizeAppearance } from '../sprite-appearance.js';
  import { OBJECT_DRAG_TYPE } from '../object-library.js';

  let { studio } = $props();
  let editingAsset = $state(false);
  let editingAssetDraft = $state.raw(null);
  let editingNewAsset = $state(false);
  let editingPlacedSprite = $state(false);
  let editingMotion = $state(false);
  let motionSource = $state('selection');
  let sidebarMode = $state('library');
  let mobilePanel = $state('scene');
  let assetSearch = $state('');
  let creatorOpen = $state(false);
  let creatorName = $state('');
  let creatorCategory = $state('Eigene Objekte');
  let creatorResolution = $state(24);
  let creatorTemplate = $state('blank');
  let draggingAssetId = $state('');
  let selected = $derived.by(() => studio.selectedEntity());
  let asset = $derived(studio.selectedAsset);
  let filteredAssets = $derived.by(() => {
    const query = assetSearch.trim().toLocaleLowerCase('de');
    if (!query) return studio.assets;
    return studio.assets.filter((entry) => `${entry.name} ${entry.category} ${entry.description ?? ''}`.toLocaleLowerCase('de').includes(query));
  });
  let inspectorContext = $derived(selected && studio.selection?.kind === 'decoration'
    ? 'instance'
    : selected && studio.selection?.kind === 'theme-element'
      ? 'theme'
      : asset
        ? 'asset'
        : 'empty');
  let motionTarget = $derived(motionSource === 'asset' ? asset : selected);
  let motionPreview = $derived(studio.selection?.kind === 'theme-element'
    ? studio.assets.find((entry) => entry.id === (selected?.id === 'stage-note' ? 'zauberberg-note' : 'stage-lights')) ?? selected
    : motionTarget);
  const animationTypes = [['none', 'Keine'], ['bob', 'Schweben'], ['pulse', 'Pulsieren'], ['blink', 'Blinken'], ['spin', 'Drehen'], ['keyframes', 'Eigene Keyframes']];
  const clone = (value) => JSON.parse(JSON.stringify(value));

  function selectAsset(id) {
    studio.selectedAssetId = id;
    studio.clearSelection();
    studio.setTool('select');
    sidebarMode = 'library';
    editingAsset = false;
    editingMotion = false;
    mobilePanel = 'inspector';
  }
  function placeAsset(id = asset?.id) {
    if (!id) return;
    studio.selectedAssetId = id;
    studio.clearSelection();
    studio.setTool('object');
    mobilePanel = 'canvas';
  }
  function dragAsset(event, id) {
    draggingAssetId = id;
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(OBJECT_DRAG_TYPE, id);
  }
  function openCreator() {
    creatorName = '';
    creatorCategory = asset?.category || 'Eigene Objekte';
    creatorResolution = 24;
    creatorTemplate = asset?.appearance ? 'selected' : 'blank';
    creatorOpen = true;
  }
  function createAssetDraft() {
    const draft = studio.createObjectDraft(creatorName.trim(), creatorResolution, creatorCategory.trim() || 'Eigene Objekte');
    if (creatorTemplate === 'selected' && asset?.appearance) {
      draft.appearance = resizeAppearance(clone(asset.appearance), creatorResolution);
      draft.color = asset.color;
      draft.label = asset.label;
      draft.animation = clone(asset.animation);
      draft.effects = clone(asset.effects ?? []);
    }
    editingAssetDraft = draft;
    editingNewAsset = true;
    editingAsset = true;
    creatorOpen = false;
  }
  function openAssetEditor() { if (asset) { editingAssetDraft = clone(asset); editingNewAsset = false; editingAsset = true; } }
  function number(event) { const value = Number(event.currentTarget.value); return event.currentTarget.value === '' || !Number.isFinite(value) ? undefined : value; }
  function saveAssetAppearance(appearance) {
    const saved = studio.saveAsset({ ...editingAssetDraft, appearance }, editingNewAsset ? 'Objektvorlage erstellen' : 'Objekt-Sprite bearbeiten');
    studio.selectedAssetId = saved.id;
    editingAssetDraft = null; editingNewAsset = false; editingAsset = false;
  }
  function cancelAssetEditor() { editingAssetDraft = null; editingNewAsset = false; editingAsset = false; }
  function savePlacedAppearance(appearance) { studio.updateSelected(['appearance'], appearance, 'Objekt-Sprite speichern'); editingPlacedSprite = false; }
  function openMotion(source = 'selection') { motionSource = source; editingMotion = true; }
  function saveMotion(animation) {
    if (motionSource === 'asset') studio.saveAsset({ ...asset, animation });
    else studio.updateSelected(['animation'], animation, 'Keyframe-Animation speichern');
    editingMotion = false;
  }

  $effect(() => {
    studio.selectionRevision;
    if (studio.workspace === 'objects' && studio.selection) {
      sidebarMode = 'scene';
      mobilePanel = 'inspector';
    }
  });
</script>

<section
  class="workspace object-workspace"
  data-library-status={studio.assetCatalogReady ? 'ready' : 'loading'}
  aria-labelledby="object-workspace-title"
>
  <header class="workspace-header">
    <div><span class="eyebrow">ASSETS & LEVELOBJEKTE</span><h2 id="object-workspace-title">Objektwerkstatt</h2><p>Erstelle globale Vorlagen, bearbeite sie zentral und platziere daraus unabhängig auswählbare Level-Instanzen.</p></div>
  </header>

  {#if editingAsset && editingAssetDraft}
    <SpriteSheetEditor appearance={editingAssetDraft.appearance} title={`Objekt gestalten · ${editingAssetDraft.name}`} showStates={false} onsave={saveAssetAppearance} oncancel={cancelAssetEditor} />
  {:else if editingPlacedSprite && selected?.appearance}
    <SpriteSheetEditor appearance={selected.appearance} title={`Objekt gestalten · ${selected.name}`} showStates={false} onsave={savePlacedAppearance} oncancel={() => editingPlacedSprite = false} />
  {:else if editingMotion && motionTarget}
    <MotionTimelineEditor animation={motionTarget.animation} previewAsset={motionPreview} title={`Bewegung · ${motionTarget.name || motionTarget.id || 'Objekt'}`} onsave={saveMotion} oncancel={() => editingMotion = false} />
  {:else}
    <div class="workspace-grid object-grid focus-layout">
      <aside class:mobile-active={mobilePanel === 'scene'} class="asset-library object-sidebar" data-focus-panel="scene">
        <div class="sidebar-mode-tabs"><button class:active={sidebarMode === 'library'} onclick={() => sidebarMode = 'library'}>◆ Assets</button><button class:active={sidebarMode === 'scene'} onclick={() => sidebarMode = 'scene'}>☷ Level-Objekte</button></div>
        {#if sidebarMode === 'scene'}
          <SceneTree {studio} onselect={() => mobilePanel = 'inspector'} />
        {:else}
          <div class="asset-library-heading">
            <div class="panel-title"><strong>Globale Assets</strong><span>{studio.assets.length}</span></div>
            <p>Einmal erstellen, zentral bearbeiten und in allen Leveln verwenden.</p>
            <button class="primary icon-label" data-action="create-asset" onclick={openCreator}><span class="button-icon" aria-hidden="true">＋</span><span>Neues Asset erstellen</span></button>
          </div>
          <label class="asset-search">Assets durchsuchen<input type="search" placeholder="Name, Kategorie …" bind:value={assetSearch} /></label>
          <div class="asset-list">
            {#each filteredAssets as entry}
              <button class:active={entry.id === studio.selectedAssetId && inspectorContext === 'asset'} class:dragging={draggingAssetId === entry.id} aria-pressed={entry.id === studio.selectedAssetId && inspectorContext === 'asset'} data-asset-id={entry.id} draggable={true} ondragstart={(event) => dragAsset(event, entry.id)} ondragend={() => draggingAssetId = ''} onclick={() => selectAsset(entry.id)}>
                <span class="asset-icon actual"><ObjectThumbnail asset={entry} language={studio.language} /></span><span><strong>{entry.name}</strong><small>{entry.category}</small></span><em>{entry.width}×{entry.height}</em>
              </button>
            {/each}
            {#if !filteredAssets.length}<div class="empty-library"><strong>Kein Asset gefunden</strong><span>Versuche einen anderen Suchbegriff oder erstelle ein neues Asset.</span></div>{/if}
          </div>
        {/if}
      </aside>

      <div class="canvas-column mobile-active" data-focus-panel="canvas">
        <div class="canvas-toolbar">
          <button class="icon-label" class:active={studio.tool === 'select'} onclick={() => studio.setTool('select')}><span class="button-icon" aria-hidden="true">↖</span><span>Auswählen</span></button>
          <button class="icon-label" class:active={studio.tool === 'transform'} data-tool="transform" onclick={() => studio.setTool('transform')}><span class="button-icon" aria-hidden="true">↔</span><span>Bewegen & skalieren</span></button>
          <span class="toolbar-help">Asset links direkt ins Level ziehen · auf Touch „Im Level platzieren“ wählen.</span>
        </div>
        <LevelCanvas {studio} />
        <footer class="canvas-status"><span>{studio.selectionCount ? `${studio.selectionCount} ausgewählt` : 'Keine Auswahl'}</span><span>Instanzen verwaltest du im Szenenbaum</span><strong>{studio.saveStatus}</strong></footer>
      </div>

      <aside class:mobile-active={mobilePanel === 'inspector'} class="property-panel object-inspector" data-focus-panel="inspector" data-object-context={inspectorContext}>
        {#if studio.selection}<SelectionSummary {studio} />{/if}
        {#if selected && studio.selection?.kind === 'decoration'}
          <div class="context-heading instance-context"><span class="context-badge">LEVEL-INSTANZ</span><h3>{selected.name || selected.label || selected.type}</h3><p>Dieses Objekt gehört nur zum geöffneten Level.</p></div>
          {#if selected.assetId}<div class="linked-instance"><strong>⌁ Verknüpft mit „{studio.assets.find((entry) => entry.id === selected.assetId)?.name ?? selected.assetId}“</strong><span>{selected.assetOverrides?.length ? `${selected.assetOverrides.length} lokale Abweichung(en)` : 'Alle Werte folgen der Vorlage'}</span><button class="edit-linked-asset" onclick={() => selectAsset(selected.assetId)}>Vorlage bearbeiten →</button>{#each selected.assetOverrides ?? [] as field}<button title="Wieder von der Vorlage übernehmen" onclick={() => studio.resetSelectedAssetOverride(field)}>↺ {field}</button>{/each}</div>{/if}
          <label>Name<input value={selected.name} oninput={(event) => studio.updateSelected(['name'], event.currentTarget.value)} /></label>
          <label>Beschriftung<input value={selected.label} maxlength="12" oninput={(event) => studio.updateSelected(['label'], event.currentTarget.value)} /></label>
          {#if selected.type === 'text'}
            <div class="transform-hint"><span>↔</span><p><strong>Direkt im Level anordnen</strong>Wähle „Bewegen & skalieren“. Ziehen verschiebt den Text frei, die vier Eckgriffe skalieren Block und Schrift gemeinsam.</p><button onclick={() => studio.setTool('transform')}>Werkzeug aktivieren</button></div>
            <label>Text<input value={selected.content.standard} oninput={(event) => studio.updateSelected(['content', 'standard'], event.currentTarget.value)} /></label>
            <label>Text im Dialekt<input value={selected.content.dialect} oninput={(event) => studio.updateSelected(['content', 'dialect'], event.currentTarget.value)} /></label>
            <div class="field-row"><label>Schriftgröße<input type="number" min="0.15" max="4" step="0.05" value={selected.textStyle.fontSize} oninput={(event) => studio.updateSelected(['textStyle', 'fontSize'], number(event))} /></label><label>Ausrichtung<select value={selected.textStyle.align} onchange={(event) => studio.updateSelected(['textStyle', 'align'], event.currentTarget.value)}><option value="left">Links</option><option value="center">Mitte</option><option value="right">Rechts</option></select></label></div>
            <div class="field-row"><label>Hintergrund<input type="color" value={selected.textStyle.background} oninput={(event) => studio.updateSelected(['textStyle', 'background'], event.currentTarget.value)} /></label><label>Rahmen<input type="color" value={selected.textStyle.borderColor} oninput={(event) => studio.updateSelected(['textStyle', 'borderColor'], event.currentTarget.value)} /></label></div>
            <label class="switch"><input type="checkbox" aria-label="Hintergrund transparent" checked={selected.textStyle.backgroundOpacity === 0} onchange={(event) => studio.updateSelected(['textStyle', 'backgroundOpacity'], event.currentTarget.checked ? 0 : 0.88)} /><span>Hintergrund transparent</span></label>
            <label class="switch"><input type="checkbox" aria-label="Rahmen ausblenden" checked={(selected.textStyle.borderOpacity ?? 0) === 0} onchange={(event) => studio.updateSelected(['textStyle', 'borderOpacity'], event.currentTarget.checked ? 0 : 1)} /><span>Nur Text · Rahmen ausblenden</span></label>
            <label class="switch"><input type="checkbox" checked={selected.textStyle.uppercase} onchange={(event) => studio.updateSelected(['textStyle', 'uppercase'], event.currentTarget.checked)} /><span>Großbuchstaben</span></label>
          {/if}
          <div class="field-row"><label>X<input type="number" step="0.05" value={selected.x} oninput={(event) => studio.updateSelected(['x'], number(event))} /></label><label>Y<input type="number" step="0.05" value={selected.y} oninput={(event) => studio.updateSelected(['y'], number(event))} /></label></div>
          <div class="field-row"><label>Breite<input type="number" min="0.25" max="24" step="0.05" value={selected.width} oninput={(event) => studio.updateSelected(['width'], number(event))} /></label><label>Höhe<input type="number" min="0.25" max="24" step="0.05" value={selected.height} oninput={(event) => studio.updateSelected(['height'], number(event))} /></label></div>
          <label>Farbe<input data-instance-setting="color" type="color" value={selected.color} oninput={(event) => studio.updateSelected(['color'], event.currentTarget.value)} /></label>
          <label>Animation<select aria-label="Bewegungsanimation" value={selected.animation.type} onchange={(event) => studio.updateSelected(['animation', 'type'], event.currentTarget.value)}>{#each animationTypes as [id, name]}<option value={id}>{name}</option>{/each}</select></label>
          <div class="field-row"><label>Tempo<input aria-label="Bewegungsanimation Tempo" type="number" min="0.1" max="12" step="0.1" value={selected.animation.speed} oninput={(event) => studio.updateSelected(['animation', 'speed'], number(event))} /></label><label>Stärke<input aria-label="Bewegungsanimation Stärke" type="number" min="0" max="1" step="0.025" value={selected.animation.amplitude} oninput={(event) => studio.updateSelected(['animation', 'amplitude'], number(event))} /></label></div>
          {#if selected.appearance?.animations?.length}<label>Sprite-Animation<select value={selected.spriteAnimation} onchange={(event) => studio.updateSelected(['spriteAnimation'], event.currentTarget.value)}>{#each selected.appearance.animations as animation}<option value={animation.id}>{animation.id}</option>{/each}</select></label>{/if}
          <button onclick={() => openMotion('selection')}>◆ Keyframe-Bewegung öffnen</button>
          {#if selected.appearance}<button onclick={() => editingPlacedSprite = true}>▦ Sprite-Keyframes öffnen</button>{/if}
          <VisualEffectsEditor effects={selected.effects ?? []} onchange={(effects) => studio.updateSelected(['effects'], effects, 'Objekteffekte bearbeiten')} />
          <label class="switch"><input type="checkbox" checked={selected.locked} onchange={(event) => studio.updateSelected(['locked'], event.currentTarget.checked)} /><span>Position sperren</span></label>
          <button class="danger" onclick={() => studio.deleteSelection()}>Objekt löschen</button>
        {:else if selected && studio.selection?.kind === 'theme-element'}
          <div class="property-section"><span class="section-number">SYS</span><h3>{selected.id === 'stage-note' ? 'Zauberberg-Note' : selected.id === 'stage-lights' ? 'Bühnenlichter' : selected.id}</h3></div>
          <p class="hint">Dieses originale Kulissenelement wurde direkt im Canvas ausgewählt. Du kannst seine Animation ändern oder das entsprechende Asset aus der Bibliothek in andere Karten setzen.</p>
          <label>Animation<select aria-label="Bewegungsanimation" value={selected.animation.type} onchange={(event) => studio.updateSelected(['animation', 'type'], event.currentTarget.value)}>{#each animationTypes as [id, name]}<option value={id}>{name}</option>{/each}</select></label>
          <div class="field-row"><label>Tempo<input aria-label="Bewegungsanimation Tempo" type="number" min="0.1" max="12" step="0.1" value={selected.animation.speed} oninput={(event) => studio.updateSelected(['animation', 'speed'], number(event))} /></label><label>Stärke<input aria-label="Bewegungsanimation Stärke" type="number" min="0" max="1" step="0.025" value={selected.animation.amplitude} oninput={(event) => studio.updateSelected(['animation', 'amplitude'], number(event))} /></label></div>
          <button onclick={() => openMotion('selection')}>◆ Keyframe-Bewegung öffnen</button>
          <button onclick={() => placeAsset(selected.id === 'stage-note' ? 'zauberberg-note' : 'stage-lights')}>In dieser Karte frei platzieren</button>
        {:else if asset}
          <div class="context-heading asset-context">
            <span class="context-badge">GLOBALE ASSET-VORLAGE</span>
            <div class="asset-inspector-title"><span class="asset-inspector-preview"><ObjectThumbnail asset={asset} language={studio.language} /></span><div><h3>{asset.name}</h3><p>In allen Leveln verfügbar · live verknüpft</p></div></div>
          </div>
          <div class="asset-primary-actions"><button class="primary icon-label" data-action="place-asset" onclick={() => placeAsset()}><span class="button-icon" aria-hidden="true">＋</span><span>Im Level platzieren</span></button>{#if asset.appearance}<button class="icon-label" onclick={openAssetEditor}><span class="button-icon" aria-hidden="true">▦</span><span>Sprite bearbeiten</span></button>{/if}</div>
          <p class="asset-live-hint">✦ Änderungen erscheinen sofort in allen verknüpften Instanzen. Bewusste lokale Abweichungen bleiben erhalten.</p>
          <label>Name<input data-asset-setting="name" value={asset.name} oninput={(event) => studio.updateAsset(['name'], event.currentTarget.value)} /></label>
          <label>Kategorie<input data-asset-setting="category" value={asset.category} oninput={(event) => studio.updateAsset(['category'], event.currentTarget.value)} /></label>
          <label>Beschreibung<textarea data-asset-setting="description" rows="3" value={asset.description} oninput={(event) => studio.updateAsset(['description'], event.currentTarget.value)}></textarea></label>
          <div class="field-row"><label>Breite<input data-asset-setting="width" type="number" min="0.25" max="24" step="0.05" value={asset.width} oninput={(event) => studio.updateAsset(['width'], number(event))} /></label><label>Höhe<input data-asset-setting="height" type="number" min="0.25" max="24" step="0.05" value={asset.height} oninput={(event) => studio.updateAsset(['height'], number(event))} /></label></div>
          <label>Grundfarbe<input data-asset-setting="color" type="color" value={asset.color} oninput={(event) => studio.updateAsset(['color'], event.currentTarget.value)} /></label>
          <div class="asset-editor-actions">{#if asset.appearance}<button onclick={openAssetEditor}>▦ Sprite-Keyframes bearbeiten</button>{/if}<button onclick={() => openMotion('asset')}>◆ Bewegung mit Keyframes</button></div>
          <VisualEffectsEditor effects={asset.effects ?? []} title="Asset-Effekte" onchange={(effects) => studio.saveAsset({ ...asset, effects })} />
          <div class="library-management-actions"><button onclick={() => studio.duplicateAsset(asset.id)}>⧉ Vorlage duplizieren</button><button onclick={() => studio.exportAsset(asset.id)}>↓ Vorlage exportieren</button>{#if studio.isCustomAsset(asset.id)}<button class="danger-subtle" onclick={() => { if (window.confirm(studio.isBuiltInAsset(asset.id) ? 'Eigene Änderungen dieser mitgelieferten Vorlage zurücksetzen?' : `Globale Vorlage „${asset.name}“ löschen? Platzierte Instanzen bleiben erhalten.`)) studio.removeAssetDefinition(asset.id); }}>{studio.isBuiltInAsset(asset.id) ? 'Eigene Änderungen zurücksetzen' : 'Vorlage löschen'}</button>{/if}</div>
        {:else}
          <div class="empty-inspector"><span>◆</span><strong>Asset oder Level-Objekt auswählen</strong><p>Wähle links eine globale Vorlage zum Bearbeiten oder direkt im Canvas eine platzierte Instanz.</p><button class="primary" onclick={() => { sidebarMode = 'library'; mobilePanel = 'scene'; }}>Assets öffnen</button></div>
        {/if}
        <details class="secondary-inspector"><summary>Levelränder & Atmosphäre</summary><EdgeEffectsEditor effects={studio.level.theme.edgeEffects ?? []} onchange={(effects) => studio.update(['theme', 'edgeEffects'], effects, 'Levelränder bearbeiten')} /></details>
      </aside>
      {#if mobilePanel !== 'canvas'}<button class="mobile-panel-scrim" aria-label="Mobile Seitenleiste schließen" onclick={() => mobilePanel = 'canvas'}></button>{/if}
      <MobileFocusTabs value={mobilePanel} options={[["scene", sidebarMode === 'library' ? "◆" : "☷", sidebarMode === 'library' ? "Assets" : "Szene"], ["canvas", "▦", "Canvas"], ["inspector", "☰", "Details"]]} onchange={(value) => mobilePanel = value} />
    </div>
  {/if}
</section>

{#if creatorOpen}
  <div class="modal-scrim asset-creator-scrim" role="presentation" onclick={(event) => { if (event.currentTarget === event.target) creatorOpen = false; }}>
    <div class="asset-creator" role="dialog" aria-modal="true" aria-labelledby="asset-creator-title">
      <header><span class="eyebrow">NEUE OBJEKTVORLAGE</span><h2 id="asset-creator-title">Was soll im Level erscheinen?</h2><p>Erst nach „Sprite übernehmen“ wird die Vorlage gespeichert. Abbrechen hinterlässt keinen leeren Bibliothekseintrag.</p></header>
      <div class="field-row"><label>Name<input id="asset-name" bind:value={creatorName} placeholder="z. B. Passauer Laterne" /></label><label>Kategorie<input bind:value={creatorCategory} placeholder="z. B. Altstadt" /></label></div>
      <fieldset class="character-template-options"><legend>Startpunkt</legend>
        <label class:active={creatorTemplate === 'blank'}><input type="radio" bind:group={creatorTemplate} value="blank" /><span><b>Leere Leinwand</b><small>Mit Füllen, Linie, Rechteck, Pipette und Auswahl von Grund auf zeichnen</small></span></label>
        <label class:active={creatorTemplate === 'selected'} class:disabled={!asset?.appearance}><input type="radio" bind:group={creatorTemplate} value="selected" disabled={!asset?.appearance} /><span><b>Aus „{asset?.name ?? 'Vorlage'}“ ableiten</b><small>Eine unabhängige Kopie als Ausgangspunkt verwenden</small></span></label>
      </fieldset>
      <fieldset class="character-resolution-options"><legend>Pixelauflösung</legend>{#each [8, 12, 16, 24] as size}<label class:active={creatorResolution === size}><input type="radio" bind:group={creatorResolution} value={size} /><b>{size} × {size}</b>{#if size === 24}<small>Maximale Details</small>{/if}</label>{/each}</fieldset>
      <footer><button onclick={() => creatorOpen = false}>Abbrechen</button><button class="primary" disabled={!creatorName.trim()} onclick={createAssetDraft}>Im Sprite-Studio gestalten →</button></footer>
    </div>
  </div>
{/if}
