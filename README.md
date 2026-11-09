# Less Perfum

Tienda de fragancias con Express y una única base PostgreSQL persistente. El catálogo, los clientes, los carritos, los pedidos, las reservas de inventario y los pagos se leen y escriben en la misma base; la aplicación no usa usuarios ni pedidos temporales en memoria.

## Requisitos

- Node.js 20 o posterior.
- PostgreSQL 14 o posterior.
- Credenciales de Google y Wompi para habilitar inicio de sesión social, correo de verificación y cobros reales.

## Instalación local

Desde esta carpeta:

```powershell
npm install
Copy-Item .env.example .env
```

Crea la base de datos y ejecuta el único esquema:

```powershell
createdb -U postgres less_perfum
psql -U postgres -d less_perfum -f database/data.sql
```

Configura en `.env` la conexión de PostgreSQL, una clave `JWT_SECRET` aleatoria, `ADMIN_EMAIL` y `ADMIN_PASSWORD`. Inicia el servidor:

```powershell
npm start
```

Abre `http://localhost:3000`. No se debe abrir el HTML directamente desde el disco: las páginas usan la API del servidor.

## Google: inicio de sesión y Gmail API

1. En Google Cloud crea un proyecto y habilita **Gmail API**. Configura la pantalla de consentimiento OAuth, agrega tu cuenta remitente como usuario de prueba si la aplicación está en modo pruebas y configura los orígenes/dominios autorizados.
2. Crea un OAuth Client ID para aplicación web. Agrega `http://localhost:3000` como origen autorizado y copia el Client ID y Client Secret a `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.
3. En OAuth 2.0 Playground (con “Use your own OAuth credentials” activado), usa ese Client ID/Secret, autoriza el alcance exacto `https://www.googleapis.com/auth/gmail.send` con la cuenta que enviará los mensajes y canjea el código por tokens. Copia el **refresh token** a `GMAIL_REFRESH_TOKEN`; establece `GMAIL_SENDER` con esa misma dirección. No uses ni compartas el access token temporal.
4. Guarda `.env`, reinicia el servidor y revisa `http://localhost:3000/api/health`: `email` debe ser `true`. Luego prueba un registro con una dirección a la que tengas acceso y revisa bandeja de entrada y spam.
5. No publiques ni compartas `.env`. Sin configuración de Gmail, el registro por contraseña devuelve un error explícito y no aparenta haber enviado el código. Los inicios de sesión Google requieren que el correo ya pertenezca a un cliente; los demás pasan al formulario de registro.

El endpoint `/api/health` informa `email: false` mientras falte cualquiera de esas cuatro variables. En aplicaciones externas que permanezcan en estado “Testing”, Google puede hacer caducar los refresh tokens de permisos sensibles tras siete días; publica/verifica la configuración de consentimiento según los requisitos de Google o vuelve a autorizar la cuenta cuando caduque. Si `email` ya es `true` pero el envío falla, revisa la consola del servidor y confirma que Gmail API esté habilitada, que el refresh token corresponda al mismo cliente OAuth y que la cuenta permita el alcance `gmail.send`.

Si la consola muestra `invalid_grant`, el refresh token fue revocado, venció o no corresponde al Client ID/Client Secret configurados. Genera uno nuevo con OAuth Playground usando el mismo cliente OAuth y la misma cuenta remitente, con `https://www.googleapis.com/auth/gmail.send`, guarda el nuevo valor en `GMAIL_REFRESH_TOKEN` y reinicia el servidor. No copies el access token temporal en esa variable.

Los códigos se guardan como hash, vencen a los 15 minutos y tienen intentos limitados. El registro Google usa el correo verificado por Google y crea a la vez el usuario y el registro de cliente.

## Wompi Colombia

1. Crea un comercio en [Wompi](https://comercios.wompi.co) y obtén las llaves de **sandbox**.
2. Configura `WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET` y `WOMPI_ENV=sandbox`.
3. Configura en el comercio la URL de eventos `https://tu-dominio/api/payments/wompi/events` para el ambiente correspondiente. El endpoint verifica el checksum y concilia los pagos; no se confía en la redirección del navegador.
4. El checkout alojado de Wompi permite ofrecer los métodos habilitados para el comercio, como tarjeta, PSE, Nequi, Daviplata y Bancolombia, en COP. Verifica qué medios habilitó Wompi para tu cuenta.
5. Prueba aprobación, rechazo y expiración en sandbox. Para producción, cambia `WOMPI_ENV=production`, usa llaves y secreto de eventos de producción, configura HTTPS y establece `WOMPI_REDIRECT_URL` con la URL pública del sitio.

Las órdenes descuentan/reservan stock al iniciar el checkout. Si el pago se rechaza o vence, el webhook o la expiración de la reserva devuelve las unidades al inventario. Nunca se solicitan ni se guardan datos de tarjeta en la tienda.

## Administración

Inicia sesión con `ADMIN_EMAIL` y `ADMIN_PASSWORD` para abrir `admin.html`. El panel permite revisar ventas, productos, clientes y pedidos, editar catálogo/stock y actualizar estados. Los cambios se guardan en PostgreSQL y el catálogo público se refresca automáticamente.

## API principal

- `GET /api/health`, `GET /api/products`, `GET /api/perfume-images`
- `POST /api/auth/register`, `POST /api/auth/verify-email`, `POST /api/auth/login`, `POST /api/auth/google`, `GET /api/auth/session`
- `GET /api/cart`, `PUT /api/cart`
- `POST /api/orders` (requiere sesión de cliente y crea el checkout Wompi)
- `POST /api/payments/wompi/events` (webhook firmado)
- `/api/admin/*` (requiere sesión de administrador)

Consulta [API_INTEGRATIONS.md](./API_INTEGRATIONS.md) para el inventario completo de endpoints, integraciones externas, variables de entorno, credenciales de administrador y recorrido/destino del pago.
