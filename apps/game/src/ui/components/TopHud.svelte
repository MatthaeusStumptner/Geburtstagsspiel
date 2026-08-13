<script>
  let { state: view } = $props();
</script>

<div class="hud" aria-label={view.copy.hudLabel ?? 'Spielstand'}>
  <div class="hud-card">
    <span>{view.copy.scoreLabel}</span>
    <strong id="score">{view.score}</strong>
  </div>
  <div class="hud-card">
    <span>{view.copy.bestLabel}</span>
    <strong id="best">{view.best}</strong>
  </div>
  <div class="hud-card compact">
    <span>{view.copy.roundLabel}</span>
    <strong id="level">{view.level}</strong>
  </div>
  <div class="hud-card compact">
    <span>{view.copy.livesLabel}</span>
    <strong id="lives" aria-hidden="true">
      {Array.from({ length: view.lives }, () => '●').join(' ')}
    </strong>
    <span class="visually-hidden" aria-live="polite">{view.lives} {view.copy.livesA11y ?? 'Leben'}</span>
  </div>
  <div class:complete={view.globalProgress === 100} class="hud-card compact progress-card">
    <span>{view.copy.globalProgressLabel}</span>
    <strong id="global-progress">{view.globalProgress}%</strong>
  </div>
</div>
