<script>
  import { onMount, tick } from 'svelte';
  import MapEndgameEvent from './MapEndgameEvent.svelte';

  let { state: view, command } = $props();
  let mapCanvas = $state();
  let mapSvg = $state();
  let markerLayer = $state();
  let closeButton = $state();
  let compactMap = $state(false);

  function positionMarkers() {
    if (!mapCanvas || !mapSvg || !markerLayer) return;
    const matrix = mapSvg.getScreenCTM();
    const canvasRect = mapCanvas.getBoundingClientRect();
    if (!matrix || canvasRect.width === 0 || canvasRect.height === 0) return;
    markerLayer.querySelectorAll('[data-level-id]').forEach((marker) => {
      const point = mapSvg.createSVGPoint();
      point.x = Number(marker.dataset.mapX);
      point.y = Number(marker.dataset.mapY);
      const screenPoint = point.matrixTransform(matrix);
      marker.style.left = `${screenPoint.x - canvasRect.left}px`;
      marker.style.top = `${screenPoint.y - canvasRect.top}px`;
    });
  }

  $effect(() => {
    const signature = `${view.open}:${view.selectionOpen}:${view.markers.map((marker) => `${marker.id}:${marker.completed}:${marker.name}`).join('|')}`;
    if (signature) tick().then(positionMarkers);
  });

  $effect(() => {
    if (view.selectionOpen) tick().then(() => closeButton?.focus());
  });

  onMount(() => {
    const compactQuery = window.matchMedia('(max-width: 680px)');
    const syncCompactMap = () => {
      compactMap = compactQuery.matches;
      tick().then(positionMarkers);
    };
    const observer = new ResizeObserver(positionMarkers);
    if (mapCanvas) observer.observe(mapCanvas);
    window.addEventListener('resize', positionMarkers);
    compactQuery.addEventListener('change', syncCompactMap);
    syncCompactMap();
    positionMarkers();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', positionMarkers);
      compactQuery.removeEventListener('change', syncCompactMap);
    };
  });

  function closeFromCanvas(event) {
    if (event.target instanceof Element && !event.target.closest('.map-marker-wrap') && view.selectionOpen) {
      command('closeMapSelection', false);
    }
  }
</script>

