import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseSceneCandidate, sceneCandidatesAt, sceneGroups, sceneSelectionKey, selectionContext, workspaceForSelection } from '../src/scene-model.js';

const level = {
  board: { walls: [{ id: 'wall-center', name: 'Mauerblock', x: 3, y: 3, width: 1, height: 1 }] },
  actors: { player: { id: 'player', x: 3, y: 3 }, cats: [{ id: 'rock-katze', x: 3, y: 3, behavior: { strategy: 'guard' } }], characters: [{ id: 'postler-1', characterId: 'postler', name: 'Passauer Postler', x: 3, y: 3, scale: 2 }] },
  decorations: [
    { id: 'bank', name: 'Bank', type: 'bench', layer: 'scenery', x: 2, y: 2, width: 3, height: 2 },
    { id: 'text', name: 'Text', type: 'text', layer: 'foreground', x: 3, y: 3, width: 2, height: 1 },
  ],
  events: [
    { id: 'eisvogel', name: { standard: 'Eisvogel' }, trigger: { type: 'zone' }, visual: { type: 'marker', x: 3.5, y: 3.5, label: '!' } },
    { id: 'unsichtbar', name: { standard: 'Unsichtbar' }, trigger: { type: 'zone' }, visual: { type: 'none', x: 3.5, y: 3.5, label: '' } },
  ],
  theme: { elements: [{ id: 'stage-note' }] },
};

test('builds a grouped scene tree with stable document identities', () => {
  const groups = sceneGroups(level);
  assert.deepEqual(groups.map((group) => group.id), ['actors', 'walls', 'objects', 'events', 'theme']);
  assert.equal(groups[0].nodes[1].key, 'cat:rock-katze');
  assert.equal(groups[0].nodes[2].key, 'character:postler-1');
  assert.equal(groups[0].nodes[2].label, 'Passauer Postler');
  assert.equal(groups[1].nodes[0].key, 'wall:wall-center');
  assert.equal(groups[2].nodes[1].detail, 'Text, Position und Darstellung');
  assert.equal(groups[3].nodes[0].key, 'event:eisvogel');
  assert.equal(groups[4].nodes[0].label, 'Zauberberg-Note');
});

test('orders overlapping candidates like the renderer and keeps walls behind authored objects', () => {
  const candidates = sceneCandidatesAt(level, { x: 3, y: 3 }, { themeBounds: () => ({ x: 3, y: 3, width: 1, height: 1 }) });
  assert.deepEqual(candidates.map((selection) => sceneSelectionKey(level, selection)), [
    'player:player', 'character:postler-1', 'cat:rock-katze', 'event:eisvogel', 'decoration:text', 'decoration:bank', 'theme-element:stage-note', 'wall:wall-center',
  ]);
  assert.equal(sceneSelectionKey(level, chooseSceneCandidate(level, candidates, candidates[0], true)), 'character:postler-1');
  assert.equal(sceneSelectionKey(level, chooseSceneCandidate(level, candidates, candidates.at(-1), true)), 'player:player');
});

test('does not offer events without a visible scene representation', () => {
  const candidates = sceneCandidatesAt(level, { x: 3, y: 3 });
  assert.equal(candidates.some((selection) => sceneSelectionKey(level, selection) === 'event:unsichtbar'), false);
});

test('does not offer editor-hidden candidates', () => {
  const hidden = new Set(['player:player', 'decoration:text']);
  const candidates = sceneCandidatesAt(level, { x: 3, y: 3 }, { hidden });
  assert.equal(candidates.some((selection) => sceneSelectionKey(level, selection) === 'player:player'), false);
  assert.equal(candidates.some((selection) => sceneSelectionKey(level, selection) === 'decoration:text'), false);
});

test('routes a recognized selection to its corresponding specialist workspace', () => {
  assert.equal(workspaceForSelection({ kind: 'wall' }), 'level');
  assert.equal(workspaceForSelection({ kind: 'player' }), 'characters');
  assert.equal(workspaceForSelection({ kind: 'character' }), 'characters');
  assert.equal(workspaceForSelection({ kind: 'event' }), 'events');
  assert.equal(workspaceForSelection({ kind: 'decoration' }), 'objects');
});

test('derives one complete editing context for every selectable level entity', () => {
  const text = selectionContext(level, { kind: 'decoration', index: 1 });
  assert.deepEqual({
    label: text.label,
    kindLabel: text.kindLabel,
    workspace: text.workspace,
    workspaceLabel: text.workspaceLabel,
    primaryTool: text.primaryTool,
  }, {
    label: 'Text',
    kindLabel: 'Textblock',
    workspace: 'objects',
    workspaceLabel: 'Objektwerkstatt',
    primaryTool: 'transform',
  });

  const event = selectionContext(level, { kind: 'event', index: 0 });
  assert.equal(event.workspace, 'events');
  assert.equal(event.primaryTool, 'event-visual');
  assert.match(event.detail, /Auslöser, Text und Darstellung/);

  const character = selectionContext(level, { kind: 'character', index: 0 });
  assert.equal(character.workspace, 'characters');
  assert.equal(character.kindLabel, 'Eigene Figur');
  assert.equal(character.primaryTool, 'transform');
  assert.match(character.detail, /2.00×/);

  const wall = selectionContext(level, { kind: 'wall', index: 0 });
  assert.equal(wall.workspace, 'level');
  assert.equal(wall.primaryTool, '');
});

test('selects a scaled character across its complete visible footprint', () => {
  const candidates = sceneCandidatesAt(level, { x: 2.75, y: 3 });
  assert.equal(candidates.some((selection) => sceneSelectionKey(level, selection) === 'character:postler-1'), true);
});
