import assert from 'node:assert/strict';
import test from 'node:test';
import { createFakeFrameClock } from './fake-frame-clock.js';
import { createRenderCoordinator } from '../src/render-coordinator.js';
import { RENDER_PROFILES } from '../src/profiles.js';

test('renders invalidated on-demand surfaces once and sleeping surfaces never', () => {
  const clock = createFakeFrameClock();
  const renders = [];
  const coordinator = createRenderCoordinator(clock.adapter);
  coordinator.registerSurface({ id: 'level', profile: 'editor', render: (frame) => renders.push(frame) });
  coordinator.invalidate('level', 'selection');
  clock.present(0);
  clock.present(16.67);
  assert.equal(renders.length, 1);
  assert.equal(coordinator.snapshot().surfaces.level.lastReason, 'selection');
});

test('coalesces visible animated surfaces in one RAF and respects maxFps', () => {
  const clock = createFakeFrameClock();
  const renders = [];
  const coordinator = createRenderCoordinator(clock.adapter);
  coordinator.registerSurface({ id: 'a', profile: 'thumbnail-animated', render: ({ timestamp }) => renders.push(['a', timestamp]) });
  coordinator.registerSurface({ id: 'b', profile: 'thumbnail-animated', render: ({ timestamp }) => renders.push(['b', timestamp]) });
  for (const timestamp of [0, 16, 34, 50, 68, 84, 102]) clock.present(timestamp);
  assert.deepEqual(renders.map(([id]) => id), ['a', 'b', 'a', 'b', 'a', 'b', 'a', 'b']);
});

test('keeps exactly one pending callback while coalescing many invalidations', () => {
  const clock = createFakeFrameClock();
  const coordinator = createRenderCoordinator(clock.adapter);
  coordinator.registerSurface({ id: 'level', profile: 'editor', render() {} });
  coordinator.invalidate('level', 'first');
  coordinator.invalidate('level', 'second');
  assert.equal(clock.pendingCount(), 1);
  assert.equal(coordinator.snapshot().surfaces.level.lastReason, 'first');
  clock.present(0);
  assert.equal(clock.pendingCount(), 0);
});

test('presents the first animated frame at timestamp zero and honors the cadence boundary', () => {
  const clock = createFakeFrameClock();
  const timestamps = [];
  const coordinator = createRenderCoordinator(clock.adapter);
  coordinator.registerSurface({ id: 'preview', profile: 'thumbnail-animated', render: ({ timestamp }) => timestamps.push(timestamp) });
  clock.present(0);
  clock.present(33.333333333333336);
  assert.deepEqual(timestamps, [0, 33.333333333333336]);
});

test('hiding a surface clears dirty work but retains its diagnostic reason', () => {
  const clock = createFakeFrameClock();
  const rendered = [];
  const coordinator = createRenderCoordinator(clock.adapter);
  coordinator.registerSurface({ id: 'thumb', profile: 'thumbnail-static', render: () => rendered.push('render') });
  coordinator.invalidate('thumb', 'asset-change');
  coordinator.setSurfaceState('thumb', { visible: false });
  assert.equal(clock.pendingCount(), 0);
  assert.equal(coordinator.snapshot().surfaces.thumb.dirty, false);
  assert.equal(coordinator.snapshot().surfaces.thumb.lastReason, 'asset-change');
  coordinator.setSurfaceState('thumb', { visible: true });
  clock.present(0);
  assert.deepEqual(rendered, []);
});

test('inactive on-demand work resumes when reactivated without creating extra callbacks', () => {
  const clock = createFakeFrameClock();
  const renders = [];
  const coordinator = createRenderCoordinator(clock.adapter);
  coordinator.registerSurface({ id: 'level', profile: 'editor', render: () => renders.push('render') });
  coordinator.setSurfaceState('level', { active: false });
  coordinator.invalidate('level', 'selection');
  assert.equal(clock.pendingCount(), 0);
  coordinator.setSurfaceState('level', { active: true });
  assert.equal(clock.pendingCount(), 1);
  clock.present(0);
  assert.deepEqual(renders, ['render']);
});

