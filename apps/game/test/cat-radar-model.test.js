import test from 'node:test';
import assert from 'node:assert/strict';
import { fixturePresentationFrame } from '@franz-lola/render-testkit';
import { isPresentationFrame } from '@franz-lola/pixel-renderer';
import { calculateCatRadar } from '../src/render/cat-radar-model.js';
import { updateCatRadarView } from '../src/render/cat-radar-view.js';

class FakeClassList {
  values = new Set();
  toggles = 0;

  toggle(name, force) {
    this.toggles += 1;
    if (force) this.values.add(name);
    else this.values.delete(name);
  }
}

class FakeStyle {
  writes = [];

  set transform(value) { this.writes.push(['transform', value]); this.transformValue = value; }
  get transform() { return this.transformValue ?? ''; }
  setProperty(name, value) { this.writes.push([name, value]); this[name] = value; }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.style = new FakeStyle();
    this.classList = new FakeClassList();
    this.attributes = new Map();
    this.hidden = false;
    this.textContent = '';
  }

  append(...children) { children.forEach((child) => { child.parentElement = this; this.children.push(child); }); }
  remove() { this.parentElement.children = this.parentElement.children.filter((child) => child !== this); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  querySelector(selector) { return this.children.find((child) => selector === 'small' ? child.tagName === 'small' : child.className === selector.slice(1)); }
}

function fakeRadarContainer() {
  const ownerDocument = { createElement: (tagName) => new FakeElement(tagName, ownerDocument) };
  return new FakeElement('div', ownerDocument);
}

test('presentation fixture is schema-valid, deeply frozen, and recursively merges allowed overrides', () => {
  const frame = fixturePresentationFrame({
    viewport: { x: 14 },
    player: { screen: { y: 91 } },
  });

  assert.equal(isPresentationFrame(frame), true);
  assert.equal(frame.camera.viewport.x, 14);
  assert.equal(frame.camera.viewport.width, 400);
  assert.equal(frame.player.screen.x, 200);
  assert.equal(frame.player.screen.y, 91);
  assert.equal(Object.isFrozen(frame.camera.viewport), true);
  assert.equal(Object.isFrozen(frame.player.screen), true);
  assert.throws(() => fixturePresentationFrame({ renderer: { backend: 'canvas2d' } }), /override/i);
});

test('anchors an offscreen cat from the exact presentation screen point', () => {
  const frame = fixturePresentationFrame({
    viewport: { x: 0, y: 80, width: 400, height: 300 },
    player: { screen: { x: 200, y: 230 } },
    cats: [{ id: 'cat-1', screen: { x: 520, y: 180 }, world: { x: 20, y: 5 }, onScreen: false, distance: 12.4, color: '#f25f5c', respawnTimer: 0 }],
  });

  const result = calculateCatRadar(frame, { active: true });

  assert.equal(result.visible, true);
  assert.deepEqual(result.indicators[0], {
    id: 'cat-1', hidden: false, x: 372, y: 203.125, angle: 81.119, distance: 12, danger: false, color: '#f25f5c',
  });
});

test('never recomputes screen position or distance from raw actor coordinates', () => {
  const frame = fixturePresentationFrame({
    cats: [{ id: 'cat-1', screen: { x: -100, y: 100 }, world: { x: 9999, y: 9999 }, onScreen: false, distance: 4.6, color: '#fff', respawnTimer: 0 }],
  });

  assert.deepEqual(calculateCatRadar(frame, { active: true }).indicators[0], {
    id: 'cat-1', hidden: false, x: 28, y: 121.333, angle: -80.538, distance: 5, danger: true, color: '#fff',
  });
});

test('clamps rays inside non-zero portrait and landscape viewports, including corners', () => {
  const portrait = fixturePresentationFrame({
    viewport: { x: 30, y: 70, width: 200, height: 400 },
    player: { screen: { x: 130, y: 270 } },
    cats: [{ id: 'corner', screen: { x: 400, y: 800 }, world: { x: 0, y: 0 }, onScreen: false, distance: 9, color: '#abc', respawnTimer: 0 }],
  });
  const landscape = fixturePresentationFrame({
    viewport: { x: 40, y: 15, width: 500, height: 180 },
    player: { screen: { x: 290, y: 105 } },
    cats: [{ id: 'corner', screen: { x: -210, y: -195 }, world: { x: 0, y: 0 }, onScreen: false, distance: 9, color: '#abc', respawnTimer: 0 }],
  });

  assert.deepEqual(calculateCatRadar(portrait, { active: true }).indicators[0], {
    id: 'corner', hidden: false, x: 214, y: 434.889, angle: 153.004, distance: 9, danger: false, color: '#abc',
  });
  assert.deepEqual(calculateCatRadar(landscape, { active: true }).indicators[0], {
    id: 'corner', hidden: false, x: 170, y: 33, angle: -59.036, distance: 9, danger: false, color: '#abc',
  });
});

