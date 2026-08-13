const decorationLabel = (item, index) => item.name || item.content?.standard || item.label || `Objekt ${index + 1}`;
const themeLabel = (item) => item.id === 'stage-note' ? 'Zauberberg-Note' : item.id === 'stage-lights' ? 'Bühnenlichter' : item.id;

const workspaceLabels = {
  level: 'Levelbau',
  objects: 'Objektwerkstatt',
  characters: 'Figurenatelier',
  events: 'Ereignisregie',
};

const kindWorkspaces = {
  player: 'characters',
  cat: 'characters',
  character: 'characters',
  decoration: 'objects',
  wall: 'level',
  event: 'events',
  'theme-element': 'objects',
};

export function sceneEntity(level, selection) {
  if (!selection || !level) return null;
  if (selection.kind === 'player') return level.actors.player;
  if (selection.kind === 'cat') return level.actors.cats[selection.index] ?? null;
  if (selection.kind === 'character') return level.actors.characters?.[selection.index] ?? null;
  if (selection.kind === 'decoration') return level.decorations[selection.index] ?? null;
  if (selection.kind === 'wall') return level.board?.walls?.[selection.index] ?? null;
  if (selection.kind === 'event') return level.events[selection.index] ?? null;
  if (selection.kind === 'theme-element') return level.theme.elements?.[selection.index] ?? null;
  return null;
}

export function sceneSelectionKey(level, selection) {
  if (!selection) return '';
  if (selection.kind === 'player') return `player:${level?.actors.player.id || 'player'}`;
  const entity = sceneEntity(level, selection);
  return entity ? `${selection.kind}:${entity.id ?? selection.index}` : '';
}

export function selectionContext(level, selection) {
  if (!selection) return null;
  const entity = sceneEntity(level, selection);
  if (!entity) return null;
  const workspace = kindWorkspaces[selection.kind] ?? 'level';
  const common = {
    selection,
    entity,
    key: sceneSelectionKey(level, selection),
    workspace,
    workspaceLabel: workspaceLabels[workspace],
    primaryTool: '',
    primaryActionLabel: '',
  };

  if (selection.kind === 'player') return {
    ...common, icon: 'FL', kindLabel: 'Spielerfigur', label: 'Franz & Lola',
    detail: 'Steuerung, Position und Sprite',
    hint: 'Alle Eigenschaften dieser Figur sind jetzt direkt im Figurenatelier geöffnet.',
  };
  if (selection.kind === 'cat') return {
    ...common, icon: '◆', kindLabel: 'Katze', label: `Katze ${selection.index + 1}`,
    detail: `${entity.behavior?.strategy || 'Katze'} · Verhalten und Sprite`,
    hint: 'Verhalten, Tempo und Aussehen dieser Katze sind jetzt gemeinsam geöffnet.',
  };
  if (selection.kind === 'character') return {
    ...common, icon: '◉', kindLabel: 'Eigene Figur', label: entity.name || `Figur ${selection.index + 1}`,
    detail: `Levelinstanz · ${Number(entity.scale ?? 1).toFixed(2)}× · Position und Sprite`,
    hint: 'Die platzierte Figur kann direkt im Level gezogen und über ihre Eckgriffe skaliert werden.',
    primaryTool: 'transform', primaryActionLabel: 'Direkt bewegen & skalieren',
  };
  if (selection.kind === 'wall') return {
    ...common, icon: '▦', kindLabel: 'Wand', label: entity.name || `Wand ${selection.index + 1}`,
    detail: `${entity.width}×${entity.height} · Muster und Kollision`,
    hint: 'Die Instanzwerte der Wand stehen im Levelbau ohne weiteren Werkzeugwechsel bereit.',
  };
  if (selection.kind === 'event') return {
    ...common, icon: entity.visual?.label || '!', kindLabel: 'Ereignis', label: entity.name?.standard || 'Ereignis',
    detail: `${entity.trigger?.type || 'Trigger'} · Auslöser, Text und Darstellung`,
    hint: 'Trigger, beide Sprachvarianten und das sichtbare Symbol sind gemeinsam geöffnet.',
    primaryTool: 'event-visual', primaryActionLabel: 'Symbol im Level versetzen',
  };
  if (selection.kind === 'theme-element') return {
    ...common, icon: '◇', kindLabel: 'Systemkulisse', label: themeLabel(entity),
    detail: 'Animation und Wiederverwendung',
    hint: 'Das originale Kulissenelement ist erkannt; seine Animation kann direkt angepasst werden.',
  };

  const isText = entity.type === 'text';
  return {
    ...common, icon: isText ? 'T' : '◆', kindLabel: isText ? 'Textblock' : 'Objekt',
    label: decorationLabel(entity, selection.index),
    detail: isText ? 'Text, Position und Darstellung' : `${entity.layer || 'scenery'} · ${entity.type || 'Objekt'} · Position und Animation`,
    hint: isText ? 'Text und Darstellung sind geöffnet; zum Anordnen steht das passende Transformieren-Werkzeug bereit.' : 'Instanz, Position, Animation und Effekte sind jetzt gemeinsam geöffnet.',
    primaryTool: 'transform', primaryActionLabel: 'Direkt bewegen & skalieren',
  };
}

