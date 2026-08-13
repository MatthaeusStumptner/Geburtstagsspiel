const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

function ease(value, easing) {
  const ratio = clamp(value, 0, 1);
  if (easing === 'step') return ratio < 1 ? 0 : 1;
  if (easing === 'ease-in-out') return ratio * ratio * (3 - 2 * ratio);
  return ratio;
}

export function sampleMotionAnimation(animation, elapsed = 0) {
  const identity = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
  if (!animation || animation.type === 'none') return identity;
  if (animation.type !== 'keyframes' || !animation.keyframes?.length) {
    const phase = Math.max(0, Number(elapsed) || 0) * Math.PI * 2 * (Number(animation.speed) || 1);
    const amplitude = Number(animation.amplitude) || 0;
    if (animation.type === 'bob') return { ...identity, y: Math.sin(phase) * amplitude };
    if (animation.type === 'pulse') return { ...identity, scale: 1 + Math.sin(phase) * amplitude };
    if (animation.type === 'spin') return { ...identity, rotation: phase * amplitude * 180 / Math.PI };
    if (animation.type === 'blink') return { ...identity, opacity: Math.sin(phase) > 0 ? 1 : Math.max(0.08, 1 - amplitude) };
    return identity;
  }
  const duration = Math.max(0.1, Number(animation.duration) || animation.keyframes.at(-1).time || 1);
  const rawTime = Math.max(0, Number(elapsed) || 0);
  const time = animation.loop === false ? Math.min(duration, rawTime) : rawTime % duration;
  const previous = [...animation.keyframes].reverse().find((frame) => frame.time <= time) ?? animation.keyframes[0];
  const next = animation.keyframes.find((frame) => frame.time > time) ?? previous;
  const span = next.time - previous.time;
  const ratio = span > 0 ? ease((time - previous.time) / span, next.easing) : 0;
  const interpolate = (key, fallback) => {
    const from = Number.isFinite(Number(previous[key])) ? Number(previous[key]) : fallback;
    const to = Number.isFinite(Number(next[key])) ? Number(next[key]) : fallback;
    return from + (to - from) * ratio;
  };
  return {
    x: interpolate('x', 0),
    y: interpolate('y', 0),
    scale: interpolate('scale', 1),
    rotation: interpolate('rotation', 0),
    opacity: interpolate('opacity', 1),
  };
}

export function applyMotionAnimation(context, animation, elapsed, centerX, centerY, tileSize = 1) {
  const sample = sampleMotionAnimation(animation, elapsed);
  context.translate(centerX, centerY);
  context.translate(sample.x * tileSize, sample.y * tileSize);
  context.rotate(sample.rotation * Math.PI / 180);
  context.scale(sample.scale, sample.scale);
  context.globalAlpha *= sample.opacity;
  context.translate(-centerX, -centerY);
  return sample;
}
