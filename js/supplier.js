document.addEventListener('DOMContentLoaded', async () => {
  const feedback = document.getElementById('pageFeedback');
  const receiptFeedback = document.getElementById('receiptFeedback');
  const productSelect = document.getElementById('productId');
  const form = document.getElementById('receiptForm');
  const button = document.getElementById('receiveButton');
  let products = [];

  async function request(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No fue posible completar la solicitud.');
    return data;
  }

  function appendEmptyRow(body, columns, message) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = columns;
    cell.className = 'empty-cell';
    cell.textContent = message;
    row.appendChild(cell);
    body.appendChild(row);
  }

  function renderProducts() {
    productSelect.replaceChildren();
    const prompt = document.createElement('option');
    prompt.value = '';
    prompt.textContent = products.length ? 'Selecciona un producto' : 'No hay productos activos';
    productSelect.appendChild(prompt);
    products.forEach(product => {
      const option = document.createElement('option');
      option.value = product.id;
      option.textContent = `${product.name} — ${product.brand} (stock: ${product.stock})`;
      productSelect.appendChild(option);
    });

    const body = document.getElementById('stockRows');
    body.replaceChildren();
    if (!products.length) appendEmptyRow(body, 3, 'No hay productos activos en el catálogo.');
    products.forEach(product => {
      const row = document.createElement('tr');
      for (const value of [product.name, product.brand, product.stock]) {
        const cell = document.createElement('td');
        cell.textContent = value;
        if (value === product.stock) cell.className = 'stock-value';
        row.appendChild(cell);
      }
      body.appendChild(row);
    });
    document.getElementById('productCount').textContent = `${products.length} productos`;
  }

  function renderReceipts(receipts) {
    const body = document.getElementById('receiptRows');
    body.replaceChildren();
    if (!receipts.length) {
      appendEmptyRow(body, 5, 'Todavía no se han registrado entregas.');
      return;
    }
    receipts.forEach(receipt => {
      const row = document.createElement('tr');
      const date = receipt.receivedAt ? new Date(receipt.receivedAt).toLocaleString('es-CO') : '—';
      for (const value of [date, receipt.reference, `${receipt.product} — ${receipt.brand}`, `+${receipt.quantity}`, receipt.notes]) {
        const cell = document.createElement('td');
        cell.textContent = value || '—';
        row.appendChild(cell);
      }
      body.appendChild(row);
    });
  }

  async function loadDashboard() {
    const data = await request('/api/supplier/summary');
    products = data.products;
    document.getElementById('supplierName').textContent = data.supplier.name;
    document.getElementById('supplierEmail').textContent = data.supplier.email;
    renderProducts();
    renderReceipts(data.receipts);
  }

  try {
    const session = await request('/api/auth/session');
    if (!session.authenticated || session.role !== 'supplier') {
      window.location.replace('formularios/login.html?redirect=supplier');
      return;
    }
    await loadDashboard();
  } catch (error) {
    feedback.textContent = error.message;
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    receiptFeedback.textContent = '';
    receiptFeedback.classList.remove('error');
    if (!productSelect.value) {
      receiptFeedback.textContent = 'Selecciona un producto del catálogo.';
      receiptFeedback.classList.add('error');
      return;
    }
    button.disabled = true;
    button.textContent = 'Registrando recepción…';
    try {
      const result = await request('/api/supplier/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ productId: Number(productSelect.value), quantity: Number(document.getElementById('quantity').value) }],
          reference: document.getElementById('reference').value.trim(),
          notes: document.getElementById('notes').value.trim()
        })
      });
      receiptFeedback.textContent = `${result.message} Referencia: ${result.reference}`;
      form.reset();
      document.getElementById('quantity').value = '1';
      await loadDashboard();
    } catch (error) {
      receiptFeedback.textContent = error.message;
      receiptFeedback.classList.add('error');
    } finally {
      button.disabled = false;
      button.textContent = 'Confirmar recepción';
    }
  });

  document.getElementById('logoutButton').addEventListener('click', async () => {
    try {
      await request('/api/auth/logout', { method: 'POST' });
      window.location.href = 'formularios/login.html';
    } catch (error) {
      feedback.textContent = error.message;
    }
  });
});