{#if view.open && view.geometry}
  <section class:map-details-open={view.selectionOpen} class:map-motion-active={view.open && !view.selectionOpen && !view.endgameEvent} class:map-motion-paused={!view.open || view.selectionOpen || !!view.endgameEvent} class="passau-map-screen" id="map-screen" aria-labelledby="map-title">
    <div class="map-heading">
      <div>
        <p class="section-label">{view.copy.kicker}</p>
        <h2 id="map-title">{view.copy.title}</h2>
      </div>
      <div class="map-heading-actions">
        <p class="map-copy">{view.copy.copy}</p>
        <button class="map-settings-button" id="settings-open-button" type="button" aria-label={view.copy.settingsLabel} onclick={() => command('openSettings')}>
          <span aria-hidden="true">⚙</span>
          <small>{view.copy.settingsLabel}</small>
        </button>
      </div>
    </div>

    <div bind:this={mapCanvas} class="map-canvas" id="map-canvas" role="presentation" onclick={closeFromCanvas}>
      <svg bind:this={mapSvg} class:compact-map={compactMap} id="passau-map" viewBox={compactMap ? '80 -120 540 960' : view.geometry.viewBox} aria-label={view.copy.mapA11yLabel}>
        <ellipse class="district" cx="350" cy="235" rx="225" ry="155"></ellipse>
        <ellipse class="district" cx="350" cy="480" rx="260" ry="140"></ellipse>
        <path class="road" d={view.geometry.routeNorth}></path>
        <path class="road" d={view.geometry.routeSouth}></path>
        <path class="river river-bank" d={view.geometry.danube}></path><path class="river danube" d={view.geometry.danube}></path>
        <path class="river river-bank" d={view.geometry.inn}></path><path class="river inn" d={view.geometry.inn}></path>
        <path class="river river-bank" d={view.geometry.ilz}></path><path class="river ilz" d={view.geometry.ilz}></path>
        <g class="map-glints" aria-hidden="true">
          <path class="map-glint map-glint-river map-glint-delay-1" d="M 118 420 l 18 4"></path>
          <path class="map-glint map-glint-river map-glint-delay-2" d="M 330 402 l 20 -2"></path>
          <path class="map-glint map-glint-river map-glint-delay-3" d="M 534 418 l 18 5"></path>
          <path class="map-glint map-glint-river map-glint-delay-3" d="M 136 652 l 18 -11"></path>
          <path class="map-glint map-glint-river map-glint-delay-1" d="M 312 584 l 16 -12"></path>
          <path class="map-glint map-glint-river map-glint-delay-2" d="M 476 492 l 18 -10"></path>
          <path class="map-glint map-glint-river map-glint-delay-2" d="M 294 104 l 8 18"></path>
          <path class="map-glint map-glint-river map-glint-delay-3" d="M 320 250 l 14 12"></path>
          <path class="map-glint map-glint-river map-glint-delay-1" d="M 408 348 l 16 11"></path>
          <path class="map-glint map-glint-road map-glint-delay-1" d="M 266 150 l 16 12"></path>
          <path class="map-glint map-glint-road map-glint-delay-3" d="M 426 520 l 16 12"></path>
        </g>
        <text class="river-label" x="120" y="432">DONAU</text>
        <text class="river-label" x="176" y="617">INN</text>
        <text class="river-label" x="290" y="88">ILZ</text>
        <g class:compact-hidden={compactMap} class="map-scale-svg" aria-hidden="true">
          <path d={`M ${view.geometry.scale.startX} ${view.geometry.scale.y} v -7 M ${view.geometry.scale.startX} ${view.geometry.scale.y} H ${view.geometry.scale.endX} M ${view.geometry.scale.endX} ${view.geometry.scale.y} v -7`}></path>
          <text x={view.geometry.scale.centerX} y={view.geometry.scale.y - 12}>1 KM</text>
        </g>
      </svg>

      <div bind:this={markerLayer} class="map-markers">
        {#each view.markers as marker, index (marker.id)}
          <div
            class="map-marker-wrap"
            data-level-id={marker.id}
            data-map-x={marker.x}
            data-map-y={marker.y}
            style={`--marker-delay: ${index * -0.32}s; --label-lift: ${marker.labelLift}px`}
          >
            <span class="map-marker-label" aria-hidden="true">{marker.name}</span>
            <button
              class:home={marker.home}
              class:park={marker.markerClass === 'park'}
              class:industrial={marker.markerClass === 'industrial'}
              class:music={marker.markerClass === 'music'}
              class:completed={marker.completed}
              class:selected={view.selectionOpen && view.selectedId === marker.id}
              class="map-marker"
              type="button"
              aria-label={marker.name}
              onclick={() => command('selectMapLocation', marker.id)}
            ><span aria-hidden="true">{marker.icon}</span></button>
          </div>
        {/each}
      </div>
    </div>

    {#if view.endgameEvent}
      <MapEndgameEvent event={view.endgameEvent} {command} />
    {/if}

    {#if view.concertUnlocked}
      <div class="concert-unlocked-badge" role="status">
        <span aria-hidden="true">♪</span>
        <strong>{view.copy.concertUnlocked}</strong>
      </div>
    {/if}

    {#if view.selectionOpen && view.selection}
      <div class="map-selection open" id="map-selection" role="dialog" aria-modal="false" aria-labelledby="map-selection-title">
        <button bind:this={closeButton} class="map-selection-close" id="map-selection-close" type="button" aria-label={view.copy.closeLabel} onclick={() => command('closeMapSelection', true)}>×</button>
        <div class="map-selection-heading">
          <p class="section-label" id="map-selection-kicker">{view.selection.kicker}</p>
          <h3 id="map-selection-title">{view.selection.name}</h3>
          <p>{view.selection.description}</p>
        </div>
        {#if view.selection.soundscape}
          <p class="map-soundscape-preview"><span aria-hidden="true">♪</span> {view.copy.soundscapeLabel}: <strong>{view.selection.soundscape}</strong></p>
        {/if}
        <dl class="map-level-stats" aria-label={view.copy.statsLabel}>
          <div><dt>{view.copy.treatsLabel}</dt><dd>{view.selection.bestTreats} / {view.selection.treatsTotal}</dd></div>
          <div><dt>{view.copy.attemptsLabel}</dt><dd>{view.selection.attempts}</dd></div>
          <div><dt>{view.copy.scoreLabel}</dt><dd>{view.selection.bestScore}</dd></div>
          <div><dt>{view.copy.statusLabel}</dt><dd>{view.selection.status}</dd></div>
        </dl>
        <button class="primary-button" id="map-start-button" type="button" onclick={() => command('startMapSelection')}>{view.selection.startLabel}</button>
      </div>
    {/if}
  </section>
{/if}
