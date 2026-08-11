import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL_DOCUMENT_KIND, LEVEL_FORMAT_VERSION, compileWallGrid, createLevelDocument, reachableTileKeys, sampleCutscene, validateLevelDocument } from '../src/index.js';

const valid = () => createLevelDocument({ kind: LEVEL_DOCUMENT_KIND, schemaVersion: LEVEL_FORMAT_VERSION, id: 'test-level', board: { columns: 9, rows: 9, tileSize: 24, tunnelRows: [4], walls: [] }, actors: { player: { x: 4, y: 6 }, cats: [{ x: 4, y: 4, color: '#ff6b5f', accent: '#9e302e' }] }, collectibles: { powerUps: [{ x: 1, y: 1 }] } });
const rows = (token) => Array.from({ length: 4 }, () => token.repeat(4));

test('normalizes and validates the shared level format', () => {
  const result = validateLevelDocument(valid()); assert.equal(result.ok, true, result.errors.join('\n')); assert.equal(result.value.kind, LEVEL_DOCUMENT_KIND); assert.equal(result.value.schemaVersion, LEVEL_FORMAT_VERSION);
});

test('compiles border walls and tunnel openings', () => {
  const grid = compileWallGrid(valid()); assert.equal(grid[0][4], true); assert.equal(grid[4][0], false); assert.equal(grid[4][8], false);
});

test('rejects actors inside walls and finds reachable tiles', () => {
  const level = valid(); level.board.walls.push({ x: 4, y: 6, width: 1, height: 1 }); const result = validateLevelDocument(level);
  assert.equal(result.ok, false); assert.match(result.errors.join(' '), /Startpunkt/); assert.equal(reachableTileKeys(level).size, 0);
});

test('preserves extensible gameplay, decoration and pixel-character data', () => {
  const level = valid();
  level.gameplay = { pelletSeed: 194, treatTargets: { easy: 60, normal: 90, hard: 140 } };
  level.decorations = [{ id: 'tree-1', type: 'tree', x: 2, y: 3, width: 2, height: 2, color: '#33aa66' }];
  level.actors.cats[0].appearance = { width: 4, height: 4, palette: ['transparent', '#ff0000'], pixels: ['0110', '1111', '1001', '0110'] };
  const result = validateLevelDocument(level);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.value.gameplay.pelletSeed, 194);
  assert.equal(result.value.decorations[0].type, 'tree');
  assert.deepEqual(result.value.actors.cats[0].appearance.pixels, ['0110', '1111', '1001', '0110']);
  assert.ok(result.metrics.reachableTiles > 0);
});

test('preserves an intentionally empty cat list', () => {
  const level = valid(); level.actors.cats = [];
  assert.deepEqual(createLevelDocument(level).actors.cats, []);
});

test('keeps reusable custom characters separate from enemy cats and exposes them to cutscenes', () => {
  const level = valid();
  level.actors.characters = [{
    id: 'passau-postler', characterId: 'postler', name: 'Passauer Postler', x: 2, y: 5, state: 'left',
    scale: 2.25,
    appearance: { width: 4, height: 4, palette: ['transparent', '#55d9dd'], pixels: ['0110', '1111', '0110', '1001'] },
    behavior: { controller: 'patrol', speedMultiplier: 0.75 },
  }];
  level.cutscenes = [{
    id: 'begruessung', kind: 'intro', name: { standard: 'Begrüßung', dialect: 'Servus' }, duration: 2,
    tracks: [{ id: 'postler-spur', type: 'actor', target: 'character:passau-postler', keyframes: [{ time: 0, x: 2, y: 5, state: 'left' }, { time: 2, x: 5, y: 5, state: 'right' }] }],
  }];

  const normalized = createLevelDocument(level);
  assert.equal(normalized.actors.cats.length, 1);
  assert.equal(normalized.actors.characters[0].characterId, 'postler');
  assert.equal(normalized.actors.characters[0].name, 'Passauer Postler');
  assert.equal(normalized.actors.characters[0].behavior.controller, 'patrol');
  assert.equal(normalized.actors.characters[0].scale, 2.25);
  const sample = sampleCutscene(normalized, normalized.cutscenes[0], 1);
  assert.equal(sample.characters.length, 1);
  assert.equal(sample.characters[0].x, 3.5);
  assert.equal(sample.characters[0].direction.name, 'right');
});

