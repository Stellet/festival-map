import { loadAttractions, getCategories } from './attractions.js';
import { MapController } from './map-controller.js';
import { navigationNodes, findShortestPath, drawRoute, clearRoute, renderNavigationGraph } from './navigation.js';
import { createFilters, openDetails, closeDetails } from './ui.js';

const APP_VERSION = {
  number: '0.1.11',
  updatedAt: '02/08/2026 · 20:53'
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
let initialPositions = [];
let debugSelection = null;
let debugDrag = null;
let creatingAttraction = false;
let currentLocationNodeId = 'art-interactive';
let activeDestination = null;

const DEFAULT_ICONS = {
  'main-stage': '★', 'alternative-stage': '★', 'food-court': 'F', exhibitors: '◆',
  'kids-area': '◆', restrooms: 'WC', medical: '+', 'main-entrance': 'E',
  'emergency-exit': 'S', 'you-are-here': '●'
};

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
  const selector = document.querySelector('#debugOriginNode');
  if (selector) selector.value = node.id;
  calculateActiveRoute();
}

function selectDebugAttraction(attraction) {
  debugSelection = attraction;
  svgDocument.querySelectorAll('.attraction').forEach((node) => node.classList.remove('debug-selected'));
  if (!attraction) {
    document.querySelector('#debugAttractionList').value = '';
    document.querySelector('#debugName').value = '';
    document.querySelector('#debugDescription').value = '';
    document.querySelector('#debugX').value = '';
    document.querySelector('#debugY').value = '';
    document.querySelector('#debugNavigationNode').value = '';
    document.querySelector('#debugDelete').disabled = true;
    return;
  }
  svgDocument.querySelector(`[data-attraction-id="${attraction.id}"]`)?.classList.add('debug-selected');
  document.querySelector('#debugAttractionList').value = attraction.id;
  document.querySelector('#debugName').value = attraction.name;
  document.querySelector('#debugDescription').value = attraction.description;
  document.querySelector('#debugIcon').value = attraction.icon;
  document.querySelector('#debugNavigationNode').value = attraction.navigationNodeId ?? '';
  document.querySelector('#debugX').value = attraction.x;
  document.querySelector('#debugY').value = attraction.y;
  document.querySelector('#debugDelete').disabled = false;
  creatingAttraction = false;
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
  group.innerHTML = `<text class="attraction-label" x="0" y="-39"></text><circle class="attraction-hit-area" cx="0" cy="0" r="34"></circle><circle class="attraction-marker" cx="0" cy="0" r="25" fill="#8b5cf6"></circle><text class="attraction-icon" x="0" y="0"></text>`;
  group.querySelector('.attraction-label').textContent = attraction.name.toUpperCase();
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
    debugDrag = null;
  };

  svgRoot.addEventListener('pointerup', finishDebugDrag);
  svgRoot.addEventListener('pointercancel', finishDebugDrag);
}

