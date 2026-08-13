<script>
  import LevelCanvas from './LevelCanvas.svelte';
  import MobileFocusTabs from './MobileFocusTabs.svelte';
  import SceneTree from './SceneTree.svelte';
  import SelectionSummary from './SelectionSummary.svelte';
  import VisualEffectsEditor from './VisualEffectsEditor.svelte';

  let { studio } = $props();
  let sidebarMode = $state('tools');
  let mobilePanel = $state('canvas');
  let selectedWall = $derived(studio.selection?.kind === 'wall' ? studio.level.board.walls[studio.selection.index] : null);
  let selectedCharacter = $derived(studio.selection?.kind === 'character' ? studio.level.actors.characters?.[studio.selection.index] : null);
  let selectedWallCount = $derived(studio.selections.filter((selection) => selection.kind === 'wall').length);
  const tools = [
    ['select', '↖', 'Auswahl', 'V'], ['transform', '↔', 'Bewegen', 'M'], ['wall', '▦', 'Stift', 'B'], ['line', '╱', 'Linie', 'L'], ['rectangle', '▰', 'Rechteck', 'R'], ['fill', '◩', 'Füllen', 'F'], ['erase', '◇', 'Radierer', 'E'],
    ['player', '●', 'Start', 'P'], ['cat', '◆', 'Katze', 'K'], ['power', '✦', 'Power', 'G'],
  ];
  const themes = [
    ['dog-park', 'Nachbarschaft'], ['brahmahof-home', 'Franz & Lolas Haus'], ['bschuett', 'Bschüttpark'], ['tabakfabrik', 'Tabakfabrik'], ['zauberberg', 'Zauberberg'],
  ];

  function number(event) { const value = Number(event.currentTarget.value); return event.currentTarget.value === '' || !Number.isFinite(value) ? undefined : value; }
  function tunnels(event) { return event.currentTarget.value.split(',').map((value) => Number.parseInt(value.trim(), 10)).filter(Number.isFinite); }

  $effect(() => {
    studio.selectionRevision;
    if (studio.workspace === 'level' && studio.selection) mobilePanel = studio.tool === 'transform' ? 'canvas' : 'inspector';
  });
</script>

