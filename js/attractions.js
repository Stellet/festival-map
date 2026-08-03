export async function loadAttractions() {
  const response = await fetch('data/attractions.json');
  if (!response.ok) throw new Error('Não foi possível carregar as atrações.');
  return response.json();
}

export function getCategories() {
  return [
    { id: 'all', label: 'Todos' },
    { id: 'stages', label: 'Palcos' },
    { id: 'food', label: 'Alimentação' },
    { id: 'restrooms', label: 'Banheiros' },
    { id: 'services', label: 'Serviços' },
    { id: 'activities', label: 'Atividades' },
    { id: 'access', label: 'Acessos' }
  ];
}
