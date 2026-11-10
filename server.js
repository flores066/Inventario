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
const { OAuth2Client } = require('google-auth-library');
const PDFDocument = require('pdfkit');

const app = express();
const port = Number(process.env.PORT || 3000);
const publicRoot = __dirname;
const jwtSecret = process.env.JWT_SECRET;
const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || '';
const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
const gmailRefreshToken = process.env.GMAIL_REFRESH_TOKEN || '';
const gmailSender = process.env.GMAIL_SENDER || '';
const turnstileTestMode = process.env.NODE_ENV !== 'production';
const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY ||
  (turnstileTestMode ? '1x00000000000000000000AA' : '');
const turnstileSecretKey = process.env.TURNSTILE_SECRET_KEY ||
  (turnstileTestMode ? '1x0000000000000000000000000000000AA' : '');
const supplierEmail = (process.env.SUPPLIER_EMAIL || '').trim().toLowerCase();
const supplierPassword = process.env.SUPPLIER_PASSWORD || '';
const supplierName = process.env.SUPPLIER_NAME || 'Proveedor Less Perfum';
const wompiPublicKey = process.env.WOMPI_PUBLIC_KEY || '';
const wompiIntegritySecret = process.env.WOMPI_INTEGRITY_SECRET || '';
const wompiEventsSecret = process.env.WOMPI_EVENTS_SECRET || '';
const wompiEnvironment = process.env.WOMPI_ENV || 'sandbox';
const appUrl = process.env.APP_URL || `http://localhost:${port}`;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const googleClient = new OAuth2Client(googleClientId, googleClientSecret);
if (gmailRefreshToken) googleClient.setCredentials({ refresh_token: gmailRefreshToken });

const cartCookie = 'less_perfum_cart_id';
const authCookie = 'less_perfum_auth';
const googlePendingCookie = 'less_perfum_google_pending';
const googleCsrfCookie = 'less_perfum_google_csrf';
const shippingCost = 20000;
const taxRate = 0.19;
const productCategories = new Set(['mujer', 'hombre', 'nicho', 'arabe', 'oferta']);
const perfumeImages = [
  'https://images.unsplash.com/photo-1594035910387-fea47794261f?w=700&h=800&fit=crop',
  'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=700&h=800&fit=crop',
  'https://images.unsplash.com/photo-1541643600914-78b084683601?w=700&h=800&fit=crop',
  'https://images.unsplash.com/photo-1592078615290-033ee584e267?w=700&h=800&fit=crop'
];
const secureCookies = process.env.NODE_ENV === 'production';
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const codeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
const paymentLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const registrationLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '20kb' }));
app.use(cookieParser());
app.use('/api/auth', authLimiter);

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

function clean(value, max = 255) {
  return String(value || '').trim().slice(0, max);
}

