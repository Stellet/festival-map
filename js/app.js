import { loadAttractions, getCategories } from './attractions.js';
import { MapController } from './map-controller.js';
import {
  navigationNodes, navigationEdges, findNearestNavigationNode, findShortestPath,
  updateNavigationNode, updateNavigationEdge, exportNavigationMesh,
  drawRoute, clearRoute, renderNavigationGraph, renderCirculationPaths
} from './navigation.js';
import { createFilters, openDetails, closeDetails } from './ui.js';

const APP_VERSION = {
  number: '0.1.15',
  updatedAt: '02/08/2026 · 23:43'
};

let debugMode = new URLSearchParams(window.location.search).get('debug') === 'true';

const viewport = document.querySelector('#mapViewport');
const mapObject = document.querySelector('#festivalMap');
const detailSheet = document.querySelector('#detailSheet');
const status = document.querySelector('#mapStatus');
const searchInput = document.querySelector('#searchInput');

const mapController = new MapController(viewport);
let attractions = [];
let selectedAttraction = null;
let svgDocument = null;
let activeCategory = 'all';
let mapIsBound = false;
let debugSelection = null;
let debugDrag = null;
let meshDrag = null;
let selectedNavigationEdgeId = null;
let currentLocationNodeId = null;
let activeDestination = null;

const MARKER_COLORS = {
  'main-stage': '#8b5cf6', 'alternative-stage': '#fb7185', 'food-court': '#d99f08',
  restrooms: '#168db5', medical: '#e25555', 'kids-area': '#db4f8c', exhibitors: '#0e9f9a',
  'main-entrance': '#2c9b64', 'emergency-exit': '#fb7185', 'you-are-here': '#172033'
};

const ATTRACTION_TYPES = [
  { id: 'stage', label: 'Palco', icon: '★', category: 'stages', description: 'Programação artística e apresentações ao vivo.', color: '#8b5cf6' },
  { id: 'food', label: 'Alimentação', icon: 'F', category: 'food', description: 'Espaço com opções de alimentação e bebidas.', color: '#d99f08' },
  { id: 'restroom', label: 'Banheiro', icon: 'WC', category: 'services', description: 'Banheiros disponíveis para o público.', color: '#168db5' },
  { id: 'health', label: 'Saúde', icon: '+', category: 'services', description: 'Ponto de apoio e atendimento de saúde.', color: '#e25555' },
  { id: 'information', label: 'Informação', icon: 'i', category: 'services', description: 'Ponto de informações e orientação do festival.', color: '#22d3ee' },
  { id: 'exhibition', label: 'Exposição', icon: '◇', category: 'exhibitions', description: 'Espaço dedicado a exposições e obras.', color: '#0e9f9a' },
  { id: 'activity', label: 'Atividade', icon: '◆', category: 'activities', description: 'Atividade interativa aberta ao público.', color: '#db4f8c' },
  { id: 'entrance', label: 'Entrada', icon: 'E', category: 'access', description: 'Acesso de entrada do festival.', color: '#2c9b64' },
  { id: 'exit', label: 'Saída', icon: 'S', category: 'access', description: 'Acesso de saída do festival.', color: '#fb7185' }
];

function updateAttractionPosition(attraction) {
  const element = svgDocument.querySelector(`[data-attraction-id="${attraction.id}"]`);
  element?.setAttribute('transform', `translate(${attraction.x} ${attraction.y})`);
}

function calculateActiveRoute() {
  if (!activeDestination) return;
  if (!currentLocationNodeId || !activeDestination.navigationNodeId) {
    clearRoute(svgDocument);
    status.textContent = 'Rota indisponível: origem ou destino sem nó de navegação.';
    return;
  }
  const shortestPath = findShortestPath(currentLocationNodeId, activeDestination.navigationNodeId);
  if (!shortestPath) {
    clearRoute(svgDocument);
    status.textContent = 'Não foi possível encontrar uma rota até esta atração.';
    return;
  }
  drawRoute(svgDocument, shortestPath);
  svgDocument.querySelectorAll('.attraction').forEach((node) => node.classList.remove('selected'));
  svgDocument.querySelector(`[data-attraction-id="${activeDestination.id}"]`)?.classList.add('selected');
  status.textContent = `Rota destacada até ${activeDestination.name}.`;
}

