CREATE DATABASE less_perfum;

-- Ejecuta el resto conectado a la base less_perfum.

CREATE TABLE IF NOT EXISTS usuarios (
  id_usuario SERIAL PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL,
  apellido VARCHAR(80) NOT NULL,
  correo VARCHAR(160) NOT NULL UNIQUE,
  telefono VARCHAR(30),
  contrasena VARCHAR(255) NOT NULL,
  estado VARCHAR(12) NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Inactivo')),
  newsletter BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
  metodo_pago VARCHAR(20) NOT NULL CHECK (metodo_pago IN ('tarjeta', 'pse', 'contraentrega')),
  estado VARCHAR(20) NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'Aprobada', 'Cancelada', 'Entregada')),
  subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
  iva NUMERIC(12, 2) NOT NULL CHECK (iva >= 0),
  envio NUMERIC(12, 2) NOT NULL CHECK (envio >= 0),
  total NUMERIC(12, 2) NOT NULL CHECK (total >= 0),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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

INSERT INTO categorias (nombre, descripcion) VALUES
  ('mujer', 'Fragancias femeninas'), ('hombre', 'Fragancias masculinas'),
  ('nicho', 'Perfumería de autor'), ('arabe', 'Fragancias árabes'), ('oferta', 'Fragancias en oferta')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO productos (id_producto, nombre, marca, precio, precio_anterior, stock, imagen, insignia, tipo_insignia, genero, id_categoria)
SELECT v.id, v.nombre, v.marca, v.precio, v.anterior, v.stock, v.imagen, v.insignia, v.tipo, v.genero, c.id_categoria
FROM (VALUES
  (1, 'Essence de Amor', 'Dior', 289900, 414900, 20, '', '-30%', 'sale', 'Mujer', 'mujer'),
  (2, 'Royal Oud', 'Maison Oud', 425000, NULL, 20, '', 'Árabe', '', 'Unisex', 'arabe'),
  (3, 'Floral Garden', 'Carolina Herrera', 329000, NULL, 20, '', 'Nuevo', '', 'Mujer', 'mujer'),
  (4, 'Midnight Noir', 'Montblanc', 375000, 500000, 20, '', '-25%', 'sale', 'Hombre', 'hombre'),
  (5, 'Citrus Dreams', 'Calvin Klein', 259000, 305000, 20, '', '-15%', 'sale', 'Unisex', 'oferta'),
  (6, 'Vintage Elegance', 'Gucci', 345000, NULL, 20, '', 'Hot', '', 'Mujer', 'mujer'),
  (7, 'Luxe Noir', 'Niche House', 465000, NULL, 20, '', 'Nicho', '', 'Unisex', 'nicho'),
  (8, 'Ocean Breeze', 'Rabanne', 315000, 420000, 20, '', '-25%', 'sale', 'Hombre', 'oferta')
) AS v(id, nombre, marca, precio, anterior, stock, imagen, insignia, tipo, genero, categoria)
JOIN categorias c ON c.nombre = v.categoria
WHERE NOT EXISTS (SELECT 1 FROM productos p WHERE p.id_producto = v.id);

