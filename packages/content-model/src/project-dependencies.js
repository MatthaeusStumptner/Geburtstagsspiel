const keyOf = ({ type, id }) => `${type}:${id}`;

const compareByKey = (left, right) => {
  const leftKey = keyOf(left);
  const rightKey = keyOf(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
};

export function resolveProjectDependencies(documents, roots) {
  const index = new Map();
  for (const document of Array.isArray(documents) ? documents : []) {
    if (!document || typeof document !== 'object') continue;
    const key = keyOf(document);
    if (!index.has(key)) index.set(key, document);
  }

  const ordered = [];
  const missing = [];
  const cycles = [];
  const missingKeys = new Set();
  const cycleKeys = new Set();
  const states = new Map();
  const stack = [];

  const reportMissing = (from, reference) => {
    const issue = { from, type: reference.type, id: reference.id };
    const issueKey = `${from}->${keyOf(reference)}`;
    if (missingKeys.has(issueKey)) return;
    missingKeys.add(issueKey);
    missing.push(issue);
  };

  const visit = (document) => {
    const key = keyOf(document);
    if (states.get(key) === 2) return;
    if (states.get(key) === 1) {
      const start = stack.indexOf(key);
      const cycle = [...stack.slice(start), key];
      const cycleKey = cycle.join('>');
      if (!cycleKeys.has(cycleKey)) {
        cycleKeys.add(cycleKey);
        cycles.push(cycle);
      }
      return;
    }

    states.set(key, 1);
    stack.push(key);
    const references = [...new Map(
      (Array.isArray(document.references) ? document.references : [])
        .filter((reference) => reference && typeof reference === 'object')
        .map((reference) => [keyOf(reference), reference]),
    ).values()].sort(compareByKey);

    for (const reference of references) {
      const dependency = index.get(keyOf(reference));
      if (!dependency) reportMissing(key, reference);
      else visit(dependency);
    }

    stack.pop();
    states.set(key, 2);
    ordered.push(document);
  };

  const rootReferences = [...new Map(
    (Array.isArray(roots) ? roots : [])
      .filter((root) => root && typeof root === 'object')
      .map((root) => [keyOf(root), root]),
  ).values()].sort(compareByKey);

  for (const root of rootReferences) {
    const document = index.get(keyOf(root));
    if (!document) reportMissing('$root', root);
    else visit(document);
  }

  return { ordered, missing, cycles };
}
