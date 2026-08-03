export const navigationNodes = [
  { id: 'entrance', x: 600, y: 720 }, { id: 'tech-lower', x: 510, y: 665 },
  { id: 'tech-exhibitors', x: 430, y: 570 }, { id: 'tech-experience', x: 545, y: 365 },
  { id: 'tech-upper', x: 650, y: 235 }, { id: 'art-lower', x: 710, y: 675 },
  { id: 'art-kids', x: 825, y: 590 }, { id: 'art-interactive', x: 820, y: 400 },
  { id: 'art-upper', x: 750, y: 250 }, { id: 'culture-lower', x: 470, y: 720 },
  { id: 'culture-food', x: 335, y: 640 }, { id: 'culture-medical', x: 310, y: 445 },
  { id: 'culture-upper', x: 500, y: 300 }, { id: 'cross-center', x: 600, y: 520 },
  { id: 'main-stage', x: 700, y: 140 }, { id: 'emergency-exit', x: 1030, y: 690 }
];

const nodeById = new Map(navigationNodes.map((node) => [node.id, node]));
const connections = [
  { from: 'entrance', to: 'tech-lower', control: [555, 700] }, { from: 'tech-lower', to: 'tech-exhibitors', control: [455, 635] },
  { from: 'tech-exhibitors', to: 'tech-experience', control: [470, 455] }, { from: 'tech-experience', to: 'tech-upper', control: [600, 290] },
  { from: 'tech-upper', to: 'main-stage', control: [690, 185] },
  { from: 'entrance', to: 'art-lower', control: [655, 705] }, { from: 'art-lower', to: 'art-kids', control: [790, 665] },
  { from: 'art-kids', to: 'art-interactive', control: [875, 490] }, { from: 'art-interactive', to: 'art-upper', control: [790, 315] },
  { from: 'art-upper', to: 'main-stage', control: [720, 190] },
  { from: 'entrance', to: 'culture-lower', control: [535, 750] }, { from: 'culture-lower', to: 'culture-food', control: [375, 710] },
  { from: 'culture-food', to: 'culture-medical', control: [270, 545] }, { from: 'culture-medical', to: 'culture-upper', control: [390, 385] },
  { from: 'culture-upper', to: 'main-stage', control: [590, 225] },
  { from: 'tech-exhibitors', to: 'cross-center', control: [515, 525] }, { from: 'cross-center', to: 'art-kids', control: [720, 530] },
  { from: 'tech-experience', to: 'art-interactive', control: [680, 420] },
  { from: 'culture-medical', to: 'tech-experience', control: [430, 485] }, { from: 'art-kids', to: 'emergency-exit', control: [930, 625] }
];

function distance(from, to) { return Math.hypot(to.x - from.x, to.y - from.y); }

export const navigationEdges = connections.map(({ from, to, control }) => ({
  from, to, control, bidirectional: true, weight: distance(nodeById.get(from), nodeById.get(to))
}));

export function findShortestPath(originId, destinationId) {
  if (!nodeById.has(originId) || !nodeById.has(destinationId)) return null;
  const distances = new Map(navigationNodes.map(({ id }) => [id, Infinity]));
  const previous = new Map();
  const pending = new Set(navigationNodes.map(({ id }) => id));
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
    commands.push(edge?.control ? `Q ${edge.control[0]} ${edge.control[1]} ${nodes[index].x} ${nodes[index].y}` : `L ${nodes[index].x} ${nodes[index].y}`);
  }
  path.setAttribute('d', commands.join(' '));
  const content = svgDocument.querySelector('#map-content');
  content.insertBefore(path, content.querySelector('.attraction'));
  const origin = svgDocument.createElementNS('http://www.w3.org/2000/svg', 'circle');
  origin.id = 'route-origin-marker'; origin.setAttribute('cx', nodes[0].x); origin.setAttribute('cy', nodes[0].y); origin.setAttribute('r', 14);
  const destination = svgDocument.createElementNS('http://www.w3.org/2000/svg', 'circle');
  destination.id = 'route-destination-marker'; destination.setAttribute('cx', nodes.at(-1).x); destination.setAttribute('cy', nodes.at(-1).y); destination.setAttribute('r', 14);
  content.insertBefore(origin, content.querySelector('.attraction'));
  content.insertBefore(destination, content.querySelector('.attraction'));
  return path;
}

export function clearRoute(svgDocument) {
  svgDocument?.querySelector('#active-route')?.remove();
  svgDocument?.querySelector('#route-origin-marker')?.remove();
  svgDocument?.querySelector('#route-destination-marker')?.remove();
}

export function renderNavigationGraph(svgDocument, visible, onNodeSelect) {
  let layer = svgDocument.querySelector('#navigation-debug');
  if (!layer) {
    layer = svgDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
    layer.id = 'navigation-debug';
    navigationEdges.forEach((edge) => {
      const from = nodeById.get(edge.from), to = nodeById.get(edge.to);
      const line = svgDocument.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', from.x); line.setAttribute('y1', from.y); line.setAttribute('x2', to.x); line.setAttribute('y2', to.y);
      layer.appendChild(line);
    });
    navigationNodes.forEach((node) => {
      const circle = svgDocument.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', node.x); circle.setAttribute('cy', node.y); circle.setAttribute('r', 9);
      circle.dataset.navigationNodeId = node.id;
      circle.addEventListener('pointerdown', (event) => {
        event.preventDefault(); event.stopImmediatePropagation(); onNodeSelect?.(node.id);
      });
      layer.appendChild(circle);
    });
    const content = svgDocument.querySelector('#map-content');
    content.insertBefore(layer, content.querySelector('.attraction'));
  }
  layer.classList.toggle('is-visible', visible);
}
