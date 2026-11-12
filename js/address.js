document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('addressForm');
  const address = document.getElementById('address');
  const city = document.getElementById('city');
  const button = form.querySelector('button[type="submit"]');
  const feedback = document.getElementById('addressFeedback');

  async function request(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || 'No fue posible completar la solicitud.');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  try {
    const data = await request('/api/account/summary');
    address.value = data.customer.address || '';
    city.value = data.customer.city || '';
  } catch (error) {
    if (error.status === 401) {
      window.location.replace('login.html?redirect=account');
      return;
    }
    feedback.textContent = error.message;
    feedback.classList.add('error');
    button.disabled = true;
    return;
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const addressValue = address.value.trim().replace(/\s+/g, ' ');
    const cityValue = city.value.trim().replace(/\s+/g, ' ');
    const validAddress = addressValue.length >= 8 && addressValue.length <= 255 &&
      !/(\p{L})\1{3,}/iu.test(addressValue);
    const validCity = cityValue.length >= 2 && cityValue.length <= 80 &&
      /^[\p{L}][\p{L}\s.'-]*[\p{L}]$/u.test(cityValue) &&
      !/(\p{L})\1{3,}/iu.test(cityValue);

    feedback.textContent = '';
    feedback.className = 'feedback';
    form.classList.add('was-validated');
    if (!validAddress || !validCity) {
      feedback.textContent = 'Ingresa una dirección completa y una ciudad válida.';
      feedback.classList.add('error');
      return;
    }

    button.disabled = true;
    button.querySelector('.btn-text').textContent = 'Guardando…';
    try {
      await request('/api/account/address', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addressValue, city: cityValue })
      });
      feedback.textContent = 'Dirección guardada correctamente.';
      feedback.classList.add('success');
      window.setTimeout(() => { window.location.href = '../account.html'; }, 600);
    } catch (error) {
      feedback.textContent = error.message;
      feedback.classList.add('error');
      button.disabled = false;
      button.querySelector('.btn-text').textContent = 'Guardar dirección';
    }
  });
});
