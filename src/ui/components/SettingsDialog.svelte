<script>
  import { tick } from 'svelte';
  import './SettingsDialog.css';

  let { state: view, command } = $props();
  let closeButton = $state();

  $effect(() => {
    if (view.open) tick().then(() => closeButton?.focus());
  });

  function closeOnBackdrop(event) {
    if (event.target === event.currentTarget) command('closeSettings');
  }
</script>

{#if view.open}
  <div
    class="settings-dialog"
    role="presentation"
    onclick={closeOnBackdrop}
  >
    <div
      class="settings-panel"
      data-context={view.context}
      role="dialog"
      aria-modal="true"
      aria-labelledby="svelte-settings-title"
    >
      <header class="settings-header">
        <div>
          <p class="section-label">{view.copy.kicker}</p>
          <h2 id="svelte-settings-title">{view.copy.title}</h2>
        </div>
        <button
          bind:this={closeButton}
          class="settings-close-button"
          id="settings-close-button"
          type="button"
          aria-label={view.copy.closeLabel}
          onclick={() => command('closeSettings')}
        >×</button>
      </header>

      <div class="settings-context-strip" aria-live="polite">
        <span>{view.copy.contextLabel}</span>
        <small>{view.copy.contextCopy}</small>
      </div>

      <div class="settings-grid">
        {#if view.context === 'map'}
          <section class="difficulty-card">
            <p class="section-label">{view.copy.difficultyLabel}</p>
            <div class="difficulty-switch" role="group" aria-label={view.copy.difficultyLabel}>
              {#each view.copy.difficulties ?? [] as option}
                <button
                  type="button"
                  class:active={view.difficulty === option.id}
                  aria-pressed={view.difficulty === option.id}
                  data-difficulty={option.id}
                  onclick={() => command('setDifficulty', option.id)}
                >{option.label}</button>
              {/each}
            </div>
            <p class="difficulty-hint">{view.copy.difficultyHint}</p>
          </section>
        {/if}

        <section class="language-card">
          <p class="section-label">{view.copy.languageLabel}</p>
          <div class="language-switch" role="group" aria-label={view.copy.languageLabel}>
            {#each view.copy.languages ?? [] as option}
              <button
                type="button"
                class:active={view.language === option.id}
                aria-pressed={view.language === option.id}
                data-language={option.id}
                onclick={() => command('setLanguage', option.id)}
              >{option.label}</button>
            {/each}
          </div>
          <p class="language-joke">{view.copy.languageJoke}</p>
        </section>

        <section class="settings-control-card">
          <p class="section-label">{view.copy.controlsLabel}</p>
          <div class="control-demo compact" aria-hidden="true">
            <span class="control-demo-route"></span>
            <span class="control-demo-dog">◆</span>
            <span class="control-demo-touch"></span>
            <span class="control-demo-arrow">→</span>
          </div>
          <p class="settings-control-copy">{view.copy.controlHint}</p>
        </section>

        <section class="settings-comfort-card">
          <p class="section-label">{view.copy.comfortLabel}</p>
          <div class="settings-system-actions">
            <button
              id="settings-sound-button"
              type="button"
              aria-pressed={view.soundEnabled}
              onclick={() => command('toggleSound')}
            >{view.copy.soundLabel}</button>
            <button
              id="settings-reduced-motion-button"
              type="button"
              aria-pressed={view.reducedMotion}
              onclick={() => command('toggleReducedMotion')}
            >{view.copy.reducedMotionLabel}</button>
          </div>
          <p class="settings-control-copy">{view.copy.reducedMotionCopy}</p>
        </section>

        {#if view.context === 'game'}
          <section class="settings-round-card">
            <p class="section-label">{view.copy.roundLabel}</p>
            <div class="settings-system-actions">
              <button
                id="settings-pause-button"
                type="button"
                disabled={!view.canPause}
                aria-pressed={view.paused}
                onclick={() => command('togglePause')}
              >{view.copy.pauseLabel}</button>
              <button id="settings-map-button" type="button" onclick={() => command('openMap')}>
                ⌖ &nbsp; {view.copy.mapLabel}
              </button>
            </div>
          </section>
        {:else}
          <section class="settings-data-card">
            <p class="section-label">{view.copy.dataLabel}</p>
            <div class="settings-system-actions">
              <button class="new-game-button" id="new-game-button" type="button" onclick={() => command('newGame')}>
                {view.copy.newGameLabel}
              </button>
              <button class="delete-browser-data-button" id="delete-browser-data-button" type="button" onclick={() => command('deleteData')}>
                {view.copy.deleteDataLabel}
              </button>
            </div>
          </section>
        {/if}
      </div>
    </div>
  </div>
{/if}