function setCurrentLocation(nodeId) {
  const node = navigationNodes.find((item) => item.id === nodeId);
  const marker = attractions.find((item) => item.id === 'you-are-here');
  if (!node || !marker) return;
  currentLocationNodeId = node.id;
  marker.navigationNodeId = node.id;
  marker.x = node.x;
  marker.y = node.y;
  updateAttractionPosition(marker);
  if (debugSelection?.id === marker.id) selectDebugAttraction(marker);
  const selector = document.querySelector('#debugOriginNode');
  if (selector) selector.value = node.id;
  calculateActiveRoute();
}

function snapCurrentLocationToNearest() {
  const marker = attractions.find((item) => item.id === 'you-are-here');
  if (!marker) return;
  const nearest = findNearestNavigationNode(marker.x, marker.y);
  if (nearest) setCurrentLocation(nearest.id);
}

function selectDebugAttraction(attraction) {
  debugSelection = attraction;
  svgDocument.querySelectorAll('.attraction').forEach((node) => node.classList.remove('debug-selected'));
  if (!attraction) {
    document.querySelector('#debugAttractionList').value = '';
    document.querySelector('#debugDelete').disabled = true;
    return;
  }
  svgDocument.querySelector(`[data-attraction-id="${attraction.id}"]`)?.classList.add('debug-selected');
  document.querySelector('#debugAttractionList').value = attraction.id;
  document.querySelector('#debugDelete').disabled = attraction.id === 'you-are-here';
}

