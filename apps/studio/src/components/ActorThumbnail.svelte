<script module>
  let nextActorThumbnailSurface = 1;
</script>

<script>
  import { animationById, animationKeyframes, drawActorPreview, stateAnimationId } from '@franz-lola/pixel-renderer';
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

  function isAnimated() {
    if (elapsed !== null) return false;
    if (actor?.effects?.length) return true;
    const selectedAppearance = appearance ?? actor?.appearance;
    if (!selectedAppearance) return true;
    const animation = animationById(selectedAppearance, animationId || actor?.animation)
      ?? animationById(selectedAppearance, stateAnimationId(selectedAppearance, state));
    return animationKeyframes(animation).length > 1;
  }

  function draw({ timestamp, measurement, renderCount, profile }) {
    if (!canvas || !measurement) return;
    const ratio = Math.min(2, measurement.devicePixelRatio);
    const width = Math.max(34, Math.round(measurement.width * ratio));
    const height = Math.max(34, Math.round(measurement.height * ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width / ratio, height / ratio);
    context.imageSmoothingEnabled = false;
    drawActorPreview(context, { ...(actor ?? {}), appearance: appearance ?? actor?.appearance }, {
      left: 2,
      top: 2,
      width: width / ratio - 4,
      height: height / ratio - 4,
    }, {
      kind,
      state,
      animationId,
      elapsed: elapsed ?? timestamp / 1000,
    });
    canvas.dataset.renderCount = String(renderCount + 1);
    canvas.dataset.renderProfile = profile;
  }

  const surface = useRenderSurface({
    id: surfaceId,
    profile: 'thumbnail-static',
    render: draw,
  });
  const renderSurface = surface.action;

  $effect(() => {
    actor; appearance; kind; state; animationId; elapsed;
    const animated = isAnimated();
    surface.setProfile(animated ? 'thumbnail-animated' : 'thumbnail-static');
    surface.setActive(animated);
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