test('fails closed for duplicate and unknown surface identifiers', () => {
  const clock = createFakeFrameClock();
  const coordinator = createRenderCoordinator(clock.adapter);
  coordinator.registerSurface({ id: 'level', profile: 'editor', render() {} });
  assert.throws(() => coordinator.registerSurface({ id: 'level', profile: 'editor', render() {} }), /already registered/);
  assert.throws(() => coordinator.invalidate('missing', 'selection'), /unknown surface/);
  assert.throws(() => coordinator.setSurfaceState('missing', { visible: false }), /unknown surface/);
  assert.throws(() => coordinator.unregisterSurface('missing'), /unknown surface/);
  assert.equal(Object.keys(coordinator.snapshot().surfaces).length, 1);
});

test('keeps scheduler state sound when a render throws', () => {
  const clock = createFakeFrameClock();
  const coordinator = createRenderCoordinator(clock.adapter);
  coordinator.registerSurface({ id: 'level', profile: 'editor', render() { throw new Error('boom'); } });
  coordinator.invalidate('level', 'selection');
  assert.throws(() => clock.present(0), /boom/);
  assert.equal(coordinator.snapshot().surfaces.level.dirty, true);
  assert.equal(clock.pendingCount(), 1);
});

test('permits a render callback to invalidate itself without losing the new work', () => {
  const clock = createFakeFrameClock();
  const reasons = [];
  const coordinator = createRenderCoordinator(clock.adapter);
  coordinator.registerSurface({
    id: 'level',
    profile: 'editor',
    render: ({ reason }) => {
      reasons.push(reason);
      if (reasons.length === 1) coordinator.invalidate('level', 'follow-up');
    },
  });
  coordinator.invalidate('level', 'initial');
  clock.present(0);
  assert.equal(clock.pendingCount(), 1);
  clock.present(1000 / 60);
  assert.deepEqual(reasons, ['initial', 'follow-up']);
});

test('permits a render callback to unregister itself and cancels the final callback', () => {
  const clock = createFakeFrameClock();
  const coordinator = createRenderCoordinator(clock.adapter);
  coordinator.registerSurface({
    id: 'level',
    profile: 'game',
    render: () => coordinator.unregisterSurface('level'),
  });
  assert.equal(clock.pendingCount(), 1);
  clock.present(0);
  assert.deepEqual(coordinator.snapshot().surfaces, {});
  assert.equal(clock.pendingCount(), 0);
});

test('does not render a surface unregistered by an earlier callback in the same frame', () => {
  const clock = createFakeFrameClock();
  const renders = [];
  const coordinator = createRenderCoordinator(clock.adapter);
  coordinator.registerSurface({
    id: 'first',
    profile: 'game',
    render: () => {
      renders.push('first');
      coordinator.unregisterSurface('second');
    },
  });
  coordinator.registerSurface({ id: 'second', profile: 'game', render: () => renders.push('second') });
  clock.present(0);
  assert.deepEqual(renders, ['first']);
});

test('manual surfaces render only through presentNow and do not queue RAF work', () => {
  const clock = createFakeFrameClock();
  const frames = [];
  const coordinator = createRenderCoordinator(clock.adapter);
  coordinator.registerSurface({ id: 'fixture', profile: 'test', render: (frame) => frames.push(frame) });
  coordinator.invalidate('fixture', 'fixture-update');
  clock.present(0);
  assert.equal(frames.length, 0);
  coordinator.presentNow('fixture', 42);
  assert.equal(frames.length, 1);
  assert.equal(frames[0].timestamp, 42);
  assert.equal(frames[0].reason, 'fixture-update');
});