function normalizePersonName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function isValidPersonName(value) {
  return value.length >= 2 && value.length <= 80 &&
    /^[\p{L}]+(?:[ '-][\p{L}]+)*$/u.test(value) &&
    !/(\p{L})\1{3,}/iu.test(value);
}

function isValidPhone(value, optional = false) {
  if (!value) return optional;
  const digits = value.replace(/\D/g, '');
  return /^\+?[\d\s()-]+$/.test(value) && digits.length >= 8 && digits.length <= 15;
}

function isValidCity(value) {
  return value.length >= 2 && value.length <= 80 &&
    /^[\p{L}][\p{L}\s.'-]*[\p{L}]$/u.test(value) &&
    !/(\p{L})\1{3,}/iu.test(value);
}

function invoicePdf(invoice) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Factura Less Perfum ${invoice.id}` } });
    const chunks = [];
    document.on('data', chunk => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);

    const money = value => `$ ${Number(value).toLocaleString('es-CO')} COP`;
    const left = 48;
    const right = 547;
    const bottom = 780;
    const drawTableHeader = () => {
      document.font('Helvetica-Bold').fontSize(9).fillColor('#292720');
      const y = document.y;
      document.text('Producto', left, y, { width: 270 });
      document.text('Cant.', 342, y, { width: 35, align: 'right' });
      document.text('Precio', 390, y, { width: 70, align: 'right' });
      document.text('Total', 470, y, { width: 77, align: 'right' });
      document.moveDown(0.7);
      document.strokeColor('#e9e6df').moveTo(left, document.y).lineTo(right, document.y).stroke();
      document.moveDown(0.6);
      document.font('Helvetica').fontSize(9);
    };

    document.font('Helvetica-Bold').fontSize(23).fillColor('#292720').text('LESS PERFUM');
    document.font('Helvetica').fontSize(11).fillColor('#806536').text('Factura de compra');
    document.moveDown(0.5);
    document.fontSize(10).fillColor('#292720')
      .text(`Factura: LP-${invoice.id}`)
      .text(`Fecha: ${new Date(invoice.createdAt).toLocaleDateString('es-CO')}`)
      .text(`Estado del pago: ${invoice.paymentStatus}`);
    document.moveDown();
    document.font('Helvetica-Bold').text('Datos del cliente');
    document.font('Helvetica')
      .text(invoice.customer)
      .text(invoice.email)
      .text(invoice.phone)
      .text(`${invoice.address}, ${invoice.city}`);
    document.moveDown();
    drawTableHeader();

    invoice.items.forEach(item => {
      const product = `${item.name} · ${item.brand}`;
      const rowHeight = Math.max(20, document.heightOfString(product, { width: 270 }));
      if (document.y + rowHeight + 10 > bottom) {
        document.addPage();
        drawTableHeader();
      }
      const y = document.y;
      document.text(product, left, y, { width: 270 });
      document.text(String(item.quantity), 342, y, { width: 35, align: 'right' });
      document.text(money(item.price), 390, y, { width: 70, align: 'right' });
      document.text(money(Number(item.price) * Number(item.quantity)), 470, y, { width: 77, align: 'right' });
      document.y = y + rowHeight + 8;
    });

    if (document.y + 105 > bottom) document.addPage();
    document.moveDown(0.5);
    document.fontSize(10)
      .text(`Subtotal: ${money(invoice.subtotal)}`, { align: 'right' })
      .text(`IVA: ${money(invoice.tax)}`, { align: 'right' })
      .text(`Envío: ${money(invoice.shipping)}`, { align: 'right' });
    document.moveDown(0.4);
    document.font('Helvetica-Bold').fontSize(13)
      .text(`Total pagado: ${money(invoice.total)}`, { align: 'right' });
    document.moveDown(2);
    document.font('Helvetica').fontSize(9).fillColor('#77736b')
      .text('Gracias por tu compra en Less Perfum.', { align: 'center' });
    document.end();
  });
}

function setSessionCookie(res, user, admin = false) {
  const maxAge = admin ? 8 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  const token = jwt.sign(user, jwtSecret, { expiresIn: admin ? '8h' : '7d' });
  res.cookie(authCookie, token, { httpOnly: true, sameSite: 'lax', secure: secureCookies, maxAge });
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

async function requireCustomer(req, res, next) {
  const user = getUser(req);
  if (!user || ['admin', 'supplier'].includes(user.role) || !Number.isInteger(Number(user.id))) {
    return sendError(res, 401, 'Inicia sesión o regístrate para continuar con tu compra.');
  }
  try {
    const result = await pool.query("SELECT 1 FROM usuarios WHERE id_usuario=$1 AND estado='Activo' AND rol='cliente'", [user.id]);
    if (!result.rows[0]) {
      res.clearCookie(authCookie, { httpOnly: true, sameSite: 'lax', secure: secureCookies });
      return sendError(res, 401, 'Tu cuenta no está activa. Inicia sesión con una cuenta habilitada.');
    }
  } catch (error) {
    console.error('Customer session check failed:', error.code || error.message);
    return sendError(res, 500, 'No fue posible validar tu cuenta.');
  }
  req.customer = user;
  next();
}

async function requireSupplier(req, res, next) {
  const user = getUser(req);
  if (!user || user.role !== 'supplier' || !Number.isInteger(Number(user.id))) {
    return sendError(res, 401, 'Inicia sesión con una cuenta de proveedor para continuar.');
  }
  try {
    const { rows } = await pool.query(
      `SELECT p.id_proveedor FROM proveedores p
       JOIN usuarios u ON u.id_usuario=p.id_usuario
       WHERE p.id_usuario=$1 AND p.activo=TRUE AND u.estado='Activo' AND u.rol='proveedor'`,
      [user.id]
    );
    if (!rows[0]) {
      res.clearCookie(authCookie, { httpOnly: true, sameSite: 'lax', secure: secureCookies });
      return sendError(res, 401, 'La cuenta de proveedor está desactivada.');
    }
    req.supplier = { ...user, supplierId: Number(rows[0].id_proveedor) };
    next();
  } catch (error) {
    console.error('Supplier session check failed:', error.code || error.message);
    return sendError(res, 500, 'No fue posible validar la cuenta de proveedor.');
  }
}

function requireCart(req, res, next) {
  const cookieId = req.cookies[cartCookie];
  req.cartId = typeof cookieId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cookieId)
    ? cookieId
    : crypto.randomUUID();
  if (req.cartId !== cookieId) {
    res.cookie(cartCookie, req.cartId, { httpOnly: true, sameSite: 'lax', secure: secureCookies, maxAge: 30 * 24 * 60 * 60 * 1000 });
  }
  next();
}

function setCartCookie(res, cartId) {
  res.cookie(cartCookie, cartId, { httpOnly: true, sameSite: 'lax', secure: secureCookies, maxAge: 30 * 24 * 60 * 60 * 1000 });
}

async function attachCartToUser(client, userId, cartId) {
  if (!cartId) return null;
  const { rows } = await client.query('SELECT id_usuario FROM carritos WHERE id_carrito=$1 FOR UPDATE', [cartId]);
  const currentUserId = rows[0]?.id_usuario;
  if (currentUserId && Number(currentUserId) !== Number(userId)) {
    const newCartId = crypto.randomUUID();
    await client.query('INSERT INTO carritos (id_carrito,id_usuario) VALUES ($1,$2)', [newCartId, userId]);
    return newCartId;
  }
  await client.query(
    `INSERT INTO carritos (id_carrito,id_usuario) VALUES ($1,$2)
     ON CONFLICT (id_carrito) DO UPDATE SET id_usuario=EXCLUDED.id_usuario, actualizado_en=CURRENT_TIMESTAMP`,
    [cartId, userId]
  );
  return cartId;
}

function customerToken(user) {
  return { id: Number(user.id_usuario), name: `${user.nombre} ${user.apellido}`.trim(), email: user.correo, role: 'customer' };
}

function setCustomerSession(res, user) {
  setSessionCookie(res, customerToken(user));
}

function ensureMailConfigured() {
  if (!googleClientId || !googleClientSecret || !gmailRefreshToken || !gmailSender) {
    const error = new Error('EMAIL_NOT_CONFIGURED');
    error.code = 'EMAIL_NOT_CONFIGURED';
    throw error;
  }
}

async function verifyCaptcha(token, req) {
  if (!turnstileSiteKey || !turnstileSecretKey) {
    const error = new Error('CAPTCHA_NOT_CONFIGURED');
    error.code = 'CAPTCHA_NOT_CONFIGURED';
    throw error;
  }
  if (typeof token !== 'string' || token.length < 10 || token.length > 2048) {
    const error = new Error('CAPTCHA_REQUIRED');
    error.code = 'CAPTCHA_REQUIRED';
    throw error;
  }
  const body = new URLSearchParams({ secret: turnstileSecretKey, response: token });
  if (req.ip) body.set('remoteip', req.ip);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('CAPTCHA_PROVIDER_UNAVAILABLE');
  const result = await response.json();
  if (!result.success) {
    const error = new Error('CAPTCHA_INVALID');
    error.code = 'CAPTCHA_INVALID';
    throw error;
  }
}

function captchaError(res, error) {
  if (error.code === 'CAPTCHA_NOT_CONFIGURED') {
    return sendError(res, 503, 'El CAPTCHA no está configurado. Configura Cloudflare Turnstile para este dominio.');
  }
  if (error.code === 'CAPTCHA_REQUIRED' || error.code === 'CAPTCHA_INVALID') {
    return sendError(res, 400, 'Completa la verificación CAPTCHA antes de registrarte.');
  }
  console.error('CAPTCHA verification failed:', error.code || error.message);
  return sendError(res, 502, 'No fue posible validar el CAPTCHA. Intenta de nuevo.');
}

function setSupplierSession(res, supplier) {
  setSessionCookie(res, {
    id: Number(supplier.id_usuario),
    name: supplier.nombre_comercial,
    email: supplier.correo,
    role: 'supplier'
  });
}

async function provisionSupplierAccount() {
  if (!supplierEmail || !supplierPassword || supplierPassword.length < 8) {
    throw new Error('Configura SUPPLIER_EMAIL y SUPPLIER_PASSWORD (mínimo 8 caracteres) en .env.');
  }
  const passwordHash = await bcrypt.hash(supplierPassword, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT id_usuario, rol FROM usuarios WHERE correo=$1 FOR UPDATE', [supplierEmail]);
    let account = existing.rows[0];
    if (account && account.rol !== 'proveedor' && account.rol !== 'cliente') {
      throw new Error('SUPPLIER_EMAIL_IN_USE');
    }
    if (!account) {
      const { rows } = await client.query(
        `INSERT INTO usuarios (nombre,apellido,correo,contrasena,estado,rol,newsletter)
         VALUES ('Proveedor','Less Perfum',$1,$2,'Activo','proveedor',FALSE)
         RETURNING id_usuario, rol`,
        [supplierEmail, passwordHash]
      );
      account = rows[0];
    } else {
      if (account.rol === 'cliente') {
        await client.query('DELETE FROM clientes WHERE id_usuario=$1', [account.id_usuario]);
      }
      await client.query(
        `UPDATE usuarios SET contrasena=$1, estado='Activo', rol='proveedor', nombre='Proveedor', apellido='Less Perfum'
         WHERE id_usuario=$2`,
        [passwordHash, account.id_usuario]
      );
    }
    await client.query(
      `INSERT INTO proveedores (id_usuario,nombre_comercial,activo)
       VALUES ($1,$2,TRUE)
       ON CONFLICT (id_usuario) DO UPDATE SET nombre_comercial=EXCLUDED.nombre_comercial, activo=TRUE`,
      [account.id_usuario, supplierName]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.message === 'SUPPLIER_EMAIL_IN_USE') {
      throw new Error('SUPPLIER_EMAIL_IN_USE: el correo configurado ya pertenece a un cliente.');
    }
    throw error;
  } finally {
    client.release();
  }
}

async function sendEmail(to, subject, body) {
  ensureMailConfigured();
  const { token } = await googleClient.getAccessToken();
  if (!token) throw new Error('GMAIL_ACCESS_TOKEN_MISSING');
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
  const raw = Buffer.from(
    `From: ${gmailSender}\r\nTo: ${to}\r\nSubject: ${encodedSubject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${body}`,
    'utf8'
  ).toString('base64url');
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw })
  });
  if (!response.ok) {
    console.error('Gmail API error:', response.status);
    throw new Error('GMAIL_SEND_FAILED');
  }
}

function mailError(res, error) {
  if (error.code === 'EMAIL_NOT_CONFIGURED') {
    return sendError(res, 503, 'El envío de correo no está configurado. Revisa las variables de Gmail API.');
  }
  console.error('Email delivery failed:', error.code || error.message);
  return sendError(res, 502, 'No fue posible enviar el correo. Intenta de nuevo o solicita otro código.');
}

function parseAdminProduct(body = {}) {
  const image = clean(body.img, 1000);
  const product = {
    name: clean(body.name, 120),
    brand: clean(body.brand, 120),
    category: clean(body.category, 30).toLowerCase(),
    price: Number(body.price),
    stock: Number(body.stock),
    badge: clean(body.badge, 40),
    badgeType: body.badgeType === 'sale' ? 'sale' : '',
    genre: clean(body.genre || 'Unisex', 30),
    image,
    active: body.active !== false
  };
  let validImage = !image;
  if (image) {
    try {
      validImage = new URL(image).protocol === 'https:';
    } catch {
      validImage = false;
    }
  }
  if (!product.name || !product.brand || !productCategories.has(product.category) ||
      !Number.isFinite(product.price) || product.price < 0 ||
      !Number.isInteger(product.stock) || product.stock < 0 || !validImage) return null;
  return product;
}

function verificationHash(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function getEventValue(data, propertyPath) {
  const parts = propertyPath.split('.');
  if (parts.some(part => !/^[a-zA-Z0-9_]+$/.test(part))) return undefined;
  return parts.reduce((value, part) => value && value[part], data);
}

function wompiConfigured() {
  return Boolean(wompiPublicKey && wompiIntegritySecret && wompiEventsSecret);
}

async function updateWompiOrder(transaction) {
  const reference = clean(transaction.reference, 100);
  const status = clean(transaction.status, 20).toUpperCase();
  const amountInCents = Number(transaction.amount_in_cents);
  const transactionId = clean(transaction.id, 100);
  if (!reference || !Number.isSafeInteger(amountInCents) || transaction.currency !== 'COP') {
    throw new Error('INVALID_WOMPI_TRANSACTION');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT id_orden, total, estado_pago, stock_reservado FROM ordenes WHERE referencia_pago=$1 FOR UPDATE',
      [reference]
    );
    const order = rows[0];
    if (!order) throw new Error('ORDER_NOT_FOUND');
    if (Math.round(Number(order.total) * 100) !== amountInCents) throw new Error('PAYMENT_AMOUNT_MISMATCH');

    if (order.estado_pago !== 'Pendiente') {
      await client.query('COMMIT');
      return;
    }

    if (status === 'APPROVED') {
      await client.query(
        `UPDATE ordenes SET estado='Aprobada', estado_pago='Pagado', transaccion_wompi=$1,
          stock_reservado=FALSE, reserva_hasta=NULL WHERE id_orden=$2`,
        [transactionId || null, order.id_orden]
      );
    } else if (['DECLINED', 'ERROR', 'VOIDED'].includes(status)) {
      if (order.stock_reservado) {
        await client.query(
          `UPDATE productos p SET stock=p.stock+d.cantidad
           FROM orden_detalles d WHERE d.id_orden=$1 AND d.id_producto=p.id_producto`,
          [order.id_orden]
        );
      }
      await client.query(
        `UPDATE ordenes SET estado='Cancelada', estado_pago='Rechazado', transaccion_wompi=$1,
          stock_reservado=FALSE, reserva_hasta=NULL WHERE id_orden=$2`,
        [transactionId || null, order.id_orden]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function expireOrderReservations() {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id_orden FROM ordenes
       WHERE estado_pago='Pendiente' AND stock_reservado=TRUE AND reserva_hasta < CURRENT_TIMESTAMP
       FOR UPDATE SKIP LOCKED`
    );
    for (const { id_orden: orderId } of rows) {
      await client.query(
        `UPDATE productos p SET stock=p.stock+d.cantidad
         FROM orden_detalles d WHERE d.id_orden=$1 AND d.id_producto=p.id_producto`,
        [orderId]
      );
      await client.query(
        `UPDATE ordenes SET estado='Cancelada', estado_pago='Expirado', stock_reservado=FALSE
         WHERE id_orden=$1`,
        [orderId]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Order reservation cleanup failed:', error.code || error.message);
  } finally {
    if (client) client.release();
  }
}

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      ok: true,
      database: 'connected',
      google: Boolean(googleClientId),
      email: Boolean(googleClientId && googleClientSecret && gmailRefreshToken && gmailSender),
      payments: wompiConfigured()
    });
  } catch (error) {
    console.error('Health check database error:', error.code || error.message);
    sendError(res, 503, 'Base de datos no disponible.');
  }
});

