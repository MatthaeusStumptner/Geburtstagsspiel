import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveStudioRendererBackend } from '../src/render/studio-render-backend.js';

test('studio renderer backend override is development-only and fail-closed', () => {
  assert.equal(resolveStudioRendererBackend('?renderer=webgl2', { development: true }), 'webgl2');
  assert.equal(resolveStudioRendererBackend('?renderer=canvas2d', { development: true }), 'canvas2d');
  assert.equal(resolveStudioRendererBackend('?renderer=webgpu', { development: true }), 'webgpu');
  assert.equal(resolveStudioRendererBackend('?renderer=bogus', { development: true }), 'auto');
  assert.equal(resolveStudioRendererBackend('?renderer=canvas2d', { development: false }), 'auto');
});
