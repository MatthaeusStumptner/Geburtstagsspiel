import test from 'node:test';
import assert from 'node:assert/strict';
import { levelCanvasRenderInputs } from '../src/render/level-canvas-render-inputs.js';

test('level canvas render inputs change for language and transform tool on a static project', () => {
  const studio = {
    revision: 4,
    sceneRevision: 2,
    workspace: 'level',
    language: 'standard',
    tool: 'select',
    showGrid: false,
    showGuttis: false,
    showEvents: false,
    difficulty: 'normal',
    selection: { kind: 'decoration', index: 0 },
    selections: [{ kind: 'decoration', index: 0 }],
    cursor: { x: 2, y: 3 },
    viewportZoom: 1,
    viewportCenter: { x: 4, y: 5 },
    editorLevel: { id: 'static-project' },
  };

  const initial = levelCanvasRenderInputs(studio);
  studio.language = 'dialect';
  studio.tool = 'transform';
  const changed = levelCanvasRenderInputs(studio);

  assert.equal(initial.language, 'standard');
  assert.equal(initial.tool, 'select');
  assert.equal(changed.language, 'dialect');
  assert.equal(changed.tool, 'transform');
  assert.notDeepEqual(changed, initial);
});