test('hides on-screen, respawning, and zero-vector cats without non-finite output', () => {
  const frame = fixturePresentationFrame({
    player: { screen: { x: 200, y: 150 } },
    cats: [
      { id: 'onscreen', screen: { x: 100, y: 100 }, world: { x: 1, y: 1 }, onScreen: true, distance: 3, color: '#111', respawnTimer: 0 },
      { id: 'respawning', screen: { x: 500, y: 100 }, world: { x: 2, y: 2 }, onScreen: false, distance: 4, color: '#222', respawnTimer: 1 },
      { id: 'zero', screen: { x: 200, y: 150 }, world: { x: 3, y: 3 }, onScreen: false, distance: 5, color: '#333', respawnTimer: 0 },
    ],
  });

  const result = calculateCatRadar(frame, { active: true });

  assert.equal(result.visible, false);
  assert.deepEqual(result.indicators.map(({ id, hidden, x, y, angle }) => ({ id, hidden, x, y, angle })), [
    { id: 'onscreen', hidden: true, x: 28, y: 64, angle: -63.435 },
    { id: 'respawning', hidden: true, x: 372, y: 121.333, angle: 80.538 },
    { id: 'zero', hidden: true, x: 200, y: 150, angle: 0 },
  ]);
  assert.equal(result.indicators.every((indicator) => Object.values(indicator).every((value) => typeof value !== 'number' || Number.isFinite(value))), true);
});

test('fails closed for inactive or invalid frame input', () => {
  const frame = fixturePresentationFrame();
  assert.deepEqual(calculateCatRadar(frame, { active: false }), { visible: false, indicators: [] });
  assert.deepEqual(calculateCatRadar(null, { active: true }), { visible: false, indicators: [] });
  assert.deepEqual(calculateCatRadar({ ...frame, camera: { ...frame.camera, viewport: { ...frame.camera.viewport, width: Number.NaN } } }, { active: true }), { visible: false, indicators: [] });
});

test('uses the rounded display distance for the danger threshold', () => {
  const frame = fixturePresentationFrame({
    cats: [{ id: 'cat-1', screen: { x: 500, y: 100 }, world: { x: 0, y: 0 }, onScreen: false, distance: 5.4, color: '#fff', respawnTimer: 0 }],
  });
  assert.equal(calculateCatRadar(frame, { active: true }).indicators[0].danger, true);
});

test('fails closed when stable cat IDs are duplicated', () => {
  const cat = { id: 'duplicate', screen: { x: 500, y: 100 }, world: { x: 0, y: 0 }, onScreen: false, distance: 7, color: '#fff', respawnTimer: 0 };
  const frame = fixturePresentationFrame({ cats: [cat, { ...cat, screen: { x: -100, y: 100 } }] });
  assert.deepEqual(calculateCatRadar(frame, { active: true }), { visible: false, indicators: [] });
});

test('view reuses stable-ID nodes, removes stale nodes, and caches non-positional writes', () => {
  const container = fakeRadarContainer();
  const first = {
    visible: true,
    indicators: [
      { id: 'lola', hidden: false, x: 28, y: 40, angle: 81, distance: 7, danger: false, color: '#f25f5c' },
      { id: 'franz', hidden: true, x: 50, y: 60, angle: 12, distance: 2, danger: true, color: '#abc' },
    ],
  };

  updateCatRadarView(container, first);
  const [lola, franz] = container.children;
  const lolaArrow = lola.querySelector('.cat-indicator-arrow');
  const firstColorWrites = lola.style.writes.filter(([name]) => name === '--cat-color').length;
  const firstAngleWrites = lolaArrow.style.writes.filter(([name]) => name === '--cat-angle').length;
  const firstDangerToggles = lola.classList.toggles;

  updateCatRadarView(container, {
    visible: true,
    indicators: [{ ...first.indicators[0], x: 30, y: 42 }],
  });

  assert.strictEqual(container.children[0], lola);
  assert.equal(container.children.includes(franz), false);
  assert.equal(lola.style.transform, 'translate3d(30px, 42px, 0)');
  assert.equal(lola.style.writes.filter(([name]) => name === '--cat-color').length, firstColorWrites);
  assert.equal(lolaArrow.style.writes.filter(([name]) => name === '--cat-angle').length, firstAngleWrites);
  assert.equal(lola.classList.toggles, firstDangerToggles);
  assert.equal(lola.querySelector('small').textContent, '7');
  assert.equal(lola.attributes.get('aria-hidden'), 'true');
  assert.equal(container.attributes.get('aria-hidden'), 'false');
});

test('view fails closed for invalid state and clears stale indicators', () => {
  const container = fakeRadarContainer();
  updateCatRadarView(container, {
    visible: true,
    indicators: [{ id: 'lola', hidden: false, x: 28, y: 40, angle: 81, distance: 7, danger: false, color: '#f25f5c' }],
  });

  updateCatRadarView(container, { visible: true, indicators: [{ id: 'lola', x: Number.NaN }] });

  assert.equal(container.hidden, true);
  assert.equal(container.attributes.get('aria-hidden'), 'true');
  assert.equal(container.children.length, 0);
});
