import test from 'node:test';
import assert from 'node:assert/strict';
import { floodFillPoints, linePoints, moveRectangle, rectanglePoints, scaleRectangle, transformHandleAt, worldPointFromScreen, worldTilePointFromScreen } from '../src/editor-tools.js';

test('line tool covers every grid cell on horizontal, vertical and diagonal strokes', () => {
  assert.deepEqual(linePoints({ x: 1, y: 2 }, { x: 4, y: 2 }), [{ x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }]);
  assert.deepEqual(linePoints({ x: 3, y: 3 }, { x: 3, y: 1 }), [{ x: 3, y: 3 }, { x: 3, y: 2 }, { x: 3, y: 1 }]);
  assert.deepEqual(linePoints({ x: 1, y: 1 }, { x: 3, y: 3 }), [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]);
});

test('rectangle tool supports filled and outlined shapes in either drag direction', () => {
  assert.equal(rectanglePoints({ x: 3, y: 3 }, { x: 1, y: 1 }).length, 9);
  const outline = rectanglePoints({ x: 1, y: 1 }, { x: 4, y: 3 }, { filled: false });
  assert.equal(outline.length, 10);
  assert.ok(outline.some((point) => point.x === 4 && point.y === 3));
  assert.ok(!outline.some((point) => point.x === 2 && point.y === 2));
});

test('fill tool respects matching-area boundaries', () => {
  const walls = new Set(['1,0', '1,1', '1,2']);
  const left = floodFillPoints({ x: 0, y: 1 }, walls, 3, 3);
  const right = floodFillPoints({ x: 2, y: 1 }, walls, 3, 3);
  assert.equal(left.length, 3);
  assert.equal(right.length, 3);
  assert.equal(floodFillPoints({ x: 1, y: 1 }, walls, 3, 3).length, 3);
});

test('screen coordinates account for camera letterboxing', () => {
  const camera = { viewport: { x: 50, y: 0, width: 200, height: 200 }, source: { x: 0, y: 0, width: 240, height: 240 } };
  const level = { board: { columns: 10, rows: 10, tileSize: 24 } };
  assert.deepEqual(worldPointFromScreen(camera, { x: 62, y: 12 }, { left: 0, top: 0 }, level), { x: 0, y: 0 });
  assert.deepEqual(worldPointFromScreen(camera, { x: 238, y: 188 }, { left: 0, top: 0 }, level), { x: 9, y: 9 });
});

test('maps canvas input to fractional tile coordinates for free placement', () => {
  const camera = { viewport: { x: 12, y: 12, width: 200, height: 200 }, source: { x: 0, y: 0, width: 240, height: 240 } };
  const level = { board: { columns: 10, rows: 10, tileSize: 24 } };
  assert.deepEqual(worldTilePointFromScreen(camera, { x: 87, y: 112 }, { left: 0, top: 0 }, level), { x: 3.75, y: 5 });
});

test('moves and uniformly scales text rectangles within the board', () => {
  const rectangle = { x: 2, y: 3, width: 4, height: 2 };
  assert.equal(transformHandleAt(rectangle, { x: 6.1, y: 5.1 }), 'se');
  assert.deepEqual(moveRectangle(rectangle, { x: 3, y: 4 }, { x: 5.25, y: 6.5 }, { columns: 10, rows: 10 }), { x: 4.25, y: 5.5, width: 4, height: 2 });
  const scaled = scaleRectangle(rectangle, 'se', { x: 8, y: 6 }, { columns: 10, rows: 10 });
  assert.equal(scaled.scale, 1.5);
  assert.deepEqual(scaled.rectangle, { x: 2, y: 3, width: 6, height: 3 });
});
