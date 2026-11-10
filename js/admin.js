document.addEventListener('DOMContentLoaded', () => {
  const loginView = document.getElementById('loginView');
  const dashboardView = document.getElementById('dashboardView');
  const dashboardError = document.getElementById('dashboardError');
  const loginError = document.getElementById('adminLoginError');
  const formatMoney = value => '$' + Number(value || 0).toLocaleString('es-CO');
  const formatDate = value => value ? new Date(value).toLocaleString('es-CO') : '—';
  const sectionLabels = {
    overview: 'Resumen',
    inventory: 'Inventario',
    customers: 'Clientes',
    orders: 'Pedidos'
  };
  let products = [];
  let customers = [];
  let orders = [];

  function renderFilteredData() {
    const productQuery = document.getElementById('productSearch').value.trim().toLocaleLowerCase('es-CO');
    const customerQuery = document.getElementById('customerSearch').value.trim().toLocaleLowerCase('es-CO');
    const orderQuery = document.getElementById('orderSearch').value.trim().toLocaleLowerCase('es-CO');
    renderProducts(products.filter(product =>
      `${product.name} ${product.brand} ${product.category}`.toLocaleLowerCase('es-CO').includes(productQuery)
    ));
    renderCustomers(customers.filter(customer =>
      `${customer.name} ${customer.surname} ${customer.email} ${customer.city || ''}`.toLocaleLowerCase('es-CO').includes(customerQuery)
    ));
    renderOrders(orders.filter(order =>
      `${order.id} ${order.customer} ${order.email} ${order.status} ${order.paymentStatus}`.toLocaleLowerCase('es-CO').includes(orderQuery)
    ));
  }

  async function request(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No fue posible completar la solicitud.');
    return data;
  }

  function addCell(row, value, className = '') {
    const cell = document.createElement('td');
    cell.textContent = value == null || value === '' ? '—' : String(value);
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
    if (type === 'number') { input.min = '0'; input.step = '1'; }
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
      const cell = addCell(row, 'No hay productos para mostrar.', 'empty-row');
      cell.colSpan = 10;
      body.appendChild(row);
      return;
    }

    entries.forEach(product => {
      const row = document.createElement('tr');
      row.dataset.id = product.id;
      addCell(row, '').appendChild(makeInput(product.name, 'name'));
      addCell(row, '').appendChild(makeInput(product.brand, 'brand'));
      addCell(row, '').appendChild(makeSelect(
        [['mujer', 'Mujer'], ['hombre', 'Hombre'], ['nicho', 'Nicho'], ['arabe', 'Árabe'], ['oferta', 'Oferta']],
        product.category, 'category'
      ));
      addCell(row, '').appendChild(makeInput(product.price, 'price', 'number'));
      addCell(row, '', product.stock <= 5 ? 'low-stock' : '').appendChild(makeInput(product.stock, 'stock', 'number'));
      addCell(row, '').appendChild(makeInput(product.img, 'img', 'url'));
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

  function renderCustomers(entries) {
    const body = document.getElementById('customerRows');
    body.replaceChildren();
    if (!entries.length) {
      const row = document.createElement('tr');
      const cell = addCell(row, 'Aún no hay clientes registrados.', 'empty-row');
      cell.colSpan = 8;
      body.appendChild(row);
      return;
    }
    entries.forEach(customer => {
      const row = document.createElement('tr');
      row.dataset.id = customer.id;
      addCell(row, `${customer.name} ${customer.surname}`);
      addCell(row, customer.email);
      addCell(row, customer.phone);
      addCell(row, customer.city);
      addCell(row, customer.address);
      addCell(row, formatDate(customer.createdAt));
      addCell(row, '').appendChild(makeSelect(
        [['Activo', 'Activo'], ['Inactivo', 'Inactivo']],
        customer.status, 'status'
      ));
      const actionCell = addCell(row, '');
      const saveButton = document.createElement('button');
      saveButton.type = 'button';
      saveButton.className = 'table-button';
      saveButton.dataset.action = 'save-customer';
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
      const cell = addCell(row, 'Aún no hay pedidos registrados.', 'empty-row');
      cell.colSpan = 11;
      body.appendChild(row);
      return;
    }
    entries.forEach(order => {
      const row = document.createElement('tr');
      row.dataset.id = order.id;
      addCell(row, `#${order.id}`);
      addCell(row, order.customer);
      addCell(row, order.email);
      addCell(row, order.phone);
      addCell(row, `${order.address || '—'}${order.city ? `, ${order.city}` : ''}`);
      addCell(row, order.itemCount);
      addCell(row, formatMoney(order.total));
      addCell(row, order.paymentStatus);
      addCell(row, '').appendChild(makeSelect(
        [['Pendiente', 'Pendiente'], ['Aprobada', 'Aprobada'], ['Cancelada', 'Cancelada'], ['Entregada', 'Entregada']],
        order.status, 'status'
      ));
      addCell(row, formatDate(order.createdAt));
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

  function renderReceipts(entries) {
    const body = document.getElementById('receiptRows');
    body.replaceChildren();
    if (!entries.length) {
      const row = document.createElement('tr');
      const cell = addCell(row, 'El proveedor aún no ha registrado recepciones.', 'empty-row');
      cell.colSpan = 6;
      body.appendChild(row);
      return;
    }
    entries.forEach(receipt => {
      const row = document.createElement('tr');
      addCell(row, formatDate(receipt.receivedAt));
      addCell(row, `${receipt.supplier} (${receipt.supplierEmail})`);
      addCell(row, receipt.reference);
      addCell(row, `${receipt.product} — ${receipt.brand}`);
      addCell(row, `+${receipt.quantity}`);
      addCell(row, receipt.notes);
      body.appendChild(row);
    });
  }

  async function loadDashboard() {
    dashboardError.textContent = '';
    const data = await request('/api/admin/summary');
    document.getElementById('productCount').textContent = data.stats.products;
    document.getElementById('lowStockCount').textContent = data.stats.lowStock;
    document.getElementById('customerCount').textContent = data.stats.customers;
    document.getElementById('orderCount').textContent = data.stats.orders;
    document.getElementById('salesTotal').textContent = formatMoney(data.stats.sales);
    document.getElementById('navProductCount').textContent = data.stats.products;
    document.getElementById('navCustomerCount').textContent = data.stats.customers;
    document.getElementById('navOrderCount').textContent = data.stats.orders;
    document.getElementById('lastUpdated').textContent = `Actualizado ${new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`;
    document.getElementById('modeNote').textContent = 'Datos sincronizados desde la base PostgreSQL.';
    products = data.products;
    customers = data.customers;
    orders = data.orders;
    renderFilteredData();
    renderReceipts(data.receipts || []);
    loginView.hidden = true;
    dashboardView.hidden = false;
  }

  document.getElementById('productForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const product = {
      name: values.get('name'),
      brand: values.get('brand'),
      category: values.get('category'),
      price: Number(values.get('price')),
      stock: Number(values.get('stock')),
      img: values.get('img'),
      badge: values.get('badge'),
      badgeType: values.get('badgeType')
    };
    try {
      await request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(product)
      });
      form.reset();
      document.getElementById('productFeedback').textContent = 'Producto guardado en la base de datos; el catálogo se actualizará automáticamente.';
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
      name: field('name').value.trim(),
      brand: field('brand').value.trim(),
      category: field('category').value,
      price: Number(field('price').value),
      stock: Number(field('stock').value),
      img: field('img').value.trim(),
      badge: field('badge').value.trim(),
      badgeType: field('badgeType').value,
      active: field('active').checked
    };
    button.disabled = true;
    try {
      await request(`/api/admin/products/${row.dataset.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(product)
      });
      document.getElementById('productFeedback').textContent = 'Cambios guardados; el catálogo y el inventario se sincronizarán automáticamente.';
      await loadDashboard();
    } catch (error) {
      document.getElementById('productFeedback').textContent = error.message;
      button.disabled = false;
    }
  });

  document.getElementById('customerRows').addEventListener('click', async event => {
    const button = event.target.closest('[data-action="save-customer"]');
    if (!button) return;
    const row = button.closest('tr');
    button.disabled = true;
    try {
      await request(`/api/admin/customers/${row.dataset.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: row.querySelector('[data-field="status"]').value })
      });
      await loadDashboard();
      dashboardError.textContent = 'Estado del cliente actualizado.';
    } catch (error) {
      dashboardError.textContent = error.message;
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
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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

  document.getElementById('menuToggle').addEventListener('click', event => {
    const isOpen = dashboardView.classList.toggle('menu-open');
    event.currentTarget.setAttribute('aria-expanded', String(isOpen));
    event.currentTarget.setAttribute('aria-label', isOpen ? 'Cerrar menú' : 'Abrir menú');
  });

  function closeMobileMenu() {
    dashboardView.classList.remove('menu-open');
    const menuToggle = document.getElementById('menuToggle');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Abrir menú');
  }

  document.getElementById('sidebarBackdrop').addEventListener('click', closeMobileMenu);
  document.querySelectorAll('.nav-link[data-section]').forEach(link => {
    link.addEventListener('click', () => {
      document.querySelectorAll('.nav-link[data-section]').forEach(item => item.classList.remove('active'));
      link.classList.add('active');
      document.getElementById('currentSectionLabel').textContent = sectionLabels[link.dataset.section];
      closeMobileMenu();
    });
  });

  const sectionObserver = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    const section = visible.target.id;
    document.querySelectorAll('.nav-link[data-section]').forEach(link => {
      const active = link.dataset.section === section;
      link.classList.toggle('active', active);
      if (active) document.getElementById('currentSectionLabel').textContent = sectionLabels[section];
    });
  }, { rootMargin: '-20% 0px -65% 0px', threshold: [0, 0.1, 0.5] });
  Object.keys(sectionLabels).forEach(id => sectionObserver.observe(document.getElementById(id)));

  document.getElementById('productSearch').addEventListener('input', renderFilteredData);
  document.getElementById('customerSearch').addEventListener('input', renderFilteredData);
  document.getElementById('orderSearch').addEventListener('input', renderFilteredData);

  document.getElementById('logoutButton').addEventListener('click', async () => {
    try {
      await request('/api/admin/logout', { method: 'POST' });
      window.location.href = 'formularios/login.html';
    } catch (error) {
      dashboardError.textContent = error.message;
    }
  });

  request('/api/admin/session').then(session => {
    if (!session.authenticated) {
      window.location.replace('formularios/login.html?redirect=admin');
      return;
    }
    document.getElementById('adminWelcome').textContent = `Sesión iniciada como ${session.user.email}`;
    document.getElementById('adminProfileEmail').textContent = session.user.email;
    return loadDashboard();
  }).catch(error => {
    loginError.textContent = error.message;
  });

  window.setInterval(() => {
    if (!dashboardView.hidden && !dashboardView.contains(document.activeElement)) {
      loadDashboard().catch(error => { dashboardError.textContent = error.message; });
    }
  }, 10000);
});
