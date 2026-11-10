# Less Perfum

Tienda Less Perfum con servidor Express. Funciona en modo demostración sin PostgreSQL ni credenciales; los datos demo viven en memoria y se reinician al apagar el servidor. PostgreSQL es opcional para guardar datos de forma permanente.

## Puesta en marcha

1. Instala dependencias:

```bash
npm install
```

1. Inicia la aplicación:

```bash
npm start
```

Abre `http://localhost:3000/index.html`. La API queda disponible bajo `/api`.

## Panel de administración demo

Usa el mismo formulario de `formularios/login.html` para clientes y administradores. En modo demo, ingresa `admin@email.com` / `admin123` y el sistema abrirá el panel automáticamente en `admin.html`. Si visitas el panel sin sesión, vuelve al mismo login. Cambia `ADMIN_EMAIL` y `ADMIN_PASSWORD` antes de publicar el sitio.

La configuración inicial usa `DEMO_MODE=true`; no hace falta crear `.env` si se usan los valores predeterminados. Para persistencia opcional, crea la base con `database/data.sql`, configura `DATABASE_URL` y usa `DEMO_MODE=false`.

## Endpoints

- `GET /api/health`
- `GET /api/products?category=mujer&search=dior`
- `GET /api/perfume-images?count=8`
- `GET /api/cart` y `PUT /api/cart`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/orders`

El servidor calcula precios, IVA, envío y stock tanto en modo demo como con PostgreSQL. Nunca almacena los datos de tarjeta; el checkout solo envía el método de pago seleccionado.