app.get('/api/perfume-images', (req, res) => {
  const requestedCount = Number.parseInt(req.query.count, 10) || 8;
  const count = Math.min(Math.max(requestedCount, 1), 24);
  const images = Array.from({ length: count }, (_, index) => {
    const imageIndex = (crypto.randomInt(perfumeImages.length) + index) % perfumeImages.length;
    return { id: index + 1, url: perfumeImages[imageIndex] };
  });
  res.set('Cache-Control', 'no-store');
  res.json({ provider: 'Unsplash', images });
});

app.get('/api/products', async (req, res) => {
  const params = [];
  const filters = ['p.activo = TRUE'];
  if (req.query.category && req.query.category !== 'all') {
    params.push(clean(req.query.category, 30).toLowerCase());
    filters.push(`c.nombre = $${params.length}`);
  }
  if (req.query.search) {
    params.push(`%${clean(req.query.search, 80).toLowerCase()}%`);
    filters.push(`(LOWER(p.nombre) LIKE $${params.length} OR LOWER(p.marca) LIKE $${params.length})`);
  }
  try {
    const { rows } = await pool.query(
      `SELECT p.id_producto AS id, p.nombre AS name, p.marca AS brand, p.precio AS price,
        p.precio_anterior AS old,
        p.imagen AS img,
        p.insignia AS badge, p.tipo_insignia AS "badgeType", c.nombre AS cat, p.genero AS genre, p.stock
       FROM productos p JOIN categorias c ON c.id_categoria=p.id_categoria
       WHERE ${filters.join(' AND ')} ORDER BY p.id_producto`,
      params
    );
    res.json(rows.map(product => ({
      ...product,
      price: Number(product.price),
      old: product.old === null ? undefined : Number(product.old)
    })));
  } catch (error) {
    console.error('Product catalog query failed:', error.code || error.message);
    sendError(res, 500, 'No fue posible cargar el catálogo.');
  }
});

app.get('/api/auth/captcha/config', (req, res) => {
  if (!turnstileSiteKey || !turnstileSecretKey) {
    return sendError(res, 503, 'El CAPTCHA no está configurado.');
  }
  res.json({ provider: 'Cloudflare Turnstile', siteKey: turnstileSiteKey, testMode: turnstileTestMode });
});

