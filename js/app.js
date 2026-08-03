import { loadAttractions, POINT_TYPES, getPointType, getTypesInState } from './attractions.js';
import { MapController } from './map-controller.js';
import {
  navigationNodes, navigationEdges, findNearestNavigationNode, findShortestPath,
  updateNavigationNode, updateNavigationEdge, exportNavigationMesh,
  drawRoute, clearRoute, renderNavigationGraph, renderCirculationPaths
} from './navigation.js';
import { renderTypeFilters, openDetails, closeDetails } from './ui.js';
import { loadAreas, findContainingArea, clampPointToArea, synchronizeAreaMemberships } from './areas.js';

const APP_VERSION = {
  number: '0.1.21',
  updatedAt: '03/08/2026 · 08:40'
};

let debugMode = new URLSearchParams(window.location.search).get('debug') === 'true';

const viewport = document.querySelector('#mapViewport');
const mapObject = document.querySelector('#festivalMap');
const detailSheet = document.querySelector('#detailSheet');
const status = document.querySelector('#mapStatus');
const searchInput = document.querySelector('#searchInput');
const fullDetailSheet = document.querySelector('#fullDetailSheet');

const mapController = new MapController(viewport);
let attractions = [];
let areas = [];
let selectedAttraction = null;
let svgDocument = null;
let activeType = 'all';
let mapIsBound = false;
let debugSelection = null;
let debugDrag = null;
let meshDrag = null;
let selectedNavigationEdgeId = null;
let currentLocationNodeId = null;
let activeDestination = null;
let selectedArea = null;
let areaDrag = null;
let floorPlanUrl = null;
const floorPlan = { x: 0, y: 0, scale: 1, opacity: 0.5 };
let currentLocationDrag = null;
let isDraggingCurrentLocation = false;
let creatingPoint = true;
const CURRENT_LOCATION_STORAGE_KEY = 'festival-map.current-location';
const EXTERNAL_LINK_TYPES = [
  { id: 'site', label: 'Site', icon: '↗' },
  { id: 'instagram', label: 'Instagram', icon: '◎' },
  { id: 'facebook', label: 'Facebook', icon: 'f' },
  { id: 'youtube', label: 'YouTube', icon: '▶' },
  { id: 'tiktok', label: 'TikTok', icon: '♪' },
  { id: 'twitter', label: 'X/Twitter', icon: '𝕏' },
  { id: 'whatsapp', label: 'WhatsApp', icon: '☏' },
  { id: 'other', label: 'Outro link', icon: '↗' }
];

const MARKER_COLORS = {
  'main-stage': '#8b5cf6', 'alternative-stage': '#fb7185', 'food-court': '#d99f08',
  restrooms: '#168db5', medical: '#e25555', 'kids-area': '#db4f8c', exhibitors: '#0e9f9a',
  'main-entrance': '#2c9b64', 'emergency-exit': '#fb7185', 'you-are-here': '#172033'
};

const EDITABLE_POINT_TYPES = POINT_TYPES.filter((type) => !type.system);
const AREA_COLORS = {
  'main-stage-area': '#55436b',
  'creative-area': '#36546b',
  'experience-area': '#4e4567',
  'services-area': '#315b5d',
  'activities-area': '#655442',
  'food-area': '#4d6047',
  'access-area': '#65474f'
};

function updateAttractionPosition(attraction) {
  const element = svgDocument.querySelector(`[data-attraction-id="${attraction.id}"]`);
  element?.setAttribute('transform', `translate(${attraction.x} ${attraction.y})`);
  const textGroup = svgDocument.querySelector(`[data-point-text-id="${attraction.id}"]`);
  textGroup?.setAttribute('transform', `translate(${attraction.x} ${attraction.y})`);
}

function ensureMapLabelsLayer() {
  const content = svgDocument.querySelector('#map-content');
  let layer = svgDocument.querySelector('#map-labels');
  if (!layer) {
    layer = svgDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
    layer.id = 'map-labels';
    layer.setAttribute('aria-hidden', 'true');
  }
  content.appendChild(layer);
  return layer;
}

function getArea(areaId) {
  return areas.find((area) => area.id === areaId) ?? null;
}

function persistCurrentLocation(marker) {
  try {
    localStorage.setItem(CURRENT_LOCATION_STORAGE_KEY, JSON.stringify({
      x: marker.x,
      y: marker.y,
      navigationNodeId: currentLocationNodeId
    }));
  } catch { /* Persistência pode estar indisponível em modo privado. */ }
}

function restoreCurrentLocation(marker) {
  try {
    const saved = JSON.parse(localStorage.getItem(CURRENT_LOCATION_STORAGE_KEY));
    if (!saved || !Number.isFinite(saved.x) || !Number.isFinite(saved.y)) return;
    marker.x = Math.min(739, Math.max(21, saved.x));
    marker.y = Math.min(1079, Math.max(21, saved.y));
    if (navigationNodes.some((node) => node.id === saved.navigationNodeId)) marker.navigationNodeId = saved.navigationNodeId;
  } catch { /* Mantém a posição original quando o estado não é válido. */ }
}

function renderFloorPlan() {
  svgDocument.querySelector('#floor-plan-layer')?.remove();
  if (!floorPlanUrl) return;
  const image = svgDocument.createElementNS('http://www.w3.org/2000/svg', 'image');
  image.id = 'floor-plan-layer';
  image.setAttribute('href', floorPlanUrl);
  image.setAttribute('x', floorPlan.x);
  image.setAttribute('y', floorPlan.y);
  image.setAttribute('width', 760);
  image.setAttribute('height', 1100);
  image.setAttribute('opacity', floorPlan.opacity);
  image.setAttribute('transform', `translate(${floorPlan.x} ${floorPlan.y}) scale(${floorPlan.scale}) translate(${-floorPlan.x} ${-floorPlan.y})`);
  const content = svgDocument.querySelector('#map-content');
  content.insertBefore(image, content.children[2] ?? null);
}

