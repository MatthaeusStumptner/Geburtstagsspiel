<script>
  import './SceneTransition.css';

  let { state: view } = $props();
</script>

{#if view.active}
  <div
    class:covering={view.phase === 'covering'}
    class:revealing={view.phase === 'revealing'}
    class="scene-transition"
    role="status"
    aria-live="polite"
  >
    <div class="scene-transition-grid" aria-hidden="true"></div>
    <div class="scene-transition-status">
      <span class="scene-transition-pip" aria-hidden="true"></span>
      <small>{view.label}</small>
      <strong>{view.place}</strong>
      <i aria-hidden="true"></i>
    </div>
  </div>
{/if}
