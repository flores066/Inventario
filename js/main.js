let PRODUCTS = [];

const BRANDS = ['Calvin Klein', 'Dior', 'Montblanc', 'Rabanne', 'Gucci', 'Carolina Herrera', 'Chanel', 'Giorgio Armani', 'Yves Saint Laurent', 'Tom Ford'];
const STRIP_ITEMS = ['Envío Express', 'Originales 100%', 'Asesoría Gratis', 'Más de 200 Fragancias', 'Cambios sin costo'];
const API_BASE = '/api';
const PERFUME_IMAGE_URLS = [
    'https://images.unsplash.com/photo-1594035910387-fea47794261f?w=700&h=800&fit=crop',
    'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=700&h=800&fit=crop',
    'https://images.unsplash.com/photo-1541643600914-78b084683601?w=700&h=800&fit=crop',
    'https://images.unsplash.com/photo-1592078615290-033ee584e267?w=700&h=800&fit=crop'
];
const FALLBACK_IMAGES = PERFUME_IMAGE_URLS.map((url, index) => ({
    id: index + 1,
    url
}));

let cart = [];
let favorites = new Set();
let currentFilter = 'all';
let modalQty = 1;
let modalProduct = null;
let heroSlide = 0;
let heroSlides;
let catalogSignature = '';
let catalogErrorShown = false;

function fmt(n) {
    return '$' + n.toLocaleString('es-CO');
}

function getCatalogSignature(products) {
    return JSON.stringify(products.map(({ id, name, brand, price, old, badge, badgeType, cat, stock, img, genre }) =>
        [id, name, brand, price, old, badge, badgeType, cat, stock, img || '', genre || '']));
}

function escapeHTML(value) {
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(value ?? '').replace(/[&<>"']/g, character => entities[character]);
}

function safeImageUrl(value) {
    try {
        const url = new URL(String(value));
        return url.protocol === 'https:' ? url.href : '';
    } catch {
        return '';
    }
}

async function saveCart() {
    try {
        const response = await fetch(`${API_BASE}/cart`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: cart.map(item => ({ id: item.id, qty: item.qty })) })
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'No fue posible actualizar el carrito.');
        }
    } catch (error) {
        showToast(escapeHTML(error.message));
        try {
            const response = await fetch(`${API_BASE}/cart`);
            if (response.ok) {
                cart = await response.json();
                renderCart();
            }
        } catch (syncError) {
            console.error('Cart resync failed:', syncError.message);
        }
    }
}

function buildStrip() {
    const inner = document.getElementById('stripInner');
    let html = '';
    for (let i = 0; i < 3; i++) STRIP_ITEMS.forEach(t => {
        html += `<div class="strip-item"><span>◆</span>${t}</div>`;
    });
    inner.innerHTML = html + html;
}

function buildBrands() {
    const html = BRANDS.map(b => `<div class="brand-item">${b}</div>`).join('');
    document.getElementById('brandTrack').innerHTML = html;
    document.getElementById('brandTrack2').innerHTML = html;
}

function buildProductCards(products) {
    return products.map(p => `
    <div class="product-card reveal" data-id="${p.id}">
      <div class="product-img-wrap">
        <img src="${escapeHTML(safeImageUrl(p.img))}" alt="${escapeHTML(p.name)}" loading="lazy" onclick="openProductModal(${p.id})">
        ${p.badge ? `<div class="product-badge ${p.badgeType === 'sale' ? 'sale' : ''}">${escapeHTML(p.badge)}</div>` : ''}
        <div class="product-actions">
          <button class="product-action-btn fav-btn ${favorites.has(p.id) ? 'active-fav' : ''}" data-id="${p.id}" title="Favorito" onclick="toggleFav(${p.id},this)">
            <i class="bi ${favorites.has(p.id) ? 'bi-heart-fill' : 'bi-heart'}"></i>
          </button>
          <button class="product-action-btn" title="Vista rápida" onclick="openProductModal(${p.id})">
            <i class="bi bi-eye"></i>
          </button>
        </div>
      </div>
      <div class="product-body">
        <div class="product-brand">${escapeHTML(p.brand)}</div>
        <div class="product-name">${escapeHTML(p.name)}</div>
        <div class="product-price-row">
          <span class="product-price">${fmt(p.price)}</span>
          ${p.old ? `<span class="product-old-price">${fmt(p.old)}</span>` : ''}
        </div>
        <button class="product-add-btn" onclick="addToCart(${p.id})" ${Number(p.stock) === 0 ? 'disabled' : ''}>${Number(p.stock) === 0 ? 'Agotado' : 'Agregar al carrito'}</button>
      </div>
    </div>
  `).join('');
}

