import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveProjectDependencies } from '../src/project-dependencies.js';

test('resolves a stable transitive publication closure and reports missing IDs', () => {
  const result = resolveProjectDependencies([
    { type: 'level', id: 'hals', references: [{ type: 'character', id: 'franz' }, { type: 'cutscene', id: 'intro' }] },
    { type: 'character', id: 'franz', references: [{ type: 'animation', id: 'franz-walk' }] },
    { type: 'animation', id: 'franz-walk', references: [] },
  ], [{ type: 'level', id: 'hals' }]);
  assert.deepEqual(result.ordered.map(({ type, id }) => `${type}:${id}`), [
    'animation:franz-walk', 'character:franz', 'level:hals',
  ]);
  assert.deepEqual(result.missing, [{ from: 'level:hals', type: 'cutscene', id: 'intro' }]);
  assert.deepEqual(result.cycles, []);
});

test('sorts each adjacency list, deduplicates nodes, and stays stable across input order', () => {
  const documents = [
    { type: 'level', id: 'hals', references: [{ type: 'object', id: 'zelt' }, { type: 'object', id: 'bank' }, { type: 'object', id: 'bank' }] },
    { type: 'object', id: 'zelt', references: [] },
    { type: 'object', id: 'bank', references: [] },
  ];
  const roots = [{ type: 'level', id: 'hals' }, { type: 'level', id: 'hals' }];
  const forward = resolveProjectDependencies(documents, roots);
  const reversed = resolveProjectDependencies([...documents].reverse(), [...roots].reverse());
  assert.deepEqual(forward, reversed);
  assert.deepEqual(forward.ordered.map(({ type, id }) => `${type}:${id}`), [
    'object:bank', 'object:zelt', 'level:hals',
  ]);
});

test('returns explicit deterministic cycle paths without dropping the cycle nodes', () => {
  const result = resolveProjectDependencies([
    { type: 'animation', id: 'a', references: [{ type: 'character', id: 'b' }] },
    { type: 'character', id: 'b', references: [{ type: 'animation', id: 'a' }] },
  ], [{ type: 'animation', id: 'a' }]);
  assert.deepEqual(result.cycles, [['animation:a', 'character:b', 'animation:a']]);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.ordered.map(({ type, id }) => `${type}:${id}`), [
    'character:b', 'animation:a',
  ]);
});
