document.addEventListener('DOMContentLoaded', () => {
  const loginView = document.getElementById('loginView');
  const dashboardView = document.getElementById('dashboardView');
  const dashboardError = document.getElementById('dashboardError');

  const formatMoney = value => '$' + Number(value || 0).toLocaleString('es-CO');

  async function request(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No fue posible completar la solicitud.');
    return data;
  }

  function addCell(row, value, className = '') {
    const cell = document.createElement('td');
    cell.textContent = value == null ? '—' : String(value);
    if (className) cell.className = className;
    row.appendChild(cell);
    return cell;
  }

  function makeInput(value, name, type = 'text') {
    const input = document.createElement('input');
    input.className = 'table-input';
    input.dataset.field = name;
    input.type = type;
    input.value = value ?? '';
    if (type === 'number') { input.min = '0'; input.step = name === 'price' ? '1' : '1'; }
    return input;
  }

  function makeSelect(options, value, name) {
    const select = document.createElement('select');
    select.className = 'table-input';
    select.dataset.field = name;
    options.forEach(([optionValue, label]) => {
      const option = document.createElement('option');
      option.value = optionValue;
      option.textContent = label;
      select.appendChild(option);
    });
    select.value = value ?? '';
    return select;
  }

  function renderProducts(entries) {
    const body = document.getElementById('productRows');
    body.replaceChildren();
    if (!entries.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.className = 'empty-row';
      cell.colSpan = 9;
      cell.textContent = 'No hay productos para mostrar.';
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }

    entries.forEach(product => {
      const row = document.createElement('tr');
      row.dataset.id = product.id;
      addCell(row, '').appendChild(makeInput(product.name, 'name'));
      addCell(row, '').appendChild(makeInput(product.brand, 'brand'));
      addCell(row, '').appendChild(makeSelect([['mujer', 'Mujer'], ['hombre', 'Hombre'], ['nicho', 'Nicho'], ['arabe', 'Árabe'], ['oferta', 'Oferta']], product.category, 'category'));
      addCell(row, '').appendChild(makeInput(product.price, 'price', 'number'));
      const stockCell = addCell(row, '', product.stock <= 5 ? 'low-stock' : '');
      stockCell.appendChild(makeInput(product.stock, 'stock', 'number'));
      addCell(row, '').appendChild(makeInput(product.badge, 'badge'));
      addCell(row, '').appendChild(makeSelect([['', 'Normal'], ['sale', 'Oferta']], product.badgeType, 'badgeType'));
      const activeCell = addCell(row, '');
      const active = document.createElement('input');
      active.type = 'checkbox';
      active.dataset.field = 'active';
      active.checked = product.active;
      active.setAttribute('aria-label', `Producto visible: ${product.name}`);
      activeCell.appendChild(active);
      const actionCell = addCell(row, '');
      const saveButton = document.createElement('button');
      saveButton.type = 'button';
      saveButton.className = 'table-button';
      saveButton.dataset.action = 'save-product';
      saveButton.textContent = 'Guardar';
      actionCell.appendChild(saveButton);
      body.appendChild(row);
    });
  }

  function renderOrders(entries) {
    const body = document.getElementById('orderRows');
    body.replaceChildren();
    if (!entries.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.className = 'empty-row';
      cell.colSpan = 7;
      cell.textContent = 'Aún no hay pedidos registrados.';
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }
    entries.forEach(order => {
      const row = document.createElement('tr');
      row.dataset.id = order.id;
      addCell(row, `#${order.id}`);
      addCell(row, order.customer);
      addCell(row, order.email);
      addCell(row, order.itemCount);
      addCell(row, formatMoney(order.total));
      addCell(row, '').appendChild(makeSelect([['Pendiente', 'Pendiente'], ['Aprobada', 'Aprobada'], ['Cancelada', 'Cancelada'], ['Entregada', 'Entregada']], order.status, 'status'));
      const actionCell = addCell(row, '');
      const saveButton = document.createElement('button');
      saveButton.type = 'button';
      saveButton.className = 'table-button';
      saveButton.dataset.action = 'save-order';
      saveButton.textContent = 'Guardar';
      actionCell.appendChild(saveButton);
      body.appendChild(row);
    });
  }

  async function loadDashboard() {
    dashboardError.textContent = '';
    const data = await request('/api/admin/summary');
    document.getElementById('productCount').textContent = data.stats.products;
    document.getElementById('customerCount').textContent = data.stats.customers;
    document.getElementById('orderCount').textContent = data.stats.orders;
    document.getElementById('salesTotal').textContent = formatMoney(data.stats.sales);
    document.getElementById('modeNote').textContent = data.mode === 'demo'
      ? 'Modo demostración: los cambios y pedidos se guardan solo mientras el servidor siga encendido.'
      : 'Datos cargados desde la base de datos.';

    renderProducts(data.products);
    renderOrders(data.orders);

    loginView.hidden = true;
    dashboardView.hidden = false;
  }

  document.getElementById('productForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const product = {
      name: values.get('name'), brand: values.get('brand'), category: values.get('category'),
      price: Number(values.get('price')), stock: Number(values.get('stock')),
      badge: values.get('badge'), badgeType: values.get('badgeType')
    };
    try {
      await request('/api/admin/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(product) });
      form.reset();
      document.getElementById('productFeedback').textContent = 'Producto agregado; el catálogo se actualizará automáticamente.';
      await loadDashboard();
    } catch (error) {
      document.getElementById('productFeedback').textContent = error.message;
    }
  });

  document.getElementById('productRows').addEventListener('click', async event => {
    const button = event.target.closest('[data-action="save-product"]');
    if (!button) return;
    const row = button.closest('tr');
    const field = name => row.querySelector(`[data-field="${name}"]`);
    const product = {
      name: field('name').value.trim(), brand: field('brand').value.trim(), category: field('category').value,
      price: Number(field('price').value), stock: Number(field('stock').value), badge: field('badge').value.trim(),
      badgeType: field('badgeType').value, active: field('active').checked
    };
    button.disabled = true;
    try {
      await request(`/api/admin/products/${row.dataset.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(product) });
      document.getElementById('productFeedback').textContent = 'Cambios guardados; el catálogo se actualizará automáticamente.';
      await loadDashboard();
    } catch (error) {
      document.getElementById('productFeedback').textContent = error.message;
      button.disabled = false;
    }
  });

  document.getElementById('orderRows').addEventListener('click', async event => {
    const button = event.target.closest('[data-action="save-order"]');
    if (!button) return;
    const row = button.closest('tr');
    button.disabled = true;
    try {
      await request(`/api/admin/orders/${row.dataset.id}/status`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: row.querySelector('[data-field="status"]').value })
      });
      await loadDashboard();
      dashboardError.textContent = 'Estado del pedido actualizado.';
    } catch (error) {
      dashboardError.textContent = error.message;
      button.disabled = false;
    }
  });

  document.getElementById('refreshButton').addEventListener('click', () => {
    loadDashboard().catch(error => { dashboardError.textContent = error.message; });
  });

  document.getElementById('logoutButton').addEventListener('click', async () => {
    await request('/api/admin/logout', { method: 'POST' }).catch(() => {});
    window.location.href = 'formularios/login.html';
  });

  request('/api/admin/session').then(session => {
    if (!session.authenticated) {
      window.location.replace('formularios/login.html?redirect=admin');
      return;
    }
    document.getElementById('adminWelcome').textContent = `Sesión iniciada como ${session.user.email}`;
    return loadDashboard();
  }).catch(() => {});

  setInterval(() => {
    if (!dashboardView.hidden && !dashboardView.contains(document.activeElement)) {
      loadDashboard().catch(error => { dashboardError.textContent = error.message; });
    }
  }, 10000);
});
