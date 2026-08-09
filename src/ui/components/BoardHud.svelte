<script>
  let { state: view, command } = $props();
</script>

<div class="mobile-game-header" id="mobile-game-header">
  <button
    class="mobile-game-menu"
    id="mobile-game-menu-button"
    type="button"
    aria-label={view.copy.menuLabel}
    onclick={() => command('openSettings')}
  >
    <span aria-hidden="true">⚙</span>
    <span>{view.copy.menuLabel}</span>
  </button>
  <div class="mobile-game-location">
    <small id="mobile-game-level">LEVEL {view.location.level}</small>
    <strong id="mobile-game-location">{view.location.name}</strong>
  </div>
</div>

<div class="map-overview-stats" id="map-overview-stats" aria-label={view.copy.mapAggregateLabel}>
  <div>
    <strong id="map-completed-levels">{view.mapProgress.completedLevels} VON {view.mapProgress.totalLevels}</strong>
    <span>{view.copy.mapAggregateLevels}</span>
  </div>
  <div>
    <strong id="map-total-treats">{view.mapProgress.treatsFound} VON {view.mapProgress.treatsTotal}</strong>
    <span>{view.copy.mapAggregateTreats}</span>
  </div>
</div>

<div class="level-status" id="level-status" aria-label={view.copy.levelStatusLabel}>
  <div>
    <span>{view.copy.levelScoreLabel}</span>
    <strong id="level-status-score">{view.levelStatus.score}</strong>
  </div>
  <div>
    <span>{view.copy.mapStatsTreats}</span>
    <strong id="level-status-treats">{view.levelStatus.collected} / {view.levelStatus.total}</strong>
  </div>
  <div>
    <span>{view.copy.levelRemainingLabel}</span>
    <strong id="level-status-remaining">{view.levelStatus.remaining}</strong>
  </div>
  <div>
    <span>{view.copy.livesLabel}</span>
    <strong id="level-status-lives">{view.levelStatus.lives}</strong>
  </div>
</div>
