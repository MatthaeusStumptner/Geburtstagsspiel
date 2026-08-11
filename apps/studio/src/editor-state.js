import { createLevelDocument, tileKey } from '@franz-lola/pixel-renderer';

const clone = (value) => JSON.parse(JSON.stringify(value));

export function wallRectanglesToCells(walls) {
  const cells = new Set();
  walls.forEach((wall) => {
    for (let y = wall.y; y < wall.y + wall.height; y += 1) {
      for (let x = wall.x; x < wall.x + wall.width; x += 1) cells.add(tileKey(x, y));
    }
  });
  return cells;
}

export function compactWallCells(cells) {
  const remaining = new Set(cells);
  const rectangles = [];
  const sorted = () => [...remaining]
    .map((key) => key.split(',').map(Number))
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  while (remaining.size) {
    const [x, y] = sorted()[0];
    let width = 1;
    while (remaining.has(tileKey(x + width, y))) width += 1;
    let height = 1;
    let canGrow = true;
    while (canGrow) {
      for (let nextX = x; nextX < x + width; nextX += 1) {
        if (!remaining.has(tileKey(nextX, y + height))) { canGrow = false; break; }
      }
      if (canGrow) height += 1;
    }
    for (let currentY = y; currentY < y + height; currentY += 1) {
      for (let currentX = x; currentX < x + width; currentX += 1) remaining.delete(tileKey(currentX, currentY));
    }
    rectangles.push({ x, y, width, height });
  }
  return rectangles;
}

function nextWallId(walls, x, y) {
  const base = 'wall-' + x + '-' + y;
  const ids = new Set(walls.map((wall) => wall.id).filter(Boolean));
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(base + '-' + suffix)) suffix += 1;
  return base + '-' + suffix;
}

export function subtractWallCell(wall, x, y) {
  if (x < wall.x || x >= wall.x + wall.width || y < wall.y || y >= wall.y + wall.height) return [clone(wall)];
  const pieces = [];
  const topHeight = y - wall.y;
  const bottomHeight = wall.y + wall.height - y - 1;
  const leftWidth = x - wall.x;
  const rightWidth = wall.x + wall.width - x - 1;
  if (topHeight > 0) pieces.push({ x: wall.x, y: wall.y, width: wall.width, height: topHeight });
  if (bottomHeight > 0) pieces.push({ x: wall.x, y: y + 1, width: wall.width, height: bottomHeight });
  if (leftWidth > 0) pieces.push({ x: wall.x, y, width: leftWidth, height: 1 });
  if (rightWidth > 0) pieces.push({ x: x + 1, y, width: rightWidth, height: 1 });
  return pieces.map((rectangle, index) => ({
    ...clone(wall),
    ...rectangle,
    ...(wall.id ? { id: index === 0 ? wall.id : wall.id + '-part-' + (index + 1) } : {}),
    ...(wall.name && index > 0 ? { name: wall.name + ' · Teil ' + (index + 1) } : {}),
  }));
}

function snapshotOf(state) {
  return {
    document: clone(state.document),
    wallCells: [...state.wallCells],
    wallsDirty: state.wallsDirty,
    selected: clone(state.selected),
  };
}

export class EditorState {
  constructor(document, { historyLimit = 100 } = {}) {
    this.historyLimit = historyLimit;
    this.history = [];
    this.future = [];
    this.transaction = null;
    this.revision = 0;
    this.selected = null;
    this.replace(document, { remember: false });
  }

  replace(document, { remember = true, label = 'Level laden' } = {}) {
    if (remember && this.document) this.pushHistory(label);
    this.document = createLevelDocument(document);
    this.wallCells = wallRectanglesToCells(this.document.board.walls);
    this.wallsDirty = false;
    this.selected = null;
    this.future = [];
    this.revision += 1;
    return this.document;
  }

  pushHistory(label, snapshot = snapshotOf(this)) {
    this.history.push({ label, snapshot });
    if (this.history.length > this.historyLimit) this.history.shift();
  }

