document.addEventListener('DOMContentLoaded', async () => {
  let cart = [];
  const orderItems = document.getElementById('orderItems');
  const summarySubtotal = document.getElementById('summarySubtotal');
  const summaryTax = document.getElementById('summaryTax');
  const summaryTotal = document.getElementById('summaryTotal');
  const checkoutForm = document.getElementById('checkoutForm');
  const checkoutButton = document.getElementById('checkoutSubmit');
  const feedback = document.getElementById('checkoutFeedback');
  const shippingCost = 20000;
  const taxRate = 0.19;
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get('order');
  const transactionId = params.get('id');

  const safeText = value => String(value ?? '').replace(/[<>]/g, '');
  const formatMoney = value => '$' + Number(value || 0).toLocaleString('es-CO');

  function showToast(message) {
    feedback.textContent = message;
    feedback.classList.add('visible');
  }

  function calculateTotals() {
    const subtotal = cart.reduce((sum, item) => sum + Number(item.price) * item.qty, 0);
    const tax = Math.round(subtotal * taxRate);
    summarySubtotal.textContent = formatMoney(subtotal);
    summaryTax.textContent = formatMoney(tax);
    summaryTotal.textContent = formatMoney(subtotal + shippingCost + tax);
  }

  function renderCartSummary() {
    if (!cart.length) {
      orderItems.innerHTML = '<p class="empty-message">No hay productos en tu carrito. <a href="index.html">Volver a la tienda</a>.</p>';
      checkoutButton.disabled = true;
      return;
    }
    orderItems.replaceChildren();
    cart.forEach(item => {
      const line = document.createElement('div');
      line.className = 'order-item';
      const description = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = item.name;
      const details = document.createElement('small');
      details.textContent = `${item.brand} · x${item.qty}`;
      const price = document.createElement('div');
      price.textContent = formatMoney(Number(item.price) * item.qty);
      description.append(name, details);
      line.append(description, price);
      orderItems.appendChild(line);
    });
    calculateTotals();
  }

  async function showOrderStatus(id) {
    checkoutForm.hidden = true;
    document.getElementById('orderItems').innerHTML = '<p class="empty-message">Estamos confirmando tu pago con Wompi…</p>';
    checkoutButton.disabled = true;
    const attempts = transactionId ? 5 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const response = await fetch(`/api/orders/${encodeURIComponent(id)}/status`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No fue posible consultar tu pedido.');
      if (data.paymentStatus === 'Pagado') {
        showToast('Pago aprobado. Tu pedido fue confirmado; gracias por comprar en Less Perfum.');
        return;
      }
      if (data.paymentStatus === 'Rechazado' || data.paymentStatus === 'Expirado') {
        showToast('El pago no fue aprobado. La reserva de inventario se liberó; puedes volver a intentar la compra.');
        return;
      }
      if (attempt < attempts - 1) await new Promise(resolve => window.setTimeout(resolve, 3000));
    }
    showToast('Tu pago está pendiente de confirmación. Te avisaremos cuando Wompi lo confirme.');
  }

  try {
    const sessionResponse = await fetch('/api/auth/session');
    const session = await sessionResponse.json();
    if (!sessionResponse.ok) throw new Error(session.error || 'No fue posible verificar tu sesión.');
    if (!session.authenticated || session.role === 'admin') {
      document.getElementById('checkoutAuthGate').hidden = false;
      document.getElementById('checkoutMain').hidden = true;
      return;
    }

    document.getElementById('fullName').value = session.user.name || '';
    document.getElementById('email').value = session.user.email || '';
    if (orderId && /^\d+$/.test(orderId)) {
      await showOrderStatus(orderId);
      return;
    }

    const cartResponse = await fetch('/api/cart');
    if (!cartResponse.ok) throw new Error('No fue posible cargar el carrito.');
    cart = await cartResponse.json();
    renderCartSummary();
  } catch (error) {
    showToast(error.message);
    checkoutButton.disabled = true;
  }

  checkoutForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!cart.length) return;
    const phone = document.getElementById('phone');
    const address = document.getElementById('address');
    const city = document.getElementById('city');
    const phoneValue = phone.value.trim();
    const addressValue = address.value.trim().replace(/\s+/g, ' ');
    const cityValue = city.value.trim().replace(/\s+/g, ' ');
    document.querySelectorAll('.field-error').forEach(element => { element.textContent = ''; });
    [phone, address, city].forEach(field => field.classList.remove('error'));
    let valid = true;
    const phoneDigits = phoneValue.replace(/\D/g, '');
    if (!/^\+?[\d\s()-]+$/.test(phoneValue) || phoneDigits.length < 8 || phoneDigits.length > 15) {
      document.getElementById('phoneErr').textContent = 'Ingresa un teléfono válido.';
      phone.classList.add('error');
      valid = false;
    }
    if (addressValue.length < 8 || /(\p{L})\1{3,}/iu.test(addressValue)) {
      document.getElementById('addressErr').textContent = 'Ingresa una dirección completa.';
      address.classList.add('error');
      valid = false;
    }
    if (cityValue.length < 2 || cityValue.length > 80 ||
        !/^[\p{L}][\p{L}\s.'-]*[\p{L}]$/u.test(cityValue) ||
        /(\p{L})\1{3,}/iu.test(cityValue)) {
      document.getElementById('cityErr').textContent = 'Ingresa tu ciudad.';
      city.classList.add('error');
      valid = false;
    }
    if (!valid) {
      showToast('Corrige los datos de entrega antes de continuar.');
      return;
    }

    checkoutButton.disabled = true;
    checkoutButton.classList.add('loading');
    checkoutButton.textContent = 'Preparando pago seguro…';
    feedback.textContent = '';
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phoneValue,
          address: addressValue,
          city: cityValue
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No fue posible iniciar el pago.');

      const paymentForm = document.createElement('form');
      paymentForm.method = 'POST';
      paymentForm.action = data.checkout.url;
      paymentForm.hidden = true;
      Object.entries(data.checkout.fields).forEach(([name, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        paymentForm.appendChild(input);
      });
      document.body.appendChild(paymentForm);
      paymentForm.submit();
    } catch (error) {
      showToast(safeText(error.message));
      checkoutButton.disabled = false;
      checkoutButton.classList.remove('loading');
      checkoutButton.textContent = 'Continuar a pagar';
    }
  });
});
