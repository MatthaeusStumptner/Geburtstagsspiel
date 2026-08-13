const clone = (value) => JSON.parse(JSON.stringify(value));

export function prepareAppearanceForEditing(input) {
  const appearance = clone(input);
  appearance.animations = (appearance.animations ?? []).map((animation) => {
    const fps = Math.max(0.25, Number(animation.fps) || 6);
    const source = animation.keyframes?.length
      ? animation.keyframes
      : (animation.frames ?? []).map((frame, index) => ({ id: `keyframe-${index + 1}`, time: index / fps, easing: 'step', pixels: frame.pixels }));
    const keyframes = source.map((frame, index) => ({
      id: frame.id || `keyframe-${index + 1}`,
      time: Number.isFinite(Number(frame.time)) ? Number(frame.time) : index / fps,
      easing: frame.easing || 'step',
      pixels: [...frame.pixels],
    })).sort((left, right) => left.time - right.time);
    const minimumDuration = Math.max(1 / fps, (keyframes.at(-1)?.time ?? 0) + 1 / fps);
    return { ...animation, fps, duration: Math.max(minimumDuration, Number(animation.duration) || 0), keyframes };
  });
  return appearance;
}

export function keyframeAtTime(animation, time) {
  if (!animation?.keyframes?.length) return null;
  const duration = Math.max(0.1, Number(animation.duration) || 1);
  const playhead = animation.loop && time >= duration ? time % duration : Math.min(duration, Math.max(0, time));
  return [...animation.keyframes].reverse().find((frame) => frame.time <= playhead) ?? animation.keyframes[0];
}

export function insertSpriteKeyframe(animation, pixels, time) {
  const used = new Set(animation.keyframes.map((frame) => frame.id));
  let index = animation.keyframes.length + 1;
  while (used.has(`keyframe-${index}`)) index += 1;
  const frame = { id: `keyframe-${index}`, time: Math.max(0, Number(time) || 0), easing: 'step', pixels: [...pixels] };
  animation.keyframes.push(frame);
  animation.keyframes.sort((left, right) => left.time - right.time);
  return frame;
}

export function prepareMotionForEditing(input = {}) {
  const animation = clone(input);
  const source = animation.keyframes?.length ? animation.keyframes : [
    { id: 'motion-1', time: 0, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, easing: 'linear' },
    { id: 'motion-2', time: 1, x: 0, y: -0.25, scale: 1, rotation: 0, opacity: 1, easing: 'ease-in-out' },
    { id: 'motion-3', time: 2, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, easing: 'ease-in-out' },
  ];
  animation.type = 'keyframes';
  animation.duration = Math.max(Number(animation.duration) || 2, source.at(-1).time || 0.1);
  animation.loop = animation.loop !== false;
  animation.keyframes = source.map((frame, index) => ({
    id: frame.id || `motion-${index + 1}`, time: Number(frame.time) || 0,
    x: Number(frame.x) || 0, y: Number(frame.y) || 0, scale: Number(frame.scale) || 1,
    rotation: Number(frame.rotation) || 0, opacity: Number.isFinite(Number(frame.opacity)) ? Number(frame.opacity) : 1,
    easing: frame.easing || 'linear',
  })).sort((left, right) => left.time - right.time);
  return animation;
}
