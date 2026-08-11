const nodesByContainer = new WeakMap();
const nodeParts = new WeakMap();
const lastWrittenState = new WeakMap();

function validIndicator(indicator) {
  return indicator
    && typeof indicator.id === 'string'
    && indicator.id.trim() === indicator.id
    && indicator.id.length > 0
    && typeof indicator.hidden === 'boolean'
    && Number.isFinite(indicator.x)
    && Number.isFinite(indicator.y)
    && Number.isFinite(indicator.angle)
    && Number.isFinite(indicator.distance)
    && indicator.distance >= 1
    && typeof indicator.danger === 'boolean'
    && typeof indicator.color === 'string'
    && indicator.color.trim() === indicator.color
    && indicator.color.length > 0;
}

function validRadarState(radarState) {
  if (!radarState || typeof radarState.visible !== 'boolean' || !Array.isArray(radarState.indicators)) return false;
  const ids = new Set();
  for (const indicator of radarState.indicators) {
    if (!validIndicator(indicator) || ids.has(indicator.id)) return false;
    ids.add(indicator.id);
  }
  return true;
}

function removeAllNodes(container, nodes) {
  nodes.forEach((node) => node.remove());
  nodes.clear();
  container.hidden = true;
  container.setAttribute('aria-hidden', 'true');
}

export function resetCatRadarView(container) {
  if (!container || typeof container !== 'object' || !container.ownerDocument) return;
  let nodes = nodesByContainer.get(container);
  if (!nodes) {
    nodes = new Map();
    nodesByContainer.set(container, nodes);
  }
  removeAllNodes(container, nodes);
}

function createIndicator(container, id) {
  const indicator = container.ownerDocument.createElement('div');
  indicator.className = 'cat-indicator';
  indicator.dataset.catId = id;
  indicator.setAttribute('aria-hidden', 'true');

  const arrow = container.ownerDocument.createElement('span');
  arrow.className = 'cat-indicator-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '▲';

  const distance = container.ownerDocument.createElement('small');
  distance.setAttribute('aria-hidden', 'true');
  indicator.append(arrow, distance);
  container.append(indicator);
  nodeParts.set(indicator, { arrow, distance });
  return indicator;
}

function updateIndicator(indicator, state) {
  const { arrow, distance } = nodeParts.get(indicator);
  const previous = lastWrittenState.get(indicator) ?? {};
  indicator.style.transform = `translate3d(${state.x}px, ${state.y}px, 0)`;
  if (state.distance !== previous.distance) distance.textContent = String(state.distance);
  if (state.danger !== previous.danger) indicator.classList.toggle('danger', state.danger);
  if (state.color !== previous.color) indicator.style.setProperty('--cat-color', state.color);
  if (state.angle !== previous.angle) arrow.style.setProperty('--cat-angle', `${state.angle}deg`);
  if (state.hidden !== previous.hidden) indicator.hidden = state.hidden;
  lastWrittenState.set(indicator, {
    distance: state.distance,
    danger: state.danger,
    color: state.color,
    angle: state.angle,
    hidden: state.hidden,
  });
}

export function updateCatRadarView(container, radarState) {
  if (!container || typeof container !== 'object' || !container.ownerDocument) return;
  let nodes = nodesByContainer.get(container);
  if (!nodes) {
    nodes = new Map();
    nodesByContainer.set(container, nodes);
  }
  if (!validRadarState(radarState)) {
    removeAllNodes(container, nodes);
    return;
  }

  const currentIds = new Set(radarState.indicators.map((indicator) => indicator.id));
  for (const [id, node] of nodes) {
    if (!currentIds.has(id)) {
      node.remove();
      nodes.delete(id);
    }
  }

  for (const state of radarState.indicators) {
    let indicator = nodes.get(state.id);
    if (!indicator) {
      indicator = createIndicator(container, state.id);
      nodes.set(state.id, indicator);
    }
    updateIndicator(indicator, state);
  }

  container.hidden = !radarState.visible;
  container.setAttribute('aria-hidden', radarState.visible ? 'false' : 'true');
}
