# Less Perfum

Tienda de fragancias con Express y una única base PostgreSQL persistente. El catálogo, los clientes, los carritos, los pedidos, las reservas de inventario y los pagos se leen y escriben en la misma base; la aplicación no usa usuarios ni pedidos temporales en memoria.

## Requisitos

- Node.js 20 o posterior.
- PostgreSQL 14 o posterior.
- Credenciales de Cloudflare Turnstile para proteger registros en producción; credenciales de Google y Wompi para habilitar inicio social y cobros reales.

## Estructura del proyecto

- `frontend/`: páginas HTML, formularios, hojas de estilo compartidas en `frontend/css/`, scripts en `frontend/js/` y recursos estáticos en `frontend/assets/`.
- `backend/`: servidor Express en `backend/server.js` y esquema PostgreSQL en `backend/database/data.sql`.
- `.env`: configuración local en la raíz; no se publica ni se guarda en Git.
- `package.json`: dependencias y comandos para ejecutar el backend desde la raíz.

## Instalación local

Desde esta carpeta:

```powershell
npm install
Copy-Item .env.example .env
```

Crea la base de datos y ejecuta el único esquema:

```powershell
createdb -U postgres less_perfums
psql -U postgres -d less_perfums -f backend/database/data.sql
```

Configura en `.env` la conexión de PostgreSQL, una clave `JWT_SECRET` aleatoria, `ADMIN_EMAIL` y `ADMIN_PASSWORD`. El servidor crea la cuenta interna del proveedor usando `SUPPLIER_EMAIL` y `SUPPLIER_PASSWORD`; la contraseña debe tener al menos 8 caracteres. En desarrollo, si se omiten las variables Turnstile, el registro usa las llaves de prueba oficiales. En producción, configura `TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY` de tu sitio antes de iniciar.

```powershell
npm start
```

Abre `http://localhost:3000`. Express sirve el frontend desde `frontend/` y las rutas `/api/*` desde el backend. No se debe abrir el HTML directamente desde el disco: las páginas usan la API del servidor.

## CAPTCHA para registro

El registro de clientes no envía ni requiere un código por correo. La página solicita un desafío Cloudflare Turnstile y el servidor valida su token con Siteverify antes de crear la cuenta. Las llaves de prueba integradas solo sirven para desarrollo local y no son protección contra bots.

1. Crea un sitio en Cloudflare Turnstile e incluye tu dominio público; para probar localmente incluye `localhost` si vas a usar llaves reales.
2. Copia la site key a `TURNSTILE_SITE_KEY` y la secret key a `TURNSTILE_SECRET_KEY`. Solo la site key se muestra en el navegador; nunca expongas el secreto.
3. Reinicia y prueba el registro. `GET /api/auth/captcha/config` muestra la site key y el modo; los endpoints de registro verifican cada token desde el servidor y rechazan tokens faltantes, inválidos o vencidos.
4. No publiques ni compartas `.env`. En producción la aplicación no usa llaves de prueba: si faltan las llaves reales, el CAPTCHA falla de forma cerrada.

## Google Identity Services (opcional)

El inicio de sesión con Google sigue usando Google Identity Services y requiere `GOOGLE_CLIENT_ID`. Si el correo verificado no tiene cuenta, la persona termina su registro con el formulario y el CAPTCHA. Gmail API ya no es requisito para crear o activar cuentas. Las variables de Gmail pueden omitirse.

## Portal del proveedor

Al arrancar, el servidor crea o actualiza el proveedor configurado mediante `SUPPLIER_EMAIL`, `SUPPLIER_PASSWORD` y `SUPPLIER_NAME`. Inicia sesión en `formularios/login.html`; el sistema redirige el rol proveedor a `supplier.html`. El portal lista productos y existencias, registra recepciones de mercancía y guarda cada movimiento con referencia, notas, fecha, proveedor y producto. El aumento de inventario se ejecuta en una transacción de PostgreSQL y el panel de administración/tienda refleja el stock.

Si `SUPPLIER_EMAIL` ya pertenece a un cliente, el arranque cambia su rol a proveedor, quita su perfil de cliente y mantiene sus pedidos históricos. Conserva `SUPPLIER_PASSWORD` en `.env` y entrégalo por un canal privado. El arranque actualiza su hash en la base de datos a partir del valor configurado; cambiar el valor en `.env` rota la contraseña del proveedor al reiniciar. La contraseña `proveedor123` es débil: úsala solo en desarrollo local y reemplázala por una contraseña única y robusta antes de publicar la aplicación.

## Wompi Colombia

1. Crea un comercio en [Wompi](https://comercios.wompi.co) y obtén las llaves de **sandbox**.
2. Configura `WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET` y `WOMPI_ENV=sandbox`.
3. Configura en el comercio la URL de eventos `https://tu-dominio/api/payments/wompi/events` para el ambiente correspondiente. El endpoint verifica el checksum y concilia los pagos; no se confía en la redirección del navegador.
4. El checkout alojado de Wompi permite ofrecer los métodos habilitados para el comercio, como tarjeta, PSE, Nequi, Daviplata y Bancolombia, en COP. Verifica qué medios habilitó Wompi para tu cuenta.
5. Prueba aprobación, rechazo y expiración en sandbox. Para producción, cambia `WOMPI_ENV=production`, usa llaves y secreto de eventos de producción, configura HTTPS y establece `WOMPI_REDIRECT_URL` con la URL pública del sitio.

Las órdenes descuentan/reservan stock al iniciar el checkout. Si el pago se rechaza o vence, el webhook o la expiración de la reserva devuelve las unidades al inventario. Nunca se solicitan ni se guardan datos de tarjeta en la tienda.

## Administración

Inicia sesión con `ADMIN_EMAIL` y `ADMIN_PASSWORD` para abrir `admin.html`. El panel permite revisar ventas, productos, clientes, pedidos y recepciones que registra el proveedor, editar catálogo/stock y actualizar estados. Los cambios se guardan en PostgreSQL y el catálogo público se refresca automáticamente. El panel del proveedor es independiente y no se enlaza desde la administración.

## Perfil del cliente

Después de iniciar sesión, el cliente llega a `account.html`, donde ve sus datos, carrito persistente y compras anteriores. Puede guardar su dirección de envío desde el perfil; esta se carga automáticamente en el siguiente checkout y puede editarse antes de pagar. En cada pedido pagado puede descargar la factura de compra en PDF; el servidor comprueba la sesión y la propiedad del pedido antes de generarla. Puede regresar a la tienda o continuar al checkout sin volver a iniciar sesión. La cuenta y los pedidos se validan en el servidor.

## API principal

- `GET /api/health`, `GET /api/products`, `GET /api/perfume-images`
- `GET /api/auth/captcha/config`, `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/google`, `GET /api/auth/session`
- `GET /api/account/summary` (requiere sesión de cliente; perfil, carrito y compras)
- `PUT /api/account/address` (requiere sesión de cliente; guarda dirección de envío)
- `GET /api/cart`, `PUT /api/cart`
- `POST /api/orders` (requiere sesión de cliente y crea el checkout Wompi)
- `GET /api/orders/:id/invoice` (requiere sesión del propietario y pago confirmado; descarga la factura PDF)
- `POST /api/payments/wompi/events` (webhook firmado)
- `/api/admin/*` (requiere sesión de administrador)
- `GET /api/supplier/summary`, `POST /api/supplier/receipts` (requieren sesión de proveedor)

Consulta [API_INTEGRATIONS.md](./API_INTEGRATIONS.md) para el inventario completo de endpoints, integraciones externas, variables de entorno, credenciales de administrador y recorrido/destino del pago.