function renderAreas() {
  svgDocument.querySelector('#map-areas')?.remove();
  svgDocument.querySelector('#area-labels')?.remove();
  const layer = svgDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
  layer.id = 'map-areas';
  const labelLayer = svgDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
  labelLayer.id = 'area-labels';
  areas.forEach((area) => {
    const group = svgDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.classList.add('map-area');
    group.dataset.areaId = area.id;
    group.classList.toggle('is-selected', area.id === selectedArea?.id);
    const shape = svgDocument.createElementNS('http://www.w3.org/2000/svg', 'rect');
    shape.classList.add('map-area-shape');
    shape.setAttribute('x', area.x); shape.setAttribute('y', area.y);
    shape.setAttribute('width', area.width); shape.setAttribute('height', area.height); shape.setAttribute('rx', 18);
    shape.setAttribute('fill', AREA_COLORS[area.id] ?? '#465064');
    const label = svgDocument.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.classList.add('map-area-label');
    label.setAttribute('x', area.x + area.width / 2); label.setAttribute('y', area.y + 22);
    label.setAttribute('stroke', AREA_COLORS[area.id] ?? '#465064');
    label.textContent = area.name.toUpperCase();
    group.appendChild(shape); layer.appendChild(group); labelLayer.appendChild(label);
  });
  const content = svgDocument.querySelector('#map-content');
  content.insertBefore(layer, content.querySelector('#circulation-paths, #navigation-debug, #active-route, .attraction'));
  ensureMapLabelsLayer().prepend(labelLayer);
}

function moveOrResizeArea(area, next) {
  const previous = { x: area.x, y: area.y, width: area.width, height: area.height };
  const pointPositions = attractions.filter((point) => point.areaId === area.id).map((point) => ({
    point,
    relativeX: previous.width ? (point.x - previous.x) / previous.width : 0.5,
    relativeY: previous.height ? (point.y - previous.y) / previous.height : 0.5
  }));
  const areaNodeIds = [...new Set([...area.entryNodeIds, ...area.exitNodeIds])];
  const nodePositions = areaNodeIds.map((nodeId) => navigationNodes.find((node) => node.id === nodeId)).filter(Boolean).map((node) => ({
    node,
    relativeX: previous.width ? (node.x - previous.x) / previous.width : 0.5,
    relativeY: previous.height ? (node.y - previous.y) / previous.height : 0.5
  }));
  Object.assign(area, next);
  pointPositions.forEach(({ point, relativeX, relativeY }) => {
    point.x = area.x + relativeX * area.width;
    point.y = area.y + relativeY * area.height;
    clampPointToArea(point, area);
    updateAttractionPosition(point);
  });
  nodePositions.forEach(({ node, relativeX, relativeY }) => {
    updateNavigationNode(node.id, area.x + relativeX * area.width, area.y + relativeY * area.height);
  });
  renderAreas();
  refreshNavigationMesh();
}

function calculateActiveRoute() {
  if (!activeDestination) return;
  const destinationArea = getArea(activeDestination.areaId);
  const destinationNodeId = activeDestination.navigationNodeId ?? destinationArea?.entryNodeIds[0] ?? null;
  if (!currentLocationNodeId || !destinationNodeId) {
    clearRoute(svgDocument);
    status.textContent = 'Rota indisponível: origem ou destino sem nó de navegação.';
    return;
  }
  const shortestPath = findShortestPath(currentLocationNodeId, destinationNodeId);
  if (!shortestPath) {
    clearRoute(svgDocument);
    status.textContent = 'Não foi possível encontrar uma rota até este ponto de interesse.';
    return;
  }
  const currentMarker = attractions.find((item) => item.id === 'you-are-here');
  drawRoute(svgDocument, shortestPath, { x: activeDestination.x, y: activeDestination.y }, currentMarker);
  svgDocument.querySelectorAll('.attraction').forEach((node) => node.classList.remove('selected'));
  svgDocument.querySelector(`[data-attraction-id="${activeDestination.id}"]`)?.classList.add('selected');
  status.textContent = `Rota destacada até ${activeDestination.name}.`;
}

function setCurrentLocation(nodeId, { moveMarker = true, persist = true } = {}) {
  if (isDraggingCurrentLocation) return;
  const node = navigationNodes.find((item) => item.id === nodeId);
  const marker = attractions.find((item) => item.id === 'you-are-here');
  if (!node || !marker) return;
  currentLocationNodeId = node.id;
  marker.navigationNodeId = node.id;
  if (moveMarker) {
    marker.x = node.x;
    marker.y = node.y;
  }
  updateAttractionPosition(marker);
  if (debugSelection?.id === marker.id) selectDebugAttraction(marker);
  const selector = document.querySelector('#debugOriginNode');
  if (selector) selector.value = node.id;
  if (persist) persistCurrentLocation(marker);
  calculateActiveRoute();
}

function snapCurrentLocationToNearest() {
  const marker = attractions.find((item) => item.id === 'you-are-here');
  if (!marker) return;
  const nearest = findNearestNavigationNode(marker.x, marker.y);
  if (nearest) setCurrentLocation(nearest.id);
}

function setPointEditorFields(point) {
  document.querySelector('#debugName').value = point?.name ?? '';
  document.querySelector('#debugPointDescription').value = point?.description ?? '';
  document.querySelector('#debugPointCategory').value = point?.categoryLabel ?? '';
  document.querySelector('#debugPointSchedule').value = point?.schedule ?? '';
  document.querySelector('#debugPointLocation').value = point?.complementaryLocation ?? '';
  EXTERNAL_LINK_TYPES.forEach(({ id }) => {
    const fieldId = `#debugLink${id[0].toUpperCase()}${id.slice(1)}`;
    document.querySelector(fieldId).value = point?.links?.[id] ?? '';
  });
}

function selectDebugAttraction(attraction) {
  debugSelection = attraction;
  svgDocument.querySelectorAll('.attraction').forEach((node) => node.classList.remove('debug-selected'));
  if (!attraction) {
    document.querySelector('#debugAttractionList').value = '';
    document.querySelector('#debugDelete').disabled = true;
    document.querySelector('#debugPointArea').value = '';
    return;
  }
  creatingPoint = false;
  svgDocument.querySelector(`[data-attraction-id="${attraction.id}"]`)?.classList.add('debug-selected');
  document.querySelector('#debugAttractionList').value = attraction.id;
  document.querySelector('#debugDelete').disabled = attraction.id === 'you-are-here';
  document.querySelector('#debugPointArea').value = attraction.areaId;
  setPointEditorFields(attraction);
}

