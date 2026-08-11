const CONTINUOUS = new Set(['playing', 'hit', 'cutscene']);
const ONCE = new Set(['ready', 'paused', 'won', 'over', 'menu']);

export function renderPolicyForState(state, settingsReturnState = null, onboardingOpen = false) {
  if (onboardingOpen || state === 'map') return 'hidden';
  if (CONTINUOUS.has(state)) return 'continuous';
  if (state === 'menu' && settingsReturnState === 'map') return 'hidden';
  if (ONCE.has(state)) return 'once';
  return 'once';
}
