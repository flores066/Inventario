CREATE DATABASE less_perfum;
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
