<script>
  let { studio } = $props();
  let context = $derived(studio.selectionContext());
</script>

{#if context}
  <div class="selection-summary" role="status" data-selection-kind={context.selection.kind} data-selection-workspace={context.workspace}>
    <span class="eyebrow">KONTEXT ERKANNT</span>
    <div><span>{context.icon}</span><div><strong>{context.label}</strong><small>{studio.selectionCount > 1 ? `${studio.selectionCount} Elemente ausgewählt · ${context.workspaceLabel}` : `${context.kindLabel} · ${context.workspaceLabel}`}</small></div></div>
    <p><b>{context.detail}</b><span>{context.hint}</span></p>
    <div class="selection-summary-actions">
      {#if context.primaryTool}<button class="primary" onclick={() => studio.activateSelectionTool()}>{context.primaryActionLabel}</button>{/if}
      {#if studio.workspace !== 'level'}<button onclick={() => studio.showSelectionInLevel()}>Im Level zeigen</button>{/if}
      <button class="selection-clear" aria-label="Auswahl aufheben" title="Auswahl aufheben" onclick={() => studio.clearSelection()}>×</button>
    </div>
  </div>
{/if}
