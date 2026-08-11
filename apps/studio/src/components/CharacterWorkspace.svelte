<script>
  import { createFranzLolaAppearance, PLAYER_STATES } from '../character-template.js';
  import ActorThumbnail from './ActorThumbnail.svelte';
  import MobileFocusTabs from './MobileFocusTabs.svelte';
  import SelectionSummary from './SelectionSummary.svelte';
  import SpriteSheetEditor from './SpriteSheetEditor.svelte';
  import VisualEffectsEditor from './VisualEffectsEditor.svelte';

  let { studio } = $props();
  let editing = $state(false);
  let editingAsset = $state.raw(null);
  let editingNewDefinition = $state(false);
  let creatorOpen = $state(false);
  let creatorName = $state('');
  let creatorTemplate = $state('pixel');
  let creatorResolution = $state(24);
  let characterSearch = $state('');
  let mobilePanel = $state('canvas');
  let selectedLevelKind = $derived(['player', 'cat', 'character'].includes(studio.selection?.kind) ? studio.selection.kind : '');
  let definition = $derived(studio.characterAssets.find((entry) => entry.id === studio.selectedCharacterId) ?? null);
  let targetKind = $derived(selectedLevelKind || (definition ? 'definition' : 'player'));
  let targetIndex = $derived(selectedLevelKind ? studio.selection.index : 0);
  let actor = $derived(targetKind === 'player' ? studio.level.actors.player : targetKind === 'cat' ? studio.level.actors.cats[targetIndex] : targetKind === 'character' ? studio.level.actors.characters?.[targetIndex] : definition);
  let appearance = $derived(actor?.appearance ?? (targetKind === 'player' ? createFranzLolaAppearance() : null));
  let title = $derived(targetKind === 'player' ? 'Franz & Lola' : targetKind === 'cat' ? `Katze ${targetIndex + 1}` : actor?.name || `Figur ${targetIndex + 1}`);
  let profile = $derived(studio.level.gameplay.difficulties[studio.difficulty]);
  let filteredCharacterAssets = $derived.by(() => {
    const query = characterSearch.trim().toLocaleLowerCase('de');
    return query ? studio.characterAssets.filter((entry) => `${entry.name} ${entry.description ?? ''}`.toLocaleLowerCase('de').includes(query)) : studio.characterAssets;
  });

  const clone = (value) => JSON.parse(JSON.stringify(value));
  function select(kind, index) { studio.selectedCharacterId = ''; studio.selectEntity(kind, index); editing = false; editingAsset = null; mobilePanel = 'inspector'; }
  function selectDefinition(id) { studio.clearSelection(); studio.selectedCharacterId = id; editing = false; editingAsset = null; mobilePanel = 'canvas'; }
  function number(event) { return Number(event.currentTarget.value); }
  function update(path, value) { studio.updateSelected(path, value, 'Figur bearbeiten'); }
  function updateDefinition(path, value) {
    if (!definition) return;
    const next = clone(definition);
    const parent = path.slice(0, -1).reduce((entry, key) => entry[key], next);
    parent[path.at(-1)] = value;
    studio.saveCharacterDefinition(next);
  }
  function editSprite() {
    editingAsset = targetKind === 'definition' ? clone(definition) : null;
    editingNewDefinition = false;
    editing = true;
  }
  function saveSprite(next) {
    if (editingAsset) studio.saveCharacterDefinition({ ...editingAsset, appearance: next }, editingNewDefinition ? 'Figurenvorlage erstellen' : 'Figuren-Sprite bearbeiten');
    else studio.setActorAppearance(targetKind, targetIndex, next);
    editingAsset = null; editingNewDefinition = false;
    editing = false;
  }
  function cancelSprite() { editingAsset = null; editingNewDefinition = false; editing = false; }
  function openCreator() { creatorName = ''; creatorTemplate = 'pixel'; creatorResolution = 24; creatorOpen = true; }
  function createCharacter() {
    if (!creatorName.trim()) return;
    editingAsset = studio.createCharacterDraft(creatorName.trim(), creatorTemplate, creatorResolution);
    creatorOpen = false;
    studio.clearSelection();
    studio.selectedCharacterId = '';
    editingNewDefinition = true;
    editing = true;
  }

  $effect(() => {
    studio.selectionRevision;
    if (studio.workspace === 'characters' && studio.selection) mobilePanel = 'inspector';
  });
