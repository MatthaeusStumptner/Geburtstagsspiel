export const RENDER_PROFILES = Object.freeze({
  game: Object.freeze({ mode: 'continuous', maxFps: null }),
  playtest: Object.freeze({ mode: 'continuous', maxFps: 60 }),
  editor: Object.freeze({ mode: 'on-demand', maxFps: 60 }),
  'thumbnail-animated': Object.freeze({ mode: 'animated', maxFps: 30 }),
  'thumbnail-static': Object.freeze({ mode: 'on-demand', maxFps: 1 }),
  test: Object.freeze({ mode: 'manual', maxFps: 60 }),
});