  beginTransaction(label = 'Bearbeiten') {
    if (this.transaction) return false;
    this.transaction = { label, snapshot: snapshotOf(this), changed: false };
    return true;
  }

  markChanged() {
    if (this.transaction) this.transaction.changed = true;
    this.revision += 1;
  }

  endTransaction() {
    if (!this.transaction) return false;
    const { label, snapshot, changed } = this.transaction;
    this.transaction = null;
    if (!changed) return false;
    this.pushHistory(label, snapshot);
    this.future = [];
    this.document = this.toDocument();
    return true;
  }

  mutate(label, mutator) {
    this.beginTransaction(label);
    mutator(this);
    this.markChanged();
    return this.endTransaction();
  }

  setWall(x, y, enabled) {
    if (!this.isInside(x, y)) return false;
    const key = tileKey(x, y);
    const changed = enabled ? !this.wallCells.has(key) : this.wallCells.has(key);
    if (!changed) return false;
    if (enabled) {
      this.wallCells.add(key);
      this.document.board.walls.push({
        id: nextWallId(this.document.board.walls, x, y),
        name: 'Wand ' + (this.document.board.walls.length + 1),
        x, y, width: 1, height: 1,
      });
      this.removeObjectsAt(x, y);
    } else {
      this.wallCells.delete(key);
      this.document.board.walls = this.document.board.walls.flatMap((wall) => subtractWallCell(wall, x, y));
    }
    this.wallsDirty = false;
    this.markChanged();
    return true;
  }

  applyWallPoints(points, enabled) {
    let changed = false;
    points.forEach(({ x, y }) => { changed = this.setWall(x, y, enabled) || changed; });
    return changed;
  }

  setPlayer(point) {
    if (!this.isInside(point.x, point.y)) return false;
    this.setWall(point.x, point.y, false);
    this.document.actors.player = { ...this.document.actors.player, ...point };
    this.selected = { kind: 'player', index: 0 };
    this.markChanged();
    return true;
  }

  addCat(point, appearance = {}) {
    if (!this.isInside(point.x, point.y)) return false;
    this.setWall(point.x, point.y, false);
    this.document.actors.cats.push({ x: point.x, y: point.y, renderer: 'cat', color: '#ff6b5f', accent: '#9e302e', ...clone(appearance) });
    this.selected = { kind: 'cat', index: this.document.actors.cats.length - 1 };
    this.markChanged();
    return true;
  }

  addCharacter(point, character) {
    if (!this.isInside(point.x, point.y) || !character) return false;
    this.setWall(point.x, point.y, false);
    this.document.actors.characters ??= [];
    this.document.actors.characters.push({ ...clone(character), x: point.x, y: point.y });
    this.selected = { kind: 'character', index: this.document.actors.characters.length - 1 };
    this.markChanged();
    return true;
  }

  togglePowerUp(point) {
    if (!this.isInside(point.x, point.y)) return false;
    const index = this.document.collectibles.powerUps.findIndex((item) => item.x === point.x && item.y === point.y);
    if (index >= 0) this.document.collectibles.powerUps.splice(index, 1);
    else {
      this.setWall(point.x, point.y, false);
      this.document.collectibles.powerUps.push({ ...point });
    }
    this.markChanged();
    return true;
  }

  addDecoration(point, decoration) {
    if (!this.isInside(point.x, point.y)) return false;
    this.document.decorations.push({ id: `decoration-${Date.now()}-${this.document.decorations.length}`, x: point.x, y: point.y, ...clone(decoration) });
    this.selected = { kind: 'decoration', index: this.document.decorations.length - 1 };
    this.markChanged();
    return true;
  }

  selectAt(point) {
    const characterIndex = (this.document.actors.characters ?? []).findIndex((actor) => actor.x === point.x && actor.y === point.y);
    const catIndex = this.document.actors.cats.findIndex((actor) => actor.x === point.x && actor.y === point.y);
    if (characterIndex >= 0) this.selected = { kind: 'character', index: characterIndex };
    else if (catIndex >= 0) this.selected = { kind: 'cat', index: catIndex };
    else if (this.document.actors.player.x === point.x && this.document.actors.player.y === point.y) this.selected = { kind: 'player', index: 0 };
    else {
      const decorationIndex = this.document.decorations.findIndex((item) => point.x >= item.x && point.x < item.x + item.width && point.y >= item.y && point.y < item.y + item.height);
      this.selected = decorationIndex >= 0 ? { kind: 'decoration', index: decorationIndex } : null;
    }
    return this.selected;
  }

