const FALLBACK_PRODUCTS = [
    { id: 1, name: 'Essence de Amor', brand: 'Dior', price: 289900, old: 414900, badge: '-30%', badgeType: 'sale', cat: 'mujer', img: '', genre: 'Mujer' },
    { id: 2, name: 'Royal Oud', brand: 'Maison Oud', price: 425000, badge: 'Arabe', badgeType: '', cat: 'arabe', img: '', genre: 'Unisex' },
    { id: 3, name: 'Floral Garden', brand: 'Carolina Herrera', price: 329000, badge: 'Nuevo', badgeType: '', cat: 'mujer', img: '', genre: 'Mujer' },
    { id: 4, name: 'Midnight Noir', brand: 'Montblanc', price: 375000, old: 500000, badge: '-25%', badgeType: 'sale', cat: 'hombre', img: '', genre: 'Hombre' },
    { id: 5, name: 'Citrus Dreams', brand: 'Calvin Klein', price: 259000, old: 305000, badge: '-15%', badgeType: 'sale', cat: 'oferta', img: '', genre: 'Unisex' },
    { id: 6, name: 'Vintage Elegance', brand: 'Gucci', price: 345000, badge: 'Hot', badgeType: '', cat: 'mujer', img: '', genre: 'Mujer' },
    { id: 7, name: 'Luxe Noir', brand: 'Niche House', price: 465000, badge: 'Nicho', badgeType: '', cat: 'nicho', img: '', genre: 'Unisex' },
    { id: 8, name: 'Ocean Breeze', brand: 'Rabanne', price: 315000, old: 420000, badge: '-25%', badgeType: 'sale', cat: 'oferta', img: '', genre: 'Hombre' }
];
let PRODUCTS = FALLBACK_PRODUCTS;

const BRANDS = ['Calvin Klein', 'Dior', 'Montblanc', 'Rabanne', 'Gucci', 'Carolina Herrera', 'Chanel', 'Giorgio Armani', 'Yves Saint Laurent', 'Tom Ford'];
const STRIP_ITEMS = ['Envío Express', 'Originales 100%', 'Asesoría Gratis', 'Más de 200 Fragancias', 'Cambios sin costo'];
const API_BASE = '/api';
const FALLBACK_IMAGES = FALLBACK_PRODUCTS.map((product, index) => ({
    id: index + 1,
    url: `https://picsum.photos/seed/less-perfum-fallback-${index + 1}/600/700`
}));

let cart = [];
let favorites = new Set();
let currentFilter = 'all';
let modalQty = 1;
let modalProduct = null;
let heroSlide = 0;
let heroSlides;
let catalogSignature = '';

function fmt(n) {
    return '$' + n.toLocaleString('es-CO');
}

function escapeHTML(value) {
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(value ?? '').replace(/[&<>"']/g, character => entities[character]);
}

async function saveCart() {
    try {
        await fetch(`${API_BASE}/cart`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: cart.map(item => ({ id: item.id, qty: item.qty })) })
        });
    } catch (error) {
        showToast('No fue posible actualizar el carrito.');
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
        <img src="${p.img}" alt="${escapeHTML(p.name)}" loading="lazy" onclick="openProductModal(${p.id})">
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
        <button class="product-add-btn" onclick="addToCart(${p.id})">Agregar al carrito</button>
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
    const ex = cart.find(x => x.id === id);
    if (ex) ex.qty += qty;
    else cart.push({ ...p, qty });
    await saveCart();
    renderCart();
    showToast(`<i class="bi bi-check-circle"></i> ${p.name} agregado`);
}

async function removeFromCart(id) {
    cart = cart.filter(x => x.id !== id);
    await saveCart();
    renderCart();
}