function buildProducts(filter) {
    const grid = document.getElementById('productsGrid');
    const filtered = filter === 'all' ? PRODUCTS : PRODUCTS.filter(p => p.cat === filter);
    grid.innerHTML = buildProductCards(filtered);
    observeReveal();
}

function buildOffers() {
    const grid = document.getElementById('offersGrid');
    if (!grid) return;
    const offers = PRODUCTS.filter(p => p.cat === 'oferta' || p.badgeType === 'sale');
    grid.innerHTML = offers.length ? buildProductCards(offers) : '<p class="empty-message">No hay ofertas activas en este momento.</p>';
    observeReveal();
}

function buildNiche() {
    const grid = document.getElementById('nicheGrid');
    if (!grid) return;
    const niche = PRODUCTS.filter(p => p.cat === 'nicho' || p.cat === 'arabe');
    grid.innerHTML = niche.length ? buildProductCards(niche) : '<p class="empty-message">Pronto añadiremos más fragancias de nicho.</p>';
    observeReveal();
}

async function addToCart(id, qty = 1) {
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) return;
    const ex = cart.find(x => x.id === id);
    const newQuantity = (ex?.qty || 0) + qty;
    if (Number.isInteger(p.stock) && newQuantity > p.stock) {
        showToast('No hay suficiente stock para agregar esa cantidad.');
        return;
    }
    if (ex) ex.qty = newQuantity;
    else cart.push({ ...p, qty });
    await saveCart();
    renderCart();
    showToast(`<i class="bi bi-check-circle"></i> ${escapeHTML(p.name)} agregado`);
}

async function removeFromCart(id) {
    cart = cart.filter(x => x.id !== id);
    await saveCart();
    renderCart();
}

async function changeQty(id, delta) {
    const item = cart.find(x => x.id === id);
    if (!item) return;
    const maximum = Number.isInteger(item.stock) ? item.stock : 99;
    if (item.qty + delta > maximum) {
        showToast('No hay más unidades disponibles.');
        return;
    }
    item.qty = Math.max(1, item.qty + delta);
    await saveCart();
    renderCart();
}

function renderCart() {
    const badge = document.getElementById('cartBadge');
    const items = document.getElementById('cartItems');
    const empty = document.getElementById('cartEmpty');
    const footer = document.getElementById('cartFooter');
    const total = document.getElementById('cartTotal');

    const count = cart.reduce((s, i) => s + i.qty, 0);
    badge.textContent = count;

    if (cart.length === 0) {
        empty.style.display = 'flex';
        footer.style.display = 'none';
        items.querySelectorAll('.cart-item').forEach(el => el.remove());
        return;
    }
    empty.style.display = 'none';
    footer.style.display = 'block';

    items.querySelectorAll('.cart-item').forEach(el => el.remove());

    cart.forEach(item => {
        const div = document.createElement('div');
        div.className = 'cart-item';
        div.dataset.id = item.id;
        div.innerHTML = `
      <div class="cart-item-img"></div>
      <div class="cart-item-info">
        <div class="cart-item-brand">${escapeHTML(item.brand)}</div>
        <div class="cart-item-name">${escapeHTML(item.name)}</div>
        <div class="cart-item-controls">
          <button class="qty-btn" onclick="changeQty(${item.id},-1)"><i class="bi bi-dash"></i></button>
          <div class="qty-val">${item.qty}</div>
          <button class="qty-btn" onclick="changeQty(${item.id},1)"><i class="bi bi-plus"></i></button>
        </div>
        <div class="cart-item-price">${fmt(item.price * item.qty)}</div>
      </div>
      <button class="cart-item-remove" onclick="removeFromCart(${item.id})"><i class="bi bi-x"></i></button>
    `;
        const imageUrl = safeImageUrl(item.img);
        if (imageUrl) div.querySelector('.cart-item-img').style.backgroundImage = `url("${imageUrl}")`;
        items.insertBefore(div, empty);
    });

    const t = cart.reduce((s, i) => s + i.price * i.qty, 0);
    total.textContent = fmt(t);
}

function openCart() {
    document.getElementById('cartPanel').classList.add('open');
    document.getElementById('cartOverlay').classList.add('open');
}

function closeCart() {
    document.getElementById('cartPanel').classList.remove('open');
    document.getElementById('cartOverlay').classList.remove('open');
}

function showFavorites() {
    if (!favorites.size) {
        showToast('Aún no tienes favoritos.');
        return;
    }
    const list = PRODUCTS.filter(p => favorites.has(p.id)).map(p => escapeHTML(p.name)).join(', ');
    showToast(`<strong>Favoritos:</strong> ${list}`);
}

