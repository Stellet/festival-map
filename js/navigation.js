export const navigationNodes = [
  { id: 'entrance', x: 380, y: 1000 }, { id: 'tech-lower', x: 285, y: 900 },
  { id: 'tech-exhibitors', x: 235, y: 750 }, { id: 'tech-experience', x: 235, y: 510 },
  { id: 'tech-upper', x: 300, y: 285 }, { id: 'art-lower', x: 395, y: 875 },
  { id: 'art-kids', x: 410, y: 720 }, { id: 'art-interactive', x: 410, y: 500 },
  { id: 'art-upper', x: 420, y: 275 }, { id: 'culture-lower', x: 500, y: 910 },
  { id: 'culture-food', x: 555, y: 790 }, { id: 'culture-medical', x: 555, y: 575 },
  { id: 'culture-upper', x: 535, y: 325 }, { id: 'cross-center', x: 380, y: 640 },
  { id: 'main-stage', x: 445, y: 105 }, { id: 'emergency-exit', x: 665, y: 900 }
];

const connectionData = [
  ['entrance', 'tech-lower', [285, 965], 'main-path'], ['tech-lower', 'tech-exhibitors', [235, 850], 'main-path'],
  ['tech-exhibitors', 'tech-experience', [235, 630], 'main-path'], ['tech-experience', 'tech-upper', [300, 400], 'main-path'],
  ['tech-upper', 'main-stage', [300, 170], 'main-path'], ['entrance', 'art-lower', [395, 950], 'main-path'],
  ['art-lower', 'art-kids', [410, 800], 'main-path'], ['art-kids', 'art-interactive', [410, 610], 'main-path'],
  ['art-interactive', 'art-upper', [420, 390], 'main-path'], ['art-upper', 'main-stage', [445, 185], 'main-path'],
  ['entrance', 'culture-lower', [500, 965], 'main-path'], ['culture-lower', 'culture-food', [555, 850], 'ramp'],
  ['culture-food', 'culture-medical', [555, 680], 'main-path'], ['culture-medical', 'culture-upper', [535, 450], 'main-path'],
  ['culture-upper', 'main-stage', [535, 210], 'ramp'],
  ['tech-exhibitors', 'cross-center', [300, 640], 'corridor'], ['cross-center', 'art-kids', [395, 640], 'corridor'],
  ['tech-experience', 'art-interactive', [320, 500], 'corridor'],
  ['culture-medical', 'tech-experience', [400, 545], 'stairs'],
  ['art-kids', 'emergency-exit', [575, 810], 'building-access'],
  ['art-upper', 'culture-upper', [480, 300], 'corridor'],
  ['cross-center', 'culture-medical', [475, 600], 'corridor']
];

const nodeById = new Map(navigationNodes.map((node) => [node.id, node]));

function curveLength(from, to, control, segments = 16) {
  let length = 0, previous = from;
  for (let index = 1; index <= segments; index += 1) {
    const t = index / segments, inverse = 1 - t;
    const point = { x: inverse * inverse * from.x + 2 * inverse * t * control[0] + t * t * to.x, y: inverse * inverse * from.y + 2 * inverse * t * control[1] + t * t * to.y };
    length += Math.hypot(point.x - previous.x, point.y - previous.y); previous = point;
  }
  return length;
}

function calculateEdgeWeight(edge) {
  const from = nodeById.get(edge.from), to = nodeById.get(edge.to);
  return edge.type === 'ramp'
    ? curveLength(from, to, edge.control)
    : Math.abs(edge.control[0] - from.x) + Math.abs(edge.control[1] - from.y)
      + Math.abs(to.x - edge.control[0]) + Math.abs(to.y - edge.control[1]);
}

export const navigationEdges = connectionData.map(([from, to, control, type], index) => ({
  id: `connection-${index + 1}`, from, to, control: [...control], type, bidirectional: true, weight: 0
}));
navigationEdges.forEach((edge) => { edge.weight = calculateEdgeWeight(edge); });

