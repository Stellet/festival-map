export function renderTypeFilters(container, types, activeType, onSelect) {
  container.replaceChildren();
  const filters = [{ id: 'all', filterLabel: 'Todos' }, ...types];
  filters.forEach((type) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `filter-chip${type.id === activeType ? ' is-active' : ''}`;
    button.textContent = type.filterLabel;
    button.dataset.type = type.id;
    button.addEventListener('click', () => {
      container.querySelectorAll('.filter-chip').forEach((item) => item.classList.remove('is-active'));
      button.classList.add('is-active');
      onSelect(type.id);
    });
    container.appendChild(button);
  });
}

// Compatibilidade com chamadas externas anteriores.
export function createFilters(container, categories, onSelect) {
  renderTypeFilters(container, categories.map(({ id, label }) => ({ id, filterLabel: label })), 'all', onSelect);
}

export function openDetails(sheet, attraction) {
  document.querySelector('#detailCategory').textContent = attraction.category;
  document.querySelector('#detailTitle').textContent = attraction.name;
  document.querySelector('#detailDescription').textContent = attraction.description;
  document.querySelector('#detailAccessibility').textContent = attraction.accessible ? 'Acessível' : 'Não informado';
  document.querySelector('#detailSchedule').textContent = attraction.schedule ?? 'Não informado';
  sheet.classList.add('is-open');
  sheet.setAttribute('aria-hidden', 'false');
}

export function closeDetails(sheet) {
  sheet.classList.remove('is-open');
  sheet.setAttribute('aria-hidden', 'true');
}
