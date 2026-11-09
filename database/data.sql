-- Ejecutar una sola vez conectado a la base less_perfum.

CREATE TABLE IF NOT EXISTS usuarios (
  id_usuario SERIAL PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL,
  apellido VARCHAR(80) NOT NULL,
  correo VARCHAR(160) NOT NULL UNIQUE,
  telefono VARCHAR(30),
  contrasena VARCHAR(255),
  google_sub VARCHAR(255) UNIQUE,
  estado VARCHAR(12) NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Inactivo')),
  newsletter BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS newsletter BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE usuarios ALTER COLUMN contrasena DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_google_sub_unique ON usuarios (google_sub) WHERE google_sub IS NOT NULL;

CREATE TABLE IF NOT EXISTS clientes (
  id_cliente SERIAL PRIMARY KEY,
  id_usuario INTEGER NOT NULL UNIQUE REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  direccion VARCHAR(255),
  ciudad VARCHAR(80),
  fecha_nacimiento DATE,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO clientes (id_usuario)
SELECT id_usuario FROM usuarios
ON CONFLICT (id_usuario) DO NOTHING;

CREATE TABLE IF NOT EXISTS categorias (
  id_categoria SERIAL PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,
  descripcion VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS productos (
  id_producto SERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  marca VARCHAR(120) NOT NULL,
  descripcion TEXT,
  precio NUMERIC(12, 2) NOT NULL CHECK (precio >= 0),
  precio_anterior NUMERIC(12, 2) CHECK (precio_anterior IS NULL OR precio_anterior >= precio),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  imagen TEXT,
  insignia VARCHAR(40),
  tipo_insignia VARCHAR(20),
  genero VARCHAR(30),
  id_categoria INTEGER NOT NULL REFERENCES categorias(id_categoria),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS carritos (
  id_carrito UUID PRIMARY KEY,
  id_usuario INTEGER REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS carrito_detalles (
  id_carrito UUID NOT NULL REFERENCES carritos(id_carrito) ON DELETE CASCADE,
  id_producto INTEGER NOT NULL REFERENCES productos(id_producto),
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  PRIMARY KEY (id_carrito, id_producto)
);

CREATE TABLE IF NOT EXISTS ordenes (
  id_orden SERIAL PRIMARY KEY,
  id_usuario INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
  nombre_completo VARCHAR(160) NOT NULL,
  correo VARCHAR(160) NOT NULL,
  telefono VARCHAR(30) NOT NULL,
  direccion VARCHAR(255) NOT NULL,
  ciudad VARCHAR(80) NOT NULL,
  metodo_pago VARCHAR(20) NOT NULL DEFAULT 'wompi',
  estado VARCHAR(20) NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'Aprobada', 'Cancelada', 'Entregada')),
  estado_pago VARCHAR(20) NOT NULL DEFAULT 'Pendiente',
  referencia_pago VARCHAR(100) UNIQUE,
  transaccion_wompi VARCHAR(100) UNIQUE,
  stock_reservado BOOLEAN NOT NULL DEFAULT FALSE,
  reserva_hasta TIMESTAMPTZ,
  subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
  iva NUMERIC(12, 2) NOT NULL CHECK (iva >= 0),
  envio NUMERIC(12, 2) NOT NULL CHECK (envio >= 0),
  total NUMERIC(12, 2) NOT NULL CHECK (total >= 0),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS estado_pago VARCHAR(20) NOT NULL DEFAULT 'Pendiente';
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS referencia_pago VARCHAR(100);
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS transaccion_wompi VARCHAR(100);
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS stock_reservado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS reserva_hasta TIMESTAMPTZ;
ALTER TABLE ordenes DROP CONSTRAINT IF EXISTS ordenes_metodo_pago_check;
ALTER TABLE ordenes ADD CONSTRAINT ordenes_metodo_pago_check CHECK (metodo_pago IN ('wompi', 'tarjeta', 'pse', 'contraentrega'));
ALTER TABLE ordenes DROP CONSTRAINT IF EXISTS ordenes_estado_pago_check;
ALTER TABLE ordenes ADD CONSTRAINT ordenes_estado_pago_check CHECK (estado_pago IN ('Pendiente', 'Pagado', 'Rechazado', 'Expirado'));
CREATE UNIQUE INDEX IF NOT EXISTS ordenes_referencia_pago_unique ON ordenes (referencia_pago) WHERE referencia_pago IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ordenes_transaccion_wompi_unique ON ordenes (transaccion_wompi) WHERE transaccion_wompi IS NOT NULL;

CREATE TABLE IF NOT EXISTS orden_detalles (
  id_detalle SERIAL PRIMARY KEY,
  id_orden INTEGER NOT NULL REFERENCES ordenes(id_orden) ON DELETE CASCADE,
  id_producto INTEGER NOT NULL REFERENCES productos(id_producto),
  nombre_producto VARCHAR(120) NOT NULL,
  marca_producto VARCHAR(120) NOT NULL,
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(12, 2) NOT NULL CHECK (precio_unitario >= 0),
  subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0)
);

CREATE TABLE IF NOT EXISTS codigos_verificacion (
  id_usuario INTEGER PRIMARY KEY REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  codigo_hash CHAR(64) NOT NULL,
  expira_en TIMESTAMPTZ NOT NULL,
  intentos INTEGER NOT NULL DEFAULT 0,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ordenes_fecha_creacion_idx ON ordenes (fecha_creacion DESC);
CREATE INDEX IF NOT EXISTS ordenes_reserva_idx ON ordenes (reserva_hasta) WHERE stock_reservado = TRUE;
CREATE INDEX IF NOT EXISTS productos_categoria_activo_idx ON productos (id_categoria, activo);

INSERT INTO categorias (nombre, descripcion) VALUES
  ('mujer', 'Fragancias femeninas'),
  ('hombre', 'Fragancias masculinas'),
  ('nicho', 'Perfumería de autor'),
  ('arabe', 'Fragancias árabes'),
  ('oferta', 'Fragancias en oferta')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO productos (id_producto, nombre, marca, precio, precio_anterior, stock, imagen, insignia, tipo_insignia, genero, id_categoria)
SELECT v.id, v.nombre, v.marca, v.precio, v.anterior, v.stock, '', v.insignia, v.tipo, v.genero, c.id_categoria
FROM (VALUES
  (1, 'Essence de Amor', 'Dior', 289900, 414900, 20, '-30%', 'sale', 'Mujer', 'mujer'),
  (2, 'Royal Oud', 'Maison Oud', 425000, NULL, 20, 'Árabe', '', 'Unisex', 'arabe'),
  (3, 'Floral Garden', 'Carolina Herrera', 329000, NULL, 20, 'Nuevo', '', 'Mujer', 'mujer'),
  (4, 'Midnight Noir', 'Montblanc', 375000, 500000, 20, '-25%', 'sale', 'Hombre', 'hombre'),
  (5, 'Citrus Dreams', 'Calvin Klein', 259000, 305000, 20, '-15%', 'sale', 'Unisex', 'oferta'),
  (6, 'Vintage Elegance', 'Gucci', 345000, NULL, 20, 'Hot', '', 'Mujer', 'mujer'),
  (7, 'Luxe Noir', 'Niche House', 465000, NULL, 20, 'Nicho', '', 'Unisex', 'nicho'),
  (8, 'Ocean Breeze', 'Rabanne', 315000, 420000, 20, '-25%', 'sale', 'Hombre', 'oferta')
) AS v(id, nombre, marca, precio, anterior, stock, insignia, tipo, genero, categoria)
JOIN categorias c ON c.nombre = v.categoria
WHERE NOT EXISTS (SELECT 1 FROM productos p WHERE p.id_producto = v.id);

SELECT setval('productos_id_producto_seq', GREATEST((SELECT COALESCE(MAX(id_producto), 1) FROM productos), 1));