async function checkout() {
    if (cart.length === 0) {
        showToast('Tu carrito está vacío. Agrega productos para continuar.');
        return;
    }
    try {
        const response = await fetch(`${API_BASE}/auth/session`);
        const session = await response.json();
        if (!response.ok) throw new Error(session.error || 'No fue posible verificar tu sesión.');
        if (!session.authenticated || session.role === 'admin') {
            window.location.href = 'formularios/login.html?redirect=checkout';
            return;
        }
    } catch (error) {
        showToast(escapeHTML(error.message));
        return;
    }
    window.location.href = 'checkout.html';
}

function toggleFav(id, btn) {
    const isFav = favorites.has(id);
    if (isFav) {
        favorites.delete(id);
        if (btn) {
            btn.classList.remove('active-fav');
            btn.innerHTML = '<i class="bi bi-heart"></i>';
        }
        showToast('Eliminado de favoritos');
    } else {
        favorites.add(id);
        if (btn) {
            btn.classList.add('active-fav');
            btn.innerHTML = '<i class="bi bi-heart-fill"></i>';
        }
        showToast(`<i class="bi bi-heart-fill" style="color:#e55;"></i> Agregado a favoritos`);
    }
    buildProducts(currentFilter);
    updateModalFavoriteBtn();
}

function updateModalFavoriteBtn() {
    const btn = document.getElementById('modalWishBtn');
    if (!btn || !modalProduct) return;
    const isFav = favorites.has(modalProduct.id);
    btn.classList.toggle('active-fav', isFav);
    btn.innerHTML = `<i class="bi ${isFav ? 'bi-heart-fill' : 'bi-heart'}" style="margin-right:8px;"></i> ${isFav ? 'En favoritos' : 'Agregar a favoritos'}`;
}

function openProductModal(id) {
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) return;
    modalProduct = p;
    modalQty = 1;
    document.getElementById('modalImg').src = safeImageUrl(p.img);
    document.getElementById('modalBrand').textContent = p.brand;
    document.getElementById('modalName').textContent = p.name;
    document.getElementById('modalPrice').textContent = fmt(p.price);
    document.getElementById('modalGenreTag').textContent = p.genre;
    document.getElementById('modalQty').textContent = 1;
    const addButton = document.getElementById('modalAddBtn');
    addButton.disabled = Number(p.stock) === 0;
    addButton.textContent = Number(p.stock) === 0 ? 'Agotado' : 'Agregar al carrito';
    addButton.onclick = () => { addToCart(p.id, modalQty); closeProductModal(null, true); openCart(); };
    document.getElementById('modalWishBtn').onclick = () => toggleFav(p.id, document.getElementById('modalWishBtn'));
    updateModalFavoriteBtn();
    document.getElementById('productModalBackdrop').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeProductModal(e, force) {
    if (force || (e && e.target === document.getElementById('productModalBackdrop'))) {
        document.getElementById('productModalBackdrop').classList.remove('open');
        document.body.style.overflow = '';
    }
}

function changeModalQty(delta) {
    const available = Number.isInteger(modalProduct?.stock) ? modalProduct.stock : 99;
    if (available < 1) return;
    modalQty = Math.min(available, Math.max(1, modalQty + delta));
    document.getElementById('modalQty').textContent = modalQty;
}

function initHero() {
    heroSlides = document.querySelectorAll('.hero-slide');
    const dots = document.querySelectorAll('.hero-dot');
    document.querySelector('.hero').classList.add('loaded');
    setInterval(() => {
        heroSlides[heroSlide].classList.remove('active');
        dots[heroSlide].classList.remove('active');
        heroSlide = (heroSlide + 1) % heroSlides.length;
        heroSlides[heroSlide].classList.add('active');
        dots[heroSlide].classList.add('active');
    }, 5500);
}

window.goSlide = function (i) {
    const dots = document.querySelectorAll('.hero-dot');
    heroSlides[heroSlide].classList.remove('active');
    dots[heroSlide].classList.remove('active');
    heroSlide = i;
    heroSlides[heroSlide].classList.add('active');
    dots[heroSlide].classList.add('active');
};

document.getElementById('openSearch').addEventListener('click', () => {
    document.getElementById('searchOverlay').classList.add('open');
    setTimeout(() => document.getElementById('searchInput').focus(), 300);
});

document.getElementById('closeSearch').addEventListener('click', () => {
    document.getElementById('searchOverlay').classList.remove('open');
    document.getElementById('searchInput').value = '';
    document.getElementById('searchResults').classList.remove('show');
});

document.getElementById('searchInput').addEventListener('input', function () {
    const q = this.value.toLowerCase().trim();
    const res = document.getElementById('searchResults');
    if (!q) { res.classList.remove('show'); return; }
    const hits = PRODUCTS.filter(p => p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q));
    if (!hits.length) {
        res.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:0.9rem;">Sin resultados</p>';
        res.classList.add('show');
        return;
    }
    res.innerHTML = hits.map(p => `
    <div class="search-result-item" onclick="openProductModal(${p.id});document.getElementById('searchOverlay').classList.remove('open')">
      <div class="search-result-thumb" style="background-image:url('${p.img}')"></div>
      <div>
        <div class="search-result-name">${escapeHTML(p.brand)} — ${escapeHTML(p.name)}</div>
        <div class="search-result-price">${fmt(p.price)}</div>
      </div>
    </div>
  `).join('');
    res.classList.add('show');
});