function refreshAttractionList() {
  const list = document.querySelector('#debugAttractionList');
  list.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Selecione um ponto';
  list.appendChild(placeholder);
  attractions.forEach((attraction) => {
    const option = document.createElement('option');
    option.value = attraction.id;
    option.textContent = attraction.name;
    list.appendChild(option);
  });
  list.value = debugSelection?.id ?? '';
}

function createAttractionElement(attraction) {
  const namespace = 'http://www.w3.org/2000/svg';
  const group = svgDocument.createElementNS(namespace, 'g');
  group.setAttribute('class', 'attraction');
  if (attraction.id === 'you-are-here') group.classList.add('current-location');
  group.setAttribute('data-id', attraction.id);
  group.setAttribute('data-attraction-id', attraction.id);
  group.setAttribute('tabindex', '0');
  group.setAttribute('role', 'button');
  group.setAttribute('aria-label', attraction.name);
  const isCurrentLocation = attraction.id === 'you-are-here';
  group.innerHTML = `<circle class="attraction-hit-area" cx="0" cy="0" r="${isCurrentLocation ? 30 : 27}"></circle><circle class="attraction-marker" cx="0" cy="0" r="${isCurrentLocation ? 21 : 16}"></circle>`;
  group.querySelector('.attraction-marker').setAttribute('fill', attraction.color ?? MARKER_COLORS[attraction.id] ?? '#8b5cf6');
  svgDocument.querySelector('#map-content').appendChild(group);
  const textGroup = svgDocument.createElementNS(namespace, 'g');
  textGroup.dataset.pointTextId = attraction.id;
  textGroup.classList.add('point-text');
  if (isCurrentLocation) textGroup.classList.add('current-location-text');
  const icon = svgDocument.createElementNS(namespace, 'text');
  icon.classList.add('attraction-icon');
  icon.setAttribute('x', 0); icon.setAttribute('y', 0); icon.textContent = attraction.icon;
  const label = svgDocument.createElementNS(namespace, 'text');
  label.classList.add('attraction-label');
  label.dataset.pointLabelId = attraction.id;
  label.setAttribute('x', 0);
  label.setAttribute('y', isCurrentLocation ? -31 : -27);
  label.textContent = attraction.name.toUpperCase();
  textGroup.append(icon, label);
  ensureMapLabelsLayer().appendChild(textGroup);
  updateAttractionPosition(attraction);
  group.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (debugMode) selectDebugAttraction(attraction);
    else selectAttraction(attraction);
  });
  return group;
}

function updateAttractionContent(attraction) {
  const element = svgDocument.querySelector(`[data-attraction-id="${attraction.id}"]`);
  element.setAttribute('aria-label', attraction.name);
  svgDocument.querySelector(`[data-point-label-id="${attraction.id}"]`).textContent = attraction.name.toUpperCase();
  svgDocument.querySelector(`[data-point-text-id="${attraction.id}"] .attraction-icon`).textContent = attraction.icon;
}

function getMapPoint(event) {
  const mapContent = svgDocument.querySelector('#map-content');
  const point = svgDocument.documentElement.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(mapContent.getScreenCTM().inverse());
}

function populateConnectionFields(edge) {
  selectedNavigationEdgeId = edge?.id ?? null;
  document.querySelector('#debugConnectionList').value = edge?.id ?? '';
  document.querySelector('#debugConnectionFrom').value = edge?.from ?? '';
  document.querySelector('#debugConnectionTo').value = edge?.to ?? '';
  document.querySelector('#debugConnectionType').value = edge?.type ?? 'main-path';
  document.querySelector('#debugControlX').value = edge?.control[0] ?? '';
  document.querySelector('#debugControlY').value = edge?.control[1] ?? '';
  svgDocument.querySelectorAll('[data-navigation-edge-id]').forEach((element) => {
    element.classList.toggle('is-selected', element.dataset.navigationEdgeId === selectedNavigationEdgeId);
  });
}

function updateAttractionsForNode(nodeId) {
  const node = navigationNodes.find((item) => item.id === nodeId);
  if (!node) return;
  attractions.filter((item) => item.navigationNodeId === nodeId).forEach((attraction) => {
    attraction.x = node.x;
    attraction.y = node.y;
    const area = getArea(attraction.areaId);
    if (area) clampPointToArea(attraction, area);
    updateAttractionPosition(attraction);
    if (debugSelection?.id === attraction.id) selectDebugAttraction(attraction);
  });
}

function refreshNavigationMesh() {
  renderCirculationPaths(svgDocument);
  renderNavigationGraph(svgDocument, debugMode);
  populateConnectionFields(navigationEdges.find((edge) => edge.id === selectedNavigationEdgeId));
  calculateActiveRoute();
}

function safelyCapturePointer(svgRoot, pointerId) {
  try { svgRoot.setPointerCapture(pointerId); } catch { /* O SVG pode ter sido refeito durante o gesto. */ }
}

function safelyReleasePointer(svgRoot, pointerId) {
  try { if (svgRoot.hasPointerCapture(pointerId)) svgRoot.releasePointerCapture(pointerId); } catch { /* Captura já liberada. */ }
}

