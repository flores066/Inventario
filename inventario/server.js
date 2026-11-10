require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET || 'less-perfum-development-secret';
const demoMode = process.env.DEMO_MODE === 'true' || !process.env.DATABASE_URL;
const adminEmail = (process.env.ADMIN_EMAIL || (demoMode ? 'admin@email.com' : '')).toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || (demoMode ? 'admin123' : '');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const publicRoot = __dirname;
const cartCookie = 'less_perfum_cart_id';
const authCookie = 'less_perfum_auth';
const shippingCost = 20000;
const taxRate = 0.19;
const productCategories = new Set(['mujer', 'hombre', 'nicho', 'arabe', 'oferta']);
const demoProducts = [
  { id: 1, name: 'Essence de Amor', brand: 'Dior', price: 289900, old: 414900, badge: '-30%', badgeType: 'sale', cat: 'mujer', genre: 'Mujer', stock: 20, img: '' },
  { id: 2, name: 'Royal Oud', brand: 'Maison Oud', price: 425000, badge: 'Árabe', badgeType: '', cat: 'arabe', genre: 'Unisex', stock: 20, img: '' },
  { id: 3, name: 'Floral Garden', brand: 'Carolina Herrera', price: 329000, badge: 'Nuevo', badgeType: '', cat: 'mujer', genre: 'Mujer', stock: 20, img: '' },
  { id: 4, name: 'Midnight Noir', brand: 'Montblanc', price: 375000, old: 500000, badge: '-25%', badgeType: 'sale', cat: 'hombre', genre: 'Hombre', stock: 20, img: '' },
  { id: 5, name: 'Citrus Dreams', brand: 'Calvin Klein', price: 259000, old: 305000, badge: '-15%', badgeType: 'sale', cat: 'oferta', genre: 'Unisex', stock: 20, img: '' },
  { id: 6, name: 'Vintage Elegance', brand: 'Gucci', price: 345000, badge: 'Hot', badgeType: '', cat: 'mujer', genre: 'Mujer', stock: 20, img: '' },
  { id: 7, name: 'Luxe Noir', brand: 'Niche House', price: 465000, badge: 'Nicho', badgeType: '', cat: 'nicho', genre: 'Unisex', stock: 20, img: '' },
  { id: 8, name: 'Ocean Breeze', brand: 'Rabanne', price: 315000, old: 420000, badge: '-25%', badgeType: 'sale', cat: 'oferta', genre: 'Hombre', stock: 20, img: '' }
];
const demoUsers = new Map();
const demoCarts = new Map();
const demoOrders = [];

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '20kb' }));
app.use(cookieParser());
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 }));

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

function clean(value, max = 255) {
  return String(value || '').trim().slice(0, max);
}

function getUser(req) {
  try {
    return jwt.verify(req.cookies[authCookie] || '', jwtSecret);
  } catch {
    return null;
  }
}

function requireAdmin(req, res, next) {
  const user = getUser(req);
  if (!user || user.role !== 'admin') return sendError(res, 401, 'Inicia sesión con una cuenta de administrador.');
  req.admin = user;
  next();
}

function requireCart(req, res, next) {
  req.cartId = req.cookies[cartCookie] || crypto.randomUUID();
  if (!req.cookies[cartCookie]) res.cookie(cartCookie, req.cartId, { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 30 });
  next();
}

app.get('/api/health', async (req, res) => {
  if (demoMode) return res.json({ ok: true, mode: 'demo' });
  try { await pool.query('SELECT 1'); res.json({ ok: true }); }
  catch { sendError(res, 503, 'Base de datos no disponible.'); }
});

app.get('/api/perfume-images', (req, res) => {
  const requestedCount = Number.parseInt(req.query.count, 10) || 8;
  const count = Math.min(Math.max(requestedCount, 1), 24);
  const images = Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    url: `https://picsum.photos/seed/less-perfum-${crypto.randomUUID()}/600/700`
  }));
  res.set('Cache-Control', 'no-store');
  res.json({ provider: 'Picsum Photos', images });
});

