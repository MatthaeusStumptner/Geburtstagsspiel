import rawCatalog from './data/passau-levels.json' with { type: 'json' };

const clone = (value) => JSON.parse(JSON.stringify(value));

export const passauCatalog = Object.freeze(rawCatalog.levels.map((level) => Object.freeze(level)));

export function catalogLevel(id) {
  const level = passauCatalog.find((entry) => entry.id === id);
  return level ? clone(level) : null;
}

export function searchCatalog(query = '') {
  const needle = query.trim().toLocaleLowerCase('de');
  if (!needle) return passauCatalog.map(clone);
  return passauCatalog
    .filter((level) => [level.id, level.name.standard, level.name.dialect, level.location.area, level.mission.standard]
      .some((value) => String(value).toLocaleLowerCase('de').includes(needle)))
    .map(clone);
}

export function catalogDocument() {
  return clone(rawCatalog);
}
