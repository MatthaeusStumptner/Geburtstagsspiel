import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCamera, projectWorldPoint, snapCameraToTexels } from '../src/index.js';

test('camera clamps at the world edges', () => {
  const camera = calculateCamera({ worldWidth: 600, worldHeight: 600, viewport: { x: 0, y: 64, width: 360, height: 576 }, target: { x: 0, y: 0 }, zoom: 1.1 });
  assert.equal(camera.source.x, 0); assert.equal(camera.source.y, 0); assert.ok(camera.source.width < 600);
  assert.deepEqual(projectWorldPoint(camera, { x: 0, y: 0 }), { x: 0, y: 64 });
});

test('camera is centered away from edges', () => {
  const camera = calculateCamera({ worldWidth: 600, worldHeight: 600, viewport: { x: 0, y: 0, width: 300, height: 500 }, target: { x: 300, y: 300 }, zoom: 1 });
  const point = projectWorldPoint(camera, { x: 300, y: 300 }); assert.equal(point.x, 150); assert.equal(point.y, 250);
});

test('editor camera letterboxes rectangular boards without distortion', () => {
  const camera = calculateCamera({ worldWidth: 800, worldHeight: 400, viewport: { x: 0, y: 0, width: 600, height: 600 }, enabled: false });
  assert.deepEqual(camera.viewport, { x: 0, y: 150, width: 600, height: 300 });
  assert.equal(camera.scale, 0.75);
});
test('snaps camera origins to the authored texel grid', () => {
  const camera = calculateCamera({
    worldWidth: 600,
    worldHeight: 600,
    viewport: { x: 0, y: 203.2, width: 412, height: 711.8 },
    target: { x: 311.37, y: 287.61 },
    zoom: 1.12,
  });
  const native = snapCameraToTexels(camera, 1, 600, 600);
  const supersampled = snapCameraToTexels(camera, 2, 600, 600);
  assert.equal(native.source.x, Math.round(native.source.x));
  assert.equal(native.source.y, Math.round(native.source.y));
  assert.equal(supersampled.source.x * 2, Math.round(supersampled.source.x * 2));
  assert.equal(supersampled.source.y * 2, Math.round(supersampled.source.y * 2));
});

test('keeps snapped cameras inside the world at every edge', () => {
  const camera = calculateCamera({ worldWidth: 600, worldHeight: 600, viewport: { x: 0, y: 0, width: 390, height: 844 }, target: { x: 599.9, y: 599.9 }, zoom: 1.12 });
  const snapped = snapCameraToTexels(camera, 1, 600, 600);
  assert.ok(snapped.source.x >= 0);
  assert.ok(snapped.source.y >= 0);
  assert.ok(snapped.source.x + snapped.source.width <= 600);
  assert.ok(snapped.source.y + snapped.source.height <= 600);
});
test('keeps edge-snapped cameras aligned at Canvas2D scene scales', () => {
  const camera = calculateCamera({ worldWidth: 600, worldHeight: 600, viewport: { x: 0, y: 0, width: 390, height: 844 }, target: { x: 599.9, y: 599.9 }, zoom: 1.12 });
  for (const sceneScale of [1.5, 2]) {
    const snapped = snapCameraToTexels(camera, sceneScale, 600, 600);
    assert.equal(snapped.source.x * sceneScale, Math.round(snapped.source.x * sceneScale));
    assert.equal(snapped.source.y * sceneScale, Math.round(snapped.source.y * sceneScale));
    assert.ok(snapped.source.x >= 0);
    assert.ok(snapped.source.y >= 0);
    assert.ok(snapped.source.x + snapped.source.width <= 600);
    assert.ok(snapped.source.y + snapped.source.height <= 600);
  }
});