test('exports immutable profiles and detached immutable snapshots', () => {
  const clock = createFakeFrameClock();
  const coordinator = createRenderCoordinator(clock.adapter);
  coordinator.registerSurface({ id: 'level', profile: 'editor', render() {} });
  assert.throws(() => { RENDER_PROFILES.editor.maxFps = 1; }, TypeError);
  const first = coordinator.snapshot();
  assert.throws(() => { first.surfaces.level.dirty = true; }, TypeError);
  coordinator.invalidate('level', 'selection');
  const second = coordinator.snapshot();
  assert.equal(first.surfaces.level.dirty, false);
  assert.equal(second.surfaces.level.dirty, true);
});

test('uses slot-based animated cadence without long-run drift', () => {
  const clock = createFakeFrameClock();
  const timestamps = [];
  const coordinator = createRenderCoordinator(clock.adapter);
  coordinator.registerSurface({ id: 'animated', profile: 'thumbnail-animated', render: ({ timestamp }) => timestamps.push(timestamp) });
  const displayStep = 1000 / 60;
  for (let index = 0; index <= 120; index += 1) clock.present(index * displayStep);
  assert.equal(timestamps.length, 61);
  assert.deepEqual(timestamps, Array.from({ length: 61 }, (_, index) => index * (1000 / 30)));
  assert.equal(new Set(timestamps).size, 61);
});

test('records hidden invalidations without queuing or retaining dirty work', () => {
  const clock = createFakeFrameClock();
  const renders = [];
  const coordinator = createRenderCoordinator(clock.adapter);
  coordinator.registerSurface({ id: 'hidden', profile: 'editor', visible: false, render: () => renders.push('render') });
  coordinator.invalidate('hidden', 'hidden-change');
  assert.equal(coordinator.snapshot().surfaces.hidden.dirty, false);
  assert.equal(coordinator.snapshot().surfaces.hidden.lastReason, 'hidden-change');
  assert.equal(clock.pendingCount(), 0);
  coordinator.setSurfaceState('hidden', { visible: true });
  clock.present(0);
  assert.deepEqual(renders, []);
  coordinator.invalidate('hidden', 'visible-change');
  clock.present(1);
  assert.deepEqual(renders, ['render']);
});

test('clears visible dirty work on hide while retaining its reason', () => {
  const clock = createFakeFrameClock();
  const renders = [];
  const coordinator = createRenderCoordinator(clock.adapter);
  coordinator.registerSurface({ id: 'editor', profile: 'editor', render: () => renders.push('render') });
  coordinator.invalidate('editor', 'before-hide');
  coordinator.setSurfaceState('editor', { visible: false });
  coordinator.setSurfaceState('editor', { visible: true });
  clock.present(0);
  assert.equal(coordinator.snapshot().surfaces.editor.lastReason, 'before-hide');
  assert.deepEqual(renders, []);
});

test('throttles dirty on-demand surfaces without losing their first pending reason', () => {
  const clock = createFakeFrameClock();
  const frames = [];
  const coordinator = createRenderCoordinator(clock.adapter);
  coordinator.registerSurface({ id: 'static', profile: 'thumbnail-static', render: (frame) => frames.push(frame) });
  coordinator.invalidate('static', 'initial');
  clock.present(0);
  coordinator.invalidate('static', 'second');
  coordinator.invalidate('static', 'third');
  clock.present(16);
  assert.equal(frames.length, 1);
  assert.equal(coordinator.snapshot().surfaces.static.dirty, true);
  assert.equal(coordinator.snapshot().surfaces.static.lastReason, 'second');
  clock.present(999);
  assert.equal(frames.length, 1);
  clock.present(1000);
  assert.equal(frames.length, 2);
  assert.equal(frames[1].reason, 'second');
  assert.equal(coordinator.snapshot().surfaces.static.dirty, false);
});

test('allows editor invalidations at the next eligible display frame', () => {
  const clock = createFakeFrameClock();
  const timestamps = [];
  const coordinator = createRenderCoordinator(clock.adapter);
  coordinator.registerSurface({ id: 'editor', profile: 'editor', render: ({ timestamp }) => timestamps.push(timestamp) });
  coordinator.invalidate('editor', 'initial');
  clock.present(0);
  coordinator.invalidate('editor', 'next');
  clock.present(1000 / 60);
  assert.deepEqual(timestamps, [0, 1000 / 60]);
});