function initializeEditor(svgRoot) {
  const panel = document.querySelector('#debugPanel');
  const list = document.querySelector('#debugAttractionList');
  const toggle = document.querySelector('#debugToggle');
  const setDebugMode = (enabled) => {
    debugMode = enabled;
    panel.hidden = !enabled;
    toggle.setAttribute('aria-pressed', String(enabled));
    renderNavigationGraph(svgDocument, enabled, setCurrentLocation);
    if (!enabled) {
      selectDebugAttraction(null);
      debugDrag = null;
    } else if (!debugSelection && attractions.length) {
      selectDebugAttraction(attractions[0]);
    }
  };

  refreshAttractionList();
  const navigationList = document.querySelector('#debugNavigationNode');
  navigationList.appendChild(new Option('Sem nó associado', ''));
  navigationNodes.forEach((node) => navigationList.appendChild(new Option(node.id, node.id)));
  const originList = document.querySelector('#debugOriginNode');
  navigationNodes.forEach((node) => originList.appendChild(new Option(node.id, node.id)));
  originList.value = currentLocationNodeId;
  originList.addEventListener('change', () => setCurrentLocation(originList.value));
  const collapseButton = document.querySelector('#debugCollapse');
  collapseButton.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('is-collapsed');
    collapseButton.textContent = collapsed ? 'Expandir' : 'Recolher';
    collapseButton.setAttribute('aria-expanded', String(!collapsed));
  });
  toggle.addEventListener('click', () => setDebugMode(!debugMode));
  list.addEventListener('change', () => selectDebugAttraction(attractions.find((item) => item.id === list.value)));

  ['debugX', 'debugY'].forEach((id) => {
    document.querySelector(`#${id}`).addEventListener('input', (event) => {
      if (!debugSelection || event.target.value === '') return;
      const value = Number(event.target.value);
      if (!Number.isFinite(value)) return;
      debugSelection[id === 'debugX' ? 'x' : 'y'] = value;
      updateAttractionPosition(debugSelection);
    });
  });

  ['debugName', 'debugDescription', 'debugIcon'].forEach((id) => {
    document.querySelector(`#${id}`).addEventListener('input', (event) => {
      if (!debugSelection) return;
      const property = { debugName: 'name', debugDescription: 'description', debugIcon: 'icon' }[id];
      debugSelection[property] = event.target.value;
      updateAttractionContent(debugSelection);
      refreshAttractionList();
    });
  });
  navigationList.addEventListener('change', () => {
    if (debugSelection) {
      debugSelection.navigationNodeId = navigationList.value || null;
      if (activeDestination?.id === debugSelection.id) calculateActiveRoute();
    }
  });

  document.querySelector('#debugNew').addEventListener('click', () => {
    creatingAttraction = true;
    selectDebugAttraction(null);
    creatingAttraction = true;
    document.querySelector('#debugName').value = '';
    document.querySelector('#debugDescription').value = '';
    document.querySelector('#debugIcon').value = '★';
    document.querySelector('#debugName').focus();
  });

  document.querySelector('#debugAdd').addEventListener('click', () => {
    if (!creatingAttraction) return;
    const name = document.querySelector('#debugName').value.trim();
    if (!name) {
      document.querySelector('#debugStatus').textContent = 'Informe o nome da atração.';
      return;
    }
    const bounds = svgRoot.getBoundingClientRect();
    const center = getMapPoint({ clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2 });
    const attraction = {
      id: `custom-${Date.now()}`,
      name,
      description: document.querySelector('#debugDescription').value.trim() || 'Atração criada localmente.',
      icon: document.querySelector('#debugIcon').value,
      navigationNodeId: document.querySelector('#debugNavigationNode').value || null,
      category: 'activities', accessible: true, schedule: 'Não informado',
      x: Math.round(center.x), y: Math.round(center.y)
    };
    attractions.push(attraction);
    createAttractionElement(attraction);
    refreshAttractionList();
    selectDebugAttraction(attraction);
    document.querySelector('#debugStatus').textContent = 'Atração adicionada.';
  });

  document.querySelector('#debugDelete').addEventListener('click', () => {
    if (!debugSelection) return;
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

  document.querySelector('#debugCenter').addEventListener('click', () => {
    if (debugSelection) mapController.focusAt(debugSelection.x, debugSelection.y);
  });
  document.querySelector('#debugCopy').addEventListener('click', async () => {
    const positions = attractions.map(({ id, x, y }) => ({ id, x, y }));
    const message = document.querySelector('#debugStatus');
    try {
      await navigator.clipboard.writeText(JSON.stringify(positions, null, 2));
      message.textContent = 'Posições copiadas.';
    } catch {
      message.textContent = 'Não foi possível copiar.';
    }
    window.setTimeout(() => { message.textContent = ''; }, 1800);
  });
  document.querySelector('#debugRestore').addEventListener('click', () => {
    initialPositions.forEach((initial) => {
      const attraction = attractions.find((item) => item.id === initial.id);
      if (!attraction) return;
      attraction.x = initial.x;
      attraction.y = initial.y;
      updateAttractionPosition(attraction);
    });
    if (debugSelection) selectDebugAttraction(debugSelection);
  });
  bindDebugDragging(svgRoot);
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

  attractions.forEach(updateAttractionPosition);
  initializeEditor(svgRoot);

  attractions.forEach((attraction) => {
    const node = svgDocument.querySelector(`[data-id="${attraction.id}"]`);
    if (!node) return;
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (debugMode) selectDebugAttraction(attraction);
        else selectAttraction(attraction);
      }
    });
  });

  const mapContent = svgDocument.querySelector('#map-content');
  mapController.setMap(svgRoot, mapContent, (attractionId) => {
    const attraction = attractions.find((item) => item.id === attractionId);
    if (!attraction) return;
    if (debugMode) selectDebugAttraction(attraction);
    else selectAttraction(attraction);
  });
}

function setupMap() {
  if (mapIsBound || !mapObject.contentDocument?.querySelector('.attraction')) return;
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
  attractions.forEach((attraction) => { attraction.icon = DEFAULT_ICONS[attraction.id] ?? '★'; });
  initialPositions = attractions.map(({ id, x, y }) => ({ id, x, y }));
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
  const scheduleFit = () => {
    window.cancelAnimationFrame(fitFrame);
    fitFrame = window.requestAnimationFrame(() => mapController.fitMapToViewport());
  };
  window.addEventListener('resize', scheduleFit);
  window.addEventListener('orientationchange', scheduleFit);
  window.visualViewport?.addEventListener('resize', scheduleFit);
  window.visualViewport?.addEventListener('scroll', scheduleFit);
}

init().catch((error) => {
  console.error(error);
  status.textContent = 'Não foi possível carregar o mapa.';
});
