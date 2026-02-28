const loginPanel = document.getElementById('loginPanel');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('loginForm');
const loginStatus = document.getElementById('loginStatus');
const logoutButton = document.getElementById('logoutButton');
const statsGrid = document.getElementById('statsGrid');
const propertyForm = document.getElementById('propertyForm');
const propertyStatus = document.getElementById('propertyStatus');
const resetPropertyFormButton = document.getElementById('resetPropertyForm');
const propertiesTableBody = document.getElementById('propertiesTableBody');
const inquiriesTableBody = document.getElementById('inquiriesTableBody');
const TOKEN_KEY = 'inmo_admin_token';

const state = {
  properties: [],
  inquiries: [],
  editingId: null
};

function formatCurrency(amount, currency) {
  const locale = currency === 'ARS' ? 'es-AR' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 0
  }).format(amount || 0);
}

function formatDate(value) {
  return new Date(value).toLocaleString('es-AR');
}

async function api(path, options = {}) {
  const token = window.localStorage.getItem(TOKEN_KEY);
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-admin-token': token } : {}),
      ...(options.headers || {})
    },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data.issues && data.issues[0]) || data.error || 'Request failed');
  }
  return data;
}

function toggleAuthenticated(isAuthenticated) {
  loginPanel.hidden = isAuthenticated;
  dashboard.hidden = !isAuthenticated;
}

function renderStats() {
  const stats = [
    ['Propiedades activas', state.properties.length],
    ['Destacadas', state.properties.filter((item) => item.featured).length],
    ['Consultas nuevas', state.inquiries.filter((item) => item.status === 'new').length],
    ['Marcadas spam', state.inquiries.filter((item) => item.status === 'spam').length]
  ];

  statsGrid.innerHTML = '';
  stats.forEach(([label, value]) => {
    const card = document.createElement('article');
    card.className = 'stat-card';
    card.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
    statsGrid.appendChild(card);
  });
}

function fillPropertyForm(property) {
  state.editingId = property ? property.id : null;
  propertyForm.reset();
  propertyStatus.textContent = '';
  propertyForm.elements.id.value = property ? property.id : '';
  propertyForm.elements.code.value = property ? property.code : '';
  propertyForm.elements.title.value = property ? property.title : '';
  propertyForm.elements.operation.value = property ? property.operation : 'Venta';
  propertyForm.elements.type.value = property ? property.type : 'Casa';
  propertyForm.elements.city.value = property ? property.city : '';
  propertyForm.elements.zone.value = property ? property.zone : '';
  propertyForm.elements.address.value = property ? property.address : '';
  propertyForm.elements.price.value = property ? property.price : '';
  propertyForm.elements.currency.value = property ? property.currency : 'USD';
  propertyForm.elements.bedrooms.value = property ? property.bedrooms : '';
  propertyForm.elements.bathrooms.value = property ? property.bathrooms : '';
  propertyForm.elements.area.value = property ? property.area : '';
  propertyForm.elements.tag.value = property ? property.tag : '';
  propertyForm.elements.accent.value = property ? property.accent : 'sunrise';
  propertyForm.elements.summary.value = property ? property.summary : '';
  propertyForm.elements.description.value = property ? property.description : '';
  propertyForm.elements.amenities.value = property ? property.amenities.join(', ') : '';
  propertyForm.elements.featured.checked = Boolean(property && property.featured);
  propertyForm.elements.status.checked = !property || property.status === 'active';
}