function bindNavigationMeshEditing(svgRoot) {
  svgRoot.addEventListener('pointerdown', (event) => {
    if (!debugMode || meshDrag) return;
    const nodeElement = event.target.closest?.('[data-navigation-node-id]');
    const controlElement = event.target.closest?.('[data-navigation-control-id]');
    const edgeElement = event.target.closest?.('[data-navigation-edge-id]');
    if (!nodeElement && !controlElement && !edgeElement) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (edgeElement) populateConnectionFields(navigationEdges.find((edge) => edge.id === edgeElement.dataset.navigationEdgeId));
    if (!nodeElement && !controlElement) return;
    meshDrag = {
      kind: nodeElement ? 'node' : 'control',
      id: nodeElement?.dataset.navigationNodeId ?? controlElement.dataset.navigationControlId,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      moved: false
    };
    if (controlElement) populateConnectionFields(navigationEdges.find((edge) => edge.id === meshDrag.id));
    safelyCapturePointer(svgRoot, event.pointerId);
  }, true);

  svgRoot.addEventListener('pointermove', (event) => {
    if (!meshDrag || event.pointerId !== meshDrag.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (Math.hypot(event.clientX - meshDrag.clientX, event.clientY - meshDrag.clientY) <= 6 && !meshDrag.moved) return;
    meshDrag.moved = true;
    const point = getMapPoint(event);
    if (meshDrag.kind === 'node') {
      updateNavigationNode(meshDrag.id, Math.round(point.x), Math.round(point.y));
      updateAttractionsForNode(meshDrag.id);
    } else {
      updateNavigationEdge(meshDrag.id, { controlX: Math.round(point.x), controlY: Math.round(point.y) });
    }
    refreshNavigationMesh();
  }, true);

  const finishMeshDrag = (event) => {
    if (!meshDrag || event.pointerId !== meshDrag.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    safelyReleasePointer(svgRoot, event.pointerId);
    if (meshDrag.kind === 'node' && !meshDrag.moved) setCurrentLocation(meshDrag.id);
    meshDrag = null;
  };
  svgRoot.addEventListener('pointerup', finishMeshDrag, true);
  svgRoot.addEventListener('pointercancel', finishMeshDrag, true);
}

function bindCurrentLocationDragging(svgRoot) {
  svgRoot.addEventListener('pointerdown', (event) => {
    const element = event.target.closest?.('[data-attraction-id="you-are-here"]');
    if (!element || currentLocationDrag) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    currentLocationDrag = {
      pointerId: event.pointerId,
      start: getMapPoint(event),
      clientX: event.clientX,
      clientY: event.clientY,
      marker: attractions.find((item) => item.id === 'you-are-here'),
      x: attractions.find((item) => item.id === 'you-are-here').x,
      y: attractions.find((item) => item.id === 'you-are-here').y,
      moved: false,
      element
    };
    isDraggingCurrentLocation = true;
    safelyCapturePointer(svgRoot, event.pointerId);
  }, true);

  svgRoot.addEventListener('pointermove', (event) => {
    if (!currentLocationDrag || event.pointerId !== currentLocationDrag.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!currentLocationDrag.moved && Math.hypot(event.clientX - currentLocationDrag.clientX, event.clientY - currentLocationDrag.clientY) <= 6) return;
    currentLocationDrag.moved = true;
    currentLocationDrag.element.classList.add('is-location-dragging');
    const point = getMapPoint(event);
    currentLocationDrag.marker.x = Math.min(739, Math.max(21, Math.round(currentLocationDrag.x + point.x - currentLocationDrag.start.x)));
    currentLocationDrag.marker.y = Math.min(1079, Math.max(21, Math.round(currentLocationDrag.y + point.y - currentLocationDrag.start.y)));
    const nearest = findNearestNavigationNode(currentLocationDrag.marker.x, currentLocationDrag.marker.y);
    if (nearest) {
      currentLocationNodeId = nearest.id;
      currentLocationDrag.marker.navigationNodeId = nearest.id;
      const selector = document.querySelector('#debugOriginNode');
      if (selector) selector.value = nearest.id;
    }
    updateAttractionPosition(currentLocationDrag.marker);
    calculateActiveRoute();
  }, true);

  const finish = (event) => {
    if (!currentLocationDrag || event.pointerId !== currentLocationDrag.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    safelyReleasePointer(svgRoot, event.pointerId);
    currentLocationDrag.element.classList.remove('is-location-dragging');
    if (currentLocationDrag.moved) {
      persistCurrentLocation(currentLocationDrag.marker);
      calculateActiveRoute();
    }
    currentLocationDrag = null;
    isDraggingCurrentLocation = false;
  };
  svgRoot.addEventListener('pointerup', finish, true);
  svgRoot.addEventListener('pointercancel', finish, true);
}

function bindDebugDragging(svgRoot) {
  svgRoot.addEventListener('pointerdown', (event) => {
    if (!debugMode) return;
    const element = event.target.closest?.('[data-attraction-id]');
    if (!element) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (debugDrag) return;
    const attraction = attractions.find((item) => item.id === element.dataset.attractionId);
    if (!attraction) return;
    selectDebugAttraction(attraction);
    safelyCapturePointer(svgRoot, event.pointerId);
    debugDrag = {
      pointerId: event.pointerId,
      start: getMapPoint(event),
      clientX: event.clientX,
      clientY: event.clientY,
      x: attraction.x,
      y: attraction.y,
      attraction,
      element,
      moved: false
    };
  });

  svgRoot.addEventListener('pointermove', (event) => {
    if (!debugDrag || event.pointerId !== debugDrag.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (Math.hypot(event.clientX - debugDrag.clientX, event.clientY - debugDrag.clientY) > 6) {
      debugDrag.moved = true;
      debugDrag.element.classList.add('debug-dragging');
    }
    if (!debugDrag.moved) return;
    const point = getMapPoint(event);
    debugDrag.attraction.x = Math.round(debugDrag.x + point.x - debugDrag.start.x);
    debugDrag.attraction.y = Math.round(debugDrag.y + point.y - debugDrag.start.y);
    const area = getArea(debugDrag.attraction.areaId);
    if (area) clampPointToArea(debugDrag.attraction, area);
    updateAttractionPosition(debugDrag.attraction);
    selectDebugAttraction(debugDrag.attraction);
    debugDrag.element.classList.add('debug-dragging');
  });

  const finishDebugDrag = (event) => {
    if (!debugDrag || event.pointerId !== debugDrag.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    safelyReleasePointer(svgRoot, event.pointerId);
    debugDrag.element.classList.remove('debug-dragging');
    if (debugDrag.attraction.id === 'you-are-here') snapCurrentLocationToNearest();
    debugDrag = null;
  };

  svgRoot.addEventListener('pointerup', finishDebugDrag);
  svgRoot.addEventListener('pointercancel', finishDebugDrag);
}

function initializeAttractionDropCreator() {
  const typeList = document.querySelector('#debugTypeList');
  const nameInput = document.querySelector('#debugName');
  const message = document.querySelector('#debugStatus');

  EDITABLE_POINT_TYPES.forEach((type) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'debug-type';
    button.dataset.typeId = type.id;
    button.setAttribute('aria-label', `Arrastar tipo ${type.label} para o mapa`);
    button.innerHTML = `<span aria-hidden="true">${type.icon}</span><small>${type.label}</small>`;
    button.addEventListener('pointerdown', (event) => {
      if (!debugMode || event.button > 0) return;
      event.preventDefault();
      if (!creatingPoint) {
        message.textContent = 'Clique em “Novo ponto” antes de criar.';
        return;
      }
      const name = nameInput.value.trim();
      if (!name) {
        message.textContent = 'Informe um nome antes de arrastar.';
        nameInput.focus();
        return;
      }

      const ghost = button.cloneNode(true);
      ghost.classList.add('debug-drag-ghost');
      document.body.appendChild(ghost);
      const moveGhost = (pointerEvent) => {
        ghost.style.transform = `translate(${pointerEvent.clientX}px, ${pointerEvent.clientY}px)`;
      };
      moveGhost(event);
      try { button.setPointerCapture?.(event.pointerId); } catch { /* O arraste continua pelos eventos do ponteiro. */ }

      const finish = (pointerEvent) => {
        button.removeEventListener('pointermove', moveGhost);
        button.removeEventListener('pointerup', finish);
        button.removeEventListener('pointercancel', cancel);
        try { if (button.hasPointerCapture?.(pointerEvent.pointerId)) button.releasePointerCapture(pointerEvent.pointerId); } catch { /* Captura já encerrada. */ }
        ghost.remove();
        const bounds = mapObject.getBoundingClientRect();
        const insideMap = pointerEvent.clientX >= bounds.left && pointerEvent.clientX <= bounds.right
          && pointerEvent.clientY >= bounds.top && pointerEvent.clientY <= bounds.bottom;
        if (!insideMap) {
          message.textContent = 'Solte o ícone dentro do mapa.';
          return;
        }
        const point = getMapPoint({
          clientX: pointerEvent.clientX - bounds.left,
          clientY: pointerEvent.clientY - bounds.top
        });
        const area = findContainingArea(areas, point.x, point.y);
        if (!area) {
          message.textContent = 'Solte o ponto dentro de uma das áreas.';
          return;
        }
        const attraction = {
          id: `custom-${Date.now()}`,
          name,
          description: document.querySelector('#debugPointDescription').value.trim() || type.description,
          type: type.id,
          icon: type.icon,
          color: type.color,
          category: type.category,
          categoryLabel: document.querySelector('#debugPointCategory').value.trim() || type.label,
          accessible: false,
          schedule: document.querySelector('#debugPointSchedule').value.trim(),
          complementaryLocation: document.querySelector('#debugPointLocation').value.trim(),
          links: Object.fromEntries(EXTERNAL_LINK_TYPES.map(({ id }) => {
            const fieldId = `#debugLink${id[0].toUpperCase()}${id.slice(1)}`;
            return [id, document.querySelector(fieldId).value.trim()];
          })),
          navigationNodeId: null,
          areaId: area.id,
          x: Math.round(point.x),
          y: Math.round(point.y)
        };
        attractions.push(attraction);
        synchronizeAreaMemberships(areas, attractions);
        createAttractionElement(attraction);
        refreshAttractionList();
        refreshTypeFilters();
        selectDebugAttraction(attraction);
        message.textContent = `${attraction.name} adicionado.`;
      };
      const cancel = (pointerEvent) => {
        button.removeEventListener('pointermove', moveGhost);
        button.removeEventListener('pointerup', finish);
        button.removeEventListener('pointercancel', cancel);
        ghost.remove();
      };
      button.addEventListener('pointermove', moveGhost);
      button.addEventListener('pointerup', finish);
      button.addEventListener('pointercancel', cancel);
    });
    typeList.appendChild(button);
  });
}

function populateAreaFields(area) {
  selectedArea = area ?? null;
  document.querySelector('#debugAreaList').value = area?.id ?? '';
  document.querySelector('#debugAreaName').value = area?.name ?? '';
  document.querySelector('#debugAreaX').value = area?.x ?? '';
  document.querySelector('#debugAreaY').value = area?.y ?? '';
  document.querySelector('#debugAreaWidth').value = area?.width ?? '';
  document.querySelector('#debugAreaHeight').value = area?.height ?? '';
  document.querySelector('#debugAreaDescription').value = area?.description ?? '';
  document.querySelector('#debugAreaInfo').value = area?.additionalInfo ?? '';
  document.querySelector('#debugAreaSite').value = area?.links?.site ?? '';
  document.querySelector('#debugAreaOtherLink').value = area?.links?.other ?? '';
  renderAreas();
}

function bindAreaDragging(svgRoot) {
  svgRoot.addEventListener('pointerdown', (event) => {
    if (!debugMode || areaDrag) return;
    const element = event.target.closest?.('[data-area-id]');
    if (!element) return;
    const area = getArea(element.dataset.areaId);
    if (!area) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    populateAreaFields(area);
    areaDrag = { pointerId: event.pointerId, start: getMapPoint(event), x: area.x, y: area.y, area };
    safelyCapturePointer(svgRoot, event.pointerId);
  }, true);
  svgRoot.addEventListener('pointermove', (event) => {
    if (!areaDrag || areaDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const point = getMapPoint(event);
    moveOrResizeArea(areaDrag.area, {
      x: Math.round(areaDrag.x + point.x - areaDrag.start.x),
      y: Math.round(areaDrag.y + point.y - areaDrag.start.y)
    });
    populateAreaFields(areaDrag.area);
  }, true);
  const finish = (event) => {
    if (!areaDrag || areaDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    safelyReleasePointer(svgRoot, event.pointerId);
    areaDrag = null;
  };
  svgRoot.addEventListener('pointerup', finish, true);
  svgRoot.addEventListener('pointercancel', finish, true);
}

function initializeAreaEditor(svgRoot) {
  const areaList = document.querySelector('#debugAreaList');
  const pointAreaList = document.querySelector('#debugPointArea');
  areaList.appendChild(new Option('Selecione uma área', ''));
  pointAreaList.appendChild(new Option('Selecione uma área', ''));
  areas.forEach((area) => {
    areaList.appendChild(new Option(area.name, area.id));
    pointAreaList.appendChild(new Option(area.name, area.id));
  });
  areaList.addEventListener('change', () => populateAreaFields(getArea(areaList.value)));
  document.querySelector('#debugAreaName').addEventListener('input', (event) => {
    if (!selectedArea) return;
    selectedArea.name = event.target.value;
    areaList.selectedOptions[0].textContent = selectedArea.name;
    pointAreaList.querySelector(`[value="${selectedArea.id}"]`).textContent = selectedArea.name;
    renderAreas();
  });
  const areaTextFields = {
    debugAreaDescription: 'description',
    debugAreaInfo: 'additionalInfo'
  };
  Object.entries(areaTextFields).forEach(([id, property]) => {
    document.querySelector(`#${id}`).addEventListener('input', (event) => {
      if (selectedArea) selectedArea[property] = event.target.value;
    });
  });
  [['debugAreaSite', 'site'], ['debugAreaOtherLink', 'other']].forEach(([id, property]) => {
    document.querySelector(`#${id}`).addEventListener('input', (event) => {
      if (!selectedArea) return;
      selectedArea.links ??= {};
      selectedArea.links[property] = event.target.value;
    });
  });
  const updateAreaGeometry = () => {
    if (!selectedArea) return;
    const values = {
      x: Number(document.querySelector('#debugAreaX').value),
      y: Number(document.querySelector('#debugAreaY').value),
      width: Number(document.querySelector('#debugAreaWidth').value),
      height: Number(document.querySelector('#debugAreaHeight').value)
    };
    if (!Object.values(values).every(Number.isFinite) || values.width < 80 || values.height < 80) return;
    moveOrResizeArea(selectedArea, values);
  };
  ['debugAreaX', 'debugAreaY', 'debugAreaWidth', 'debugAreaHeight'].forEach((id) => {
    document.querySelector(`#${id}`).addEventListener('change', updateAreaGeometry);
  });
  pointAreaList.addEventListener('change', () => {
    if (!debugSelection) return;
    const area = getArea(pointAreaList.value);
    if (!area) return;
    debugSelection.areaId = area.id;
    debugSelection.navigationNodeId = area.entryNodeIds[0] ?? null;
    if (!findContainingArea([area], debugSelection.x, debugSelection.y)) {
      debugSelection.x = area.x + area.width / 2;
      debugSelection.y = area.y + area.height / 2;
    }
    clampPointToArea(debugSelection, area);
    synchronizeAreaMemberships(areas, attractions);
    updateAttractionPosition(debugSelection);
    calculateActiveRoute();
  });
  bindAreaDragging(svgRoot);
}

function initializeFloorPlanEditor() {
  document.querySelector('#debugFloorFile').addEventListener('change', (event) => {
    const [file] = event.target.files;
    if (!file) return;
    if (floorPlanUrl) URL.revokeObjectURL(floorPlanUrl);
    floorPlanUrl = URL.createObjectURL(file);
    renderFloorPlan();
  });
  const updateFloor = () => {
    floorPlan.x = Number(document.querySelector('#debugFloorX').value) || 0;
    floorPlan.y = Number(document.querySelector('#debugFloorY').value) || 0;
    floorPlan.scale = Math.max(0.1, Number(document.querySelector('#debugFloorScale').value) || 1);
    floorPlan.opacity = Math.min(1, Math.max(0, Number(document.querySelector('#debugFloorOpacity').value)));
    renderFloorPlan();
  };
  ['debugFloorX', 'debugFloorY', 'debugFloorScale', 'debugFloorOpacity'].forEach((id) => {
    document.querySelector(`#${id}`).addEventListener('input', updateFloor);
  });
  document.querySelector('#debugFloorRemove').addEventListener('click', () => {
    if (floorPlanUrl) URL.revokeObjectURL(floorPlanUrl);
    floorPlanUrl = null;
    document.querySelector('#debugFloorFile').value = '';
    renderFloorPlan();
  });
}

function initializeEditor(svgRoot) {
  const panel = document.querySelector('#debugPanel');
  const list = document.querySelector('#debugAttractionList');
  const toggle = document.querySelector('#debugToggle');
  const setDebugMode = (enabled) => {
    debugMode = enabled;
    panel.hidden = !enabled;
    toggle.setAttribute('aria-pressed', String(enabled));
    svgRoot.classList.toggle('debug-mode', enabled);
    renderNavigationGraph(svgDocument, enabled);
    populateConnectionFields(navigationEdges.find((edge) => edge.id === selectedNavigationEdgeId));
    if (!enabled) {
      selectDebugAttraction(null);
      debugDrag = null;
      meshDrag = null;
      areaDrag = null;
    }
  };

  refreshAttractionList();
  initializeAttractionDropCreator();
  initializeAreaEditor(svgRoot);
  initializeFloorPlanEditor();
  const originList = document.querySelector('#debugOriginNode');
  navigationNodes.forEach((node) => originList.appendChild(new Option(node.id, node.id)));
  originList.value = currentLocationNodeId;
  originList.addEventListener('change', () => setCurrentLocation(originList.value));

  const connectionList = document.querySelector('#debugConnectionList');
  const connectionFrom = document.querySelector('#debugConnectionFrom');
  const connectionTo = document.querySelector('#debugConnectionTo');
  navigationNodes.forEach((node) => {
    connectionFrom.appendChild(new Option(node.id, node.id));
    connectionTo.appendChild(new Option(node.id, node.id));
  });
  navigationEdges.forEach((edge) => connectionList.appendChild(new Option(`${edge.from} → ${edge.to}`, edge.id)));
  connectionList.addEventListener('change', () => {
    populateConnectionFields(navigationEdges.find((edge) => edge.id === connectionList.value));
  });
  const updateSelectedConnection = () => {
    const edge = navigationEdges.find((item) => item.id === selectedNavigationEdgeId);
    if (!edge) return;
    const controlX = Number(document.querySelector('#debugControlX').value);
    const controlY = Number(document.querySelector('#debugControlY').value);
    updateNavigationEdge(edge.id, {
      from: connectionFrom.value,
      to: connectionTo.value,
      type: document.querySelector('#debugConnectionType').value,
      controlX,
      controlY
    });
    connectionList.selectedOptions[0].textContent = `${edge.from} → ${edge.to}`;
    refreshNavigationMesh();
  };
  ['debugConnectionFrom', 'debugConnectionTo', 'debugConnectionType'].forEach((id) => {
    document.querySelector(`#${id}`).addEventListener('change', updateSelectedConnection);
  });
  ['debugControlX', 'debugControlY'].forEach((id) => {
    document.querySelector(`#${id}`).addEventListener('input', (event) => {
      if (event.target.value !== '' && Number.isFinite(Number(event.target.value))) updateSelectedConnection();
    });
  });
  populateConnectionFields(navigationEdges[0]);
  const collapseButton = document.querySelector('#debugCollapse');
  collapseButton.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('is-collapsed');
    collapseButton.textContent = collapsed ? 'Expandir' : 'Recolher';
    collapseButton.setAttribute('aria-expanded', String(!collapsed));
  });
  toggle.addEventListener('click', () => setDebugMode(!debugMode));
  list.addEventListener('change', () => selectDebugAttraction(attractions.find((item) => item.id === list.value)));
  document.querySelector('#debugNewPoint').addEventListener('click', () => {
    creatingPoint = true;
    selectDebugAttraction(null);
    setPointEditorFields(null);
    document.querySelector('#debugName').focus();
  });
  const pointFieldMap = {
    debugName: 'name',
    debugPointDescription: 'description',
    debugPointCategory: 'categoryLabel',
    debugPointSchedule: 'schedule',
    debugPointLocation: 'complementaryLocation'
  };
  Object.entries(pointFieldMap).forEach(([id, property]) => {
    document.querySelector(`#${id}`).addEventListener('input', (event) => {
      if (!debugSelection || creatingPoint) return;
      debugSelection[property] = event.target.value;
      if (property === 'name') {
        updateAttractionContent(debugSelection);
        refreshAttractionList();
      }
      if (selectedAttraction?.id === debugSelection.id) selectedAttraction = debugSelection;
    });
  });
  EXTERNAL_LINK_TYPES.forEach(({ id }) => {
    const fieldId = `#debugLink${id[0].toUpperCase()}${id.slice(1)}`;
    document.querySelector(fieldId).addEventListener('input', (event) => {
      if (!debugSelection || creatingPoint) return;
      debugSelection.links ??= {};
      debugSelection.links[id] = event.target.value;
    });
  });

  document.querySelector('#debugDelete').addEventListener('click', () => {
    if (!debugSelection) return;
    if (debugSelection.id === 'you-are-here') return;
    svgDocument.querySelector(`[data-attraction-id="${debugSelection.id}"]`)?.remove();
    svgDocument.querySelector(`[data-point-text-id="${debugSelection.id}"]`)?.remove();
    attractions = attractions.filter((item) => item.id !== debugSelection.id);
    synchronizeAreaMemberships(areas, attractions);
    selectedAttraction = selectedAttraction?.id === debugSelection.id ? null : selectedAttraction;
    if (activeDestination?.id === debugSelection.id) activeDestination = null;
    clearRoute(svgDocument);
    debugSelection = null;
    refreshAttractionList();
    refreshTypeFilters();
    selectDebugAttraction(null);
    creatingPoint = true;
    setPointEditorFields(null);
    document.querySelector('#debugStatus').textContent = 'Ponto de interesse excluído.';
  });

  document.querySelector('#debugCopyMesh').addEventListener('click', async () => {
    const message = document.querySelector('#debugStatus');
    try {
      await navigator.clipboard.writeText(JSON.stringify(exportNavigationMesh(), null, 2));
      message.textContent = 'Malha copiada.';
    } catch {
      message.textContent = 'Não foi possível copiar.';
    }
    window.setTimeout(() => { message.textContent = ''; }, 1800);
  });
  bindDebugDragging(svgRoot);
  bindNavigationMeshEditing(svgRoot);
  setDebugMode(debugMode);
}

function selectAttraction(attraction) {
  closeFullDetails();
  selectedAttraction = attraction;
  svgDocument.querySelectorAll('.attraction').forEach((node) => node.classList.remove('selected'));
  svgDocument.querySelector(`[data-id="${attraction.id}"]`)?.classList.add('selected');
  mapController.focusAt(attraction.x, attraction.y);
  openDetails(detailSheet, attraction);
  status.textContent = attraction.name;
}

function closeAttractionDetails() {
  closeFullDetails();
  closeDetails(detailSheet);
}

function closeFullDetails(restoreFocus = false) {
  const wasOpen = fullDetailSheet.classList.contains('is-open');
  fullDetailSheet.classList.remove('is-open');
  fullDetailSheet.setAttribute('aria-hidden', 'true');
  if (wasOpen && restoreFocus) document.querySelector('#moreDetailsButton').focus();
}

function getSafeExternalUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function openFullDetails() {
  if (!selectedAttraction) return;
  const area = getArea(selectedAttraction.areaId);
  const type = getPointType(selectedAttraction.type);
  document.querySelector('#fullDetailTitle').textContent = selectedAttraction.name;
  document.querySelector('#fullDetailDescription').textContent = selectedAttraction.description;
  document.querySelector('#fullDetailArea').textContent = area?.name ?? 'Área não informada';
  document.querySelector('#fullDetailCategory').textContent = selectedAttraction.categoryLabel ?? type?.label ?? 'Não informada';
  const scheduleRow = document.querySelector('#fullDetailScheduleRow');
  scheduleRow.hidden = !selectedAttraction.schedule;
  document.querySelector('#fullDetailSchedule').textContent = selectedAttraction.schedule || '';
  const locationRow = document.querySelector('#fullDetailLocationRow');
  locationRow.hidden = !selectedAttraction.complementaryLocation;
  document.querySelector('#fullDetailLocation').textContent = selectedAttraction.complementaryLocation || '';
  const links = document.querySelector('#fullDetailLinks');
  links.replaceChildren();
  const availableLinks = { ...area?.links, ...selectedAttraction.links };
  EXTERNAL_LINK_TYPES.forEach(({ id, label, icon }) => {
    const href = getSafeExternalUrl(availableLinks[id]);
    if (!href) return;
    const anchor = document.createElement('a');
    anchor.className = 'external-link';
    anchor.href = href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.setAttribute('aria-label', `Abrir ${label} em uma nova aba`);
    anchor.innerHTML = `<span aria-hidden="true">${icon}</span><span class="sr-only">${label}</span>`;
    links.appendChild(anchor);
  });
  links.hidden = !links.childElementCount;
  fullDetailSheet.classList.add('is-open');
  fullDetailSheet.setAttribute('aria-hidden', 'false');
  document.querySelector('#backDetailsButton').focus();
}

function bindMapAttractions() {
  const svgRoot = svgDocument.documentElement;

  renderAreas();
  renderCirculationPaths(svgDocument);
  attractions.forEach(createAttractionElement);
  bindCurrentLocationDragging(svgRoot);
  setCurrentLocation(currentLocationNodeId, { moveMarker: false, persist: false });
  initializeEditor(svgRoot);

  const mapContent = svgDocument.querySelector('#map-content');
  mapController.setMap(svgRoot, mapContent, (attractionId) => {
    const attraction = attractions.find((item) => item.id === attractionId);
    if (!attraction) return;
    if (debugMode) selectDebugAttraction(attraction);
    else selectAttraction(attraction);
  });
}

function setupMap() {
  if (mapIsBound || !mapObject.contentDocument?.querySelector('#map-content')) return;
  svgDocument = mapObject.contentDocument;
  mapIsBound = true;
  bindMapAttractions();
  mapController.fitMapToViewport();
}

function applyVisibility() {
  const query = searchInput.value.trim().toLowerCase();
  attractions.forEach((attraction) => {
    const matchesType = activeType === 'all' || attraction.type === activeType || attraction.id === 'you-are-here';
    const matchesSearch = !query || `${attraction.name} ${attraction.description}`.toLowerCase().includes(query);
    const hidden = !(matchesType && matchesSearch);
    svgDocument.querySelector(`[data-id="${attraction.id}"]`)?.classList.toggle('hidden', hidden);
    svgDocument.querySelector(`[data-point-text-id="${attraction.id}"]`)?.classList.toggle('hidden', hidden);
  });
}

function refreshTypeFilters() {
  const availableTypes = getTypesInState(attractions);
  if (activeType !== 'all' && !availableTypes.some((type) => type.id === activeType)) activeType = 'all';
  renderTypeFilters(document.querySelector('#filterList'), availableTypes, activeType, (type) => {
    activeType = type;
    applyVisibility();
  });
  if (svgDocument) applyVisibility();
}

async function init() {
  document.querySelector('#app-version').textContent = `v${APP_VERSION.number} · ${APP_VERSION.updatedAt}`;
  [attractions, areas] = await Promise.all([loadAttractions(), loadAreas()]);
  attractions.forEach((point) => {
    if (point.id === 'you-are-here') {
      restoreCurrentLocation(point);
      return;
    }
    const assignedArea = getArea(point.areaId) ?? findContainingArea(areas, point.x, point.y) ?? areas[0];
    point.areaId = assignedArea.id;
    clampPointToArea(point, assignedArea);
  });
  synchronizeAreaMemberships(areas, attractions);
  currentLocationNodeId = attractions.find((item) => item.id === 'you-are-here')?.navigationNodeId ?? null;
  refreshTypeFilters();

  mapObject.addEventListener('load', setupMap);
  setupMap();

  searchInput.addEventListener('input', () => svgDocument && applyVisibility());
  document.querySelector('#zoomInButton').addEventListener('click', () => mapController.zoomBy(1.2));
  document.querySelector('#zoomOutButton').addEventListener('click', () => mapController.zoomBy(1 / 1.2));
  document.querySelector('#resetViewButton').addEventListener('click', () => mapController.fitMapToViewport());
  document.querySelector('#closeSheetButton').addEventListener('click', closeAttractionDetails);
  document.querySelector('#moreDetailsButton').addEventListener('click', openFullDetails);
  document.querySelector('#backDetailsButton').addEventListener('click', () => closeFullDetails(true));
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (fullDetailSheet.classList.contains('is-open')) closeFullDetails(true);
    else if (detailSheet.classList.contains('is-open')) closeAttractionDetails();
  });
  document.addEventListener('pointerdown', (event) => {
    if (fullDetailSheet.classList.contains('is-open')) {
      if (!fullDetailSheet.contains(event.target)) closeFullDetails();
      return;
    }
    if (detailSheet.classList.contains('is-open') && !detailSheet.contains(event.target)) closeAttractionDetails();
  });
  document.querySelector('#routeButton').addEventListener('click', () => {
    if (!selectedAttraction || selectedAttraction.id === 'you-are-here') return;
    closeAttractionDetails();
    activeDestination = selectedAttraction;
    calculateActiveRoute();
  });
  document.querySelector('#clearRouteButton').addEventListener('click', () => {
    clearRoute(svgDocument);
    activeDestination = null;
    status.textContent = 'Rota removida.';
  });

  let fitFrame = 0;
  let orientation = window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
  const scheduleOrientationFit = () => {
    window.cancelAnimationFrame(fitFrame);
    fitFrame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => mapController.fitMapToViewport());
    });
  };
  window.addEventListener('resize', () => {
    const nextOrientation = window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
    if (nextOrientation === orientation) return;
    orientation = nextOrientation;
    scheduleOrientationFit();
  });
  window.addEventListener('orientationchange', scheduleOrientationFit);
}

init().catch((error) => {
  console.error(error);
  status.textContent = 'Não foi possível carregar o mapa.';
});