async function changeQty(id, delta) {
    const item = cart.find(x => x.id === id);
    if (!item) return;
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
      <div class="cart-item-img" style="background-image:url('${item.img}')"></div>
      <div class="cart-item-info">
        <div class="cart-item-brand">${item.brand}</div>
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-controls">
          <button class="qty-btn" onclick="changeQty(${item.id},-1)"><i class="bi bi-dash"></i></button>
          <div class="qty-val">${item.qty}</div>
          <button class="qty-btn" onclick="changeQty(${item.id},1)"><i class="bi bi-plus"></i></button>
        </div>
        <div class="cart-item-price">${fmt(item.price * item.qty)}</div>
      </div>
      <button class="cart-item-remove" onclick="removeFromCart(${item.id})"><i class="bi bi-x"></i></button>
    `;
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
    const list = PRODUCTS.filter(p => favorites.has(p.id)).map(p => p.name).join(', ');
    showToast(`<strong>Favoritos:</strong> ${list}`);
}

function checkout() {
    if (cart.length === 0) {
        showToast('Tu carrito está vacío. Agrega productos para continuar.');
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
    modalProduct = p;
    modalQty = 1;
    document.getElementById('modalImg').src = p.img;
    document.getElementById('modalBrand').textContent = p.brand;
    document.getElementById('modalName').textContent = p.name;
    document.getElementById('modalPrice').textContent = fmt(p.price);
    document.getElementById('modalGenreTag').textContent = p.genre;
    document.getElementById('modalQty').textContent = 1;
    document.getElementById('modalAddBtn').onclick = () => { addToCart(p.id, modalQty); closeProductModal(null, true); openCart(); };
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
    modalQty = Math.max(1, modalQty + delta);
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
    let apiAvailable = false;
    const [productsResult, cartResult, imagesResult] = await Promise.allSettled([
        fetch(`${API_BASE}/products`),
        fetch(`${API_BASE}/cart`),
        fetch(`${API_BASE}/perfume-images?count=${FALLBACK_PRODUCTS.length}`)
    ]);
    if (productsResult.status === 'fulfilled' && productsResult.value.ok) {
        PRODUCTS = await productsResult.value.json();
        apiAvailable = true;
    }
    if (cartResult.status === 'fulfilled' && cartResult.value.ok) cart = await cartResult.value.json();
    const imageData = imagesResult.status === 'fulfilled' && imagesResult.value.ok
        ? await imagesResult.value.json()
        : { images: FALLBACK_IMAGES };
    const images = imageData.images || FALLBACK_IMAGES;
    PRODUCTS = PRODUCTS.map((product, index) => ({
        ...product,
        img: product.img || images[index % images.length].url
    }));
    catalogSignature = JSON.stringify(PRODUCTS.map(({ id, name, brand, price, old, badge, badgeType, cat }) => [id, name, brand, price, old, badge, badgeType, cat]));
    buildStrip();
    buildBrands();
    buildProducts('all');
    buildOffers();
    buildNiche();
    initHero();
    renderCart();
    observeReveal();
    if (!apiAvailable) showToast('Mostrando el catálogo de demostración.');
}

async function refreshCatalog() {
    if (document.visibilityState !== 'visible') return;
    try {
        const response = await fetch(`${API_BASE}/products`);
        if (!response.ok) return;
        const updatedProducts = await response.json();
        const signature = JSON.stringify(updatedProducts.map(({ id, name, brand, price, old, badge, badgeType, cat }) => [id, name, brand, price, old, badge, badgeType, cat]));
        if (signature === catalogSignature) return;

        const previousImages = new Map(PRODUCTS.map(product => [product.id, product.img]));
        PRODUCTS = updatedProducts.map((product, index) => ({
            ...product,
            img: product.img || previousImages.get(product.id) || FALLBACK_IMAGES[index % FALLBACK_IMAGES.length].url
        }));
        catalogSignature = signature;
        buildProducts(currentFilter);
        buildOffers();
        buildNiche();
        showToast('El catálogo fue actualizado.');
    } catch (error) {
        // Se mantiene visible el último catálogo si la API se desconecta temporalmente.
    }
}

initStore();
setInterval(refreshCatalog, 3000);
