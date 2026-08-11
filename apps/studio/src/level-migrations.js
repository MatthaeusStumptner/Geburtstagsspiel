const clone = (value) => JSON.parse(JSON.stringify(value));

const retiredZauberbergNotes = new Set(['zauberberg-note-frei', 'zauberberg-buehnen-note']);
const zauberbergNoteAssets = new Set(['music-note', 'zauberberg-note']);

export function migrateLegacyLevel(level) {
  const migrated = clone(level);
  if (migrated?.id !== 'zauberberg') return migrated;

  const removedDecorations = new Set();
  migrated.decorations = (migrated.decorations ?? []).filter((item) => {
    const remove = retiredZauberbergNotes.has(item.id) || zauberbergNoteAssets.has(item.assetId);
    if (remove) removedDecorations.add(item.id);
    return !remove;
  });
  migrated.events = (migrated.events ?? []).map((event) => {
    if (!zauberbergNoteAssets.has(event.visual?.assetId)) return event;
    const visual = { ...event.visual, type: 'none', label: '', animation: { type: 'none', speed: 1, amplitude: 0 }, effects: [] };
    delete visual.assetId;
    delete visual.appearance;
    delete visual.spriteAnimation;
    return { ...event, visual };
  });
  migrated.cutscenes = (migrated.cutscenes ?? []).map((cutscene) => ({
    ...cutscene,
    tracks: (cutscene.tracks ?? []).filter((track) => track.id !== 'note-solo' && !removedDecorations.has(track.target)),
  }));
  return migrated;
}
