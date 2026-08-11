import { createHash } from 'node:crypto';
import { goldenProjects } from './fixtures.js';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function snapshotChecksum(snapshot) {
  return createHash('sha256').update(JSON.stringify(canonicalize(snapshot))).digest('hex');
}

export function loadGoldenProject(id) {
  const project = goldenProjects[id];
  if (!project) throw new RangeError(`Unknown golden project: ${id}`);
  return project;
}

export function runInputScript(session, script) {
  if (!session || typeof session.queueInput !== 'function' || typeof session.step !== 'function') {
    throw new TypeError('runInputScript requires a game session');
  }
  if (!Array.isArray(script)) throw new TypeError('runInputScript requires an input script');

  let snapshot = session.snapshot();
  for (const step of script) {
    if (!step || typeof step !== 'object') throw new TypeError('Input script entries must be objects');
    if (step.input !== undefined) session.queueInput(step.input);
    snapshot = session.step(step.dt);
  }

  return deepFreeze({
    ...snapshot,
    levelId: snapshot.level.id,
    checksum: snapshotChecksum(snapshot),
  });
}
