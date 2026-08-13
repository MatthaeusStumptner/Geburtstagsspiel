<script>
  import { onMount } from 'svelte';
  import { drawActorPreview } from '@franz-lola/pixel-renderer';

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
  let canvas;
  let frame; let lastDraw = 0;
  let visible = true;

  function draw(timestamp = 0) {
    if (!canvas) return;
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(34, Math.round((bounds.width || 64) * ratio));
    const height = Math.max(34, Math.round((bounds.height || 64) * ratio));
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
  }

  function animate(timestamp) { if (visible && (!lastDraw || timestamp - lastDraw >= 100)) { draw(timestamp); lastDraw = timestamp; } frame = requestAnimationFrame(animate); }

  onMount(() => {
    if (elapsed === null) frame = requestAnimationFrame(animate); else draw(elapsed * 1000);
    const resize = new ResizeObserver(() => draw(elapsed === null ? performance.now() : elapsed * 1000));
    resize.observe(canvas);
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) draw(elapsed === null ? performance.now() : elapsed * 1000); }); intersection.observe(canvas);
    return () => { cancelAnimationFrame(frame); resize.disconnect(); intersection.disconnect(); };
  });

  $effect(() => {
    actor; appearance; kind; state; animationId; elapsed;
    if (canvas) draw(elapsed === null ? performance.now() : elapsed * 1000);
  });
</script>

<canvas
  class={`actor-thumbnail ${className}`}
  bind:this={canvas}
  aria-label={label}
  data-actor-kind={kind}
  data-actor-state={state}
></canvas>
