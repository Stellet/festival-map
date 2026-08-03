export async function loadAreas() {
  const response = await fetch('data/areas.json');
  if (!response.ok) throw new Error('Não foi possível carregar as áreas do mapa.');
  return response.json();
}

export function findContainingArea(areas, x, y) {
  return areas.find((area) => x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height) ?? null;
}

export function clampPointToArea(point, area, padding = 30) {
  const horizontalPadding = Math.min(padding, area.width / 2);
  const verticalPadding = Math.min(padding, area.height / 2);
  point.x = Math.min(area.x + area.width - horizontalPadding, Math.max(area.x + horizontalPadding, point.x));
  point.y = Math.min(area.y + area.height - verticalPadding, Math.max(area.y + verticalPadding, point.y));
  return point;
}

export function synchronizeAreaMemberships(areas, points) {
  areas.forEach((area) => { area.pointIds = []; });
  points.forEach((point) => {
    const area = areas.find((item) => item.id === point.areaId);
    if (area) area.pointIds.push(point.id);
  });
}