app.get('/api/products', async (req, res) => {
  if (demoMode) {
    const category = clean(req.query.category, 30);
    const search = clean(req.query.search, 80).toLowerCase();
    const products = demoProducts.filter(product =>
      product.active !== false &&
      (!category || category === 'all' || product.cat === category) &&
      (!search || `${product.name} ${product.brand}`.toLowerCase().includes(search))
    );
    return res.json(products.map(({ stock, ...product }) => product));
  }
  const params = [];
  const filters = ['p.activo = TRUE'];
  if (req.query.category && req.query.category !== 'all') { params.push(clean(req.query.category, 30)); filters.push(`c.nombre = $${params.length}`); }
  if (req.query.search) { params.push(`%${clean(req.query.search, 80).toLowerCase()}%`); filters.push(`(LOWER(p.nombre) LIKE $${params.length} OR LOWER(p.marca) LIKE $${params.length})`); }
  try {
    const { rows } = await pool.query(`SELECT p.id_producto AS id, p.nombre AS name, p.marca AS brand, p.precio AS price, p.precio_anterior AS old, p.imagen AS img, p.insignia AS badge, p.tipo_insignia AS "badgeType", c.nombre AS cat, p.genero AS genre FROM productos p JOIN categorias c ON c.id_categoria = p.id_categoria WHERE ${filters.join(' AND ')} ORDER BY p.id_producto`, params);
    res.json(rows.map(product => ({ ...product, price: Number(product.price), old: product.old === null ? undefined : Number(product.old) })));
  } catch { sendError(res, 500, 'No fue posible cargar el catálogo.'); }
});

app.post('/api/auth/register', async (req, res) => {
  const body = req.body || {};
  const firstName = clean(body.firstName, 80), lastName = clean(body.lastName, 80), email = clean(body.email, 160).toLowerCase(), phone = clean(body.phone, 30), password = String(body.password || '');
  if (!firstName || !lastName || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) return sendError(res, 400, 'Revisa los datos de registro.');
  if (demoMode) {
    if (demoUsers.has(email)) return sendError(res, 409, 'Este correo ya está registrado.');
    const user = { id: demoUsers.size + 1, nombre: firstName, apellido: lastName, correo: email, contrasena: await bcrypt.hash(password, 10) };
    demoUsers.set(email, user);
    return res.status(201).json({ user: { id_usuario: user.id, nombre: firstName, apellido: lastName, correo: email }, message: 'Cuenta creada correctamente (modo demostración).' });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query('INSERT INTO usuarios (nombre, apellido, correo, telefono, contrasena, newsletter) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id_usuario, nombre, apellido, correo', [firstName, lastName, email, phone || null, hash, Boolean(body.newsletter)]);
    res.status(201).json({ user: rows[0], message: 'Cuenta creada correctamente.' });
  } catch (error) { sendError(res, error.code === '23505' ? 409 : 500, error.code === '23505' ? 'Este correo ya está registrado.' : 'No fue posible crear la cuenta.'); }
});

app.post('/api/auth/login', async (req, res) => {
  const body = req.body || {};
  const email = clean(body.email, 160).toLowerCase(), password = String(body.password || '');
  if (adminEmail && email === adminEmail) {
    const supplied = Buffer.from(password);
    const expected = Buffer.from(adminPassword);
    const validPassword = expected.length > 0 && supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
    if (!validPassword) return sendError(res, 401, 'Correo o contraseña incorrectos.');
    const user = { id: 'admin', name: 'Administrador', email: adminEmail, role: 'admin' };
    res.cookie(authCookie, jwt.sign(user, jwtSecret, { expiresIn: '8h' }), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 8 });
    return res.json({ user: { name: user.name, email: user.email }, role: 'admin', mode: demoMode ? 'demo' : 'database' });
  }
  if (demoMode) {
    const account = demoUsers.get(email);
    if (!account || !(await bcrypt.compare(password, account.contrasena))) return sendError(res, 401, 'Correo o contraseña incorrectos.');
    const user = { id: account.id, name: account.nombre, email: account.correo };
    res.cookie(authCookie, jwt.sign(user, jwtSecret, { expiresIn: '7d' }), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 * 7 });
    return res.json({ user, mode: 'demo' });
  }
  try {
    const { rows } = await pool.query('SELECT id_usuario, nombre, apellido, correo, contrasena FROM usuarios WHERE correo = $1 AND estado = \'Activo\'', [email]);
    if (!rows[0] || !(await bcrypt.compare(password, rows[0].contrasena))) return sendError(res, 401, 'Correo o contraseña incorrectos.');
    const user = { id: rows[0].id_usuario, name: rows[0].nombre, email: rows[0].correo };
    res.cookie(authCookie, jwt.sign(user, jwtSecret, { expiresIn: '7d' }), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 * 7 });
    res.json({ user });
  } catch { sendError(res, 500, 'No fue posible iniciar sesión.'); }
});

