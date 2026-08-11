<script>
  import { tick } from 'svelte';
  let { studio, onselect = () => {} } = $props();
  let tree;
  let search = $state('');
  let filter = $state('all');
  let collapsed = $state([]);
  let groups = $derived.by(() => studio.sceneGroups().map((group) => ({
    ...group,
    nodes: group.nodes.filter((node) => (filter === 'all' || group.id === filter) && `${node.label} ${node.detail}`.toLowerCase().includes(search.trim().toLowerCase())),
  })).filter((group) => group.nodes.length));

  function toggleGroup(id) { collapsed = collapsed.includes(id) ? collapsed.filter((entry) => entry !== id) : [...collapsed, id]; }
  function select(event, node) { studio.selectEntity(node.kind, node.index, { additive: event.shiftKey, reveal: !event.shiftKey }); onselect(node); }
  function control(event, action) { event.stopPropagation(); action(); }

  $effect(() => {
    studio.selectionRevision;
    tick().then(() => tree?.querySelector('.scene-node.selected')?.scrollIntoView({ block: 'nearest' }));
  });
</script>

<div class="scene-tree" aria-label="Szenenbaum" bind:this={tree}>
  <header>
    <div><strong>Szene</strong><span>{studio.sceneGroups().reduce((sum, group) => sum + group.nodes.length, 0)} Elemente</span></div>
    <label class="scene-search"><span>⌕</span><input bind:value={search} placeholder="Element suchen" aria-label="Szenenbaum durchsuchen" /></label>
    <label class="scene-filter"><span class="visually-hidden">Elementtyp filtern</span><select bind:value={filter} aria-label="Elementtyp filtern"><option value="all">Alle Typen</option><option value="actors">Figuren</option><option value="walls">Wände</option><option value="objects">Objekte & Texte</option><option value="events">Ereignisse</option><option value="theme">Systemkulisse</option></select></label>
  </header>

  <div class="scene-groups">
    {#each groups as group}
      <section class="scene-group">
        <button class="scene-group-toggle" aria-expanded={!collapsed.includes(group.id)} onclick={() => toggleGroup(group.id)}><span>{group.icon}</span><strong>{group.label}</strong><em>{group.nodes.length}</em><i>{collapsed.includes(group.id) ? '›' : '⌄'}</i></button>
        {#if !collapsed.includes(group.id)}
          <div class="scene-node-list">
            {#each group.nodes as node}
              {@const entity = studio.selectedEntity(node)}
              {@const hidden = studio.isSceneHidden(node.kind, node.index)}
              {@const selected = studio.isSelected(node.kind, node.index)}
              <div class:selected class:hidden class:locked={Boolean(entity?.locked)} class="scene-node" data-scene-key={node.key}>
                <button class="scene-node-main" onclick={(event) => select(event, node)} title="Klick: erkennen und passende Details öffnen · Shift: zur Auswahl hinzufügen">
                  <span>{node.icon}</span><span><strong>{node.label}</strong><small>{node.detail}</small></span>{#if selected}<i>✓</i>{/if}
                </button>
                <div class="scene-node-actions">
                  {#if node.canHide}<button aria-label={`${node.label} ${hidden ? 'einblenden' : 'ausblenden'}`} aria-pressed={hidden} title={hidden ? 'Einblenden' : 'Nur im Editor ausblenden'} onclick={(event) => control(event, () => studio.toggleSceneVisibility(node.kind, node.index))}>{hidden ? '○' : '◉'}</button>{/if}
                  {#if node.canLock}<button aria-label={`${node.label} ${entity?.locked ? 'entsperren' : 'sperren'}`} aria-pressed={Boolean(entity?.locked)} title={entity?.locked ? 'Entsperren' : 'Position sperren'} onclick={(event) => control(event, () => studio.setSceneLocked(node.kind, node.index, !entity?.locked))}>{entity?.locked ? '▣' : '□'}</button>{/if}
                  {#if node.canReorder}<button aria-label={`${node.label} nach hinten`} title="Nach hinten" disabled={node.index === 0} onclick={(event) => control(event, () => studio.moveSceneNode(node.kind, node.index, -1))}>↓</button><button aria-label={`${node.label} nach vorne`} title="Nach vorne" disabled={node.index === studio.level.decorations.length - 1} onclick={(event) => control(event, () => studio.moveSceneNode(node.kind, node.index, 1))}>↑</button>{/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </section>
    {/each}
    {#if !groups.length}<p class="hint">Keine passenden Elemente gefunden.</p>{/if}
  </div>
  <footer><span><kbd>Shift</kbd> Mehrfachauswahl</span><span><kbd>Alt</kbd> Überlappung wählen</span><span>Ein Klick öffnet automatisch die passenden Details</span></footer>
</div>
