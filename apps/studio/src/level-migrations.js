const clone = (value) => JSON.parse(JSON.stringify(value));

const retiredZauberbergNotes = new Set(['zauberberg-note-frei', 'zauberberg-buehnen-note']);

export function migrateLegacyLevel(level) {
  const migrated = clone(level);
  if (migrated?.id !== 'zauberberg') return migrated;

  migrated.decorations = (migrated.decorations ?? []).filter((item) => !retiredZauberbergNotes.has(item.id));
  migrated.events = (migrated.events ?? []).map((event) => {
    if (event.id !== 'zugabe' || event.visual?.assetId !== 'zauberberg-note') return event;
    const visual = { ...event.visual, type: 'none', label: '', animation: { type: 'none', speed: 1, amplitude: 0 }, effects: [] };
    delete visual.assetId;
    delete visual.appearance;
    delete visual.spriteAnimation;
    return { ...event, visual };
  });
  migrated.cutscenes = (migrated.cutscenes ?? []).map((cutscene) => ({
    ...cutscene,
    tracks: (cutscene.tracks ?? []).filter((track) => track.id !== 'note-solo' && !retiredZauberbergNotes.has(track.target)),
  }));
  return migrated;
}