function renderProperties() {
  propertiesTableBody.innerHTML = '';
  state.properties.forEach((property) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${property.code}</td>
      <td>${property.title}</td>
      <td>${property.operation}</td>
      <td>${property.city}</td>
      <td>${formatCurrency(property.price, property.currency)}</td>
      <td><div class="row-actions"></div></td>
    `;
    const actions = row.querySelector('.row-actions');

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.textContent = 'Editar';
    editButton.addEventListener('click', () => fillPropertyForm(property));

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.textContent = 'Eliminar';
    deleteButton.className = 'delete-btn';
    deleteButton.addEventListener('click', async () => {
      if (!window.confirm(`Eliminar ${property.title}?`)) return;
      await api(`/api/admin/properties/${property.id}`, { method: 'DELETE' });
      await loadDashboard();
    });

    actions.append(editButton, deleteButton);
    propertiesTableBody.appendChild(row);
  });
}

async function updateInquiryStatus(inquiryId, status) {
  await api(`/api/admin/inquiries/${inquiryId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });
  await loadDashboard();
}

function renderInquiries() {
  inquiriesTableBody.innerHTML = '';
  state.inquiries.forEach((inquiry) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${formatDate(inquiry.createdAt)}</td>
      <td>${inquiry.source}</td>
      <td>${inquiry.name}</td>
      <td><a href="mailto:${inquiry.email}">${inquiry.email}</a></td>
      <td>${inquiry.phone || '-'}</td>
      <td></td>
      <td class="message-cell">${inquiry.message}</td>
    `;

    const statusCell = row.children[5];
    const select = document.createElement('select');
    select.className = 'status-select';
    ['new', 'read', 'answered', 'spam'].forEach((optionValue) => {
      const option = document.createElement('option');
      option.value = optionValue;
      option.textContent = optionValue;
      option.selected = inquiry.status === optionValue;
      select.appendChild(option);
    });
    select.addEventListener('change', () => updateInquiryStatus(inquiry.id, select.value));
    statusCell.appendChild(select);

    inquiriesTableBody.appendChild(row);
  });
}

async function loadDashboard() {
  const [propertiesPayload, inquiriesPayload] = await Promise.all([
    api('/api/admin/properties'),
    api('/api/admin/inquiries')
  ]);

  state.properties = propertiesPayload.items || [];
  state.inquiries = inquiriesPayload.items || [];
  renderStats();
  renderProperties();
  renderInquiries();
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginStatus.textContent = 'Ingresando...';
  const formData = new FormData(loginForm);
  const payload = Object.fromEntries(formData.entries());
  try {
    const login = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (login.token) {
      window.localStorage.setItem(TOKEN_KEY, login.token);
    }
    loginStatus.textContent = 'Ingreso correcto. Abriendo panel...';
    window.setTimeout(() => {
      window.location.replace('/admin/?session=ok');
    }, 200);
  } catch (error) {
    loginStatus.textContent = error.message || 'No se pudo ingresar.';
  }
});

logoutButton.addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' });
  window.localStorage.removeItem(TOKEN_KEY);
  toggleAuthenticated(false);
});

resetPropertyFormButton.addEventListener('click', () => fillPropertyForm(null));

propertyForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  propertyStatus.textContent = 'Guardando...';
  const formData = new FormData(propertyForm);
  const payload = Object.fromEntries(formData.entries());
  payload.featured = propertyForm.elements.featured.checked;
  payload.status = propertyForm.elements.status.checked ? 'active' : 'draft';

  try {
    if (state.editingId) {
      await api(`/api/admin/properties/${state.editingId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    } else {
      await api('/api/admin/properties', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }
    propertyStatus.textContent = 'Propiedad guardada.';
    fillPropertyForm(null);
    await loadDashboard();
  } catch (error) {
    propertyStatus.textContent = error.message || 'No se pudo guardar.';
  }
});

async function boot() {
  try {
    const session = await api('/api/admin/session');
    toggleAuthenticated(Boolean(session.authenticated));
    fillPropertyForm(null);
    if (session.authenticated) {
      const params = new URLSearchParams(window.location.search);
      if (params.get('session') === 'ok') {
        window.history.replaceState({}, '', '/admin/');
      }
      await loadDashboard();
    }
  } catch (_error) {
    window.localStorage.removeItem(TOKEN_KEY);
    toggleAuthenticated(false);
  }
}

boot();
