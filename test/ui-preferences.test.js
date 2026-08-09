import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveReducedMotionPreference,
  settingsContextForState,
  settingsScopeIsVisible,
} from '../src/ui/ui-preferences.js';

test('reduced motion follows the saved override before the operating system preference', () => {
  assert.equal(resolveReducedMotionPreference(true, false), true);
  assert.equal(resolveReducedMotionPreference(false, true), false);
  assert.equal(resolveReducedMotionPreference(undefined, true), true);
  assert.equal(resolveReducedMotionPreference(undefined, false), false);
});

test('settings resolve the underlying game state while the menu is open', () => {
  assert.equal(settingsContextForState('map'), 'map');
  assert.equal(settingsContextForState('menu', 'map'), 'map');
  assert.equal(settingsContextForState('menu', 'playing'), 'game');
  assert.equal(settingsContextForState('paused'), 'game');
});

test('settings cards are visible only in their intended context', () => {
  assert.equal(settingsScopeIsVisible('all', 'map'), true);
  assert.equal(settingsScopeIsVisible('all', 'game'), true);
  assert.equal(settingsScopeIsVisible('map', 'map'), true);
  assert.equal(settingsScopeIsVisible('map', 'game'), false);
  assert.equal(settingsScopeIsVisible('game', 'game'), true);
  assert.equal(settingsScopeIsVisible('game', 'map'), false);
});
