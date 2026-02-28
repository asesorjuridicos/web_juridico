const propertyGrid = document.getElementById('propertyGrid');
const featuredGrid = document.getElementById('featuredGrid');
const filterForm = document.getElementById('filterForm');
const filterOperation = document.getElementById('filterOperation');
const filterType = document.getElementById('filterType');
const filterCity = document.getElementById('filterCity');
const filterQuery = document.getElementById('filterQuery');
const resultsSummary = document.getElementById('resultsSummary');
const metricTotal = document.getElementById('metricTotal');
const metricCities = document.getElementById('metricCities');
const metricFeatured = document.getElementById('metricFeatured');
const propertyModal = document.getElementById('propertyModal');
const modalVisual = document.getElementById('modalVisual');
const modalCode = document.getElementById('modalCode');
const modalTitle = document.getElementById('modalTitle');
const modalMeta = document.getElementById('modalMeta');
const modalPrice = document.getElementById('modalPrice');
const modalDescription = document.getElementById('modalDescription');
const modalAmenities = document.getElementById('modalAmenities');
const modalContactButton = document.getElementById('modalContactButton');
const contactForm = document.getElementById('contactForm');
const valuationForm = document.getElementById('valuationForm');
const contactStatus = document.getElementById('contactStatus');
const valuationStatus = document.getElementById('valuationStatus');

const state = {
  properties: [],
  filtered: [],
  activeProperty: null
};

function formatCurrency(amount, currency) {
  const locale = currency === 'ARS' ? 'es-AR' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 0
  }).format(amount || 0);
}

function uniqueValues(items, field) {
  return [...new Set(items.map((item) => item[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function populateSelect(select, items) {
  const current = select.value;
  while (select.options.length > 1) {
    select.remove(1);
  }
  items.forEach((item) => {
    const option = document.createElement('option');
    option.value = item;
    option.textContent = item;
    select.appendChild(option);
  });
  select.value = current;
}

function createMetaItem(text) {
  const item = document.createElement('span');
  item.textContent = text;
  return item;
}

function renderPropertyCard(property) {
  const article = document.createElement('article');
  article.className = 'property-card';
  article.innerHTML = `
    <div class="property-visual accent-${property.accent}">
      <span class="badge">${property.tag || property.operation}</span>
      <p class="code">${property.code}</p>
    </div>
    <div class="property-content">
      <div class="property-topline">
        <span>${property.operation}</span>
        <span>${property.city}</span>
      </div>
      <h3>${property.title}</h3>
      <p class="property-summary">${property.summary}</p>
      <div class="property-meta"></div>
      <div class="property-bottom">
        <span class="property-price">${formatCurrency(property.price, property.currency)}</span>
        <button class="property-link" type="button">Ver ficha</button>
      </div>
    </div>
  `;

  const metaWrap = article.querySelector('.property-meta');
  metaWrap.appendChild(createMetaItem(property.type));
  if (property.area) metaWrap.appendChild(createMetaItem(`${property.area} m2`));
  if (property.bedrooms) metaWrap.appendChild(createMetaItem(`${property.bedrooms} dorm.`));
  if (property.bathrooms) metaWrap.appendChild(createMetaItem(`${property.bathrooms} bano`));

  article.querySelector('.property-link').addEventListener('click', () => openModal(property));
  return article;
}

function renderProperties() {
  propertyGrid.innerHTML = '';
  featuredGrid.innerHTML = '';

  if (!state.filtered.length) {
    propertyGrid.innerHTML = '<p class="search-footnote">No hay propiedades que coincidan con ese filtro.</p>';
  } else {
    state.filtered.forEach((property) => {
      propertyGrid.appendChild(renderPropertyCard(property));
    });
  }

  const featured = state.properties.filter((property) => property.featured);
  featured.slice(0, 3).forEach((property) => {
    featuredGrid.appendChild(renderPropertyCard(property));
  });

  resultsSummary.textContent = `${state.filtered.length} propiedad/es visibles sobre ${state.properties.length} activas.`;
}

function applyFilters() {
  const query = filterQuery.value.trim().toLowerCase();
  const operation = filterOperation.value.trim().toLowerCase();
  const type = filterType.value.trim().toLowerCase();
  const city = filterCity.value.trim().toLowerCase();

  state.filtered = state.properties.filter((property) => {
    if (operation && property.operation.toLowerCase() !== operation) return false;
    if (type && property.type.toLowerCase() !== type) return false;
    if (city && property.city.toLowerCase() !== city) return false;
    if (query) {
      const haystack = [
        property.title,
        property.summary,
        property.type,
        property.operation,
        property.city,
        property.zone,
        property.address
      ].join(' ').toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  renderProperties();
}

function updateMetrics() {
  metricTotal.textContent = String(state.properties.length);
  metricCities.textContent = String(uniqueValues(state.properties, 'city').length);
  metricFeatured.textContent = String(state.properties.filter((property) => property.featured).length);
}

function openModal(property) {
  state.activeProperty = property;
  modalVisual.className = `modal-visual accent-${property.accent}`;
  modalCode.textContent = property.code;
  modalTitle.textContent = property.title;
  modalMeta.textContent = `${property.operation} · ${property.type} · ${property.city} · ${property.zone}`;
  modalPrice.textContent = formatCurrency(property.price, property.currency);
  modalDescription.textContent = property.description;
  modalAmenities.innerHTML = '';
  property.amenities.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    modalAmenities.appendChild(li);
  });
  propertyModal.hidden = false;
}

function closeModal() {
  propertyModal.hidden = true;
  state.activeProperty = null;
}

async function loadProperties() {
  const response = await fetch('/api/properties');
  const payload = await response.json();
  state.properties = payload.items || [];
  populateSelect(filterOperation, uniqueValues(state.properties, 'operation'));
  populateSelect(filterType, uniqueValues(state.properties, 'type'));
  populateSelect(filterCity, uniqueValues(state.properties, 'city'));
  updateMetrics();
  applyFilters();
}

async function submitLeadForm(form, statusNode) {
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  statusNode.textContent = 'Enviando...';

  try {
    const response = await fetch('/api/contact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error((data.issues && data.issues[0]) || data.message || 'No se pudo enviar.');
    }
    statusNode.textContent = data.message || 'Consulta enviada.';
    form.reset();
  } catch (error) {
    statusNode.textContent = error.message || 'No se pudo enviar.';
  }
}

filterForm.addEventListener('submit', (event) => {
  event.preventDefault();
  applyFilters();
});

contactForm.addEventListener('submit', (event) => {
  event.preventDefault();
  submitLeadForm(contactForm, contactStatus);
});

valuationForm.addEventListener('submit', (event) => {
  event.preventDefault();
  submitLeadForm(valuationForm, valuationStatus);
});

modalContactButton.addEventListener('click', () => {
  if (!state.activeProperty) return;
  closeModal();
  contactForm.querySelector('[name="message"]').value = `Hola, quiero informacion sobre ${state.activeProperty.title} (${state.activeProperty.code}).`;
  contactForm.querySelector('[name="city"]').value = state.activeProperty.city;
  contactForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

propertyModal.addEventListener('click', (event) => {
  if (event.target.hasAttribute('data-close-modal')) {
    closeModal();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !propertyModal.hidden) {
    closeModal();
  }
});

loadProperties().catch(() => {
  resultsSummary.textContent = 'No se pudo cargar el inventario.';
});
