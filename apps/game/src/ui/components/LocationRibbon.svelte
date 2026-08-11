<script>
  let { state: view } = $props();
</script>

<div class="location-ribbon" aria-hidden="true">
  <span id="location-river">{view.location.river}</span>
  <span id="location-coordinates">{view.location.coordinates}</span>
  <span id="location-name">{view.location.name}</span>
</div>
