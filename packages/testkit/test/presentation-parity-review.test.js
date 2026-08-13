import assert from 'node:assert/strict';
import test from 'node:test';
import * as testkit from '../src/index.js';

const EXPECTED_CHECKSUM = 'b3c8457ba89a848a4245bb76156a471f632e31cd879f2c473118d87544e00572';
const EXPECTED_FRAME = Object.freeze({
  presentationTime: 2,
  camera: {
    viewport: { x: 0, y: 0, width: 400, height: 300 },
    source: { x: 23, y: 0, width: 192.85714285714283, height: 144.6428571428571 },
    scale: 2.0740740740740744,
  },
  player: {
    id: 'player',
    world: { x: 169.19999999999965, y: 36 },
    screen: { x: 303.22962962962896, y: 74.66666666666669 },
  },
  cats: [{
    id: 'cat-1', index: 0,
    world: { x: 132, y: 132 },
    screen: { x: 226.0740740740741, y: 273.7777777777778 },
    onScreen: true, distance: 4.289813515760324, color: '#ff6b5f', respawnTimer: 0,
  }],
  display: {
    width: 400, height: 300, actualPixelRatio: 1, pixelRatio: 1,
    bufferWidth: 400, bufferHeight: 300, reason: 'golden-capture',
  },
});

function goldenProjection(frame) {
  return {
    presentationTime: frame.presentationTime,
    camera: frame.camera,
    player: frame.player,
    cats: frame.cats,
    display: frame.display,
  };
}

async function capture(adapter) {
  assert.equal(typeof testkit.renderGoldenCapture, 'function', 'testkit must expose app-owned capture adapters');
  const fixture = await testkit.loadGoldenProject('hals-smoke');
  return testkit.renderGoldenCapture({ adapter, fixture, presentationTime: 2 });
}

test('Game capture independently matches the literal golden checksum and projection', async () => {
  const result = await capture('game');
  assert.equal(result.checksum, EXPECTED_CHECKSUM);
  assert.deepEqual(goldenProjection(result.frame), EXPECTED_FRAME);
});

test('Studio capture independently matches the literal golden checksum and projection', async () => {
  const result = await capture('studio');
  assert.equal(result.checksum, EXPECTED_CHECKSUM);
  assert.deepEqual(goldenProjection(result.frame), EXPECTED_FRAME);
});

test('app-owned Game and Studio captures remain presentation-identical', async () => {
  const [game, studio] = await Promise.all([capture('game'), capture('studio')]);
  assert.deepEqual(goldenProjection(studio.frame), goldenProjection(game.frame));
});
