<script>
  let { state: view, command } = $props();
  let progress = $derived(view.treatTotal > 0 ? view.collected / view.treatTotal : 0);
</script>

<aside class="side-panel">
  <section class="mission-card">
    <p class="section-label" id="mission-label">{view.location.missionLabel}</p>
    <h2 id="mission-title">{view.location.mission}</h2>
    <div class="route-line" aria-hidden="true">
      <span class="route-dot active"></span>
      <i></i>
      <span class:active={progress >= 0.5} class="route-dot"></span>
      <i></i>
      <span class:active={progress >= 1} class="route-dot"></span>
    </div>
    <div class="route-names">
      <span>{view.copy.routeOne}</span><span>{view.copy.routeTwo}</span><span>{view.copy.routeThree}</span>
    </div>
    <div class="treat-meter">
      <span>{view.copy.treatProgressLabel}</span>
      <strong id="treat-progress">{view.collected} / {view.treatTotal}</strong>
    </div>
    <div class:complete={view.globalProgress === 100} class="global-progress-panel">
      <div>
        <span>{view.copy.globalProgressLabel}</span>
        <strong id="global-progress-copy">{view.globalProgress}%</strong>
      </div>
      <span class="global-progress-track" aria-hidden="true"><i id="global-progress-bar" style={`width: ${view.globalProgress}%`}></i></span>
    </div>
    <div class="secret-meter">
      <span>{view.copy.secretsLabel}</span>
      <strong id="eggs">{view.eggs} / {view.eggTotal}</strong>
    </div>
    <p class:saved={view.savePulse} class="save-note"><i aria-hidden="true"></i><span id="save-status">{view.saveStatus}</span></p>
  </section>

  <section class="legend-card">
    <p class="section-label">{view.copy.guideLabel}</p>
    <ul>
      <li><span class="legend-icon treat" aria-hidden="true"></span><div><strong>{view.copy.treatTitle}</strong><small>{view.copy.treatCopy}</small></div></li>
      <li><span class="legend-icon paw" aria-hidden="true">✦</span><div><strong>{view.copy.powerTitle}</strong><small>{view.copy.powerCopy}</small></div></li>
      <li><span class="legend-icon cat" aria-hidden="true">▲</span><div><strong>{view.copy.catTitle}</strong><small>{view.copy.catCopy}</small></div></li>
    </ul>
  </section>

  <section class="controls-card">
    <p class="section-label">{view.copy.controlsLabel}</p>
    <div class="key-row"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>{view.copy.orLabel}</span><kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd></div>
    <div class="utility-buttons">
      <button id="pause-button" type="button" aria-pressed={view.paused} onclick={() => command('togglePauseFromHud')}>{view.copy.pauseLabel}</button>
      <button id="sound-button" type="button" aria-pressed={view.soundEnabled} onclick={() => command('toggleSound')}>{view.copy.soundLabel}</button>
      <button id="map-button" class="map-button" type="button" onclick={() => command('openMap')}>⌖ &nbsp; {view.copy.mapButton}</button>
    </div>
  </section>

  <p class="flavour-copy"><span>{view.copy.flavourQuote}</span><br /><small>{view.copy.flavourByline}</small></p>
</aside>