function edgePath(edge, reverse = false) {
  const from = nodeById.get(edge.from), to = nodeById.get(edge.to);
  if (edge.type === 'ramp') {
    const start = reverse ? to : from, end = reverse ? from : to;
    return `M ${start.x} ${start.y} Q ${edge.control[0]} ${edge.control[1]} ${end.x} ${end.y}`;
  }
  const points = [from, { x: edge.control[0], y: from.y }, { x: edge.control[0], y: edge.control[1] }, { x: to.x, y: edge.control[1] }, to];
  if (reverse) points.reverse();
  return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
}

export function findNearestNavigationNode(x, y) {
  return navigationNodes.reduce((nearest, node) => {
    const distance = Math.hypot(node.x - x, node.y - y);
    return !nearest || distance < nearest.distance ? { node, distance } : nearest;
  }, null)?.node ?? null;
}

export function updateNavigationNode(nodeId, x, y) {
  const node = nodeById.get(nodeId);
  if (!node || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  node.x = x; node.y = y;
  navigationEdges.forEach((edge) => {
    if (edge.from === nodeId || edge.to === nodeId) edge.weight = calculateEdgeWeight(edge);
  });
  return node;
}

export function updateNavigationEdge(edgeId, changes) {
  const edge = navigationEdges.find((item) => item.id === edgeId);
  if (!edge) return null;
  const nextFrom = changes.from && nodeById.has(changes.from) ? changes.from : edge.from;
  const nextTo = changes.to && nodeById.has(changes.to) ? changes.to : edge.to;
  if (nextFrom !== nextTo) { edge.from = nextFrom; edge.to = nextTo; }
  if (['main-path', 'corridor', 'ramp', 'stairs', 'building-access'].includes(changes.type)) edge.type = changes.type;
  if (Number.isFinite(changes.controlX)) edge.control[0] = changes.controlX;
  if (Number.isFinite(changes.controlY)) edge.control[1] = changes.controlY;
  edge.weight = calculateEdgeWeight(edge);
  return edge;
}

export function exportNavigationMesh() {
  return {
    nodes: navigationNodes.map(({ id, x, y }) => ({ id, x, y })),
    connections: navigationEdges.map(({ id, from, to, type, control, bidirectional, weight }) => ({
      id, from, to, type, control: { x: control[0], y: control[1] }, bidirectional, weight
    }))
  };
}

export function renderCirculationPaths(svgDocument) {
  svgDocument.querySelector('#circulation-paths')?.remove();
  const layer = svgDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
  layer.id = 'circulation-paths';
  navigationEdges.forEach((edge) => {
    ['floor', 'line'].forEach((part) => {
      const path = svgDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('class', `circulation-${edge.type}-${part}`);
      path.setAttribute('d', edgePath(edge));
      layer.appendChild(path);
    });
    if (edge.type === 'stairs') {
      const steps = svgDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
      steps.setAttribute('class', 'circulation-stairs-steps');
      steps.setAttribute('d', [-20, -10, 0, 10, 20].map((offset) => `M ${edge.control[0] - 18} ${edge.control[1] + offset} h 36`).join(' '));
      layer.appendChild(steps);
    }
  });
  const content = svgDocument.querySelector('#map-content');
  const firstOverlay = content.querySelector('#navigation-debug, #active-route, .attraction');
  content.insertBefore(layer, firstOverlay);
  return layer;
}

// Compatibilidade temporária com chamadas anteriores.
export const renderNavigationStreets = renderCirculationPaths;

export function findShortestPath(originId, destinationId) {
  if (!nodeById.has(originId) || !nodeById.has(destinationId)) return null;
  const distances = new Map(navigationNodes.map(({ id }) => [id, Infinity]));
  const previous = new Map(), pending = new Set(navigationNodes.map(({ id }) => id));
  distances.set(originId, 0);
  while (pending.size) {
    let current = null;
    pending.forEach((id) => { if (current === null || distances.get(id) < distances.get(current)) current = id; });
    if (current === null || distances.get(current) === Infinity) break;
    pending.delete(current);
    if (current === destinationId) break;
    navigationEdges.forEach((edge) => {
      let neighbor = null;
      if (edge.from === current) neighbor = edge.to;
      else if (edge.bidirectional && edge.to === current) neighbor = edge.from;
      if (!neighbor || !pending.has(neighbor)) return;
      const candidate = distances.get(current) + edge.weight;
      if (candidate < distances.get(neighbor)) { distances.set(neighbor, candidate); previous.set(neighbor, current); }
    });
  }
  if (distances.get(destinationId) === Infinity) return null;
  const path = [];
  for (let current = destinationId; current; current = previous.get(current)) {
    path.unshift(current);
    if (current === originId) break;
  }
  return path[0] === originId ? path : null;
}

export function drawRoute(svgDocument, nodeIds) {
  clearRoute(svgDocument);
  const nodes = nodeIds.map((id) => nodeById.get(id));
  if (!nodes.length) return null;
  const path = svgDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.id = 'active-route';
  const commands = [`M ${nodes[0].x} ${nodes[0].y}`];
  for (let index = 1; index < nodes.length; index += 1) {
    const fromId = nodeIds[index - 1], toId = nodeIds[index];
    const edge = navigationEdges.find((item) => (item.from === fromId && item.to === toId) || (item.bidirectional && item.from === toId && item.to === fromId));
    commands.push(edge ? edgePath(edge, edge.from !== fromId).replace(/^M[^Q]+Q\s*/, 'Q ') : `L ${nodes[index].x} ${nodes[index].y}`);
  }
  path.setAttribute('d', commands.join(' '));
  const content = svgDocument.querySelector('#map-content'), firstAttraction = content.querySelector('.attraction');
  content.insertBefore(path, firstAttraction);
  const origin = svgDocument.createElementNS('http://www.w3.org/2000/svg', 'circle');
  origin.id = 'route-origin-marker'; origin.setAttribute('cx', nodes[0].x); origin.setAttribute('cy', nodes[0].y); origin.setAttribute('r', 14);
  const destination = svgDocument.createElementNS('http://www.w3.org/2000/svg', 'circle');
  destination.id = 'route-destination-marker'; destination.setAttribute('cx', nodes.at(-1).x); destination.setAttribute('cy', nodes.at(-1).y); destination.setAttribute('r', 14);
  content.insertBefore(origin, firstAttraction); content.insertBefore(destination, firstAttraction);
  return path;
}

export function clearRoute(svgDocument) {
  svgDocument?.querySelector('#active-route')?.remove();
  svgDocument?.querySelector('#route-origin-marker')?.remove();
  svgDocument?.querySelector('#route-destination-marker')?.remove();
}

export function renderNavigationGraph(svgDocument, visible) {
  svgDocument.querySelector('#navigation-debug')?.remove();
  const layer = svgDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
  layer.id = 'navigation-debug';
  navigationEdges.forEach((edge) => {
    const path = svgDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', edgePath(edge)); path.dataset.navigationEdgeId = edge.id;
    layer.appendChild(path);
    const control = svgDocument.createElementNS('http://www.w3.org/2000/svg', 'circle');
    control.setAttribute('cx', edge.control[0]); control.setAttribute('cy', edge.control[1]); control.setAttribute('r', 7);
    control.dataset.navigationControlId = edge.id; layer.appendChild(control);
  });
  navigationNodes.forEach((node) => {
    const circle = svgDocument.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', node.x); circle.setAttribute('cy', node.y); circle.setAttribute('r', 9);
    circle.dataset.navigationNodeId = node.id; layer.appendChild(circle);
  });
  const content = svgDocument.querySelector('#map-content');
  content.insertBefore(layer, content.querySelector('#active-route, .attraction'));
  layer.classList.toggle('is-visible', visible);
  return layer;
}