function refreshAttractionList() {
  const list = document.querySelector('#debugAttractionList');
  list.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Selecione uma atração';
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
  group.setAttribute('data-id', attraction.id);
  group.setAttribute('data-attraction-id', attraction.id);
  group.setAttribute('tabindex', '0');
  group.innerHTML = `<text class="attraction-label" x="0" y="-39"></text><circle class="attraction-hit-area" cx="0" cy="0" r="34"></circle><circle class="attraction-marker" cx="0" cy="0" r="25"></circle><text class="attraction-icon" x="0" y="0"></text>`;
  group.querySelector('.attraction-label').textContent = attraction.name.toUpperCase();
  group.querySelector('.attraction-marker').setAttribute('fill', attraction.color ?? MARKER_COLORS[attraction.id] ?? '#8b5cf6');
  group.querySelector('.attraction-icon').textContent = attraction.icon;
  svgDocument.querySelector('#map-content').appendChild(group);
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
  element.querySelector('.attraction-label').textContent = attraction.name.toUpperCase();
  element.querySelector('.attraction-icon').textContent = attraction.icon;
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
    svgRoot.setPointerCapture(event.pointerId);
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
    updateAttractionPosition(debugDrag.attraction);
    selectDebugAttraction(debugDrag.attraction);
    debugDrag.element.classList.add('debug-dragging');
  });

  const finishDebugDrag = (event) => {
    if (!debugDrag || event.pointerId !== debugDrag.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (svgRoot.hasPointerCapture(event.pointerId)) svgRoot.releasePointerCapture(event.pointerId);
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

  ATTRACTION_TYPES.forEach((type) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'debug-type';
    button.dataset.typeId = type.id;
    button.setAttribute('aria-label', `Arrastar tipo ${type.label} para o mapa`);
    button.innerHTML = `<span aria-hidden="true">${type.icon}</span><small>${type.label}</small>`;
    button.addEventListener('pointerdown', (event) => {
      if (!debugMode || event.button > 0) return;
      event.preventDefault();
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
        const attraction = {
          id: `custom-${Date.now()}`,
          name,
          description: type.description,
          icon: type.icon,
          color: type.color,
          category: type.category,
          accessible: false,
          schedule: 'Não informado',
          navigationNodeId: null,
          x: Math.round(point.x),
          y: Math.round(point.y)
        };
        attractions.push(attraction);
        createAttractionElement(attraction);
        refreshAttractionList();
        selectDebugAttraction(attraction);
        nameInput.value = '';
        message.textContent = `${attraction.name} adicionada.`;
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

function initializeEditor(svgRoot) {
  const panel = document.querySelector('#debugPanel');
  const list = document.querySelector('#debugAttractionList');
  const toggle = document.querySelector('#debugToggle');
  const setDebugMode = (enabled) => {
    debugMode = enabled;
    panel.hidden = !enabled;
    toggle.setAttribute('aria-pressed', String(enabled));
    renderNavigationGraph(svgDocument, enabled);
    populateConnectionFields(navigationEdges.find((edge) => edge.id === selectedNavigationEdgeId));
    if (!enabled) {
      selectDebugAttraction(null);
      debugDrag = null;
      meshDrag = null;
    } else if (!debugSelection && attractions.length) {
      selectDebugAttraction(attractions[0]);
    }
  };

  refreshAttractionList();
  initializeAttractionDropCreator();
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

  document.querySelector('#debugDelete').addEventListener('click', () => {
    if (!debugSelection) return;
    if (debugSelection.id === 'you-are-here') return;
    svgDocument.querySelector(`[data-attraction-id="${debugSelection.id}"]`)?.remove();
    attractions = attractions.filter((item) => item.id !== debugSelection.id);
    selectedAttraction = selectedAttraction?.id === debugSelection.id ? null : selectedAttraction;
    if (activeDestination?.id === debugSelection.id) activeDestination = null;
    clearRoute(svgDocument);
    debugSelection = null;
    refreshAttractionList();
    selectDebugAttraction(null);
    document.querySelector('#debugStatus').textContent = 'Atração excluída.';
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
  selectedAttraction = attraction;
  svgDocument.querySelectorAll('.attraction').forEach((node) => node.classList.remove('selected'));
  svgDocument.querySelector(`[data-id="${attraction.id}"]`)?.classList.add('selected');
  mapController.focusAt(attraction.x, attraction.y);
  openDetails(detailSheet, attraction);
  status.textContent = attraction.name;
}

function closeAttractionDetails() {
  closeDetails(detailSheet);
}

function bindMapAttractions() {
  const svgRoot = svgDocument.documentElement;

  renderCirculationPaths(svgDocument);
  attractions.forEach(createAttractionElement);
  setCurrentLocation(currentLocationNodeId);
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
    const matchesCategory = activeCategory === 'all' || attraction.category === activeCategory || attraction.id === 'you-are-here';
    const matchesSearch = !query || `${attraction.name} ${attraction.description}`.toLowerCase().includes(query);
    svgDocument.querySelector(`[data-id="${attraction.id}"]`)?.classList.toggle('hidden', !(matchesCategory && matchesSearch));
  });
}

async function init() {
  document.querySelector('#app-version').textContent = `v${APP_VERSION.number} · ${APP_VERSION.updatedAt}`;
  attractions = await loadAttractions();
  currentLocationNodeId = attractions.find((item) => item.id === 'you-are-here')?.navigationNodeId ?? null;
  createFilters(document.querySelector('#filterList'), getCategories(), (category) => {
    activeCategory = category;
    applyVisibility();
  });

  mapObject.addEventListener('load', setupMap);
  setupMap();

  searchInput.addEventListener('input', () => svgDocument && applyVisibility());
  document.querySelector('#zoomInButton').addEventListener('click', () => mapController.zoomBy(1.2));
  document.querySelector('#zoomOutButton').addEventListener('click', () => mapController.zoomBy(1 / 1.2));
  document.querySelector('#resetViewButton').addEventListener('click', () => mapController.fitMapToViewport());
  document.querySelector('#closeSheetButton').addEventListener('click', closeAttractionDetails);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && detailSheet.classList.contains('is-open')) closeAttractionDetails();
  });
  document.addEventListener('pointerdown', (event) => {
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
