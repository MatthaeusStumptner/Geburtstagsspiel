import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTokenToSelection, copySelectedPixels, floodFillPixelKeys, invertPixelSelection, linePixelKeys, moveSelectedPixels, outlineRectanglePixelKeys, pasteSelectedPixels, selectPixelRectangle, selectPixelsByToken } from '../src/pixel-selection.js';

test('selects rectangular pixel regions and supports additive multi-selection', () => {
  const first = selectPixelRectangle([], { x: 1, y: 1 }, { x: 2, y: 2 }, 4, 4);
  assert.deepEqual(first, ['1:1', '2:1', '1:2', '2:2']);
  const added = selectPixelRectangle(first, { x: 0, y: 0 }, { x: 0, y: 0 }, 4, 4, true);
  assert.deepEqual(added, ['1:1', '2:1', '1:2', '2:2', '0:0']);
});

test('selects equal colors, inverts selection and recolors selected pixels', () => {
  const rows = ['0110', '1221', '0110'];
  const same = selectPixelsByToken(rows, '2');
  assert.deepEqual(same, ['1:1', '2:1']);
  assert.equal(invertPixelSelection(same, 4, 3).length, 10);
  assert.deepEqual(applyTokenToSelection(rows, same, '3'), ['0110', '1331', '0110']);
});

test('moves the selected drawing without changing unrelated pixels', () => {
  const moved = moveSelectedPixels(['100', '020', '003'], ['0:0', '1:1'], 1, 0);
  assert.equal(moved.moved, true);
  assert.deepEqual(moved.rows, ['010', '002', '003']);
  assert.deepEqual(moved.selection, ['1:0', '2:1']);
  const blocked = moveSelectedPixels(moved.rows, moved.selection, 1, 0);
  assert.equal(blocked.moved, false);
  assert.deepEqual(blocked.rows, moved.rows);
});

test('draws clipped lines and outlined or filled rectangles', () => {
  assert.deepEqual(linePixelKeys({ x: 0, y: 0 }, { x: 3, y: 3 }, 4, 4), ['0:0', '1:1', '2:2', '3:3']);
  assert.deepEqual(outlineRectanglePixelKeys({ x: 1, y: 1 }, { x: 3, y: 2 }, 5, 4), ['1:1', '2:1', '3:1', '1:2', '2:2', '3:2']);
  assert.equal(outlineRectanglePixelKeys({ x: 0, y: 0 }, { x: 2, y: 2 }, 3, 3, true).length, 9);
});

test('fills only a connected color region', () => {
  const rows = ['0010', '0110', '0000'];
  assert.deepEqual(floodFillPixelKeys(rows, 0, 0), ['0:0', '1:0', '0:1', '0:2', '1:2', '2:2', '3:2', '3:1', '3:0']);
  assert.deepEqual(floodFillPixelKeys(rows, { x: 1, y: 1 }), ['1:1', '2:1', '2:0']);
});

test('copies irregular selections and pastes them at a chosen origin', () => {
  const clipboard = copySelectedPixels(['120', '003', '000'], ['0:0', '1:0', '2:1']);
  assert.deepEqual(clipboard.cells, [{ x: 0, y: 0, token: '1' }, { x: 1, y: 0, token: '2' }, { x: 2, y: 1, token: '3' }]);
  const pasted = pasteSelectedPixels(['0000', '0000', '0000'], clipboard, 1, 1);
  assert.equal(pasted.pasted, true);
  assert.deepEqual(pasted.rows, ['0000', '0120', '0003']);
  assert.deepEqual(pasted.selection, ['1:1', '2:1', '3:2']);
});
