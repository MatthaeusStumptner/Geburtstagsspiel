function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const entry of Object.values(value)) deepFreeze(entry);
  return value;
}

export const legacyObjectV1 = deepFreeze({
  kind: 'franz-lola-content',
  schemaVersion: 1,
  type: 'object',
  id: 'briefkasten',
  name: 'Briefkasten',
  description: '',
  document: {
    id: 'briefkasten',
    name: 'Briefkasten',
    type: 'custom',
    width: 2,
    height: 2,
  },
  dependencies: [],
});

export const eventV2 = deepFreeze({
  kind: 'franz-lola-content',
  schemaVersion: 2,
  type: 'event',
  id: 'eisvogel',
  name: 'Eisvogel',
  description: '',
  document: {
    id: 'eisvogel',
    kind: 'easter-egg',
    name: { standard: 'Eisvogel', dialect: 'Eisvogl' },
    message: { standard: 'Gefunden!', dialect: 'Gfundn!' },
    reward: 100,
    scope: 'global',
    trigger: {
      type: 'time',
      zones: [{ x: 1, y: 1, width: 1, height: 1 }],
      sequence: [],
      seconds: 1,
    },
    visual: {
      type: 'kingfisher',
      x: 0.375,
      y: 6,
      color: '#55d9dd',
      accent: '#f5c451',
      label: '◆',
      visibility: 'after-trigger',
      assetId: '',
      appearance: null,
      spriteAnimation: '',
      animation: {
        type: 'none',
        speed: 1,
        amplitude: 0.15,
        duration: 1,
        loop: true,
        keyframes: [],
      },
      effects: [],
    },
  },
  dependencies: [],
  references: [],
});
