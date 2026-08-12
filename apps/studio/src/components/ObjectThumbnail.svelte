<script module>
  let nextObjectThumbnailSurface = 1;
</script>

<script>
  import { drawDecorationPreview } from '@franz-lola/pixel-renderer';
  import { getObjectThumbnailAnimationActivity, thumbnailRenderRevision } from '../render/studio-render-session.svelte.js';
  import { useRenderSurface } from '../render/use-render-surface.svelte.js';

  let { asset, language = 'standard', label = asset?.name ?? 'Objektvorschau' } = $props();
  const surfaceId = `object-thumbnail-surface-${nextObjectThumbnailSurface++}`;
  let canvas;
  let renderedAsset = null;
  let presentationCount = $state(0);
  let presentedProfile = $state('thumbnail-static');

  function draw({ animationElapsed, animationSettled, measurement, renderCount, profile }) {
    if (!canvas || !renderedAsset || !measurement) return;
    const ratio = Math.min(2, measurement.devicePixelRatio);
    const width = Math.max(36, Math.round(measurement.width * ratio));
    const height = Math.max(36, Math.round(measurement.height * ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width / ratio, height / ratio);
    context.imageSmoothingEnabled = false;
    drawDecorationPreview(context, { ...renderedAsset, x: 0, y: 0 }, {
      left: 2,
      top: 2,
      width: width / ratio - 4,
      height: height / ratio - 4,
    }, animationElapsed, language);
    presentationCount += 1;
    presentedProfile = animationSettled ? 'thumbnail-static' : profile;
    if (animationSettled) surface.setProfile('thumbnail-static');
  }

  const surface = useRenderSurface({
    id: surfaceId,
    profile: 'thumbnail-static',
    render: draw,
  });
  const renderSurface = surface.action;

  $effect(() => {
    const revision = thumbnailRenderRevision({ asset, language });
    renderedAsset = JSON.parse(revision).asset;
    const activity = getObjectThumbnailAnimationActivity(asset);
    const animated = activity.continuous || activity.duration > 0;
    surface.setProfile(animated ? 'thumbnail-animated' : 'thumbnail-static');
    surface.setAnimationActivity({ ...activity, restartKey: revision });
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