app.post('/api/auth/register', registrationLimiter, async (req, res) => {
  const body = req.body || {};
  const firstName = normalizePersonName(body.firstName);
  const lastName = normalizePersonName(body.lastName);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const password = String(body.password || '');
  const phoneValid = body.phone == null ||
    (typeof body.phone === 'string' && body.phone.length <= 30 &&
      (body.phone.length === 0 || (Boolean(phone) && isValidPhone(phone, true))));
  if (!isValidPersonName(firstName) || !isValidPersonName(lastName) || !phoneValid ||
      email.length > 160 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || !password.trim()) {
    return sendError(res, 400, 'Revisa nombre, apellido, teléfono, correo y contraseña (mínimo 8 caracteres).');
  }
  try {
    await verifyCaptcha(body.captchaToken, req);
  } catch (error) {
    return captchaError(res, error);
  }
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const client = await pool.connect();
    let user;
    let cartId;
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO usuarios (nombre, apellido, correo, telefono, contrasena, estado, rol, newsletter)
         VALUES ($1,$2,$3,$4,$5,'Activo','cliente',$6)
         RETURNING id_usuario, nombre, apellido, correo`,
        [firstName, lastName, email, phone || null, passwordHash, Boolean(body.newsletter)]
      );
      user = rows[0];
      await client.query('INSERT INTO clientes (id_usuario) VALUES ($1)', [user.id_usuario]);
      cartId = await attachCartToUser(client, user.id_usuario, req.cookies[cartCookie]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    setCustomerSession(res, user);
    if (cartId && cartId !== req.cookies[cartCookie]) setCartCookie(res, cartId);
    res.status(201).json({
      user: { name: `${user.nombre} ${user.apellido}`, email: user.correo },
      role: 'customer',
      message: 'Cuenta creada e inicio de sesión exitoso.'
    });
  } catch (error) {
    if (error.code === '23505') return sendError(res, 409, 'Este correo ya está registrado.');
    console.error('Customer registration failed:', error.code || error.message);
    sendError(res, 500, 'No fue posible crear la cuenta.');
  }
});

app.post('/api/auth/resend-code', codeLimiter, async (req, res) => {
  const email = clean(req.body?.email, 160).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return sendError(res, 400, 'Ingresa un correo válido.');
  try {
    ensureMailConfigured();
    const client = await pool.connect();
    let userId;
    let code;
    try {
      await client.query('BEGIN');
      const userResult = await client.query(
        "SELECT id_usuario FROM usuarios WHERE correo=$1 AND estado='Inactivo' FOR UPDATE",
        [email]
      );
      if (!userResult.rows[0]) {
        await client.query('ROLLBACK');
        return sendError(res, 404, 'No encontramos una cuenta pendiente de verificación para ese correo.');
      }
      userId = userResult.rows[0].id_usuario;
      code = String(crypto.randomInt(100000, 1000000));
      await client.query(
        `INSERT INTO codigos_verificacion (id_usuario, codigo_hash, expira_en, intentos)
         VALUES ($1,$2,CURRENT_TIMESTAMP + INTERVAL '15 minutes',0)
         ON CONFLICT (id_usuario) DO UPDATE SET codigo_hash=EXCLUDED.codigo_hash,
           expira_en=EXCLUDED.expira_en, intentos=0, creado_en=CURRENT_TIMESTAMP`,
        [userId, verificationHash(code)]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await sendEmail(email, 'Nuevo código Less Perfum', `Tu nuevo código de verificación es ${code}. Vence en 15 minutos.`);
    res.json({ message: 'Enviamos un nuevo código de verificación.' });
  } catch (error) {
    if (error.code === 'EMAIL_NOT_CONFIGURED') return mailError(res, error);
    console.error('Verification code resend failed:', error.code || error.message);
    sendError(res, 502, 'No fue posible enviar el código.');
  }
});

app.post('/api/auth/verify-email', codeLimiter, async (req, res) => {
  const email = clean(req.body?.email, 160).toLowerCase();
  const code = clean(req.body?.code, 6);
  if (!/^\S+@\S+\.\S+$/.test(email) || !/^\d{6}$/.test(code)) {
    return sendError(res, 400, 'Ingresa el correo y el código de 6 dígitos.');
  }
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT u.id_usuario, u.nombre, u.apellido, u.correo, c.codigo_hash, c.expira_en, c.intentos
       FROM usuarios u JOIN codigos_verificacion c ON c.id_usuario=u.id_usuario
       WHERE u.correo=$1 AND u.estado='Inactivo' FOR UPDATE OF u, c`,
      [email]
    );
    const pending = rows[0];
    if (!pending || new Date(pending.expira_en) <= new Date() || pending.intentos >= 5) {
      await client.query('ROLLBACK');
      return sendError(res, 400, 'El código venció o ya no es válido. Solicita uno nuevo.');
    }
    const suppliedHash = Buffer.from(verificationHash(code), 'hex');
    const expectedHash = Buffer.from(pending.codigo_hash, 'hex');
    if (suppliedHash.length !== expectedHash.length || !crypto.timingSafeEqual(suppliedHash, expectedHash)) {
      await client.query('UPDATE codigos_verificacion SET intentos=intentos+1 WHERE id_usuario=$1', [pending.id_usuario]);
      await client.query('COMMIT');
      return sendError(res, 400, 'El código no coincide.');
    }
    await client.query("UPDATE usuarios SET estado='Activo' WHERE id_usuario=$1", [pending.id_usuario]);
    await client.query('DELETE FROM codigos_verificacion WHERE id_usuario=$1', [pending.id_usuario]);
    const cartId = await attachCartToUser(client, pending.id_usuario, req.cookies[cartCookie]);
    await client.query('COMMIT');
    setCustomerSession(res, pending);
    if (cartId && cartId !== req.cookies[cartCookie]) setCartCookie(res, cartId);
    res.json({ user: { name: `${pending.nombre} ${pending.apellido}`, email: pending.correo }, message: 'Correo verificado e inicio de sesión exitoso.' });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Email verification failed:', error.code || error.message);
    sendError(res, 500, 'No fue posible verificar el código.');
  } finally {
    if (client) client.release();
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = clean(req.body?.email, 160).toLowerCase();
  const password = String(req.body?.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email) || !password) return sendError(res, 400, 'Ingresa un correo y contraseña válidos.');

  if (adminEmail && email === adminEmail) {
    const supplied = Buffer.from(password);
    const expected = Buffer.from(adminPassword);
    const validPassword = expected.length > 0 && supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
    if (!validPassword) return sendError(res, 401, 'Correo o contraseña incorrectos.');
    setSessionCookie(res, { id: 'admin', name: 'Administrador', email: adminEmail, role: 'admin' }, true);
    return res.json({ user: { name: 'Administrador', email: adminEmail }, role: 'admin' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id_usuario, nombre, apellido, correo, contrasena, estado, rol
       FROM usuarios WHERE correo=$1`,
      [email]
    );
    const account = rows[0];
    if (!account) {
      return res.status(404).json({
        error: 'Este correo no está registrado. Te llevaremos al formulario de registro.',
        registrationRequired: true
      });
    }
    if (!account.contrasena || !(await bcrypt.compare(password, account.contrasena))) {
      return sendError(res, 401, 'Correo o contraseña incorrectos.');
    }
    if (account.rol === 'proveedor') {
      if (account.estado !== 'Activo') return sendError(res, 403, 'La cuenta de proveedor está desactivada.');
      const { rows: supplierRows } = await pool.query(
        `SELECT p.id_proveedor, p.nombre_comercial FROM proveedores p
         WHERE p.id_usuario=$1 AND p.activo=TRUE`,
        [account.id_usuario]
      );
      if (!supplierRows[0]) return sendError(res, 403, 'La cuenta de proveedor está desactivada.');
      setSupplierSession(res, { ...account, nombre_comercial: supplierRows[0].nombre_comercial });
      return res.json({
        user: { name: supplierRows[0].nombre_comercial, email: account.correo },
        role: 'supplier'
      });
    }
    if (account.rol !== 'cliente') return sendError(res, 403, 'Esta cuenta no puede iniciar sesión desde aquí.');
    if (account.estado !== 'Activo') {
      const { rows: pendingRows } = await pool.query(
        'SELECT 1 FROM codigos_verificacion WHERE id_usuario=$1 AND expira_en > CURRENT_TIMESTAMP',
        [account.id_usuario]
      );
      if (!pendingRows[0]) return sendError(res, 403, 'La cuenta está desactivada. Contacta con la tienda.');
      await pool.query("UPDATE usuarios SET estado='Activo' WHERE id_usuario=$1", [account.id_usuario]);
      await pool.query('DELETE FROM codigos_verificacion WHERE id_usuario=$1', [account.id_usuario]);
      account.estado = 'Activo';
    }
    const client = await pool.connect();
    let cartId;
    try {
      await client.query('BEGIN');
      cartId = await attachCartToUser(client, account.id_usuario, req.cookies[cartCookie]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    setCustomerSession(res, account);
    if (cartId && cartId !== req.cookies[cartCookie]) setCartCookie(res, cartId);
    res.json({
      user: { name: `${account.nombre} ${account.apellido}`, email: account.correo },
      role: 'customer'
    });
  } catch (error) {
    console.error('Login failed:', error.code || error.message);
    sendError(res, 500, 'No fue posible iniciar sesión.');
  }
});

app.get('/api/auth/google/config', (req, res) => {
  if (!googleClientId) return sendError(res, 503, 'El inicio de sesión con Google no está configurado.');
  const csrfToken = crypto.randomBytes(24).toString('hex');
  res.cookie(googleCsrfCookie, csrfToken, { httpOnly: false, sameSite: 'lax', secure: secureCookies, maxAge: 10 * 60 * 1000 });
  res.json({ clientId: googleClientId, csrfToken });
});

app.post('/api/auth/google', async (req, res) => {
  const csrfCookie = req.cookies[googleCsrfCookie] || '';
  if (!csrfCookie || !req.body?.csrfToken || csrfCookie !== req.body.csrfToken) {
    return sendError(res, 403, 'No fue posible validar la solicitud de Google. Recarga la página.');
  }
  if (!googleClientId) return sendError(res, 503, 'El inicio de sesión con Google no está configurado.');
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: String(req.body.credential || ''), audience: googleClientId });
    const profile = ticket.getPayload();
    if (!profile || !profile.email || profile.email_verified !== true || !profile.sub) {
      return sendError(res, 401, 'Google no pudo verificar la cuenta.');
    }
    const email = profile.email.toLowerCase();
    const client = await pool.connect();
    let account;
    try {
      await client.query('BEGIN');
      const lookup = await client.query(
        `SELECT id_usuario, nombre, apellido, correo, estado, rol
         FROM usuarios WHERE google_sub=$1 OR correo=$2 ORDER BY (google_sub=$1) DESC LIMIT 1 FOR UPDATE`,
        [profile.sub, email]
      );
      account = lookup.rows[0];
      if (account) {
        if (account.rol !== 'cliente') {
          await client.query('ROLLBACK');
          return sendError(res, 403, 'Esta cuenta no puede iniciar sesión como cliente.');
        }
        if (account.estado !== 'Activo') {
          await client.query("UPDATE usuarios SET estado='Activo', google_sub=$1 WHERE id_usuario=$2", [profile.sub, account.id_usuario]);
          await client.query('DELETE FROM codigos_verificacion WHERE id_usuario=$1', [account.id_usuario]);
          account.estado = 'Activo';
        } else {
          await client.query('UPDATE usuarios SET google_sub=COALESCE(google_sub,$1) WHERE id_usuario=$2', [profile.sub, account.id_usuario]);
        }
        account.cartId = await attachCartToUser(client, account.id_usuario, req.cookies[cartCookie]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    res.clearCookie(googleCsrfCookie, { httpOnly: false, sameSite: 'lax', secure: secureCookies });
    if (!account) {
      const pendingToken = jwt.sign({
        sub: profile.sub,
        email,
        givenName: clean(profile.given_name, 80),
        familyName: clean(profile.family_name, 80)
      }, jwtSecret, { expiresIn: '10m' });
      res.cookie(googlePendingCookie, pendingToken, { httpOnly: true, sameSite: 'lax', secure: secureCookies, maxAge: 10 * 60 * 1000 });
      return res.json({ needsRegistration: true, redirect: 'formularios/register.html?google=1' });
    }
    setCustomerSession(res, account);
    if (account.cartId && account.cartId !== req.cookies[cartCookie]) setCartCookie(res, account.cartId);
    res.json({ user: { name: `${account.nombre} ${account.apellido}`, email: account.correo } });
  } catch (error) {
    if (error.code === '23505') return sendError(res, 409, 'La cuenta de Google ya está asociada con otro usuario.');
    console.error('Google sign-in failed:', error.code || error.message);
    sendError(res, 401, 'No fue posible validar el inicio de sesión con Google.');
  }
});

app.get('/api/auth/google/pending', (req, res) => {
  try {
    const profile = jwt.verify(req.cookies[googlePendingCookie] || '', jwtSecret);
    res.json({ pending: true, firstName: profile.givenName, lastName: profile.familyName, email: profile.email });
  } catch {
    res.json({ pending: false });
  }
});

app.post('/api/auth/google/register', async (req, res) => {
  let profile;
  try {
    profile = jwt.verify(req.cookies[googlePendingCookie] || '', jwtSecret);
  } catch {
    return sendError(res, 401, 'La verificación de Google venció. Inicia el proceso de nuevo.');
  }
  const firstName = normalizePersonName(profile.givenName || req.body?.firstName);
  const lastName = normalizePersonName(profile.familyName || req.body?.lastName);
  const rawPhone = req.body?.phone;
  const phone = typeof rawPhone === 'string' ? rawPhone.trim() : '';
  const phoneValid = rawPhone == null ||
    (typeof rawPhone === 'string' && rawPhone.length <= 30 &&
      (rawPhone.length === 0 || (Boolean(phone) && isValidPhone(phone, true))));
  if (!isValidPersonName(firstName) || !isValidPersonName(lastName) || !phoneValid ||
      !profile.sub || !profile.email) {
    return sendError(res, 400, 'Revisa tu nombre, apellido y teléfono para crear la cuenta.');
  }
  try {
    await verifyCaptcha(req.body?.captchaToken, req);
  } catch (error) {
    return captchaError(res, error);
  }
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO usuarios (nombre, apellido, correo, telefono, google_sub, estado, rol, newsletter)
       VALUES ($1,$2,$3,$4,$5,'Activo','cliente',$6)
       RETURNING id_usuario, nombre, apellido, correo`,
      [firstName, lastName, profile.email, phone || null, profile.sub, Boolean(req.body?.newsletter)]
    );
    const user = rows[0];
    await client.query('INSERT INTO clientes (id_usuario) VALUES ($1)', [user.id_usuario]);
    const cartId = await attachCartToUser(client, user.id_usuario, req.cookies[cartCookie]);
    await client.query('COMMIT');
    setCustomerSession(res, user);
    if (cartId && cartId !== req.cookies[cartCookie]) setCartCookie(res, cartId);
    res.clearCookie(googlePendingCookie, { httpOnly: true, sameSite: 'lax', secure: secureCookies });
    res.status(201).json({
      user: { name: `${user.nombre} ${user.apellido}`, email: user.correo },
      role: 'customer',
      message: 'Cuenta creada e inicio de sesión exitoso.'
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error.code === '23505') return sendError(res, 409, 'Ese correo ya tiene una cuenta. Inicia sesión.');
    console.error('Google registration failed:', error.code || error.message);
    sendError(res, 500, 'No fue posible crear la cuenta de Google.');
  } finally {
    if (client) client.release();
  }
});

