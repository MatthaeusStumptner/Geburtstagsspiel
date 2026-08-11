function selectionRoute(studio) {
  if (!studio.selection) return '';
  if (studio.selection.kind === 'player') return 'player';
  const target = studio.selectedEntity();
  const identity = target?.id ?? studio.selection.index;
  return identity === undefined || identity === null ? '' : `${studio.selection.kind}:${identity}`;
}

export function routeFromStudio(studio) {
  const route = { levelId: studio.level.id, workspace: studio.workspace };
  if (studio.workspace === 'level') route.selection = selectionRoute(studio);
  else if (studio.workspace === 'objects') {
    route.assetId = studio.selectedAssetId;
    route.selection = selectionRoute(studio);
  } else if (studio.workspace === 'characters') route.selection = selectionRoute(studio);
  else if (studio.workspace === 'events') {
    route.eventId = studio.selectedEventId;
    route.selection = selectionRoute(studio);
  }
  else if (studio.workspace === 'cutscenes') {
    route.cutsceneId = studio.selectedCutsceneId;
    route.trackId = studio.selectedTrackId;
    route.keyframeId = studio.selectedKeyframeId;
  }
  return route;
}

function applySelection(studio, value) {
  studio.selection = null;
  studio.engine.selected = null;
  if (!value) return;
  if (value === 'player') { studio.selectEntity('player', 0); return; }
  const separator = value.indexOf(':');
  if (separator < 1) return;
  const kind = value.slice(0, separator);
  const identity = value.slice(separator + 1);
  const collections = {
    wall: studio.level.board.walls,
    cat: studio.level.actors.cats,
    character: studio.level.actors.characters ?? [],
    decoration: studio.level.decorations,
    'theme-element': studio.level.theme.elements ?? [],
    event: studio.level.events,
  };
  const collection = Object.hasOwn(collections, kind) ? collections[kind] : null;
  if (!collection) return;
  let index = collection.findIndex((entry) => String(entry.id ?? '') === identity);
  if (index < 0 && /^\d+$/.test(identity)) index = Number(identity);
  if (index >= 0 && index < collection.length) studio.selectEntity(kind, index);
}

export function applyStudioRoute(studio, route) {
  if (route.levelId && route.levelId !== studio.level.id) {
    if (studio.draftsList().some((draft) => draft.id === route.levelId)) studio.loadDraft(route.levelId);
    else if (studio.templates().some((level) => level.id === route.levelId)) studio.loadTemplate(route.levelId);
  }
  studio.workspace = route.workspace;
  if (route.assetId && studio.assets.some((asset) => asset.id === route.assetId)) studio.selectedAssetId = route.assetId;
  if (route.eventId && studio.level.events.some((event) => event.id === route.eventId)) studio.selectedEventId = route.eventId;
  if (route.cutsceneId && studio.level.cutscenes.some((cutscene) => cutscene.id === route.cutsceneId)) studio.selectedCutsceneId = route.cutsceneId;
  if (route.trackId && studio.selectedCutscene?.tracks.some((track) => track.id === route.trackId)) studio.selectedTrackId = route.trackId;
  if (route.keyframeId && studio.selectedTrack?.keyframes.some((keyframe) => keyframe.id === route.keyframeId)) studio.selectedKeyframeId = route.keyframeId;
  applySelection(studio, route.selection);
}
