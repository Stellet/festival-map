export const POINT_TYPES = [
  { id: 'stage', label: 'Palco', filterLabel: 'Palcos', icon: '★', color: '#8b5cf6', category: 'stages', description: 'Programação artística e apresentações ao vivo.' },
  { id: 'activity', label: 'Atividade', filterLabel: 'Atividades', icon: '◆', color: '#db4f8c', category: 'activities', description: 'Atividade interativa aberta ao público.' },
  { id: 'exhibition', label: 'Exposição', filterLabel: 'Exposições', icon: '◇', color: '#0e9f9a', category: 'exhibitions', description: 'Espaço dedicado a exposições e obras.' },
  { id: 'food', label: 'Alimentação', filterLabel: 'Alimentação', icon: 'F', color: '#d99f08', category: 'food', description: 'Espaço com opções de alimentação e bebidas.' },
  { id: 'bathroom', label: 'Banheiro', filterLabel: 'Banheiros', icon: 'WC', color: '#168db5', category: 'restrooms', description: 'Banheiros disponíveis para o público.' },
  { id: 'health', label: 'Saúde', filterLabel: 'Saúde', icon: '+', color: '#e25555', category: 'services', description: 'Ponto de apoio e atendimento de saúde.' },
  { id: 'information', label: 'Informação', filterLabel: 'Informações', icon: 'i', color: '#22d3ee', category: 'services', description: 'Ponto de informações e orientação do festival.' },
  { id: 'entrance', label: 'Entrada', filterLabel: 'Entradas', icon: 'E', color: '#2c9b64', category: 'access', description: 'Acesso de entrada do festival.' },
  { id: 'exit', label: 'Saída', filterLabel: 'Saídas', icon: 'S', color: '#fb7185', category: 'access', description: 'Acesso de saída do festival.' },
  { id: 'location', label: 'Localização', filterLabel: 'Localização', icon: '●', color: '#172033', category: 'location', description: 'Posição atual usada como origem da navegação.', system: true }
];

const typeById = new Map(POINT_TYPES.map((type) => [type.id, type]));

export function getPointType(typeId) {
  return typeById.get(typeId) ?? null;
}

export function getTypesInState(points) {
  const presentTypes = new Set(points.filter((point) => !point.system).map((point) => point.type));
  return POINT_TYPES.filter((type) => !type.system && presentTypes.has(type.id));
}

export async function loadAttractions() {
  const response = await fetch('data/attractions.json');
  if (!response.ok) throw new Error('Não foi possível carregar os pontos de interesse.');
  const points = await response.json();
  return points.map((point) => {
    const type = getPointType(point.type);
    return {
      ...point,
      icon: type?.icon ?? point.icon,
      color: type?.color ?? point.color,
      category: point.category ?? type?.category,
      description: point.description || type?.description || 'Informações em atualização.'
    };
  });
}

// Compatibilidade temporária com integrações que ainda usam categorias estáticas.
export function getCategories() {
  return [{ id: 'all', label: 'Todos' }, ...POINT_TYPES.filter((type) => !type.system).map((type) => ({ id: type.id, label: type.filterLabel }))];
}
