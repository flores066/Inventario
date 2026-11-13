document.addEventListener('DOMContentLoaded', async () => {
  const feedback = document.getElementById('pageFeedback');
  const money = value => '\$' + Number(value || 0).toLocaleString('es-CO');

  // Función helper para peticiones HTTP
  async function request(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No fue posible completar la solicitud.');
    return data;
  }

  const logoutButton = document.getElementById('logoutButton');
  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
      logoutButton.disabled = true;
      try {
        await request('/api/auth/logout', { method: 'POST' });
        window.location.replace('index.html');
      } catch (error) {
        if (feedback) feedback.textContent = error.message;
        logoutButton.disabled = false;
      }
    });
  }

  function showEmpty(container, message) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = message;
    container.appendChild(empty);
  }

  function renderCart(items) {
    const container = document.getElementById('cartItems');
    if (!container) return;
    container.replaceChildren();
    
    if (!items.length) {
      showEmpty(container, 'Tu carrito está vacío. Explora la tienda y agrega tus fragancias favoritas.');
      const cartTotal = document.getElementById('cartTotal');
      if (cartTotal) cartTotal.textContent = money(0);
      return;
    }
    
    let total = 0;
    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'cart-row';
      const details = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = item.name;
      const meta = document.createElement('small');
      meta.textContent = `${item.brand} · ${item.quantity} unidad(es)`;
      details.append(name, meta);
      const lineTotal = Number(item.price) * Number(item.quantity);
      total += lineTotal;
      const price = document.createElement('strong');
      price.textContent = money(lineTotal);
      row.append(details, price);
      container.appendChild(row);
    });
    
    const cartTotal = document.getElementById('cartTotal');
    if (cartTotal) cartTotal.textContent = money(total);
  }

  function renderOrders(orders) {
    const container = document.getElementById('orderList');
    if (!container) return;
    container.replaceChildren();
    
    if (!orders.length) {
      showEmpty(container, 'Aún no tienes compras. Cuando completes un pedido, aparecerá aquí.');
      return;
    }
    
    orders.forEach(order => {
      const card = document.createElement('article');
      card.className = 'order-item';
      const header = document.createElement('header');
      const heading = document.createElement('h3');
      heading.textContent = `Pedido #${order.id}`;
      const status = document.createElement('span');
      status.className = 'order-status';
      status.textContent = `${order.status} · Pago ${order.paymentStatus}`;
      header.append(heading, status);
      const date = document.createElement('time');
      date.dateTime = order.createdAt;
      date.textContent = new Date(order.createdAt).toLocaleString('es-CO');
      const contents = document.createElement('p');
      contents.textContent = order.items.map(item => `${item.name} (${item.quantity})`).join(', ') || 'Sin detalle de productos';
      const total = document.createElement('div');
      total.className = 'order-total';
      total.textContent = `Total: ${money(order.total)}`;
      card.append(header, date, contents, total);
      
      if (order.paymentStatus === 'Pagado') {
        const invoice = document.createElement('a');
        invoice.className = 'button-link invoice-link';
        invoice.href = `/api/orders/${encodeURIComponent(order.id)}/invoice`;
        invoice.download = `Factura-LessPerfum-${order.id}.pdf`;
        invoice.textContent = 'Descargar factura PDF';
        card.appendChild(invoice);
      }
      container.appendChild(card);
    });
  }

  const customerNameEl = document.getElementById('customerName');
  if (customerNameEl) {
    try {
      const data = await request('/api/account/summary');
      const customer = data.customer;

      customerNameEl.textContent = customer.name || 'cliente';
      
      const profileEmail = document.getElementById('profileEmail');
      if (profileEmail) profileEmail.textContent = customer.email;
      
      const customerEmail = document.getElementById('customerEmail');
      if (customerEmail) customerEmail.textContent = customer.email;

      const profileName = document.getElementById('profileName');
      if (profileName) profileName.textContent = `${customer.name || ''} ${customer.surname || ''}`.trim();

      const profilePhone = document.getElementById('profilePhone');
      if (profilePhone) profilePhone.textContent = customer.phone || 'Sin registrar';

      const profileAddress = document.getElementById('profileAddress');
      if (profileAddress) {
        profileAddress.textContent = [customer.address, customer.city].filter(Boolean).join(', ') || 'Sin registrar';
      }

      const addressButton = document.getElementById('addAddressButton');
      if (addressButton) {
        addressButton.addEventListener('click', () => {
          window.location.href = 'formularios/address.html';
        });
      }

      renderCart(data.cart || []);
      renderOrders(data.orders || []);
    } catch (error) {
      if (error.message.includes('Inicia sesión')) {
        window.location.replace('formularios/login.html?redirect=account');
        return;
      }
      if (feedback) feedback.textContent = error.message;
    }
  }

});