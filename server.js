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
  if (!user || user.role === 'admin' || !Number.isInteger(Number(user.id))) {
    return sendError(res, 401, 'Inicia sesión o regístrate para continuar con tu compra.');
  }
  try {
    const result = await pool.query("SELECT 1 FROM usuarios WHERE id_usuario=$1 AND estado='Activo'", [user.id]);
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
  return { id: Number(user.id_usuario), name: `${user.nombre} ${user.apellido}`.trim(), email: user.correo };
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

app.post('/api/auth/register', codeLimiter, async (req, res) => {
  const body = req.body || {};
  const firstName = clean(body.firstName, 80);
  const lastName = clean(body.lastName, 80);
  const email = clean(body.email, 160).toLowerCase();
  const phone = clean(body.phone, 30);
  const password = String(body.password || '');
  if (!firstName || !lastName || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
    return sendError(res, 400, 'Revisa nombre, apellido, correo y contraseña (mínimo 8 caracteres).');
  }
  try {
    ensureMailConfigured();
    const passwordHash = await bcrypt.hash(password, 12);
    const code = String(crypto.randomInt(100000, 1000000));
    const client = await pool.connect();
    let user;
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO usuarios (nombre, apellido, correo, telefono, contrasena, estado, newsletter)
         VALUES ($1,$2,$3,$4,$5,'Inactivo',$6)
         RETURNING id_usuario, nombre, apellido, correo`,
        [firstName, lastName, email, phone || null, passwordHash, Boolean(body.newsletter)]
      );
      user = rows[0];
      await client.query('INSERT INTO clientes (id_usuario) VALUES ($1)', [user.id_usuario]);
      await client.query(
        `INSERT INTO codigos_verificacion (id_usuario, codigo_hash, expira_en, intentos)
         VALUES ($1,$2,CURRENT_TIMESTAMP + INTERVAL '15 minutes',0)`,
        [user.id_usuario, verificationHash(code)]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    try {
      await sendEmail(email, 'Verifica tu cuenta Less Perfum', `Tu código de verificación es ${code}. Vence en 15 minutos.`);
    } catch (error) {
      console.error('Verification email delivery failed:', error.code || error.message);
      return sendError(res, 502, 'La cuenta quedó pendiente, pero no se pudo enviar el código. Usa “Reenviar código”.');
    }
    res.status(201).json({ verificationRequired: true, email, message: 'Te enviamos un código de verificación.' });
  } catch (error) {
    if (error.code === 'EMAIL_NOT_CONFIGURED') return mailError(res, error);
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
      `SELECT id_usuario, nombre, apellido, correo, contrasena, estado
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
    if (account.estado !== 'Activo') {
      return sendError(res, 403, 'Verifica tu correo antes de iniciar sesión.');
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
    res.json({ user: { name: `${account.nombre} ${account.apellido}`, email: account.correo } });
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
        `SELECT id_usuario, nombre, apellido, correo, estado
         FROM usuarios WHERE google_sub=$1 OR correo=$2 ORDER BY (google_sub=$1) DESC LIMIT 1 FOR UPDATE`,
        [profile.sub, email]
      );
      account = lookup.rows[0];
      if (account) {
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
  const firstName = clean(profile.givenName || req.body?.firstName, 80);
  const lastName = clean(profile.familyName || req.body?.lastName, 80);
  const phone = clean(req.body?.phone, 30);
  if (!firstName || !lastName || !profile.sub || !profile.email) {
    return sendError(res, 400, 'Completa tu nombre y apellido para crear la cuenta.');
  }
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO usuarios (nombre, apellido, correo, telefono, google_sub, estado, newsletter)
       VALUES ($1,$2,$3,$4,$5,'Activo',$6)
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
    res.status(201).json({ user: { name: `${user.nombre} ${user.apellido}`, email: user.correo }, message: 'Cuenta creada e inicio de sesión exitoso.' });
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
  if (user.role !== 'admin') {
    try {
      const { rows } = await pool.query("SELECT 1 FROM usuarios WHERE id_usuario=$1 AND estado='Activo'", [user.id]);
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
    const [productResult, orderResult, customerResult, salesResult] = await Promise.all([
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
      pool.query("SELECT COALESCE(SUM(total),0) AS total FROM ordenes WHERE estado_pago='Pagado'")
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
      customers: customerResult.rows
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
  const phone = clean(req.body?.phone, 30);
  const address = clean(req.body?.address, 255);
  const city = clean(req.body?.city, 80);
  if (!phone || !address || address.length < 8 || !city) return sendError(res, 400, 'Completa teléfono, dirección y ciudad.');

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