app.get('/api/auth/session', async (req, res) => {
  const user = getUser(req);
  if (!user) return res.json({ authenticated: false });
  if (user.role === 'supplier') {
    try {
      const { rows } = await pool.query(
        `SELECT 1 FROM proveedores p JOIN usuarios u ON u.id_usuario=p.id_usuario
         WHERE p.id_usuario=$1 AND p.activo=TRUE AND u.estado='Activo' AND u.rol='proveedor'`,
        [user.id]
      );
      if (!rows[0]) {
        res.clearCookie(authCookie, { httpOnly: true, sameSite: 'lax', secure: secureCookies });
        return res.json({ authenticated: false });
      }
    } catch (error) {
      console.error('Supplier session lookup failed:', error.code || error.message);
      return sendError(res, 500, 'No fue posible validar la sesión.');
    }
  } else if (user.role !== 'admin') {
    try {
      const { rows } = await pool.query(
        "SELECT 1 FROM usuarios WHERE id_usuario=$1 AND estado='Activo' AND rol='cliente'",
        [user.id]
      );
      if (!rows[0]) {
        res.clearCookie(authCookie, { httpOnly: true, sameSite: 'lax', secure: secureCookies });
        return res.json({ authenticated: false });
      }
    } catch (error) {
      console.error('Session lookup failed:', error.code || error.message);
      return sendError(res, 500, 'No fue posible validar la sesión.');
    }
  }
  res.json({
    authenticated: true,
    role: user.role || 'customer',
    user: { id: user.id, name: user.name, email: user.email }
  });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(authCookie, { httpOnly: true, sameSite: 'lax', secure: secureCookies });
  res.json({ ok: true });
});

app.get('/api/account/summary', requireCustomer, requireCart, async (req, res) => {
  try {
    const client = await pool.connect();
    let accountCartId;
    try {
      await client.query('BEGIN');
      accountCartId = await attachCartToUser(client, req.customer.id, req.cartId);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    if (accountCartId && accountCartId !== req.cartId) setCartCookie(res, accountCartId);
    if (accountCartId) req.cartId = accountCartId;
    const [userResult, cartResult, orderResult] = await Promise.all([
      pool.query(
        `SELECT u.nombre AS name, u.apellido AS surname, u.correo AS email, u.telefono AS phone,
          c.direccion AS address, c.ciudad AS city
         FROM usuarios u JOIN clientes c ON c.id_usuario=u.id_usuario
         WHERE u.id_usuario=$1 AND u.estado='Activo'`,
        [req.customer.id]
      ),
      pool.query(
        `SELECT p.id_producto AS id, p.nombre AS name, p.marca AS brand, p.precio AS price,
          p.imagen AS img, cd.cantidad AS quantity
         FROM carrito_detalles cd
         JOIN productos p ON p.id_producto=cd.id_producto
         WHERE cd.id_carrito=$1 AND p.activo=TRUE
         ORDER BY p.nombre`,
        [req.cartId]
      ),
      pool.query(
        `SELECT o.id_orden AS id, o.estado AS status, o.estado_pago AS "paymentStatus",
          o.total, o.fecha_creacion AS "createdAt",
          COALESCE((
            SELECT json_agg(json_build_object(
              'name', d.nombre_producto, 'brand', d.marca_producto,
              'quantity', d.cantidad, 'price', d.precio_unitario
            ) ORDER BY d.id_detalle)
            FROM orden_detalles d WHERE d.id_orden=o.id_orden
          ), '[]'::json) AS items
         FROM ordenes o
         WHERE o.id_usuario=$1
         ORDER BY o.fecha_creacion DESC LIMIT 50`,
        [req.customer.id]
      )
    ]);
    if (!userResult.rows[0]) return sendError(res, 401, 'Inicia sesión de nuevo para consultar tu perfil.');
    res.json({
      customer: userResult.rows[0],
      cart: cartResult.rows.map(item => ({
        ...item,
        price: Number(item.price),
        quantity: Number(item.quantity),
        img: item.img || perfumeImages[Number(item.id) % perfumeImages.length]
      })),
      orders: orderResult.rows.map(order => ({ ...order, total: Number(order.total) }))
    });
  } catch (error) {
    console.error('Customer account summary failed:', error.code || error.message);
    sendError(res, 500, 'No fue posible cargar tu perfil.');
  }
});

app.get('/api/admin/session', (req, res) => {
  const user = getUser(req);
  if (!user || user.role !== 'admin') return res.json({ authenticated: false });
  res.json({ authenticated: true, user: { name: user.name, email: user.email } });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie(authCookie, { httpOnly: true, sameSite: 'lax', secure: secureCookies });
  res.json({ ok: true });
});

app.get('/api/admin/summary', requireAdmin, async (req, res) => {
  try {
    const [productResult, orderResult, customerResult, salesResult, receiptResult] = await Promise.all([
      pool.query(
        `SELECT p.id_producto AS id, p.nombre AS name, p.marca AS brand, p.precio AS price,
          p.imagen AS img,
          c.nombre AS category, p.stock, p.insignia AS badge, p.tipo_insignia AS "badgeType", p.activo AS active
         FROM productos p JOIN categorias c ON c.id_categoria=p.id_categoria ORDER BY p.id_producto`
      ),
      pool.query(
        `SELECT o.id_orden AS id, o.nombre_completo AS customer, o.correo AS email,
          o.telefono AS phone, o.direccion AS address, o.ciudad AS city, o.total,
          o.estado AS status, o.estado_pago AS "paymentStatus", o.metodo_pago AS "paymentMethod",
          o.fecha_creacion AS "createdAt",
          (SELECT COALESCE(SUM(d.cantidad),0)::int FROM orden_detalles d WHERE d.id_orden=o.id_orden) AS "itemCount"
         FROM ordenes o ORDER BY o.fecha_creacion DESC`
      ),
      pool.query(
        `SELECT u.id_usuario AS id, u.nombre AS name, u.apellido AS surname, u.correo AS email,
          u.telefono AS phone, u.estado AS status, u.fecha_registro AS "createdAt",
          c.direccion AS address, c.ciudad AS city
         FROM clientes c JOIN usuarios u ON u.id_usuario=c.id_usuario
         ORDER BY u.fecha_registro DESC`
      ),
      pool.query("SELECT COALESCE(SUM(total),0) AS total FROM ordenes WHERE estado_pago='Pagado'"),
      pool.query(
        `SELECT m.id_movimiento AS id, m.referencia AS reference, m.notas AS notes,
          m.cantidad AS quantity, m.fecha_recepcion AS "receivedAt",
          p.nombre AS product, p.marca AS brand, u.nombre_comercial AS supplier,
          account.correo AS "supplierEmail"
         FROM movimientos_inventario m
         JOIN productos p ON p.id_producto=m.id_producto
         JOIN proveedores u ON u.id_proveedor=m.id_proveedor
         JOIN usuarios account ON account.id_usuario=u.id_usuario
         ORDER BY m.fecha_recepcion DESC, m.id_movimiento DESC LIMIT 100`
      )
    ]);
    const products = productResult.rows.map((product, index) => ({
      ...product,
      price: Number(product.price),
      img: product.img || perfumeImages[index % perfumeImages.length]
    }));
    const orders = orderResult.rows.map(order => ({ ...order, total: Number(order.total) }));
    res.json({
      stats: {
        products: products.length,
        lowStock: products.filter(product => Number(product.stock) <= 5).length,
        customers: customerResult.rows.length,
        orders: orders.length,
        sales: Number(salesResult.rows[0].total)
      },
      products,
      orders,
      customers: customerResult.rows,
      receipts: receiptResult.rows
    });
  } catch (error) {
    console.error('Admin summary query failed:', error.code || error.message);
    sendError(res, 500, 'No fue posible cargar el panel de administración.');
  }
});

app.put('/api/admin/customers/:id/status', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const status = clean(req.body?.status, 12);
  if (!Number.isInteger(id) || id < 1 || !['Activo', 'Inactivo'].includes(status)) {
    return sendError(res, 400, 'Estado de cliente inválido.');
  }
  try {
    const { rows } = await pool.query(
      'UPDATE usuarios SET estado=$1 WHERE id_usuario=$2 RETURNING id_usuario AS id, estado AS status',
      [status, id]
    );
    if (!rows[0]) return sendError(res, 404, 'Cliente no encontrado.');
    res.json(rows[0]);
  } catch (error) {
    console.error('Customer status update failed:', error.code || error.message);
    sendError(res, 500, 'No fue posible actualizar el estado del cliente.');
  }
});

