export function resolveReducedMotionPreference(savedPreference, systemPreference = false) {
  return typeof savedPreference === 'boolean' ? savedPreference : Boolean(systemPreference);
}

export function settingsContextForState(state, returnState = null) {
  const effectiveState = state === 'menu' ? returnState : state;
  return effectiveState === 'map' ? 'map' : 'game';
}

export function settingsScopeIsVisible(scope, context) {
  return scope === 'all' || scope === context;
}
