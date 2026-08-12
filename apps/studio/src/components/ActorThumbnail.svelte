<script module>
  let nextActorThumbnailSurface = 1;
</script>

<script>
  import { drawActorPreview } from '@franz-lola/pixel-renderer';
  import { getActorThumbnailAnimationActivity, thumbnailRenderRevision } from '../render/studio-render-session.svelte.js';
  import { useRenderSurface } from '../render/use-render-surface.svelte.js';

  let {
    actor = null,
    appearance = null,
    kind = 'player',
    state = 'idle',
    animationId = '',
    elapsed = null,
    label = kind === 'cat' ? 'Katzenvorschau' : 'Vorschau von Franz und Lola',
    class: className = '',
  } = $props();
  const surfaceId = `actor-thumbnail-surface-${nextActorThumbnailSurface++}`;
  let canvas;
  let renderedActor = null;
  let presentationCount = 0;

  function draw({ animationElapsed, animationSettled, measurement, renderCount, profile }) {
    if (!canvas || !measurement) return;
    const ratio = Math.min(2, measurement.devicePixelRatio);
    const width = Math.max(34, Math.round(measurement.width * ratio));
    const height = Math.max(34, Math.round(measurement.height * ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width / ratio, height / ratio);
    context.imageSmoothingEnabled = false;
    drawActorPreview(context, renderedActor ?? { ...(actor ?? {}), appearance: appearance ?? actor?.appearance }, {
      left: 2,
      top: 2,
      width: width / ratio - 4,
      height: height / ratio - 4,
    }, {
      kind,
      state,
      animationId,
      elapsed: elapsed ?? animationElapsed,
    });
    presentationCount += 1;
    canvas.dataset.renderCount = String(presentationCount);
    canvas.dataset.renderProfile = animationSettled ? 'thumbnail-static' : profile;
    canvas.dataset.animationSettled = String(animationSettled);
    if (animationSettled) surface.setProfile('thumbnail-static');
  }

  const surface = useRenderSurface({
    id: surfaceId,
    profile: 'thumbnail-static',
    render: draw,
  });
  const renderSurface = surface.action;

  $effect(() => {
    const revision = thumbnailRenderRevision({ actor, appearance: appearance ?? actor?.appearance, kind, state, animationId, elapsed });
    const renderData = JSON.parse(revision);
    renderedActor = { ...(renderData.actor ?? {}), appearance: renderData.appearance };
    const activity = getActorThumbnailAnimationActivity({ actor, appearance, state, animationId, elapsed });
    const animated = activity.continuous || activity.duration > 0;
    surface.setProfile(animated ? 'thumbnail-animated' : 'thumbnail-static');
    surface.setAnimationActivity({ ...activity, restartKey: revision });
    surface.invalidate('thumbnail:reactive');
  });
</script>

<canvas
  class={`actor-thumbnail ${className}`}
  bind:this={canvas}
  use:renderSurface
  aria-label={label}
  data-actor-kind={kind}
  data-actor-state={state}
  data-render-count="0"
  data-render-profile="thumbnail-static"
  data-surface-id={surfaceId}
></canvas>
