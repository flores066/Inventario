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
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const publicRoot = __dirname;
const cartCookie = 'less_perfum_cart_id';
const authCookie = 'less_perfum_auth';
const shippingCost = 20000;
const taxRate = 0.19;

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

function requireCart(req, res, next) {
  if (!req.cookies[cartCookie]) res.cookie(cartCookie, crypto.randomUUID(), { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 30 });
  req.cartId = req.cookies[cartCookie] || res.getHeader('Set-Cookie')[0].split('=')[1].split(';')[0];
  next();
}

app.get('/api/health', async (req, res) => {
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
  const firstName = clean(req.body.firstName, 80), lastName = clean(req.body.lastName, 80), email = clean(req.body.email, 160).toLowerCase(), phone = clean(req.body.phone, 30), password = String(req.body.password || '');
  if (!firstName || !lastName || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) return sendError(res, 400, 'Revisa los datos de registro.');
  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query('INSERT INTO usuarios (nombre, apellido, correo, telefono, contrasena, newsletter) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id_usuario, nombre, apellido, correo', [firstName, lastName, email, phone || null, hash, Boolean(req.body.newsletter)]);
    res.status(201).json({ user: rows[0], message: 'Cuenta creada correctamente.' });
  } catch (error) { sendError(res, error.code === '23505' ? 409 : 500, error.code === '23505' ? 'Este correo ya está registrado.' : 'No fue posible crear la cuenta.'); }
});

app.post('/api/auth/login', async (req, res) => {
  const email = clean(req.body.email, 160).toLowerCase(), password = String(req.body.password || '');
  try {
    const { rows } = await pool.query('SELECT id_usuario, nombre, apellido, correo, contrasena FROM usuarios WHERE correo = $1 AND estado = \'Activo\'', [email]);
    if (!rows[0] || !(await bcrypt.compare(password, rows[0].contrasena))) return sendError(res, 401, 'Correo o contraseña incorrectos.');
    const user = { id: rows[0].id_usuario, name: rows[0].nombre, email: rows[0].correo };
    res.cookie(authCookie, jwt.sign(user, jwtSecret, { expiresIn: '7d' }), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 * 7 });
    res.json({ user });
  } catch { sendError(res, 500, 'No fue posible iniciar sesión.'); }
});

app.get('/api/cart', requireCart, async (req, res) => {
  try {
    await pool.query('INSERT INTO carritos (id_carrito, id_usuario) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.cartId, getUser(req)?.id || null]);
    const { rows } = await pool.query('SELECT p.id_producto AS id, p.nombre AS name, p.marca AS brand, p.precio AS price, p.imagen AS img, cd.cantidad AS qty FROM carrito_detalles cd JOIN productos p ON p.id_producto = cd.id_producto WHERE cd.id_carrito = $1 ORDER BY cd.id_producto', [req.cartId]);
    res.json(rows.map(item => ({ ...item, price: Number(item.price) })));
  } catch { sendError(res, 500, 'No fue posible cargar el carrito.'); }
});

app.put('/api/cart', requireCart, async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (items.some(item => !Number.isInteger(Number(item.id)) || !Number.isInteger(Number(item.qty)) || Number(item.qty) < 1 || Number(item.qty) > 99)) return sendError(res, 400, 'Carrito inválido.');
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