document.getElementById('openMobile').addEventListener('click', () => document.getElementById('mobileMenu').classList.add('open'));
document.getElementById('closeMobile').addEventListener('click', closeMobileMenu);
function closeMobileMenu() { document.getElementById('mobileMenu').classList.remove('open'); }

document.getElementById('openCart').addEventListener('click', openCart);
document.getElementById('openFav').addEventListener('click', showFavorites);
document.getElementById('cartCheckoutBtn').addEventListener('click', checkout);

document.getElementById('filterTabs').addEventListener('click', e => {
    const btn = e.target.closest('.filter-tab');
    if (!btn) return;
    document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    buildProducts(currentFilter);
});

window.addEventListener('scroll', () => {
    document.getElementById('siteNav').classList.toggle('scrolled', window.scrollY > 60);
});

function observeReveal() {
    const obs = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                e.target.classList.add('visible');
                obs.unobserve(e.target);
            }
        });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

function showToast(html) {
    const c = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = 'toast-msg';
    t.innerHTML = html;
    c.appendChild(t);
    requestAnimationFrame(() => { requestAnimationFrame(() => t.classList.add('show')); });
    setTimeout(() => {
        t.classList.remove('show');
        setTimeout(() => t.remove(), 400);
    }, 2800);
}

async function initStore() {
    let catalogRows = [];
    const [productsResult, cartResult, imagesResult] = await Promise.allSettled([
        fetch(`${API_BASE}/products`),
        fetch(`${API_BASE}/cart`),
        fetch(`${API_BASE}/perfume-images?count=8`)
    ]);
    if (productsResult.status === 'fulfilled' && productsResult.value.ok) {
        catalogRows = await productsResult.value.json();
        PRODUCTS = catalogRows;
    } else {
        PRODUCTS = [];
    }
    if (cartResult.status === 'fulfilled' && cartResult.value.ok) {
        cart = await cartResult.value.json();
    } else {
        console.error('Cart initial load failed.');
        showToast('No fue posible cargar el carrito.');
    }
    const imageData = imagesResult.status === 'fulfilled' && imagesResult.value.ok
        ? await imagesResult.value.json()
        : { images: FALLBACK_IMAGES };
    const images = imageData.images?.length ? imageData.images : FALLBACK_IMAGES;
    PRODUCTS = PRODUCTS.map((product, index) => ({
        ...product,
        img: product.img || images[index % images.length].url,
        stock: Number(product.stock)
    }));
    catalogSignature = getCatalogSignature(catalogRows);
    buildStrip();
    buildBrands();
    buildProducts('all');
    buildOffers();
    buildNiche();
    initHero();
    renderCart();
    observeReveal();
    if (productsResult.status !== 'fulfilled' || !productsResult.value.ok) showToast('No fue posible cargar el catálogo de la base de datos.');
}

async function refreshCatalog() {
    if (document.visibilityState !== 'visible') return;
    try {
        const response = await fetch(`${API_BASE}/products`);
        if (!response.ok) throw new Error('No fue posible actualizar el catálogo.');
        const updatedProducts = await response.json();
        const signature = getCatalogSignature(updatedProducts);
        if (signature === catalogSignature) {
            catalogErrorShown = false;
            return;
        }

        const previousImages = new Map(PRODUCTS.map(product => [product.id, product.img]));
        PRODUCTS = updatedProducts.map((product, index) => ({
            ...product,
            img: product.img || previousImages.get(product.id) || FALLBACK_IMAGES[index % FALLBACK_IMAGES.length].url,
            stock: Number(product.stock)
        }));
        catalogSignature = signature;
        buildProducts(currentFilter);
        buildOffers();
        buildNiche();
        const cartResponse = await fetch(`${API_BASE}/cart`);
        if (cartResponse.ok) {
            cart = await cartResponse.json();
            renderCart();
        }
        showToast('El catálogo fue actualizado.');
        catalogErrorShown = false;
    } catch (error) {
        console.error('Catalog refresh failed:', error.message);
        if (!catalogErrorShown) showToast('No se pudo actualizar el catálogo; se conserva la última versión cargada.');
        catalogErrorShown = true;
    }
}

initStore().catch(error => {
    console.error('Store initialization failed:', error.message);
    showToast('No fue posible iniciar la tienda. Intenta actualizar la página.');
});
setInterval(refreshCatalog, 3000);