test('clamps reusable character display scales to the public renderer contract', () => {
  const level = valid();
  level.actors.characters = [{ id: 'klein', x: 1, y: 1, scale: 0.1 }, { id: 'gross', x: 2, y: 2, scale: 12 }];
  assert.deepEqual(createLevelDocument(level).actors.characters.map((character) => character.scale), [0.5, 4]);
});

test('assigns stable unique actor ids and preserves authored cat ids', () => {
  const level = valid();
  level.actors.player.id = 'franz-lola';
  level.actors.cats = [
    { id: 'rock-katze', x: 2, y: 2 },
    { id: 'rock-katze', x: 3, y: 2 },
    { x: 4, y: 2 },
  ];
  const actors = createLevelDocument(level).actors;
  assert.equal(actors.player.id, 'franz-lola');
  assert.deepEqual(actors.cats.map((cat) => cat.id), ['rock-katze', 'rock-katze-2', 'cat-3']);
});

test('preserves the complete base36 palette used by editable Franz and Lola sprites', () => {
  const level = valid();
  level.actors.player.appearance = {
    width: 4,
    height: 4,
    palette: ['transparent', ...Array.from({ length: 11 }, (_, index) => `#${(index + 1).toString(16).padStart(6, '0')}`)],
    pixels: ['0ab0', '1ab1', '1ab1', '0ab0'],
  };
  const appearance = createLevelDocument(level).actors.player.appearance;
  assert.equal(appearance.palette.length, 12);
  assert.deepEqual(appearance.pixels, ['0ab0', '1ab1', '1ab1', '0ab0']);
});

test('normalizes configurable actor behavior, difficulty physics and sprite animations', () => {
  const level = valid();
  level.actors.player.behavior = { controller: 'autopilot', speedMultiplier: 1.4 };
  level.actors.cats[0].behavior = { strategy: 'guard', speedMultiplier: 0.8, target: { x: 2, y: 6 } };
  level.actors.cats[0].appearance = {
    width: 4, height: 4, palette: ['transparent', '#ff0000'], pixels: ['0000', '0110', '0110', '0000'],
    animations: [{ id: 'walk', fps: 8, loop: true, frames: [{ pixels: ['0000', '0110', '0110', '0000'] }, { pixels: ['1001', '0110', '0110', '1001'] }] }],
  };
  level.gameplay.difficulties = { normal: { playerSpeed: 6.2, catCount: 1 } };
  const normalized = createLevelDocument(level);
  assert.equal(normalized.actors.player.behavior.controller, 'autopilot');
  assert.equal(normalized.actors.cats[0].behavior.strategy, 'guard');
  assert.equal(normalized.actors.cats[0].appearance.animations[0].frames.length, 2);
  assert.equal(normalized.gameplay.difficulties.normal.playerSpeed, 6.2);
  assert.equal(normalized.gameplay.difficulties.normal.catCount, 1);
});

test('normalizes localized level events, triggers, rewards and visuals', () => {
  const level = valid();
  level.events = [{
    id: 'Ilz Vögl!', name: { standard: 'Eisvogel', dialect: 'Eisvogl' }, message: { standard: 'Gefunden!', dialect: 'Gfundn!' }, reward: 150,
    trigger: { type: 'zone', zones: [{ x: -2, y: 4, width: 3, height: 1 }, { x: 8, y: 4, width: 3, height: 1 }] },
    visual: { type: 'kingfisher', x: 0.375, y: 6, visibility: 'after-trigger' },
  }];
  const event = createLevelDocument(level).events[0];
  assert.equal(event.id, 'ilz-v-gl');
  assert.equal(event.message.dialect, 'Gfundn!');
  assert.equal(event.reward, 150);
  assert.deepEqual(event.trigger.zones, [{ x: 0, y: 4, width: 3, height: 1 }, { x: 8, y: 4, width: 1, height: 1 }]);
  assert.equal(event.visual.x, 0.375);
});