app.post('/api/admin/products', requireAdmin, async (req, res) => {
  const product = parseAdminProduct(req.body);
  if (!product) return sendError(res, 400, 'Revisa nombre, marca, categoría, precio, stock e imagen HTTPS.');
  try {
    const { rows } = await pool.query(
      `INSERT INTO productos (nombre,marca,precio,stock,imagen,insignia,tipo_insignia,genero,id_categoria,activo)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,c.id_categoria,$9
       FROM categorias c WHERE c.nombre=$10 RETURNING id_producto AS id`,
      [product.name, product.brand, product.price, product.stock, product.image, product.badge || null,
        product.badgeType || null, product.genre, product.active, product.category]
    );
    if (!rows[0]) return sendError(res, 400, 'La categoría seleccionada no existe.');
    res.status(201).json({ product: { id: rows[0].id, ...product } });
  } catch (error) {
    console.error('Product creation failed:', error.code || error.message);
    sendError(res, 500, 'No fue posible crear el producto.');
  }
});

app.put('/api/admin/products/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const product = parseAdminProduct(req.body);
  if (!Number.isInteger(id) || !product) return sendError(res, 400, 'Revisa los datos del producto.');
  try {
    const { rows } = await pool.query(
      `UPDATE productos p SET nombre=$1, marca=$2, precio=$3, stock=$4, imagen=$5, insignia=$6,
        tipo_insignia=$7, genero=$8, activo=$9, id_categoria=c.id_categoria
       FROM categorias c WHERE p.id_producto=$10 AND c.nombre=$11 RETURNING p.id_producto AS id`,
      [product.name, product.brand, product.price, product.stock, product.image, product.badge || null,
        product.badgeType || null, product.genre, product.active, id, product.category]
    );
    if (!rows[0]) return sendError(res, 404, 'Producto o categoría no encontrados.');
    res.json({ product: { id, ...product } });
  } catch (error) {
    console.error('Product update failed:', error.code || error.message);
    sendError(res, 500, 'No fue posible actualizar el producto.');
  }
});

app.put('/api/admin/orders/:id/status', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const status = clean(req.body?.status, 20);
  if (!Number.isInteger(id) || !['Pendiente', 'Aprobada', 'Cancelada', 'Entregada'].includes(status)) {
    return sendError(res, 400, 'Estado de pedido inválido.');
  }
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT estado, estado_pago, stock_reservado FROM ordenes WHERE id_orden=$1 FOR UPDATE',
      [id]
    );
    const order = rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      return sendError(res, 404, 'Pedido no encontrado.');
    }
    if (status === 'Cancelada' && order.estado_pago === 'Pagado') {
      await client.query('ROLLBACK');
      return sendError(res, 409, 'El pedido ya fue pagado. Gestiona el reembolso desde Wompi antes de cancelarlo.');
    }
    if (['Aprobada', 'Entregada'].includes(status) && order.estado_pago !== 'Pagado') {
      await client.query('ROLLBACK');
      return sendError(res, 409, 'Solo se pueden aprobar o entregar pedidos con pago confirmado por Wompi.');
    }
    if (order.estado_pago === 'Pagado' && !['Aprobada', 'Entregada'].includes(status)) {
      await client.query('ROLLBACK');
      return sendError(res, 409, 'Un pedido pagado solo puede aprobarse o marcarse como entregado.');
    }
    if (order.estado === 'Entregada' && status !== 'Entregada') {
      await client.query('ROLLBACK');
      return sendError(res, 409, 'Un pedido entregado no se puede reabrir.');
    }
    if (order.estado === 'Cancelada' && status !== 'Cancelada') {
      await client.query('ROLLBACK');
      return sendError(res, 409, 'Un pedido cancelado no se puede reactivar.');
    }
    if (status === 'Cancelada' && order.stock_reservado) {
      await client.query(
        `UPDATE productos p SET stock=p.stock+d.cantidad
         FROM orden_detalles d WHERE d.id_orden=$1 AND d.id_producto=p.id_producto`,
        [id]
      );
      await client.query(
        `UPDATE ordenes SET estado=$1, estado_pago='Expirado', stock_reservado=FALSE, reserva_hasta=NULL
         WHERE id_orden=$2`,
        [status, id]
      );
    } else {
      await client.query('UPDATE ordenes SET estado=$1 WHERE id_orden=$2', [status, id]);
    }
    await client.query('COMMIT');
    res.json({ id, status });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Order status update failed:', error.code || error.message);
    sendError(res, 500, 'No fue posible actualizar el pedido.');
  } finally {
    if (client) client.release();
  }
});

app.get('/api/supplier/summary', requireSupplier, async (req, res) => {
  try {
    const [productResult, movementResult] = await Promise.all([
      pool.query(
        `SELECT id_producto AS id, nombre AS name, marca AS brand, stock
         FROM productos WHERE activo=TRUE ORDER BY nombre`
      ),
      pool.query(
        `SELECT m.id_movimiento AS id, m.referencia AS reference, m.notas AS notes,
          m.cantidad AS quantity, m.fecha_recepcion AS "receivedAt",
          p.id_producto AS "productId", p.nombre AS product, p.marca AS brand
         FROM movimientos_inventario m
         JOIN productos p ON p.id_producto=m.id_producto
         WHERE m.id_proveedor=$1
         ORDER BY m.fecha_recepcion DESC, m.id_movimiento DESC LIMIT 100`,
        [req.supplier.supplierId]
      )
    ]);
    res.json({
      supplier: { name: req.supplier.name, email: req.supplier.email },
      products: productResult.rows,
      receipts: movementResult.rows
    });
  } catch (error) {
    console.error('Supplier dashboard query failed:', error.code || error.message);
    sendError(res, 500, 'No fue posible cargar el panel del proveedor.');
  }
});