test('coordinates throttled on-demand work with animation and callback invalidation', () => {
  const clock = createFakeFrameClock();
  const events = [];
  const coordinator = createRenderCoordinator(clock.adapter);
  coordinator.registerSurface({
    id: 'editor',
    profile: 'editor',
    render: ({ timestamp }) => {
      events.push(['editor', timestamp]);
      if (timestamp === 0) coordinator.invalidate('editor', 'callback-follow-up');
    },
  });
  coordinator.registerSurface({ id: 'animated', profile: 'thumbnail-animated', render: ({ timestamp }) => events.push(['animated', timestamp]) });
  coordinator.invalidate('editor', 'initial');
  clock.present(0);
  clock.present(1000 / 60);
  assert.deepEqual(events, [
    ['editor', 0],
    ['animated', 0],
    ['editor', 1000 / 60],
  ]);
});
test('handles suspended gaps and backward clock resets without cadence bursts', () => {
  const clock = createFakeFrameClock();
  const timestamps = [];
  const coordinator = createRenderCoordinator(clock.adapter);
  coordinator.registerSurface({ id: 'animated', profile: 'thumbnail-animated', render: ({ timestamp }) => timestamps.push(timestamp) });
  clock.present(0);
  clock.present(1000);
  clock.present(1000 + 1000 / 60);
  clock.present(-10);
  clock.present(-10 + 1000 / 60);
  clock.present(-10 + 1000 / 30);
  assert.deepEqual(timestamps, [0, 1000, -10, -10 + 1000 / 30]);
});
test('resets each animated surface phase after a backward timestamp', () => {
  const clock = createFakeFrameClock();
  const events = [];
  const coordinator = createRenderCoordinator(clock.adapter);
  coordinator.registerSurface({ id: 'a', profile: 'thumbnail-animated', render: ({ timestamp }) => events.push(['a', timestamp]) });
  coordinator.registerSurface({ id: 'b', profile: 'thumbnail-animated', render: ({ timestamp }) => events.push(['b', timestamp]) });
  clock.present(0);
  coordinator.setSurfaceState('b', { active: false });
  clock.present(1000);
  coordinator.setSurfaceState('b', { active: true });
  clock.present(132);
  clock.present(133.33333333333334);
  assert.deepEqual(events, [
    ['a', 0], ['b', 0],
    ['a', 1000],
    ['a', 132], ['b', 132],
    ['b', 133.33333333333334],
  ]);
});

test('resets throttled on-demand cadence from its own backward timestamp', () => {
  const clock = createFakeFrameClock();
  const timestamps = [];
  const coordinator = createRenderCoordinator(clock.adapter);
  coordinator.registerSurface({ id: 'editor', profile: 'editor', render: ({ timestamp }) => timestamps.push(timestamp) });
  coordinator.invalidate('editor', 'initial');
  clock.present(0);
  coordinator.invalidate('editor', 'forward');
  clock.present(1000);
  coordinator.invalidate('editor', 'backward');
  clock.present(132);
  coordinator.invalidate('editor', 'too-soon');
  clock.present(133.33333333333334);
  clock.present(148.66666666666666);
  assert.deepEqual(timestamps, [0, 1000, 132, 148.66666666666666]);
});

test('keeps continuous surfaces presenting for backward and forward timestamps', () => {
  const clock = createFakeFrameClock();
  const timestamps = [];
  const coordinator = createRenderCoordinator(clock.adapter);
  coordinator.registerSurface({ id: 'game', profile: 'game', render: ({ timestamp }) => timestamps.push(timestamp) });
  for (const timestamp of [0, 1000, 132, 133.33333333333334]) clock.present(timestamp);
  assert.deepEqual(timestamps, [0, 1000, 132, 133.33333333333334]);
});