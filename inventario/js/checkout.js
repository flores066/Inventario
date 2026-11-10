document.addEventListener('DOMContentLoaded', () => {
  let cart = [];
  const orderItems = document.getElementById('orderItems');
  const summarySubtotal = document.getElementById('summarySubtotal');
  const summaryShipping = document.getElementById('summaryShipping');
  const summaryTax = document.getElementById('summaryTax');
  const summaryTotal = document.getElementById('summaryTotal');
  const paymentRadios = Array.from(document.querySelectorAll('input[name="paymentMethod"]'));
  const cardDetails = document.getElementById('cardDetails');
  const checkoutForm = document.getElementById('checkoutForm');

  const shippingCost = 20000;
  const taxRate = 0.19;

  const sanitize = value => value.toString().replace(/[<>]/g, '');

  function formatMoney(value) {
    return '$' + value.toLocaleString('es-CO');
  }

  function calculateTotals() {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const tax = Math.round(subtotal * taxRate);
    const total = subtotal + shippingCost + tax;
    summarySubtotal.textContent = formatMoney(subtotal);
    summaryTax.textContent = formatMoney(tax);
    summaryTotal.textContent = formatMoney(total);
    return total;
  }

  function renderCartSummary() {
    if (!cart.length) {
      orderItems.innerHTML = '<p class="empty-message">No hay productos en tu carrito. <a href="index.html">Volver a la tienda</a>.</p>';
      document.getElementById('checkoutSubmit').disabled = true;
      return;
    }

    orderItems.innerHTML = cart.map(item => {
      const subtotal = item.price * item.qty;
      return `
        <div class="order-item">
          <div>
            <strong>${sanitize(item.name)}</strong>
            <small>${sanitize(item.brand)} · x${item.qty}</small>
          </div>
          <div>${formatMoney(subtotal)}</div>
        </div>
      `;
    }).join('');

    calculateTotals();
  }

  function updatePaymentFields() {
    const selected = paymentRadios.find(r => r.checked).value;
    cardDetails.style.display = selected === 'tarjeta' ? 'block' : 'none';
  }

  function validateField(inputId, errorId, condition, message) {
    const field = document.getElementById(inputId);
    const error = document.getElementById(errorId);
    if (!condition) {
      field.classList.add('error');
      if (error) error.textContent = message;
      return false;
    }
    field.classList.remove('error');
    if (error) error.textContent = '';
    return true;
  }

  function clearErrors() {
    checkoutForm.querySelectorAll('.field-error').forEach(el => el.textContent = '');
    checkoutForm.querySelectorAll('input').forEach(input => input.classList.remove('error'));
  }

  function validateCheckout() {
    clearErrors();
    const fullName = document.getElementById('fullName');
    const email = document.getElementById('email');
    const phone = document.getElementById('phone');
    const address = document.getElementById('address');
    const city = document.getElementById('city');
    const cardNumber = document.getElementById('cardNumber');
    const expiry = document.getElementById('expiry');
    const cvv = document.getElementById('cvv');

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phonePattern = /^\+?\d{8,15}$/;
    const expiryPattern = /^(0[1-9]|1[0-2])\/(\d{2})$/;
    const cardPattern = /^\d{16}$/;
    const cvvPattern = /^\d{3}$/;

    let valid = true;
    valid = validateField('fullName', 'nameErr', fullName.value.trim().length >= 3, 'Ingresa tu nombre completo.') && valid;
    valid = validateField('email', 'emailErr', emailPattern.test(email.value.trim()), 'Ingresa un correo válido.') && valid;
    valid = validateField('phone', 'phoneErr', phonePattern.test(phone.value.trim().replace(/\s/g, '')), 'Ingresa un teléfono válido.') && valid;
    valid = validateField('address', 'addressErr', address.value.trim().length >= 10, 'Ingresa una dirección completa.') && valid;
    valid = validateField('city', 'cityErr', city.value.trim().length >= 2, 'Ingresa tu ciudad.') && valid;

    const selectedMethod = paymentRadios.find(r => r.checked).value;
    if (selectedMethod === 'tarjeta') {
      valid = validateField('cardNumber', 'cardErr', cardPattern.test(cardNumber.value.replace(/\s/g, '')), 'Ingresa un número de tarjeta válido de 16 dígitos.') && valid;
      valid = validateField('expiry', 'expiryErr', expiryPattern.test(expiry.value.trim()), 'Ingresa el vencimiento en MM/AA.') && valid;
      valid = validateField('cvv', 'cvvErr', cvvPattern.test(cvv.value.trim()), 'Ingresa el CVV de 3 dígitos.') && valid;
    }

    return Boolean(valid);
  }

  paymentRadios.forEach(radio => radio.addEventListener('change', updatePaymentFields));
  updatePaymentFields();

  fetch('/api/cart')
    .then(async response => {
      if (!response.ok) throw new Error('No fue posible cargar el carrito.');
      cart = await response.json();
      renderCartSummary();
    })
    .catch(error => {
      orderItems.innerHTML = `<p class="empty-message">${sanitize(error.message)}</p>`;
      document.getElementById('checkoutSubmit').disabled = true;
    });

  checkoutForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!cart.length) return;
    if (!validateCheckout()) {
      showToast('Corrige los errores del formulario antes de continuar.');
      return;
    }

    const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
    const submitButton = document.getElementById('checkoutSubmit');
    submitButton.disabled = true;
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: document.getElementById('fullName').value.trim(),
          email: document.getElementById('email').value.trim(),
          phone: document.getElementById('phone').value.trim(),
          address: document.getElementById('address').value.trim(),
          city: document.getElementById('city').value.trim(),
          paymentMethod,
          items: cart.map(item => ({ id: item.id, qty: item.qty }))
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No fue posible procesar la orden.');
      cart = [];
      await fetch('/api/cart', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [] }) });
      showToast('Compra realizada con éxito. Gracias por preferir Less Perfum.');
      setTimeout(() => { window.location.href = 'index.html'; }, 2200);
    } catch (error) {
      submitButton.disabled = false;
      showToast(sanitize(error.message));
    }
  });

  function showToast(message) {
    const container = document.createElement('div');
    container.className = 'toast-msg';
    container.textContent = message;
    document.body.appendChild(container);
    requestAnimationFrame(() => container.classList.add('show'));
    setTimeout(() => {
      container.classList.remove('show');
      setTimeout(() => container.remove(), 400);
    }, 2800);
  }
});