app.post('/api/supplier/receipts', requireSupplier, async (req, res) => {
  const items = req.body?.items;
  const reference = clean(req.body?.reference, 100) || `REC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const notes = clean(req.body?.notes, 500);
  if (!Array.isArray(items) || items.length < 1 || items.length > 50 ||
      items.some(item => !Number.isInteger(Number(item.productId)) || Number(item.productId) < 1 ||
        !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1 || Number(item.quantity) > 10000) ||
      new Set(items.map(item => Number(item.productId))).size !== items.length) {
    return sendError(res, 400, 'Indica productos válidos y una cantidad positiva para cada uno.');
  }
  const orderedItems = [...items].map(item => ({
    productId: Number(item.productId),
    quantity: Number(item.quantity)
  })).sort((a, b) => a.productId - b.productId);
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const supplierResult = await client.query(
      'SELECT id_proveedor FROM proveedores WHERE id_proveedor=$1 AND activo=TRUE FOR UPDATE',
      [req.supplier.supplierId]
    );
    if (!supplierResult.rows[0]) {
      await client.query('ROLLBACK');
      return sendError(res, 403, 'La cuenta de proveedor está desactivada.');
    }
    const received = [];
    for (const item of orderedItems) {
      const productResult = await client.query(
        'SELECT nombre FROM productos WHERE id_producto=$1 AND activo=TRUE FOR UPDATE',
        [item.productId]
      );
      if (!productResult.rows[0]) {
        await client.query('ROLLBACK');
        return sendError(res, 404, `El producto ${item.productId} no existe o no está activo.`);
      }
      const stockResult = await client.query(
        'UPDATE productos SET stock=stock+$1 WHERE id_producto=$2 RETURNING stock',
        [item.quantity, item.productId]
      );
      await client.query(
        `INSERT INTO movimientos_inventario (id_proveedor,id_producto,cantidad,referencia,notas)
         VALUES ($1,$2,$3,$4,$5)`,
        [req.supplier.supplierId, item.productId, item.quantity, reference, notes || null]
      );
      received.push({
        productId: item.productId,
        product: productResult.rows[0].nombre,
        quantity: item.quantity,
        stock: stockResult.rows[0].stock
      });
    }
    await client.query('COMMIT');
    res.status(201).json({ reference, received, message: 'Recepción registrada y existencias actualizadas.' });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Inventory receipt failed:', error.code || error.message);
    sendError(res, 500, 'No fue posible registrar la recepción del inventario.');
  } finally {
    if (client) client.release();
  }
});

app.get('/api/cart', requireCart, async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO carritos (id_carrito, id_usuario)
       VALUES ($1,$2) ON CONFLICT (id_carrito) DO UPDATE SET id_usuario=COALESCE(carritos.id_usuario,EXCLUDED.id_usuario)`,
      [req.cartId, getUser(req)?.id || null]
    );
    const { rows } = await pool.query(
      `SELECT p.id_producto AS id, p.nombre AS name, p.marca AS brand, p.precio AS price,
        p.imagen AS img,
        cd.cantidad AS qty, p.stock
       FROM carrito_detalles cd JOIN productos p ON p.id_producto=cd.id_producto
       WHERE cd.id_carrito=$1 AND p.activo=TRUE ORDER BY p.id_producto`,
      [req.cartId]
    );
    res.json(rows.map(item => ({
      ...item,
      price: Number(item.price),
      img: item.img || perfumeImages[Number(item.id) % perfumeImages.length]
    })));
  } catch (error) {
    console.error('Cart load failed:', error.code || error.message);
    sendError(res, 500, 'No fue posible cargar el carrito.');
  }
});

app.put('/api/cart', requireCart, async (req, res) => {
  const items = req.body?.items;
  if (!Array.isArray(items) || items.length > 50 ||
      items.some(item => !Number.isInteger(Number(item.id)) || !Number.isInteger(Number(item.qty)) ||
        Number(item.qty) < 1 || Number(item.qty) > 99) ||
      new Set(items.map(item => Number(item.id))).size !== items.length) {
    return sendError(res, 400, 'Carrito inválido.');
  }
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO carritos (id_carrito, id_usuario) VALUES ($1,$2)
       ON CONFLICT (id_carrito) DO UPDATE SET id_usuario=COALESCE(carritos.id_usuario,EXCLUDED.id_usuario)`,
      [req.cartId, getUser(req)?.id || null]
    );
    await client.query('DELETE FROM carrito_detalles WHERE id_carrito=$1', [req.cartId]);
    for (const item of items) {
      const result = await client.query(
        `INSERT INTO carrito_detalles (id_carrito,id_producto,cantidad)
         SELECT $1,p.id_producto,$3 FROM productos p
         WHERE p.id_producto=$2 AND p.activo=TRUE AND p.stock >= $3`,
        [req.cartId, Number(item.id), Number(item.qty)]
      );
      if (result.rowCount !== 1) throw new Error('CART_STOCK');
    }
    await client.query('UPDATE carritos SET actualizado_en=CURRENT_TIMESTAMP WHERE id_carrito=$1', [req.cartId]);
    await client.query('COMMIT');
    res.json(items);
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error.message === 'CART_STOCK') return sendError(res, 409, 'Un producto ya no tiene stock suficiente.');
    console.error('Cart update failed:', error.code || error.message);
    sendError(res, 500, 'No fue posible actualizar el carrito.');
  } finally {
    if (client) client.release();
  }
});

app.post('/api/orders', requireCustomer, requireCart, paymentLimiter, async (req, res) => {
  if (!wompiConfigured()) return sendError(res, 503, 'Los pagos Wompi no están configurados. Revisa sus variables de entorno.');
  const rawPhone = req.body?.phone;
  const phone = typeof rawPhone === 'string' ? rawPhone.trim() : '';
  const address = typeof req.body?.address === 'string' ? req.body.address.trim().replace(/\s+/g, ' ') : '';
  const city = typeof req.body?.city === 'string' ? req.body.city.trim().replace(/\s+/g, ' ') : '';
  if (typeof rawPhone !== 'string' || rawPhone.length > 30 || !isValidPhone(phone) || address.length < 8 || address.length > 255 ||
      /(\p{L})\1{3,}/iu.test(address) || !isValidCity(city)) {
    return sendError(res, 400, 'Ingresa un teléfono válido, una dirección completa y una ciudad válida.');
  }

  let redirectBase;
  try {
    redirectBase = new URL(process.env.WOMPI_REDIRECT_URL || `${appUrl}/checkout.html`);
  } catch {
    return sendError(res, 503, 'La URL de retorno de Wompi no es válida.');
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const userResult = await client.query(
      `SELECT u.id_usuario, u.nombre, u.apellido, u.correo
       FROM usuarios u WHERE u.id_usuario=$1 AND u.estado='Activo' FOR UPDATE`,
      [req.customer.id]
    );
    const user = userResult.rows[0];
    if (!user) throw new Error('CUSTOMER_NOT_FOUND');
    const cartOwner = await client.query(
      'SELECT id_usuario FROM carritos WHERE id_carrito=$1 FOR UPDATE',
      [req.cartId]
    );
    if (!cartOwner.rows[0] || Number(cartOwner.rows[0].id_usuario) !== Number(user.id_usuario)) {
      throw new Error('CART_NOT_OWNED');
    }

    const { rows: products } = await client.query(
      `SELECT p.id_producto AS id, p.nombre AS name, p.marca AS brand, p.precio AS price, p.stock,
        cd.cantidad AS qty
       FROM carrito_detalles cd JOIN productos p ON p.id_producto=cd.id_producto
       WHERE cd.id_carrito=$1 AND p.activo=TRUE ORDER BY p.id_producto FOR UPDATE OF p`,
      [req.cartId]
    );
    if (!products.length) throw new Error('EMPTY_CART');
    for (const item of products) {
      if (item.qty > item.stock) throw new Error('INSUFFICIENT_STOCK');
    }
    const subtotal = products.reduce((sum, item) => sum + Number(item.price) * item.qty, 0);
    const iva = Math.round(subtotal * taxRate);
    const total = subtotal + iva + shippingCost;
    const fullName = `${user.nombre} ${user.apellido}`.trim();
    const reference = `LESS-${crypto.randomUUID()}`;
    const { rows: orderRows } = await client.query(
      `INSERT INTO ordenes
        (id_usuario,nombre_completo,correo,telefono,direccion,ciudad,metodo_pago,estado,estado_pago,
         referencia_pago,stock_reservado,reserva_hasta,subtotal,iva,envio,total)
       VALUES ($1,$2,$3,$4,$5,$6,'wompi','Pendiente','Pendiente',$7,TRUE,
         CURRENT_TIMESTAMP + INTERVAL '24 hours',$8,$9,$10,$11)
       RETURNING id_orden AS id,total,referencia_pago AS reference,reserva_hasta AS "expiresAt"`,
      [user.id_usuario, fullName, user.correo, phone, address, city, reference, subtotal, iva, shippingCost, total]
    );
    const order = orderRows[0];
    for (const item of products) {
      await client.query(
        `INSERT INTO orden_detalles
          (id_orden,id_producto,nombre_producto,marca_producto,cantidad,precio_unitario,subtotal)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [order.id, item.id, item.name, item.brand, item.qty, item.price, Number(item.price) * item.qty]
      );
      await client.query('UPDATE productos SET stock=stock-$1 WHERE id_producto=$2', [item.qty, item.id]);
    }
    await client.query(
      'UPDATE usuarios SET telefono=$1 WHERE id_usuario=$2',
      [phone, user.id_usuario]
    );
    await client.query(
      `UPDATE clientes SET direccion=$1, ciudad=$2 WHERE id_usuario=$3`,
      [address, city, user.id_usuario]
    );
    await client.query('DELETE FROM carrito_detalles WHERE id_carrito=$1', [req.cartId]);
    await client.query('COMMIT');

    const amountInCents = Math.round(Number(order.total) * 100);
    const expirationTime = new Date(order.expiresAt).toISOString();
    const integrity = crypto.createHash('sha256')
      .update(`${order.reference}${amountInCents}COP${expirationTime}${wompiIntegritySecret}`)
      .digest('hex');
    const redirectUrl = new URL(redirectBase);
    redirectUrl.searchParams.set('order', String(order.id));
    res.status(201).json({
      order: { id: order.id, reference: order.reference, total: Number(order.total) },
      checkout: {
        url: 'https://checkout.wompi.co/p/',
        fields: {
          'public-key': wompiPublicKey,
          currency: 'COP',
          'amount-in-cents': String(amountInCents),
          reference: order.reference,
          'expiration-time': expirationTime,
          'signature:integrity': integrity,
          'redirect-url': redirectUrl.toString()
        }
      },
      message: 'Pedido creado. Continúa en Wompi para pagar.'
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error.message === 'CUSTOMER_NOT_FOUND') return sendError(res, 401, 'Inicia sesión de nuevo para continuar.');
    if (error.message === 'CART_NOT_OWNED') return sendError(res, 403, 'No se pudo validar la propiedad del carrito. Recarga la tienda e inténtalo de nuevo.');
    if (error.message === 'EMPTY_CART') return sendError(res, 400, 'Tu carrito está vacío.');
    if (error.message === 'INSUFFICIENT_STOCK') return sendError(res, 409, 'No hay stock suficiente para uno de tus productos.');
    console.error('Order creation failed:', error.code || error.message);
    sendError(res, 500, 'No fue posible iniciar el pago.');
  } finally {
    if (client) client.release();
  }
});

