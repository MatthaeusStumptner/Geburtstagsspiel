const clone = (value) => JSON.parse(JSON.stringify(value));
const OLD_COPY_SUFFIX = '-lokale-kopie';
const SAFETY_SUFFIX = '-lokale-sicherung';

function sourceIdFromGeneratedCopy(id) {
  const value = String(id ?? '');
  if (value.endsWith(SAFETY_SUFFIX)) return value.slice(0, -SAFETY_SUFFIX.length);
  let sourceId = value;
  let matched = false;
  while (sourceId.endsWith(OLD_COPY_SUFFIX)) {
    sourceId = sourceId.slice(0, -OLD_COPY_SUFFIX.length);
    matched = true;
  }
  return matched && sourceId ? sourceId : '';
}

function sourceName(name) {
  return String(name || 'Inhalt')
    .replace(/(?: · lokale Kopie)+$/u, '')
    .replace(/ · lokale Sicherung$/u, '');
}

export function isAutomaticLocalCopy(id) {
  return Boolean(sourceIdFromGeneratedCopy(id));
}

export function createLocalSafetyCopy(local, sourceId = sourceIdFromGeneratedCopy(local?.id) || local?.id) {
  return {
    ...clone(local),
    id: `${sourceId}${SAFETY_SUFFIX}`,
    name: `${sourceName(local?.name)} · lokale Sicherung`,
    localOnly: true,
    sourceId,
  };
}

export function collapseAutomaticLocalCopies(entries) {
  const retained = [];
  const safetyCopies = new Map();
  const removed = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const sourceId = entry?.localOnly && entry?.sourceId
      ? String(entry.sourceId)
      : sourceIdFromGeneratedCopy(entry?.id);
    if (!sourceId) {
      retained.push(clone(entry));
      continue;
    }
    if (String(entry.id).includes(OLD_COPY_SUFFIX)) removed.push(entry.id);
    safetyCopies.set(sourceId, createLocalSafetyCopy(entry, sourceId));
  }
  return { entries: [...retained, ...safetyCopies.values()], removed };
}
