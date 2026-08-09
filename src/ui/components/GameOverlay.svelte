<script>
  import { tick } from 'svelte';

  let { state: view, command } = $props();
  let primaryButton = $state();

  $effect(() => {
    if (view.open) tick().then(() => primaryButton?.focus());
  });
</script>

{#if view.open}
  <div
    class:grand-finale={view.variant === 'grand-finale'}
    class:confirmation={view.variant === 'confirmation'}
    class:level-intro={view.variant === 'level-intro'}
    class="game-overlay"
    id="overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="game-overlay-title"
  >
    <div class="overlay-card">
      {#if view.variant === 'grand-finale'}
        <div class="completion-emblem" aria-hidden="true"><strong>100%</strong><span>PASSAU</span></div>
      {/if}
      <p class="overlay-kicker">{view.kicker}</p>
      <h2 id="game-overlay-title">{view.title}</h2>
      <p>{view.copy}</p>
      {#if view.showControls}
        <div class="control-intro">
          <div class="control-demo" aria-hidden="true"><span class="control-demo-route"></span><span class="control-demo-dog">◆</span><span class="control-demo-touch"></span><span class="control-demo-arrow">→</span></div>
          <p>{view.controlHint}</p>
        </div>
      {/if}
      <button bind:this={primaryButton} class="primary-button" id="overlay-button" type="button" onclick={() => command('activateOverlayPrimary')}>{view.button}</button>
      {#if view.secondaryButton}
        <button class="secondary-button" id="overlay-secondary-button" type="button" onclick={() => command('activateOverlaySecondary')}>{view.secondaryButton}</button>
      {/if}
      <p class="key-hint">{view.keyHint}</p>
    </div>
  </div>
{/if}