app.get('/api/orders/:id/status', requireCustomer, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return sendError(res, 400, 'Pedido inválido.');
  try {
    const { rows } = await pool.query(
      `SELECT id_orden AS id, estado AS status, estado_pago AS "paymentStatus", total
       FROM ordenes WHERE id_orden=$1 AND id_usuario=$2`,
      [id, req.customer.id]
    );
    if (!rows[0]) return sendError(res, 404, 'No encontramos este pedido.');
    res.json({ ...rows[0], total: Number(rows[0].total) });
  } catch (error) {
    console.error('Order status lookup failed:', error.code || error.message);
    sendError(res, 500, 'No fue posible consultar el estado del pedido.');
  }
});

app.get('/api/orders/:id/invoice', requireCustomer, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return sendError(res, 400, 'Pedido inválido.');
  try {
    const { rows } = await pool.query(
      `SELECT o.id_orden AS id, o.nombre_completo AS customer, o.correo AS email,
        o.telefono AS phone, o.direccion AS address, o.ciudad AS city,
        o.estado_pago AS "paymentStatus", o.subtotal, o.iva AS tax, o.envio AS shipping,
        o.total, o.fecha_creacion AS "createdAt",
        COALESCE((
          SELECT json_agg(json_build_object(
            'name', d.nombre_producto, 'brand', d.marca_producto,
            'quantity', d.cantidad, 'price', d.precio_unitario
          ) ORDER BY d.id_detalle)
          FROM orden_detalles d WHERE d.id_orden=o.id_orden
        ), '[]'::json) AS items
       FROM ordenes o
       WHERE o.id_orden=$1 AND o.id_usuario=$2 AND o.estado_pago='Pagado'`,
      [id, req.customer.id]
    );
    if (!rows[0]) return sendError(res, 404, 'No encontramos una factura disponible para este pedido.');
    const pdf = await invoicePdf(rows[0]);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Factura-LessPerfum-${id}.pdf"`,
      'Cache-Control': 'private, no-store',
      'Content-Length': pdf.length
    });
    res.send(pdf);
  } catch (error) {
    console.error('Invoice generation failed:', error.code || error.message);
    sendError(res, 500, 'No fue posible generar la factura.');
  }
});

app.post('/api/payments/wompi/events', async (req, res) => {
  if (!wompiEventsSecret) return sendError(res, 503, 'La validación de eventos Wompi no está configurada.');
  const event = req.body || {};
  const signature = event.signature || {};
  if (event.event !== 'transaction.updated' || !Array.isArray(signature.properties) || !signature.checksum ||
      !Number.isInteger(event.timestamp) || !event.data?.transaction) {
    return sendError(res, 400, 'Evento Wompi inválido.');
  }
  const expectedEnvironment = wompiEnvironment === 'production' ? 'prod' : 'test';
  if (event.environment !== expectedEnvironment) return sendError(res, 400, 'El ambiente del evento Wompi no coincide.');
  const values = signature.properties.map(property => getEventValue(event.data, property));
  if (values.some(value => value === undefined || value === null)) return sendError(res, 400, 'Firma de evento Wompi inválida.');
  const expectedChecksum = crypto.createHash('sha256')
    .update(`${values.join('')}${event.timestamp}${wompiEventsSecret}`)
    .digest('hex');
  const supplied = Buffer.from(String(signature.checksum).toLowerCase());
  const expected = Buffer.from(expectedChecksum);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    return sendError(res, 401, 'No se pudo validar la firma del evento Wompi.');
  }
  try {
    await updateWompiOrder(event.data.transaction);
    res.sendStatus(200);
  } catch (error) {
    if (error.message === 'ORDER_NOT_FOUND') return sendError(res, 404, 'Pedido Wompi no encontrado.');
    if (error.message === 'PAYMENT_AMOUNT_MISMATCH' || error.message === 'INVALID_WOMPI_TRANSACTION') {
      console.error('Wompi transaction validation failed:', error.message);
      return sendError(res, 400, 'Los datos del pago no coinciden con el pedido.');
    }
    console.error('Wompi event processing failed:', error.code || error.message);
    sendError(res, 500, 'No fue posible conciliar el evento Wompi.');
  }
});

app.use(express.static(publicRoot));
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError) return sendError(res, 400, 'JSON inválido.');
  console.error('Unhandled request error:', error.code || error.message);
  if (res.headersSent) return next(error);
  sendError(res, 500, 'Error interno del servidor.');
});

async function start() {
  const missing = [];
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
  if (!jwtSecret || jwtSecret.length < 32) missing.push('JWT_SECRET (mínimo 32 caracteres)');
  if (!adminEmail) missing.push('ADMIN_EMAIL');
  if (!adminPassword) missing.push('ADMIN_PASSWORD');
  if (missing.length) throw new Error(`Falta configurar: ${missing.join(', ')}.`);
  await pool.query('SELECT 1');
  await provisionSupplierAccount();
  app.listen(port, () => {
    console.log(`Less Perfum disponible en ${appUrl}`);
    const timer = setInterval(expireOrderReservations, 60 * 1000);
    timer.unref();
  });
}

start().catch(error => {
  console.error('No fue posible iniciar Less Perfum:', error.message);
  process.exitCode = 1;
});
