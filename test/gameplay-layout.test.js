import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGameplayLayout,
  highestVisibleBlockerBottom,
} from '../src/render/gameplay-layout.js';

test('uses the highest visible HUD blocker bottom', () => {
  const bottom = highestVisibleBlockerBottom([
    { bottom: 124, visible: true },
    { bottom: 238.5, visible: true },
  ], 20);

  assert.equal(bottom, 238.5);
});

test('ignores missing and hidden HUD blockers', () => {
  const bottom = highestVisibleBlockerBottom([
    null,
    { bottom: 260, visible: false },
    { bottom: Number.NaN, visible: true },
    { bottom: 96, visible: true },
  ], 100);

  assert.equal(bottom, 100);
});

test('excludes the mobile DOM HUD from the renderer backbuffer', () => {
  const layout = createGameplayLayout();
  const snapshot = layout.update({
    canvasWidth: 412,
    canvasHeight: 915,
    hudBottom: 203.2,
    canvasTop: 0,
    devicePixelRatio: 2.625,
    safeTop: 0,
    safeBottom: 0,
    mobile: true,
  });

  assert.deepEqual(snapshot.viewport, { x: 0, y: 0, width: 412, height: 711.8 });
  assert.equal(snapshot.cssHeight, 711.8);
  assert.equal(snapshot.devicePixelRatio, 2.625);
});

test('keeps the desktop backbuffer clear of mobile HUD deductions', () => {
  const layout = createGameplayLayout();
  const snapshot = layout.update({
    canvasWidth: 800,
    canvasHeight: 600,
    hudBottom: 120,
    canvasTop: 0,
    devicePixelRatio: 2,
    safeTop: 20,
    safeBottom: 24,
    mobile: false,
  });

  assert.deepEqual(snapshot.viewport, { x: 0, y: 0, width: 800, height: 600 });
});

test('normalizes invalid geometry to at least one rounded CSS pixel', () => {
  const layout = createGameplayLayout();
  const snapshot = layout.update({
    canvasWidth: 0.0004,
    canvasHeight: -1,
    hudBottom: 100,
    canvasTop: 50,
    devicePixelRatio: 0,
    safeTop: 0,
    safeBottom: 100,
    mobile: true,
  });

  assert.deepEqual(snapshot, {
    cssWidth: 1,
    cssHeight: 1,
    viewport: { x: 0, y: 0, width: 1, height: 1 },
    devicePixelRatio: 1,
    revision: 1,
  });
});

test('does not advance layout revision for identical observer input', () => {
  const layout = createGameplayLayout();
  const input = {
    canvasWidth: 390,
    canvasHeight: 844,
    hudBottom: 180,
    canvasTop: 0,
    devicePixelRatio: 3,
    safeTop: 0,
    safeBottom: 0,
    mobile: true,
  };

  const first = layout.update(input);
  const second = layout.update(input);

  assert.equal(second.revision, first.revision);
  assert.equal(layout.snapshot().revision, first.revision);
});

test('advances layout revision only when normalized geometry or DPR changes', () => {
  const layout = createGameplayLayout();
  const input = {
    canvasWidth: 390.0004,
    canvasHeight: 844,
    hudBottom: 180,
    canvasTop: 0,
    devicePixelRatio: 3,
    safeTop: 0,
    safeBottom: 0,
    mobile: true,
  };

  const first = layout.update(input);
  const normalizedEqual = layout.update({ ...input, canvasWidth: 390.00049 });
  const dprChange = layout.update({ ...input, devicePixelRatio: 2 });

  assert.equal(normalizedEqual.revision, first.revision);
  assert.equal(dprChange.revision, first.revision + 1);
});
