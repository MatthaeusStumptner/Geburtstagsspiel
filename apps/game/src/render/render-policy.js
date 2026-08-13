const CONTINUOUS = new Set(['playing', 'hit', 'cutscene']);
const ONCE = new Set(['ready', 'paused', 'won', 'over', 'menu']);
const POLICIES = Object.freeze({
  continuous: Object.freeze({ mode: 'continuous', maxFps: null }),
  hidden: Object.freeze({ mode: 'hidden' }),
  once: Object.freeze({ mode: 'once' }),
});

export function renderPolicyForState(state, settingsReturnState = null, onboardingOpen = false) {
  if (onboardingOpen || state === 'map') return POLICIES.hidden;
  if (CONTINUOUS.has(state)) return POLICIES.continuous;
  if (state === 'menu' && settingsReturnState === 'map') return POLICIES.hidden;
  if (ONCE.has(state)) return POLICIES.once;
  return POLICIES.once;
}