test('validates unique event ids and usable direction sequences', () => {
  const level = valid();
  const event = { id: 'glocke', name: { standard: 'Glocke', dialect: 'Glockn' }, message: { standard: 'Bim', dialect: 'Bam' }, trigger: { type: 'direction-sequence', sequence: [] }, visual: { type: 'bell' } };
  level.events = [event, event]; const result = validateLevelDocument(level);
  assert.equal(result.ok, false); assert.match(result.errors.join(' '), /eindeutig/); assert.match(result.errors.join(' '), /mindestens eine Richtung/);
});

test('preserves reusable sprite objects and samples level-bound cutscenes', () => {
  const level = valid();
  level.decorations = [{
    id: 'music-note-1', assetId: 'music-note', name: 'Musiknote', type: 'custom', x: 2, y: 2, width: 2, height: 2, color: '#55d9dd', label: '♪',
    appearance: { width: 4, height: 4, palette: ['transparent', '#55d9dd'], pixels: ['0010', '0010', '0110', '1100'], animations: [{ id: 'pulse', fps: 4, frames: [{ pixels: ['0010', '0010', '0110', '1100'] }] }] },
  }];
  level.cutscenes = [{
    id: 'intro', kind: 'intro', duration: 4, name: { standard: 'Ankunft', dialect: 'Oikemma' }, tracks: [
      { id: 'franz', type: 'actor', target: 'player', keyframes: [{ time: 0, x: 1, y: 6, state: 'right' }, { time: 4, x: 5, y: 6, state: 'right', easing: 'ease-in-out' }] },
      { id: 'note', type: 'object', target: 'music-note-1', keyframes: [{ time: 0, x: 2, y: 2 }, { time: 4, x: 6, y: 2, animation: 'pulse' }] },
      { id: 'text', type: 'dialogue', target: 'dialogue', keyframes: [{ time: 1, duration: 2, speaker: 'Franz', text: { standard: 'Servus!', dialect: 'Hawedere!' } }] },
    ],
  }];
  const normalized = createLevelDocument(level);
  assert.equal(normalized.decorations[0].assetId, 'music-note');
  assert.equal(normalized.decorations[0].appearance.palette.length, 2);
  assert.equal(normalized.cutscenes[0].tracks.length, 3);
  const sample = sampleCutscene(normalized, 'intro', 2, 'dialect');
  assert.equal(sample.level.actors.player.x, 3);
  assert.equal(sample.level.decorations[0].x, 4);
  assert.equal(sample.player.x, 3);
  assert.equal(sample.decorations[0].x, 4);
  assert.equal(sample.dialogue.text, 'Hawedere!');
  assert.equal(sample.done, false);
});

test('preserves only supported linked object overrides', () => {
  const level = createLevelDocument({
    decorations: [{
      id: 'note-1', assetId: 'music-note', type: 'custom', color: '#ff00aa',
      assetOverrides: ['color', 'label', 'color', 'unknown'],
    }],
  });
  assert.deepEqual(level.decorations[0].assetOverrides, ['color', 'label']);
});

