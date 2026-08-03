export const BELL_SEQUENCE = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right'];

function ilzvogelEvent() {
  return {
    id: 'ilzvogel',
    kind: 'easter-egg',
    name: { standard: 'Eisvogel an der Ilz', dialect: 'Eisvogl an da Ilz' },
    message: {
      standard: 'Donnerwetter, ein Eisvogel an der Ilz!',
      dialect: 'Sakradi, a Eisvogl an da Ilz!',
    },
    reward: 150,
    scope: 'global',
    trigger: {
      type: 'zone',
      zones: [
        { x: 0, y: 12, width: 2, height: 1 },
        { x: 23, y: 12, width: 2, height: 1 },
      ],
    },
    visual: {
      type: 'kingfisher', x: 0.375, y: 6, color: '#31b7cf', accent: '#f1d05c', label: '◆', visibility: 'after-trigger',
    },
  };
}

function hundewieseEvent() {
  return {
    id: 'hundewiese',
    kind: 'easter-egg',
    name: { standard: 'Lolas Lieblingsplatz', dialect: "D'Lolas Lieblingsplatzerl" },
    message: {
      standard: 'Lola hat ihren Lieblingsplatz gefunden!',
      dialect: "Ja mei, d'Lola hod ihr Lieblingsplatzerl gfundn!",
    },
    reward: 100,
    scope: 'global',
    trigger: { type: 'zone', zones: [{ x: 10, y: 10, width: 5, height: 5 }] },
    visual: {
      type: 'paw', x: 12.5, y: 12.2, color: '#75a27c', accent: '#f5c451', label: '◆', visibility: 'after-trigger',
    },
  };
}

function kirchenglocknEvent() {
  return {
    id: 'kirchenglockn',
    kind: 'easter-egg',
    name: { standard: 'Passauer Kirchenglocken', dialect: 'Passauer Kirchenglockn' },
    message: {
      standard: 'Bim bam! Die Passauer Glocken läuten nur für euch.',
      dialect: "Bim bam! D'Passauer Glockn läutn bloß für eich.",
    },
    reward: 250,
    scope: 'global',
    trigger: { type: 'direction-sequence', sequence: [...BELL_SEQUENCE] },
    visual: {
      type: 'bell', x: 12.5, y: 0.5, color: '#8f6c2e', accent: '#f5c451', label: '◆', visibility: 'after-trigger',
    },
  };
}

export function eventsForLocation(location) {
  const events = [];
  if (location.river.includes('ILZ')) events.push(ilzvogelEvent());
  if (location.home || location.theme === 'bschuett') events.push(hundewieseEvent());
  if (['dom', 'oberhaus'].includes(location.id)) events.push(kirchenglocknEvent());
  return events;
}
