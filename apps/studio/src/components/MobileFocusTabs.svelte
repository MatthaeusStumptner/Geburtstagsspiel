<script>
  let { value, options, onchange } = $props();
</script>

<nav class="mobile-focus-tabs" aria-label="Mobile Arbeitsansicht">
  {#each options as [id, icon, label]}
    <button class:active={value === id} aria-pressed={value === id} onclick={() => onchange(id)}><span>{icon}</span><strong>{label}</strong></button>
  {/each}
</nav>