app.get('/api/admin/session', (req, res) => {
  const user = getUser(req);
  if (!user || user.role !== 'admin') return res.json({ authenticated: false });
  res.json({ authenticated: true, user: { name: user.name, email: user.email } });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie(authCookie, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  res.json({ ok: true });
});

app.get('/api/admin/summary', requireAdmin, async (req, res) => {
  if (demoMode) {
    const products = demoProducts.map(({ id, name, brand, price, cat, stock, badge, badgeType, active = true }) => ({ id, name, brand, price, category: cat, stock, badge, badgeType, active }));
    const orders = demoOrders.map(order => ({ id: order.id, customer: order.customer.fullName, email: order.customer.email, total: order.total, status: order.status, createdAt: order.createdAt, itemCount: order.items.reduce((count, item) => count + item.qty, 0) }));
    return res.json({ mode: 'demo', stats: { products: products.length, customers: demoUsers.size, orders: orders.length, sales: orders.reduce((sum, order) => sum + order.total, 0) }, products, orders });
  }

  try {
    const [productResult, orderResult, customerResult] = await Promise.all([
      pool.query('SELECT p.id_producto AS id, p.nombre AS name, p.marca AS brand, p.precio AS price, c.nombre AS category, p.stock, p.insignia AS badge, p.tipo_insignia AS "badgeType", p.activo AS active FROM productos p JOIN categorias c ON c.id_categoria = p.id_categoria ORDER BY p.id_producto'),
      pool.query('SELECT id_orden AS id, nombre_completo AS customer, correo AS email, total, estado AS status, fecha_creacion AS "createdAt", (SELECT COALESCE(SUM(cantidad), 0)::int FROM orden_detalles WHERE orden_detalles.id_orden = ordenes.id_orden) AS "itemCount" FROM ordenes ORDER BY fecha_creacion DESC LIMIT 100'),
      pool.query('SELECT COUNT(*)::int AS count FROM usuarios')
    ]);
    const products = productResult.rows.map(product => ({ ...product, price: Number(product.price) }));
    const orders = orderResult.rows.map(order => ({ ...order, total: Number(order.total) }));
    res.json({ mode: 'database', stats: { products: products.length, customers: customerResult.rows[0].count, orders: orders.length, sales: orders.reduce((sum, order) => sum + order.total, 0) }, products, orders });
  } catch {
    sendError(res, 500, 'No fue posible cargar el panel de administración.');
  }
});

function parseAdminProduct(body = {}) {
  const product = {
    name: clean(body.name, 120),
    brand: clean(body.brand, 120),
    category: clean(body.category, 30).toLowerCase(),
    price: Number(body.price),
    stock: Number(body.stock),
    badge: clean(body.badge, 40),
    badgeType: body.badgeType === 'sale' ? 'sale' : '',
    genre: clean(body.genre || 'Unisex', 30),
    active: body.active !== false
  };
  if (!product.name || !product.brand || !productCategories.has(product.category) || !Number.isFinite(product.price) || product.price < 0 || !Number.isInteger(product.stock) || product.stock < 0) return null;
  return product;
}

app.post('/api/admin/products', requireAdmin, async (req, res) => {
  const product = parseAdminProduct(req.body);
  if (!product) return sendError(res, 400, 'Revisa nombre, marca, categoría, precio y stock.');
  if (demoMode) {
    const created = { id: Math.max(0, ...demoProducts.map(item => item.id)) + 1, ...product, cat: product.category, img: '' };
    demoProducts.push(created);
    return res.status(201).json({ product: { id: created.id, ...product } });
  }
  try {
    const { rows } = await pool.query('INSERT INTO productos (nombre,marca,precio,stock,imagen,insignia,tipo_insignia,genero,id_categoria,activo) SELECT $1,$2,$3,$4,$5,$6,$7,$8,c.id_categoria,$9 FROM categorias c WHERE c.nombre = $10 RETURNING id_producto AS id', [product.name, product.brand, product.price, product.stock, '', product.badge || null, product.badgeType || null, product.genre, product.active, product.category]);
    if (!rows[0]) return sendError(res, 400, 'La categoría seleccionada no existe.');
    res.status(201).json({ product: { id: rows[0].id, ...product } });
  } catch {
    sendError(res, 500, 'No fue posible crear el producto.');
  }
});

app.put('/api/admin/products/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const product = parseAdminProduct(req.body);
  if (!Number.isInteger(id) || !product) return sendError(res, 400, 'Revisa los datos del producto.');
  if (demoMode) {
    const current = demoProducts.find(item => item.id === id);
    if (!current) return sendError(res, 404, 'Producto no encontrado.');
    Object.assign(current, product, { cat: product.category });
    return res.json({ product: { id, ...product } });
  }
  try {
    const { rows } = await pool.query('UPDATE productos p SET nombre=$1, marca=$2, precio=$3, stock=$4, insignia=$5, tipo_insignia=$6, genero=$7, activo=$8, id_categoria=c.id_categoria FROM categorias c WHERE p.id_producto=$9 AND c.nombre=$10 RETURNING p.id_producto AS id', [product.name, product.brand, product.price, product.stock, product.badge || null, product.badgeType || null, product.genre, product.active, id, product.category]);
    if (!rows[0]) return sendError(res, 404, 'Producto o categoría no encontrados.');
    res.json({ product: { id, ...product } });
  } catch {
    sendError(res, 500, 'No fue posible actualizar el producto.');
  }
});

