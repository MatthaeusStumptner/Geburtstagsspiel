<script>
  import { tick } from 'svelte';
  import './GameOverlay.css';
  import './MapEndgameEvent.css';

  let { event, command } = $props();
  let primaryButton = $state();

  $effect(() => {
    if (event.phase === 'reveal') tick().then(() => primaryButton?.focus());
  });
</script>

<div
  class:booting={event.phase === 'boot'}
  class:revealed={event.phase === 'reveal'}
  class="map-endgame-event"
  role="dialog"
  aria-modal="true"
  aria-labelledby="map-event-title"
>
  <div class="map-event-scanlines" aria-hidden="true"></div>

  {#if event.phase === 'boot'}
    <div class="map-event-terminal">
      <div class="map-event-terminal-bar" aria-hidden="true"><i></i><i></i><i></i><span>{event.terminalLabel ?? 'F-60 // PASSAU'}</span></div>
      <p class="overlay-kicker">{event.kicker}</p>
      <h2 id="map-event-title">{event.title}</h2>
      <div class="map-event-log" aria-live="polite">
        {#each event.lines as line, index}
          <p class:current={index === event.lines.length - 1}><span>[0{index + 1}]</span> {line}</p>
        {/each}
      </div>
      <div class="map-event-loader" aria-label={`${event.progress}%`}>
        <i style={`width: ${event.progress}%`}></i>
      </div>
      <small>{event.progress}% // {event.wait}</small>
    </div>
  {:else}
    <div class="overlay-card endgame-card" data-page={event.page}>
      <div class="endgame-spark-field" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
      <p class="overlay-kicker">{event.kicker}</p>
      <h2 id="map-event-title">{event.title}</h2>

      {#if event.page === 0}
        <div class="endgame-passau" aria-hidden="true">
          <strong>100%</strong><span>PASSAU</span>
          <div class="endgame-route"><i></i><b>◆</b><i></i><b>♪</b></div>
        </div>
      {:else if event.page === 1}
        <div class="endgame-certificate" aria-hidden="true">
          <small>SONDERAKTE F-60</small><strong>GENEHMIGT</strong><span>9 / 9 ORTE · 60 JAHRE</span>
        </div>
      {:else}
        <div class="concert-ticket" aria-hidden="true">
          <span class="concert-ticket-stub">F-60</span>
          <div><small>EXKLUSIVE FREIGABE</small><strong>KONZERT<br />NACH WAHL</strong><i>♪</i></div>
        </div>
      {/if}

      <p>{event.copy}</p>
      <div class="endgame-progress" aria-label={`${event.page + 1} / ${event.pages}`}>
        {#each Array(event.pages) as _, index}<span class:active={index === event.page}></span>{/each}
      </div>
      <button bind:this={primaryButton} class="primary-button" type="button" onclick={() => command('advanceMapEndgame')}>{event.button}</button>
    </div>
  {/if}
</div>
