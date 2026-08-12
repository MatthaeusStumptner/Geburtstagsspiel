<script module>
  let nextObjectThumbnailSurface = 1;
</script>

<script>
  import { animationById, animationKeyframes, drawDecorationPreview, stateAnimationId } from '@franz-lola/pixel-renderer';
  import { useRenderSurface } from '../render/use-render-surface.svelte.js';

  let { asset, language = 'standard', label = asset?.name ?? 'Objektvorschau' } = $props();
  const surfaceId = `object-thumbnail-surface-${nextObjectThumbnailSurface++}`;
  let canvas;
  let presentationCount = $state(0);
  let presentedProfile = $state('thumbnail-static');

  function isAnimated() {
    if (asset?.animation?.type && asset.animation.type !== 'none' || asset?.effects?.length) return true;
    const appearance = asset?.appearance;
    const animation = animationById(appearance, asset?.spriteAnimation)
      ?? animationById(appearance, stateAnimationId(appearance, 'idle'));
    return animationKeyframes(animation).length > 1;
  }

  function draw({ timestamp, measurement, renderCount, profile }) {
    if (!canvas || !asset || !measurement) return;
    const ratio = Math.min(2, measurement.devicePixelRatio);
    const width = Math.max(36, Math.round(measurement.width * ratio));
    const height = Math.max(36, Math.round(measurement.height * ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width / ratio, height / ratio);
    context.imageSmoothingEnabled = false;
    drawDecorationPreview(context, { ...asset, x: 0, y: 0 }, {
      left: 2,
      top: 2,
      width: width / ratio - 4,
      height: height / ratio - 4,
    }, timestamp / 1000, language);
    presentationCount = renderCount + 1;
    presentedProfile = profile;
  }

  const surface = useRenderSurface({
    id: surfaceId,
    profile: 'thumbnail-static',
    render: draw,
  });
  const renderSurface = surface.action;

  $effect(() => {
    asset; language;
    const animated = isAnimated();
    surface.setProfile(animated ? 'thumbnail-animated' : 'thumbnail-static');
    surface.setActive(animated);
    surface.invalidate('thumbnail:reactive');
  });
</script>

<canvas
  class="object-thumbnail"
  bind:this={canvas}
  use:renderSurface
  aria-label={label}
  data-render-count={presentationCount}
  data-render-profile={presentedProfile}
  data-surface-id={surfaceId}
></canvas>