app.put('/api/admin/orders/:id/status', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const status = clean(req.body?.status, 20);
  if (!Number.isInteger(id) || !['Pendiente', 'Aprobada', 'Cancelada', 'Entregada'].includes(status)) return sendError(res, 400, 'Estado de pedido inválido.');
  if (demoMode) {
    const order = demoOrders.find(item => item.id === id);
    if (!order) return sendError(res, 404, 'Pedido no encontrado.');
    order.status = status;
    return res.json({ id, status });
  }
  try {
    const { rows } = await pool.query('UPDATE ordenes SET estado=$1 WHERE id_orden=$2 RETURNING id_orden AS id, estado AS status', [status, id]);
    if (!rows[0]) return sendError(res, 404, 'Pedido no encontrado.');
    res.json(rows[0]);
  } catch {
    sendError(res, 500, 'No fue posible actualizar el pedido.');
  }
});

app.get('/api/cart', requireCart, async (req, res) => {
  if (demoMode) {
    const cart = demoCarts.get(req.cartId) || [];
    return res.json(cart.map(item => {
      const product = demoProducts.find(candidate => candidate.id === item.id);
      return { id: product.id, name: product.name, brand: product.brand, price: product.price, img: product.img, qty: item.qty };
    }).filter(Boolean));
  }
  try {
    await pool.query('INSERT INTO carritos (id_carrito, id_usuario) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.cartId, getUser(req)?.id || null]);
    const { rows } = await pool.query('SELECT p.id_producto AS id, p.nombre AS name, p.marca AS brand, p.precio AS price, p.imagen AS img, cd.cantidad AS qty FROM carrito_detalles cd JOIN productos p ON p.id_producto = cd.id_producto WHERE cd.id_carrito = $1 ORDER BY cd.id_producto', [req.cartId]);
    res.json(rows.map(item => ({ ...item, price: Number(item.price) })));
  } catch { sendError(res, 500, 'No fue posible cargar el carrito.'); }
});

app.put('/api/cart', requireCart, async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.some(item => !Number.isInteger(Number(item.id)) || !Number.isInteger(Number(item.qty)) || Number(item.qty) < 1 || Number(item.qty) > 99)) return sendError(res, 400, 'Carrito inválido.');
  if (demoMode) {
    const validItems = items.filter(item => demoProducts.some(product => product.id === Number(item.id)))
      .map(item => ({ id: Number(item.id), qty: Number(item.qty) }));
    demoCarts.set(req.cartId, validItems);
    return res.json(validItems);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO carritos (id_carrito, id_usuario) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.cartId, getUser(req)?.id || null]);
    await client.query('DELETE FROM carrito_detalles WHERE id_carrito = $1', [req.cartId]);
    for (const item of items) await client.query('INSERT INTO carrito_detalles (id_carrito, id_producto, cantidad) SELECT $1, id_producto, $3 FROM productos WHERE id_producto = $2 AND activo = TRUE', [req.cartId, item.id, item.qty]);
    await client.query('UPDATE carritos SET actualizado_en = CURRENT_TIMESTAMP WHERE id_carrito = $1', [req.cartId]);
    await client.query('COMMIT'); res.json(items);
  } catch { await client.query('ROLLBACK'); sendError(res, 500, 'No fue posible actualizar el carrito.'); } finally { client.release(); }
});

