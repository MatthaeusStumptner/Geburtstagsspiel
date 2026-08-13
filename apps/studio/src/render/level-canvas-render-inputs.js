export function levelCanvasRenderInputs(studio) {
  return Object.freeze({
    revision: studio.revision,
    sceneRevision: studio.sceneRevision,
    level: studio.level,
    editorLevel: studio.editorLevel,
    workspace: studio.workspace,
    language: studio.language,
    tool: studio.tool,
    showGrid: studio.showGrid,
    showGuttis: studio.showGuttis,
    showEvents: studio.showEvents,
    difficulty: studio.difficulty,
    pellets: studio.pellets,
    selection: studio.selection,
    selections: studio.selections,
    cursor: studio.cursor,
    viewportZoom: studio.viewportZoom,
    viewportCenter: studio.viewportCenter,
    playerHidden: Boolean(studio.isSceneHidden?.('player', 0)),
  });
}
