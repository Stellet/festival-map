export function createFilters(container, categories, onSelect) {
  categories.forEach((category, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `filter-chip${index === 0 ? ' is-active' : ''}`;
    button.textContent = category.label;
    button.dataset.category = category.id;
    button.addEventListener('click', () => {
      container.querySelectorAll('.filter-chip').forEach((item) => item.classList.remove('is-active'));
      button.classList.add('is-active');
      onSelect(category.id);
    });
    container.appendChild(button);
  });
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
