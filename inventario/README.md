# Less Perfum

Backend Express y PostgreSQL para la tienda frontend existente. Los archivos CSS no se modifican.

## Puesta en marcha

1. Instala PostgreSQL y crea la base de datos ejecutando `database/data.sql` con `psql`.
2. Copia `.env.example` como `.env` y ajusta `DATABASE_URL` y `JWT_SECRET`.
3. Instala dependencias:

```bash
npm install
```

4. Inicia la aplicación:

```bash
npm start
```

Abre `http://localhost:3000/index.html`. La API queda disponible bajo `/api`.

## Endpoints

- `GET /api/health`
- `GET /api/products?category=mujer&search=dior`
- `GET /api/perfume-images?count=8`
- `GET /api/cart` y `PUT /api/cart`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/orders`

El servidor calcula precios, IVA, envío y stock desde PostgreSQL. Nunca almacena los datos de tarjeta; el checkout solo envía el método de pago seleccionado.