</script>

<section class="workspace character-workspace" aria-labelledby="character-workspace-title">
  <header class="workspace-header character-workspace-header">
    <div><span class="eyebrow">CHARAKTERATELIER</span><h2 id="character-workspace-title">Figuren & Sprite-Sheets</h2><p>Erstelle eigenständige Figuren einmal global und setze sie anschließend in beliebig vielen Levels ein.</p></div>
    <div class="character-header-actions"><div class="history-actions" aria-label="Änderungsverlauf"><button onclick={() => studio.undo()} disabled={!studio.canUndo} aria-label="Rückgängig">↶</button><button onclick={() => studio.redo()} disabled={!studio.canRedo} aria-label="Wiederholen">↷</button></div><button class="primary create-character-button" id="create-character" onclick={openCreator}>＋ Neue Figur</button></div>
  </header>

  {#if editing && (actor || editingAsset)}
    {#key `${targetKind}-${targetIndex}-${editingAsset?.id ?? ''}`}
      <SpriteSheetEditor
        appearance={editingAsset?.appearance ?? appearance}
        title={editingAsset ? `${editingAsset.name} gestalten` : title}
        showStates={true}
        onsave={saveSprite}
        oncancel={cancelSprite}
      />
    {/key}
  {:else}
    <div class="character-layout focus-layout">
      <aside class:mobile-active={mobilePanel === 'scene'} class="actor-browser" data-focus-panel="scene">
        <div class="panel-title"><strong>Figuren im Level</strong><span>{1 + studio.level.actors.cats.length + (studio.level.actors.characters?.length ?? 0)}</span></div>
        <button class:active={targetKind === 'player'} onclick={() => select('player', 0)}><span class="actor-avatar actual"><ActorThumbnail actor={studio.level.actors.player} kind="player" state="idle" label="Franz und Lola" /></span><span><b>Franz & Lola</b><small>Spieler · gemeinsam</small></span></button>
        {#each studio.level.actors.cats as cat, index}
          <button class:active={targetKind === 'cat' && targetIndex === index} onclick={() => select('cat', index)}><span class="actor-avatar actual"><ActorThumbnail actor={cat} kind="cat" state="idle" label={`Katze ${index + 1}`} /></span><span><b>Katze {index + 1}</b><small>Gegner · {cat.behavior.strategy}</small></span></button>
        {/each}
        {#each studio.level.actors.characters ?? [] as character, index}
          <button class:active={targetKind === 'character' && targetIndex === index} data-level-character-id={character.id} onclick={() => select('character', index)}><span class="actor-avatar actual"><ActorThumbnail actor={character} kind="character" state={character.state} label={character.name} /></span><span><b>{character.name}</b><small>Eigene Figur · Cutscene-fähig</small></span></button>
        {/each}
        <button class="subtle-add" onclick={() => { studio.setTool('cat'); studio.workspace = 'level'; }}>＋ Katze im Level setzen</button>

        <div class="panel-title global-character-title"><strong>Globale Bibliothek</strong><span>{studio.characterAssets.length}</span></div>
        <p class="library-explainer">Diese Vorlagen stehen in jedem Level bereit. Platzierte Figuren werden vollständig in das Level eingebettet.</p>
        <button class="character-library-create" onclick={openCreator}>＋ Neue globale Figur</button>
        <label class="asset-search">Figuren durchsuchen<input type="search" placeholder="Name oder Beschreibung …" bind:value={characterSearch} /></label>
        {#each filteredCharacterAssets as entry}
          <button class:active={targetKind === 'definition' && definition?.id === entry.id} data-character-id={entry.id} onclick={() => selectDefinition(entry.id)}><span class="actor-avatar actual"><ActorThumbnail actor={entry} kind="character" state="idle" label={`${entry.name} aus der Figurenbibliothek`} /></span><span><b>{entry.name}</b><small>Global · in allen Levels</small></span></button>
        {/each}
        {#if !studio.characterAssets.length}<div class="character-library-empty"><strong>Noch keine eigene Figur</strong><span>Lege hier deinen ersten vollständig neuen Charakter an.</span></div>{/if}
      </aside>

      <div class="character-stage mobile-active" data-focus-panel="canvas">
        {#if actor}
          <div class="character-hero" data-character-source={targetKind === 'definition' ? 'global' : 'level'}>
            <ActorThumbnail actor={actor} {appearance} kind={targetKind === 'definition' ? 'character' : targetKind} state={actor.state ?? 'idle'} class="actor-preview-large" label={`${title} in Spieldarstellung`} />
            <div><span class="eyebrow">{targetKind === 'definition' ? 'GLOBALE FIGURENVORLAGE' : 'AKTIVE FIGUR IM LEVEL'}</span><h3>{title}</h3><p>{appearance ? `${appearance.width} × ${appearance.height} Pixel · ${appearance.animations.length} Animationen` : 'Standard-Pixelrenderer'}{targetKind === 'character' ? ` · ${Number(actor.scale ?? 1).toFixed(2)}× im Level` : ''}</p><button class="primary" onclick={editSprite}>Sprite-Sheet bearbeiten</button>{#if targetKind === 'definition'}<button class="place-character-button" onclick={() => studio.placeCharacter(definition.id)}>＋ Im Level platzieren</button>{:else if targetKind === 'character'}<button class="place-character-button" onclick={() => studio.transformSelectedInLevel()}>↔ Im Level bewegen & skalieren</button>{:else if targetKind === 'player'}<button onclick={() => studio.resetPlayerAppearance()}>Originalvorlage laden</button>{/if}</div>
          </div>
          <div class="state-matrix">
            <header><strong>Player States</strong><span>Jeder Zustand verweist eindeutig auf eine Animation.</span></header>
            {#each PLAYER_STATES as state}
              <div data-player-state={state}><ActorThumbnail actor={actor} {appearance} kind={targetKind === 'cat' ? 'cat' : 'character'} {state} class="actor-state-preview" label={`${state} Vorschau`} /><strong>{state}</strong><code>{appearance?.stateAnimations?.[state] || 'Standardrenderer'}</code></div>
            {/each}
          </div>
        {:else}
          <div class="empty-workspace"><span>◎</span><h3>Eine Figur auswählen</h3><p>Wähle links eine Level-Figur oder lege eine neue globale Vorlage an.</p><button class="primary" onclick={openCreator}>Neue Figur anlegen</button></div>
        {/if}
      </div>

      <aside class:mobile-active={mobilePanel === 'inspector'} class="property-panel" data-focus-panel="inspector">
        <SelectionSummary {studio} />
        {#if actor && targetKind === 'definition'}
          <div class="property-section"><span class="section-number">GLOBAL</span><h3>Figurenvorlage</h3></div>
          <p class="hint">Änderungen an der Vorlage gelten sofort für passende Instanzen im geöffneten Level. Andere Level übernehmen sie beim nächsten Platzieren.</p>
          <label>Name<input value={definition.name} onchange={(event) => updateDefinition(['name'], event.currentTarget.value)} /></label>
          <label>Beschreibung<textarea rows="3" value={definition.description} onchange={(event) => updateDefinition(['description'], event.currentTarget.value)}></textarea></label>
          <p class="hint">Freie Figuren stehen im normalen Spiel. Bewegung und Zustandswechsel werden gezielt in Cutscenes inszeniert.</p>
          <VisualEffectsEditor effects={definition.effects ?? []} title="Vorlageneffekte" onchange={(effects) => updateDefinition(['effects'], effects)} />
          <button class="primary" onclick={() => studio.placeCharacter(definition.id)}>＋ Im Level platzieren</button>
          <div class="library-management-actions"><button onclick={() => studio.duplicateCharacterDefinition(definition.id)}>⧉ Figur duplizieren</button><button onclick={() => studio.exportCharacterDefinition(definition.id)}>↓ Figur exportieren</button><button class="danger" onclick={() => { if (window.confirm(`Globale Figur „${definition.name}“ löschen? Bereits platzierte Figuren bleiben im Level erhalten.`)) studio.removeCharacterDefinition(definition.id); }}>Globale Vorlage löschen</button></div>
        {:else if actor}
          <div class="property-section"><span class="section-number">{targetKind === 'character' ? 'FIG' : 'AI'}</span><h3>{targetKind === 'character' ? 'Eigene Figur' : 'Verhalten'}</h3></div>
          {#if targetKind === 'character'}<label>Name<input value={actor.name} onchange={(event) => update(['name'], event.currentTarget.value)} /></label>{/if}
          <div class="field-row"><label>X<input type="number" value={actor.x} onchange={(event) => update(['x'], number(event))} /></label><label>Y<input type="number" value={actor.y} onchange={(event) => update(['y'], number(event))} /></label></div>
          {#if targetKind === 'player'}
            <label>Steuerung<select value={actor.behavior.controller} onchange={(event) => update(['behavior', 'controller'], event.currentTarget.value)}><option value="user">Spieler</option><option value="autopilot">Autopilot</option><option value="patrol">Patrouille</option><option value="stationary">Stehen</option></select></label>
          {:else if targetKind === 'cat'}
            <label>Strategie<select value={actor.behavior.strategy} onchange={(event) => update(['behavior', 'strategy'], event.currentTarget.value)}><option value="chase">Verfolgen</option><option value="ambush">Auflauern</option><option value="scatter-chase">Wechseln</option><option value="guard">Ort bewachen</option><option value="random">Zufällig</option><option value="stationary">Stehen</option></select></label>
            <div class="field-row"><label>Vorausschau<input type="number" min="0" max="12" value={actor.behavior.lookAhead} onchange={(event) => update(['behavior', 'lookAhead'], number(event))} /></label><label>Zufall<input type="number" min="0" max="12" step="0.1" value={actor.behavior.wanderMultiplier} onchange={(event) => update(['behavior', 'wanderMultiplier'], number(event))} /></label></div>
            <div class="field-row"><label>Fell<input type="color" value={actor.color} oninput={(event) => update(['color'], event.currentTarget.value)} /></label><label>Akzent<input type="color" value={actor.accent} oninput={(event) => update(['accent'], event.currentTarget.value)} /></label></div>
          {:else}
            <label>Grundzustand<select value={actor.state} onchange={(event) => update(['state'], event.currentTarget.value)}>{#each PLAYER_STATES as state}<option value={state}>{state}</option>{/each}</select></label>
            <label>Größe im Level<input aria-label="Figur Skalierung" type="range" min="0.5" max="4" step="0.05" value={actor.scale ?? 1} oninput={(event) => update(['scale'], number(event))} /><output>{Number(actor.scale ?? 1).toFixed(2)}×</output></label>
            <button class="primary" onclick={() => studio.transformSelectedInLevel()}>↔ Im Level bewegen & skalieren</button>
            <p class="hint">Diese Figur kann frei skaliert und als Darsteller in Cutscenes bewegt und animiert werden.</p>
          {/if}
          {#if targetKind !== 'character'}<label>Tempo-Multiplikator<input type="number" min="0.1" max="4" step="0.1" value={actor.behavior.speedMultiplier} onchange={(event) => update(['behavior', 'speedMultiplier'], number(event))} /></label>{/if}
          <VisualEffectsEditor effects={actor.effects ?? []} title="Figureneffekte" onchange={(effects) => update(['effects'], effects)} />
          {#if targetKind === 'cat'}<button class="danger" onclick={() => studio.deleteSelection()}>Katze entfernen</button>{:else if targetKind === 'character'}<button class="danger" onclick={() => studio.deleteSelection()}>Figur aus Level entfernen</button>{/if}
        {/if}
        <div class="property-section"><span class="section-number">PHYS</span><h3>Spielgefühl</h3></div>
        <label>Schwierigkeit<select bind:value={studio.difficulty}><option value="easy">Spaziergang</option><option value="normal">Gassirunde</option><option value="hard">Abenteuer</option></select></label>
        <div class="field-row"><label>Franz Tempo<input type="number" step="0.05" value={profile.playerSpeed} onchange={(event) => studio.update(['gameplay', 'difficulties', studio.difficulty, 'playerSpeed'], number(event))} /></label><label>Katze Tempo<input type="number" step="0.05" value={profile.catSpeed} onchange={(event) => studio.update(['gameplay', 'difficulties', studio.difficulty, 'catSpeed'], number(event))} /></label></div>
        <div class="field-row"><label>Leben<input type="number" min="1" value={profile.lives} onchange={(event) => studio.update(['gameplay', 'difficulties', studio.difficulty, 'lives'], number(event))} /></label><label>Katzen<input type="number" min="0" max="12" value={profile.catCount} onchange={(event) => studio.update(['gameplay', 'difficulties', studio.difficulty, 'catCount'], number(event))} /></label></div>
      </aside>
      {#if mobilePanel !== 'canvas'}<button class="mobile-panel-scrim" aria-label="Mobile Seitenleiste schließen" onclick={() => mobilePanel = 'canvas'}></button>{/if}
      <MobileFocusTabs value={mobilePanel} options={[["scene", "FL", "Figuren"], ["canvas", "◈", "Vorschau"], ["inspector", "☰", "Details"]]} onchange={(value) => mobilePanel = value} />
    </div>
  {/if}
</section>

{#if creatorOpen}
  <div class="modal-scrim character-creator-scrim" role="presentation" onclick={(event) => { if (event.currentTarget === event.target) creatorOpen = false; }}>
    <div class="character-creator" role="dialog" aria-modal="true" aria-labelledby="character-creator-title">
      <header><span class="eyebrow">NEUE GLOBALE FIGUR</span><h2 id="character-creator-title">Wer soll Passau bereichern?</h2><p>Die Vorlage steht anschließend in jedem Level bereit. Erst beim Platzieren entsteht eine unabhängige Levelinstanz.</p></header>
      <label>Figurenname<input id="character-name" bind:value={creatorName} placeholder="z. B. Passauer Postler" /></label>
      <fieldset class="character-template-options"><legend>Startvorlage</legend>
        <label class:active={creatorTemplate === 'pixel'}><input type="radio" bind:group={creatorTemplate} value="pixel" /><span><b>Detaillierte Figur</b><small>24×24-Pixel-Vorlage mit Schattierung, elf Farben und animierten Bewegungszuständen</small></span></label>
        <label class:active={creatorTemplate === 'empty'}><input type="radio" bind:group={creatorTemplate} value="empty" /><span><b>Leere Leinwand</b><small>Komplett von Null in der gewählten Auflösung zeichnen</small></span></label>
        <label class:active={creatorTemplate === 'franz-lola'}><input type="radio" bind:group={creatorTemplate} value="franz-lola" /><span><b>Franz & Lola kopieren</b><small>Vorhandene fünf Bewegungszustände umbauen</small></span></label>
      </fieldset>
      <fieldset class="character-resolution-options"><legend>Arbeitsauflösung</legend>{#each [8, 12, 16, 24] as size}<label class:active={creatorResolution === size}><input type="radio" bind:group={creatorResolution} value={size} /><b>{size} × {size}</b>{#if size === 24}<small>Maximale Details</small>{/if}</label>{/each}</fieldset>
      <footer><button onclick={() => creatorOpen = false}>Abbrechen</button><button class="primary" disabled={!creatorName.trim()} onclick={createCharacter}>Weiter zum Sprite-Studio →</button></footer>
    </div>
  </div>
{/if}