export function sceneGroups(level) {
  if (!level) return [];
  const node = (kind, index, capabilities = {}) => {
    const context = selectionContext(level, { kind, index });
    return {
      kind, index, key: context.key, label: context.label, detail: context.detail, icon: context.icon,
      canHide: false, canLock: false, canReorder: false, ...capabilities,
    };
  };
  return [
    {
      id: 'actors', label: 'Figuren', icon: 'FL',
      nodes: [
        node('player', 0, { canHide: true }),
        ...level.actors.cats.map((_, index) => node('cat', index, { canHide: true })),
        ...(level.actors.characters ?? []).map((_, index) => node('character', index, { canHide: true })),
      ],
    },
    {
      id: 'walls', label: 'Wände', icon: '▦',
      nodes: (level.board?.walls ?? []).map((_, index) => node('wall', index)),
    },
    {
      id: 'objects', label: 'Objekte & Texte', icon: '◆',
      nodes: level.decorations.map((_, index) => node('decoration', index, { canHide: true, canLock: true, canReorder: true })),
    },
    {
      id: 'events', label: 'Ereignisse', icon: '!',
      nodes: level.events.map((_, index) => node('event', index, { canHide: true })),
    },
    {
      id: 'theme', label: 'Systemkulisse', icon: 'SYS',
      nodes: (level.theme.elements ?? []).map((_, index) => node('theme-element', index)),
    },
  ];
}

const sameTile = (entity, point) => entity && entity.x === point.x && entity.y === point.y;
const contains = (item, point) => item && point.x >= item.x && point.x < item.x + item.width && point.y >= item.y && point.y < item.y + item.height;
export const characterBounds = (character) => {
  if (!character) return null;
  const scale = Math.max(0.5, Math.min(4, Number(character.scale) || 1));
  return { x: character.x + (1 - scale) / 2, y: character.y + (1 - scale) / 2, width: scale, height: scale };
};

export function sceneCandidatesAt(level, point, { hidden = new Set(), themeBounds = () => null } = {}) {
  const candidates = [];
  const add = (kind, index) => {
    const selection = { kind, index };
    if (!hidden.has(sceneSelectionKey(level, selection))) candidates.push(selection);
  };

  if (sameTile(level.actors.player, point)) add('player', 0);
  for (let index = (level.actors.characters?.length ?? 0) - 1; index >= 0; index -= 1) if (contains(characterBounds(level.actors.characters[index]), point)) add('character', index);
  for (let index = level.actors.cats.length - 1; index >= 0; index -= 1) if (sameTile(level.actors.cats[index], point)) add('cat', index);
  for (let index = level.events.length - 1; index >= 0; index -= 1) {
    const visual = level.events[index].visual;
    if (!visual || visual.type === 'none') continue;
    if (Math.abs(visual.x - (point.x + 0.5)) <= 0.75 && Math.abs(visual.y - (point.y + 0.5)) <= 0.75) add('event', index);
  }
  for (let index = level.decorations.length - 1; index >= 0; index -= 1) if (contains(level.decorations[index], point)) add('decoration', index);
  for (let index = (level.theme.elements?.length ?? 0) - 1; index >= 0; index -= 1) {
    const bounds = themeBounds(level.theme.elements[index].id);
    if (contains(bounds, point)) add('theme-element', index);
  }
  for (let index = level.board.walls.length - 1; index >= 0; index -= 1) {
    if (contains(level.board.walls[index], point)) add('wall', index);
  }
  return candidates;
}

export function chooseSceneCandidate(level, candidates, current, cycle = false) {
  if (!candidates.length) return null;
  if (!cycle || !current) return candidates[0];
  const currentKey = sceneSelectionKey(level, current);
  const index = candidates.findIndex((candidate) => sceneSelectionKey(level, candidate) === currentKey);
  return candidates[(index + 1 + candidates.length) % candidates.length];
}

export function workspaceForSelection(selection) {
  return selection ? kindWorkspaces[selection.kind] ?? 'level' : 'level';
}