app.post('/api/orders', async (req, res) => {
  const body = req.body || {}, items = Array.isArray(body.items) ? body.items : [];
  const customer = ['fullName', 'email', 'phone', 'address', 'city'].reduce((data, field) => ({ ...data, [field]: clean(body[field], 160) }), {});
  if (!items.length || Object.values(customer).some(value => !value) || !/^\S+@\S+\.\S+$/.test(customer.email) || !['tarjeta', 'pse', 'contraentrega'].includes(body.paymentMethod)) return sendError(res, 400, 'Datos de compra inválidos.');
  if (demoMode) {
    const quantities = new Map();
    for (const item of items) {
      const id = Number(item.id), qty = Number(item.qty);
      if (!Number.isInteger(id) || !Number.isInteger(qty) || qty < 1 || qty > 99) return sendError(res, 400, 'Datos de compra inválidos.');
      quantities.set(id, (quantities.get(id) || 0) + qty);
    }
    const details = [];
    for (const [id, qty] of quantities) {
      const product = demoProducts.find(candidate => candidate.id === id);
      if (!product) return sendError(res, 400, 'No fue posible procesar la orden.');
      if (qty > product.stock) return sendError(res, 409, 'No hay stock suficiente.');
      details.push({ product, qty });
    }
    const subtotal = details.reduce((sum, item) => sum + item.product.price * item.qty, 0);
    const total = subtotal + Math.round(subtotal * taxRate) + shippingCost;
    details.forEach(item => { item.product.stock -= item.qty; });
    const order = { id: demoOrders.length + 1, total };
    demoOrders.push({ ...order, customer, paymentMethod: body.paymentMethod, status: 'Pendiente', createdAt: new Date().toISOString(), items: details.map(item => ({ id: item.product.id, qty: item.qty })) });
    return res.status(201).json({ order, message: 'Compra realizada con éxito (modo demostración).' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids = items.map(item => Number(item.id));
    const { rows: products } = await client.query('SELECT p.id_producto AS id, p.nombre AS name, p.marca AS brand, p.precio AS price, p.stock FROM productos p WHERE p.id_producto = ANY($1::int[]) AND p.activo = TRUE FOR UPDATE', [ids]);
    if (products.length !== items.length) throw new Error('PRODUCT_NOT_FOUND');
    const details = items.map(item => { const product = products.find(row => row.id === Number(item.id)); const qty = Number(item.qty); if (!Number.isInteger(qty) || qty < 1 || qty > product.stock) throw new Error('STOCK'); return { ...product, qty, lineTotal: Number(product.price) * qty }; });
    const subtotal = details.reduce((total, item) => total + item.lineTotal, 0), iva = Math.round(subtotal * taxRate), total = subtotal + iva + shippingCost;
    const user = getUser(req);
    const order = await client.query('INSERT INTO ordenes (id_usuario,nombre_completo,correo,telefono,direccion,ciudad,metodo_pago,subtotal,iva,envio,total) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id_orden AS id, total', [user?.id || null, customer.fullName, customer.email, customer.phone, customer.address, customer.city, body.paymentMethod, subtotal, iva, shippingCost, total]);
    for (const item of details) { await client.query('INSERT INTO orden_detalles (id_orden,id_producto,nombre_producto,marca_producto,cantidad,precio_unitario,subtotal) VALUES ($1,$2,$3,$4,$5,$6,$7)', [order.rows[0].id, item.id, item.name, item.brand, item.qty, item.price, item.lineTotal]); await client.query('UPDATE productos SET stock = stock - $1 WHERE id_producto = $2', [item.qty, item.id]); }
    await client.query('COMMIT'); res.status(201).json({ order: order.rows[0], message: 'Compra realizada con éxito.' });
  } catch (error) { await client.query('ROLLBACK'); sendError(res, error.message === 'STOCK' ? 409 : error.message === 'PRODUCT_NOT_FOUND' ? 400 : 500, error.message === 'STOCK' ? 'No hay stock suficiente.' : 'No fue posible procesar la orden.'); } finally { client.release(); }
});

app.use(express.static(publicRoot));
app.use((error, req, res, next) => { if (error instanceof SyntaxError) return sendError(res, 400, 'JSON inválido.'); next(error); });
app.listen(port, () => console.log(`Less Perfum disponible en http://localhost:${port}`));