<section class="workspace level-workspace" aria-labelledby="level-workspace-title">
  <header class="workspace-header">
    <div><span class="eyebrow">LEVELBAU</span><h2 id="level-workspace-title">Wege, Regeln und Ort</h2><p>Hier entsteht nur das Spielfeld. Figuren, Objekte und Ereignisse haben eigene Arbeitsbereiche.</p></div>
    <div class="history-actions"><button onclick={() => studio.undo()} disabled={!studio.canUndo} aria-label="Rückgängig">↶</button><button onclick={() => studio.redo()} disabled={!studio.canRedo} aria-label="Wiederholen">↷</button></div>
  </header>

  <div class="workspace-grid canvas-workspace-grid focus-layout">
    <aside class:mobile-active={mobilePanel === 'scene'} class="level-sidebar" data-focus-panel="scene" aria-label="Werkzeuge und Szenenbaum">
      <div class="sidebar-mode-tabs"><button class:active={sidebarMode === 'tools'} onclick={() => sidebarMode = 'tools'}>▦ Werkzeuge</button><button class:active={sidebarMode === 'scene'} onclick={() => sidebarMode = 'scene'}>☷ Szene</button></div>
      {#if sidebarMode === 'tools'}
        <div class="tool-list">
          {#each tools as [id, icon, label, key]}
            <button class:active={studio.tool === id} data-tool={id} onclick={() => { studio.setTool(id); mobilePanel = 'canvas'; }} title={`${label} (${key})`}><span>{icon}</span><b>{label}</b><kbd>{key}</kbd></button>
          {/each}
          <hr />
          <button data-tool="object" onclick={() => studio.workspace = 'objects'}><span>♣</span><b>Objektwerkstatt</b><kbd>O</kbd></button>
          <button data-tool="event-visual" onclick={() => studio.workspace = 'events'}><span>!</span><b>Ereignisregie</b><kbd>I</kbd></button>
        </div>
      {:else}
        <SceneTree {studio} onselect={() => mobilePanel = 'inspector'} />
      {/if}
    </aside>

    <div class="canvas-column mobile-active" data-focus-panel="canvas">
      <div class="canvas-toolbar">
        <label>Vorschau<select bind:value={studio.difficulty}><option value="easy">Spaziergang · 70</option><option value="normal">Gassirunde · 110</option><option value="hard">Abenteuer · 160</option></select></label>
        <label class="switch"><input type="checkbox" bind:checked={studio.showGrid} /><span>Raster</span></label>
        <label class="switch"><input type="checkbox" bind:checked={studio.showGuttis} /><span>Guttis</span></label>
        <label class="switch"><input type="checkbox" bind:checked={studio.showEvents} /><span>Ereignisse</span></label>
      </div>
      {#if studio.tool === 'character' && studio.selectedCharacterAsset}<div class="character-placement-banner" role="status"><span>◎</span><div><strong>{studio.selectedCharacterAsset.name} platzieren</strong><small>Klicke auf ein freies Feld. Die Figur wird nicht als Katze gezählt.</small></div><button onclick={() => studio.setTool('select')}>Abbrechen</button></div>{/if}
      <LevelCanvas {studio} />
      <footer class="canvas-status"><span>{studio.cursorCopy}</span><span>{studio.tool === 'select' ? studio.selection ? 'Erkannt · passende Details geöffnet · Alt wählt dahinter' : 'Element anklicken · Typ und Details werden automatisch erkannt' : studio.tool === 'character' ? `${studio.selectedCharacterAsset?.name ?? 'Figur'} auf ein freies Feld setzen` : studio.tool === 'transform' ? `${studio.selection?.kind === 'character' ? 'Figur' : 'Objekt'} ziehen · Eckgriff ziehen zum Skalieren` : 'Ziehen oder klicken, um zu bearbeiten'}</span><strong>{studio.saveStatus}</strong></footer>
    </div>

    <aside class:mobile-active={mobilePanel === 'inspector'} class="property-panel" data-focus-panel="inspector">
      <SelectionSummary {studio} />
      {#if selectedCharacter}
        <section class="character-instance-inspector" aria-label="Ausgewählte Figur positionieren">
          <div class="property-section"><span class="section-number">FIG</span><h3>{selectedCharacter.name}</h3></div>
          <p class="hint">Die Figur ist im Canvas hervorgehoben. Mit „Bewegen“ ziehst du sie direkt; die vier Eckgriffe skalieren sie.</p>
          <div class="field-row"><label>X<input aria-label="Figur X" type="number" min="0" max={studio.level.board.columns - 1} value={selectedCharacter.x} onchange={(event) => studio.updateSelected(['x'], number(event), 'Figur positionieren')} /></label><label>Y<input aria-label="Figur Y" type="number" min="0" max={studio.level.board.rows - 1} value={selectedCharacter.y} onchange={(event) => studio.updateSelected(['y'], number(event), 'Figur positionieren')} /></label></div>
          <label>Skalierung<input aria-label="Figur Skalierung im Level" type="range" min="0.5" max="4" step="0.05" value={selectedCharacter.scale ?? 1} oninput={(event) => studio.updateSelected(['scale'], number(event), 'Figur skalieren')} /><output>{Number(selectedCharacter.scale ?? 1).toFixed(2)}×</output></label>
          <div class="character-instance-actions"><button class="primary" onclick={() => studio.transformSelectedInLevel()}>↔ Bewegen & skalieren</button><button onclick={() => studio.openSelectionWorkspace()}>Sprite & Details öffnen</button></div>
          <button class="danger" onclick={() => studio.deleteSelection()}>Figur aus Level entfernen</button>
        </section>
      {/if}
      {#if selectedWall}
        <section class="wall-instance-inspector" aria-label="Ausgewählte Wand bearbeiten">
          <div class="property-section"><span class="section-number">WALL</span><h3>{selectedWallCount > 1 ? selectedWallCount + ' Wände' : selectedWall.name || 'Wand ' + (studio.selection.index + 1)}</h3></div>
          <p class="hint">Diese Werte gelten für die platzierte Instanz. Stiländerungen werden auf alle ausgewählten Wände angewendet.</p>
          <div class="field-row"><label>ID<input value={selectedWall.id || 'wall-' + (studio.selection.index + 1)} onchange={(event) => studio.updateSelected(['id'], event.currentTarget.value)} /></label><label>Name<input value={selectedWall.name || 'Wand ' + (studio.selection.index + 1)} oninput={(event) => studio.updateSelected(['name'], event.currentTarget.value)} /></label></div>
          <div class="field-row"><label>X<input aria-label="Wand X" type="number" min="0" max={studio.level.board.columns - 1} value={selectedWall.x} oninput={(event) => studio.updateSelected(['x'], number(event))} /></label><label>Y<input aria-label="Wand Y" type="number" min="0" max={studio.level.board.rows - 1} value={selectedWall.y} oninput={(event) => studio.updateSelected(['y'], number(event))} /></label></div>
          <div class="field-row"><label>Breite<input aria-label="Wand Breite" type="number" min="1" max={studio.level.board.columns} value={selectedWall.width} oninput={(event) => studio.updateSelected(['width'], number(event))} /></label><label>Höhe<input aria-label="Wand Höhe" type="number" min="1" max={studio.level.board.rows} value={selectedWall.height} oninput={(event) => studio.updateSelected(['height'], number(event))} /></label></div>
          <label class="switch"><input aria-label="Themefarbe für Wand" type="checkbox" checked={selectedWall.useThemeColor !== false} onchange={(event) => studio.updateSelectedWalls(['useThemeColor'], event.currentTarget.checked)} /><span>Farbe aus dem Level-Theme verwenden</span></label>
          <div class="field-row"><label>Eigenfarbe<input aria-label="Wand Eigenfarbe" type="color" value={selectedWall.color || studio.level.theme.palette.walls[0]} oninput={(event) => studio.updateSelectedWalls(['color'], event.currentTarget.value)} /></label><label>Akzent<input aria-label="Wand Akzent" type="color" value={selectedWall.accent || '#48707a'} oninput={(event) => studio.updateSelectedWalls(['accent'], event.currentTarget.value)} /></label></div>
          <label>Muster<select aria-label="Wand Muster" value={selectedWall.pattern || 'theme'} onchange={(event) => studio.updateSelectedWalls(['pattern'], event.currentTarget.value)}><option value="theme">Theme-Details</option><option value="solid">Glatt</option><option value="brick">Backstein</option><option value="metal">Metall</option><option value="windows">Fenster</option></select></label>
          <label>Deckkraft<input aria-label="Wand Deckkraft" type="range" min="0.15" max="1" step="0.05" value={selectedWall.opacity ?? 1} oninput={(event) => studio.updateSelectedWalls(['opacity'], number(event))} /><output>{Math.round((selectedWall.opacity ?? 1) * 100)}%</output></label>
          <VisualEffectsEditor effects={selectedWall.effects ?? []} title="Wand-Effekte" onchange={(effects) => studio.updateSelectedWalls(['effects'], effects)} />
          <button class="danger" onclick={() => studio.deleteSelection()}>{selectedWallCount > 1 ? selectedWallCount + ' Wände löschen' : 'Wand löschen'}</button>
        </section>
      {/if}
      <div class="property-section"><span class="section-number">01</span><h3>Identität</h3></div>
      <label>ID<input id="level-id" value={studio.level.id} onchange={(event) => studio.update(['id'], event.currentTarget.value)} /></label>
      <label>Name<input id="level-name" value={studio.level.name.standard} oninput={(event) => studio.update(['name', 'standard'], event.currentTarget.value)} /></label>
      <label>Name im Dialekt<input value={studio.level.name.dialect} oninput={(event) => studio.update(['name', 'dialect'], event.currentTarget.value)} /></label>
      <div class="field-row"><label>Symbol<input value={studio.level.icon} maxlength="3" oninput={(event) => studio.update(['icon'], event.currentTarget.value)} /></label><label>Gebiet<input value={studio.level.location.area} oninput={(event) => studio.update(['location', 'area'], event.currentTarget.value)} /></label></div>
      <label>Mission<input value={studio.level.mission.standard} oninput={(event) => studio.update(['mission', 'standard'], event.currentTarget.value)} /></label>
      <label>Beschreibung<textarea rows="3" value={studio.level.description.standard} oninput={(event) => studio.update(['description', 'standard'], event.currentTarget.value)}></textarea></label>

      <div class="property-section"><span class="section-number">02</span><h3>Raster & Theme</h3></div>
      <div class="field-row"><label>Breite<input type="number" min="9" max="64" value={studio.level.board.columns} oninput={(event) => studio.update(['board', 'columns'], number(event))} /></label><label>Höhe<input type="number" min="9" max="64" value={studio.level.board.rows} oninput={(event) => studio.update(['board', 'rows'], number(event))} /></label></div>
      <label>Tunnelzeilen<input value={studio.level.board.tunnelRows.join(', ')} onchange={(event) => studio.update(['board', 'tunnelRows'], tunnels(event))} /></label>
      <label>Umgebung<select value={studio.level.theme.landmark} onchange={(event) => studio.update(['theme', 'landmark'], event.currentTarget.value)}>{#each themes as [id, name]}<option value={id}>{name}</option>{/each}</select></label>
      <div class="color-grid">
        <label>Straße<input type="color" value={studio.level.theme.palette.ground[0]} oninput={(event) => studio.update(['theme', 'palette', 'ground', 0], event.currentTarget.value)} /></label>
        <label>Mauer<input type="color" value={studio.level.theme.palette.walls[0]} oninput={(event) => studio.update(['theme', 'palette', 'walls', 0], event.currentTarget.value)} /></label>
        <label>Bordstein<input type="color" value={studio.level.theme.palette.curb} oninput={(event) => studio.update(['theme', 'palette', 'curb'], event.currentTarget.value)} /></label>
        <label>Wasser<input type="color" value={studio.level.theme.palette.water} oninput={(event) => studio.update(['theme', 'palette', 'water'], event.currentTarget.value)} /></label>
      </div>

      <div class="property-section"><span class="section-number">03</span><h3>Prüfung</h3></div>
      <div class:invalid={!studio.validation.ok} class="validation-card"><strong>{studio.validation.ok ? '✓ Level ist spielbar' : `⚠ ${studio.validation.errors.length} Fehler`}</strong><span>{studio.validation.warnings.length} Hinweise · {studio.pellets.size} Guttis</span></div>
      {#if studio.validation.errors.length}<ul class="issue-list">{#each studio.validation.errors as error}<li>{error}</li>{/each}</ul>{/if}
      {#if studio.validation.warnings.length}<details><summary>Hinweise ansehen</summary><ul class="issue-list warning">{#each studio.validation.warnings as warning}<li>{warning}</li>{/each}</ul></details>{/if}
    </aside>
    {#if mobilePanel !== 'canvas'}<button class="mobile-panel-scrim" aria-label="Mobile Seitenleiste schließen" onclick={() => mobilePanel = 'canvas'}></button>{/if}
    <MobileFocusTabs value={mobilePanel} options={[["scene", "☷", "Szene"], ["canvas", "▦", "Canvas"], ["inspector", "☰", "Details"]]} onchange={(value) => mobilePanel = value} />
  </div>
</section>
