import { contentPublicationPath, validateContentDocument, validateLevelDocument } from '@franz-lola/pixel-renderer';

const MAX_BODY_BYTES = 5_000_000;
const MAX_LEVEL_BYTES = 1_000_000;
const MAX_LEVELS = 20;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function assertSafeObject(value, depth = 0) {
  if (depth > 32) throw new Error('Die JSON-Struktur ist zu tief verschachtelt.');
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (DANGEROUS_KEYS.has(key)) throw new Error(`Nicht erlaubter JSON-Schlüssel: ${key}`);
    assertSafeObject(child, depth + 1);
  }
}

export async function readPublishBody(request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    throw new Error('Veröffentlichungen müssen als JSON gesendet werden.');
  }
  const declaredLength = Number(request.headers.get('Content-Length') || 0);
  if (declaredLength > MAX_BODY_BYTES) throw new Error('Die Veröffentlichung ist größer als 5 MB.');
  const reader = request.body?.getReader(); const chunks = []; let length = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) { await reader.cancel(); throw new Error('Die Veröffentlichung ist größer als 5 MB.'); }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(length); let offset = 0;
  chunks.forEach((chunk) => { bytes.set(chunk, offset); offset += chunk.byteLength; });
  const source = new TextDecoder().decode(bytes);
  const body = JSON.parse(source);
  assertSafeObject(body);
  return body;
}

export function publishLevelsFromBody(body) {
  const levels = Array.isArray(body?.levels) ? body.levels : body?.level ? [body.level] : [];
  if (!levels.length) throw new Error('Bitte mindestens einen Entwurf auswählen.');
  if (levels.length > MAX_LEVELS) throw new Error(`Es können höchstens ${MAX_LEVELS} Level auf einmal veröffentlicht werden.`);
  const encoder = new TextEncoder();
  levels.forEach((level, index) => {
    if (encoder.encode(JSON.stringify(level)).byteLength > MAX_LEVEL_BYTES) throw new Error(`Level ${index + 1} ist größer als 1 MB.`);
  });
  return levels;
}

function enforceResourceLimits(level) {
  if ((level.actors.characters ?? []).length > 64) throw new Error('Das Level enthält mehr als 64 eigene Figuren.');
  if (level.board.columns > 64 || level.board.rows > 64 || level.board.columns * level.board.rows > 4096) {
    throw new Error('Veröffentlichte Level dürfen höchstens 64 × 64 Felder groß sein.');
  }
  if (level.board.walls.length > 512) throw new Error('Das Level enthält mehr als 512 Wandrechtecke.');
  if (level.actors.cats.length > 16) throw new Error('Das Level enthält mehr als 16 Katzen.');
  if (level.decorations.length > 256) throw new Error('Das Level enthält mehr als 256 Dekorationen.');
}

export function preparePublishedLevel(input, { existing, nextMapOrder }) {
  const result = validateLevelDocument(input);
  if (!result.ok) throw new Error(result.errors.join(' '));
  enforceResourceLimits(result.value);
  const existingSource = existing?.source ?? {};
  const mapOrder = Number.isInteger(existingSource.mapOrder)
    ? existingSource.mapOrder
    : nextMapOrder;
  const value = {
    ...result.value,
    source: {
      ...result.value.source,
      catalog: existing ? existingSource.catalog || 'Geburtstagsspiel' : 'Levelwerkstatt',
      gameLayout: existing && Number.isInteger(existingSource.gameLayout) ? existingSource.gameLayout : nextMapOrder,
      markerClass: existing ? existingSource.markerClass ?? '' : '',
      home: existing ? Boolean(existingSource.home) : false,
      mapOrder,
    },
  };
  return { value, warnings: result.warnings, path: `src/data/levels/${value.id}.level.json` };
}

export function preparePublishedBatch(inputs, { existingByPath = new Map(), nextMapOrder = 0 } = {}) {
  const initial = inputs.map((input, index) => preparePublishedLevel(input, { existing: null, nextMapOrder: nextMapOrder + index }));
  const paths = initial.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) throw new Error('Jede ausgewählte Level-ID darf nur einmal vorkommen.');
  let nextNewOrder = nextMapOrder;
  return inputs.map((input, index) => {
    const existing = existingByPath.get(initial[index].path) ?? null;
    const prepared = preparePublishedLevel(input, { existing, nextMapOrder: nextNewOrder });
    if (!existing) nextNewOrder += 1;
    return prepared;
  });
}

export function preparePublishedContent(input) {
  const result = validateContentDocument(input);
  if (!result.ok) throw new Error(result.errors.join(' '));
  if (result.value.type === 'level') throw new Error('Level werden über gemeinsame Level-Entwürfe veröffentlicht.');
  return {
    value: result.value,
    warnings: [],
    path: contentPublicationPath(result.value.type, result.value.id),
  };
}