test('preserves freely positioned and scaled localized text blocks and sprite event visuals', () => {
  const level = valid();
  const appearance = { width: 4, height: 4, palette: ['transparent', '#ffffff'], pixels: rows('1'), animations: [{ id: 'idle', duration: 1, keyframes: [{ id: 'keyframe-1', time: 0, pixels: rows('1') }] }] };
  level.decorations = [{ id: 'copy', type: 'text', x: 1.375, y: 2.625, width: 5.5, height: 2.25, color: '#ffffff', content: { standard: 'Freier Text', dialect: 'Freia Text' }, textStyle: { fontSize: 0.7, align: 'left', background: '#071016', backgroundOpacity: 0, borderColor: '#55d9dd' } }];
  level.events = [{ id: 'sprite-event', name: { standard: 'Objekt', dialect: 'Objekt' }, message: { standard: 'Da!', dialect: 'Do!' }, trigger: { type: 'time', seconds: 1 }, visual: { type: 'custom', assetId: 'spark', appearance, spriteAnimation: 'idle', animation: { type: 'pulse', speed: 1, amplitude: 0.1 } } }];
  const normalized = createLevelDocument(level);
  assert.equal(normalized.decorations[0].type, 'text');
  assert.equal(normalized.decorations[0].content.dialect, 'Freia Text');
  assert.equal(normalized.decorations[0].textStyle.align, 'left');
  assert.equal(normalized.decorations[0].textStyle.backgroundOpacity, 0);
  assert.equal(normalized.decorations[0].x, 1.375);
  assert.equal(normalized.decorations[0].height, 2.25);
  assert.equal(normalized.events[0].visual.assetId, 'spark');
  assert.equal(normalized.events[0].visual.appearance.animations[0].keyframes.length, 1);
});

test('normalizes stackable visual effects, animated level edges and borderless text', () => {
  const level = valid();
  level.board.walls = [{
    id: 'backstein-links', name: 'Linker Backsteinblock', x: 2, y: 2, width: 3, height: 2,
    useThemeColor: false, color: '#553322', accent: '#f5c451', pattern: 'brick', opacity: 0.65,
    effects: [{ id: 'wand-echo', type: 'echo', intensity: 0.35, speed: 1.2, color: '#55d9dd' }],
  }];  level.theme.edgeEffects = [
    { id: 'Ilz Wellen', type: 'water-flow', side: 'left', speed: 99, intensity: 0.7, count: 4, color: '#2379a3', accent: '#f5c451' },
    { id: 'boot', type: 'boat', side: 'both', speed: 0.8, intensity: 0.6, count: 1, color: '#d8b27b', accent: '#f3eee0' },
  ];
  level.actors.cats[0].effects = [{ id: 'Rock Glitch', type: 'glitch', intensity: 0.8, speed: 3, color: '#ff4f87' }];
  level.decorations = [{
    id: 'text', type: 'text', x: 1, y: 1, width: 4, height: 2, color: '#ffffff',
    content: { standard: 'Nur Text', dialect: 'Bloß Text' },
    textStyle: { backgroundOpacity: 0, borderOpacity: 0 },
    effects: [{ id: 'schein', type: 'neon', intensity: 0.5, speed: 1, color: '#55d9dd' }],
  }];
  const normalized = createLevelDocument(level);
  assert.equal(normalized.board.walls[0].id, 'backstein-links');
  assert.equal(normalized.board.walls[0].pattern, 'brick');
  assert.equal(normalized.board.walls[0].useThemeColor, false);
  assert.equal(normalized.board.walls[0].effects[0].type, 'echo');  assert.equal(normalized.theme.edgeEffects.length, 2);
  assert.equal(normalized.theme.edgeEffects[0].id, 'ilz-wellen');
  assert.equal(normalized.theme.edgeEffects[0].speed, 8);
  assert.equal(normalized.actors.cats[0].effects[0].type, 'glitch');
  assert.equal(normalized.decorations[0].effects[0].type, 'neon');
  assert.equal(normalized.decorations[0].textStyle.backgroundOpacity, 0);
  assert.equal(normalized.decorations[0].textStyle.borderOpacity, 0);
});

test('limits visual effect stacks and replaces unsupported effect types', () => {
  const level = valid();
  level.actors.player.effects = Array.from({ length: 6 }, (_, index) => ({ id: `fx-${index}`, type: index === 0 ? 'unknown' : 'sparkle' }));
  const effects = createLevelDocument(level).actors.player.effects;
  assert.equal(effects.length, 4);
  assert.equal(effects[0].type, 'glitch');
});