  deleteSelected() {
    if (!this.selected) return false;
    const selected = this.selected;
    if (selected.kind === 'cat') this.document.actors.cats.splice(selected.index, 1);
    else if (selected.kind === 'character') this.document.actors.characters.splice(selected.index, 1);
    else if (selected.kind === 'decoration') this.document.decorations.splice(selected.index, 1);
    else if (selected.kind === 'wall') { this.document.board.walls.splice(selected.index, 1); this.refreshWallCells(); }
    else return false;
    this.selected = null;
    this.markChanged();
    return true;
  }

  selectedObject() {
    if (!this.selected) return null;
    if (this.selected.kind === 'player') return this.document.actors.player;
    if (this.selected.kind === 'cat') return this.document.actors.cats[this.selected.index] ?? null;
    if (this.selected.kind === 'character') return this.document.actors.characters?.[this.selected.index] ?? null;
    if (this.selected.kind === 'decoration') return this.document.decorations[this.selected.index] ?? null;
    if (this.selected.kind === 'wall') return this.document.board.walls[this.selected.index] ?? null;
    return null;
  }

  setSelectedAppearance(appearance) {
    const object = this.selectedObject();
    if (!object || !['player', 'cat', 'character'].includes(this.selected?.kind)) return false;
    object.appearance = clone(appearance);
    object.renderer = appearance ? 'pixel-art' : (this.selected.kind === 'player' ? 'franz-lola' : this.selected.kind === 'cat' ? 'cat' : 'pixel-art');
    this.markChanged();
    return true;
  }

  removeObjectsAt(x, y) {
    this.document.collectibles.powerUps = this.document.collectibles.powerUps.filter((point) => point.x !== x || point.y !== y);
    this.document.actors.cats = this.document.actors.cats.filter((actor) => actor.x !== x || actor.y !== y);
    this.document.actors.characters = (this.document.actors.characters ?? []).filter((actor) => actor.x !== x || actor.y !== y);
  }

  isInside(x, y) {
    return x >= 0 && y >= 0 && x < this.document.board.columns && y < this.document.board.rows;
  }

  refreshWallCells() {
    this.wallCells = wallRectanglesToCells(this.document.board.walls);
    this.wallsDirty = false;
  }

  toDocument() {
    return createLevelDocument(this.document);
  }

  restore(snapshot) {
    this.document = createLevelDocument(snapshot.document);
    this.wallCells = new Set(snapshot.wallCells);
    this.wallsDirty = snapshot.wallsDirty;
    this.selected = snapshot.selected;
    this.revision += 1;
  }

  undo() {
    const entry = this.history.pop();
    if (!entry) return false;
    this.future.push({ label: entry.label, snapshot: snapshotOf(this) });
    this.restore(entry.snapshot);
    return true;
  }

  redo() {
    const entry = this.future.pop();
    if (!entry) return false;
    this.history.push({ label: entry.label, snapshot: snapshotOf(this) });
    this.restore(entry.snapshot);
    return true;
  }
}

export function createStarterLevel() {
  return createLevelDocument({
    id: 'mein-level',
    name: { standard: 'Mein Passau-Level', dialect: 'Mei Passau-Level' },
    description: { standard: 'Eine selbst gebaute Gassi-Runde.', dialect: 'A selber baute Gassi-Rundn.' },
    mission: { standard: 'Alle Guttis finden', dialect: 'Olle Guttis findn' },
    board: { columns: 25, rows: 25, tileSize: 24, tunnelRows: [12], walls: [] },
    theme: { landmark: 'dog-park' },
    actors: { player: { x: 12, y: 20 }, cats: [], characters: [] },
    decorations: [],
  });
}