SELECT setval('productos_id_producto_seq', GREATEST((SELECT COALESCE(MAX(id_producto), 1) FROM productos), 1));
/*
USE less_perfum;

-- =====================
-- TABLA ROLES
-- =====================

CREATE TABLE roles(
id_rol INT AUTO_INCREMENT PRIMARY KEY,
nombre_rol VARCHAR(50) NOT NULL,
descripcion VARCHAR(255)
);

-- =====================
-- TABLA PERMISOS
-- =====================

CREATE TABLE permisos(
id_permiso INT AUTO_INCREMENT PRIMARY KEY,
nombre_permiso VARCHAR(100) NOT NULL,
descripcion VARCHAR(255)
);

-- =====================
-- TABLA ROL_PERMISO
-- =====================

CREATE TABLE rol_permiso(
id_rol INT,
id_permiso INT,
PRIMARY KEY(id_rol,id_permiso),

FOREIGN KEY(id_rol)
REFERENCES roles(id_rol),

FOREIGN KEY(id_permiso)
REFERENCES permisos(id_permiso)
);

-- =====================
-- TABLA USUARIOS
-- =====================

CREATE TABLE usuarios(
id_usuario INT AUTO_INCREMENT PRIMARY KEY,
nombre VARCHAR(50) NOT NULL,
apellido VARCHAR(50) NOT NULL,
correo VARCHAR(100) UNIQUE,
telefono VARCHAR(20),
contrasena VARCHAR(255),
estado ENUM('Activo','Inactivo'),
fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
id_rol INT,

FOREIGN KEY(id_rol)
REFERENCES roles(id_rol)
);

-- =====================
-- TABLA CLIENTES
-- =====================

CREATE TABLE clientes(
id_cliente INT AUTO_INCREMENT PRIMARY KEY,
id_usuario INT UNIQUE,
direccion VARCHAR(150),
ciudad VARCHAR(50),
fecha_nacimiento DATE,

FOREIGN KEY(id_usuario)
REFERENCES usuarios(id_usuario)
);

-- =====================
-- TABLA PROVEEDORES
-- =====================

CREATE TABLE proveedores(
id_proveedor INT AUTO_INCREMENT PRIMARY KEY,
nombre_empresa VARCHAR(100),
nombre_contacto VARCHAR(100),
telefono VARCHAR(20),
correo VARCHAR(100),
direccion VARCHAR(150),
ciudad VARCHAR(50),
estado ENUM('Activo','Inactivo')
);

-- =====================
-- TABLA CATEGORIAS
-- =====================

CREATE TABLE categorias(
id_categoria INT AUTO_INCREMENT PRIMARY KEY,
nombre VARCHAR(50),
descripcion VARCHAR(255)
);

-- =====================
-- TABLA MARCAS
-- =====================

CREATE TABLE marcas(
id_marca INT AUTO_INCREMENT PRIMARY KEY,
nombre VARCHAR(50),
descripcion VARCHAR(255)
);

-- =====================
-- TABLA PRODUCTOS
-- =====================

CREATE TABLE productos(
id_producto INT AUTO_INCREMENT PRIMARY KEY,
nombre VARCHAR(100),
descripcion TEXT,
precio DECIMAL(10,2),
stock INT,
imagen VARCHAR(255),
estado ENUM('Disponible','Agotado'),
fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,

id_categoria INT,
id_marca INT,
id_proveedor INT,

FOREIGN KEY(id_categoria)
REFERENCES categorias(id_categoria),

FOREIGN KEY(id_marca)
REFERENCES marcas(id_marca),

FOREIGN KEY(id_proveedor)
REFERENCES proveedores(id_proveedor)
);

-- =====================
-- TABLA INVENTARIO
-- =====================

CREATE TABLE inventario(
id_inventario INT AUTO_INCREMENT PRIMARY KEY,
id_producto INT UNIQUE,
cantidad_actual INT,
stock_minimo INT,
ultima_actualizacion DATETIME,

FOREIGN KEY(id_producto)
REFERENCES productos(id_producto)
);

-- =====================
-- MOVIMIENTOS INVENTARIO
-- =====================

CREATE TABLE movimientos_inventario(
id_movimiento INT AUTO_INCREMENT PRIMARY KEY,
id_producto INT,

tipo_movimiento ENUM(
'Entrada',
'Salida'
),

cantidad INT,
fecha_movimiento DATETIME DEFAULT CURRENT_TIMESTAMP,
descripcion TEXT,

FOREIGN KEY(id_producto)
REFERENCES productos(id_producto)
);

-- =====================
-- PEDIDOS
-- =====================

CREATE TABLE pedidos(
id_pedido INT AUTO_INCREMENT PRIMARY KEY,
id_cliente INT,

fecha_pedido DATETIME DEFAULT CURRENT_TIMESTAMP,

estado ENUM(
'Pendiente',
'Aprobado',
'Cancelado',
'Entregado'
),

total DECIMAL(10,2),

FOREIGN KEY(id_cliente)
REFERENCES clientes(id_cliente)
);

-- =====================
-- DETALLE PEDIDO
-- =====================

CREATE TABLE detalle_pedido(
id_detalle INT AUTO_INCREMENT PRIMARY KEY,

id_pedido INT,
id_producto INT,

cantidad INT,
precio_unitario DECIMAL(10,2),
subtotal DECIMAL(10,2),

FOREIGN KEY(id_pedido)
REFERENCES pedidos(id_pedido),

FOREIGN KEY(id_producto)
REFERENCES productos(id_producto)
);

-- =====================
-- FACTURAS
-- =====================

CREATE TABLE facturas(
id_factura INT AUTO_INCREMENT PRIMARY KEY,
id_pedido INT UNIQUE,

fecha DATETIME DEFAULT CURRENT_TIMESTAMP,

subtotal DECIMAL(10,2),
iva DECIMAL(10,2),
total DECIMAL(10,2),

FOREIGN KEY(id_pedido)
REFERENCES pedidos(id_pedido)
);

-- =====================
-- METODOS DE PAGO
-- =====================

CREATE TABLE metodos_pago(
id_metodo INT AUTO_INCREMENT PRIMARY KEY,
nombre VARCHAR(50),
descripcion VARCHAR(255)
);

-- =====================
-- PAGOS
-- =====================

CREATE TABLE pagos(
id_pago INT AUTO_INCREMENT PRIMARY KEY,

id_pedido INT,
id_metodo INT,

monto DECIMAL(10,2),

fecha_pago DATETIME
DEFAULT CURRENT_TIMESTAMP,

estado ENUM(
'Pendiente',
'Pagado',
'Rechazado'
),

FOREIGN KEY(id_pedido)
REFERENCES pedidos(id_pedido),

FOREIGN KEY(id_metodo)
REFERENCES metodos_pago(id_metodo)
);

-- =====================
-- COMPRAS PROVEEDOR
-- =====================

CREATE TABLE compras_proveedor(
id_compra INT AUTO_INCREMENT PRIMARY KEY,

id_proveedor INT,

fecha_compra DATETIME
DEFAULT CURRENT_TIMESTAMP,

total DECIMAL(10,2),

estado ENUM(
'Pendiente',
'Recibido'
),

FOREIGN KEY(id_proveedor)
REFERENCES proveedores(id_proveedor)
);

-- =====================
-- DETALLE COMPRA
-- =====================

CREATE TABLE detalle_compra(
id_detalle_compra INT AUTO_INCREMENT PRIMARY KEY,

id_compra INT,
id_producto INT,

cantidad INT,
precio_compra DECIMAL(10,2),
subtotal DECIMAL(10,2),

FOREIGN KEY(id_compra)
REFERENCES compras_proveedor(id_compra),

FOREIGN KEY(id_producto)
REFERENCES productos(id_producto)
);

-- =====================
-- HISTORIAL DE SESIONES
-- =====================

CREATE TABLE historial_sesiones(
id_historial INT AUTO_INCREMENT PRIMARY KEY,

id_usuario INT,

fecha_ingreso DATETIME,
fecha_salida DATETIME,

ip VARCHAR(50),

FOREIGN KEY(id_usuario)
REFERENCES usuarios(id_usuario)
);
*/
