# APIs e integraciones de Less Perfum

Este documento describe lo que está conectado en el código y lo que aún requiere credenciales. La aplicación no incluye claves privadas ni credenciales de administrador predeterminadas. Los valores de `.env.example` son marcadores de posición.

## Resumen

| Integración | Uso | Estado en el código | ¿Requiere credenciales? |
|---|---|---|---|
| PostgreSQL | Usuarios/clientes, catálogo, carritos, pedidos, pagos e inventario | Acceso del servidor mediante `pg` | Sí: `DATABASE_URL` |
| Google Identity Services | Inicio y registro con cuenta Google; se valida el ID token en el servidor | Integrado | Sí: `GOOGLE_CLIENT_ID` |
| Cloudflare Turnstile | CAPTCHA para el registro tradicional y el registro completado desde Google | Verificación server-side con Siteverify; llaves oficiales de prueba solo en desarrollo | Sí en producción: `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` |
| Gmail API | Envío de mensajes mediante rutas heredadas de verificación | Código heredado; ya no es necesario para registrar o activar clientes | Sí, solo si se usan esas rutas heredadas |
| Wompi Colombia | Checkout alojado y confirmación de transacciones por webhook | Integrado; cobros reales no confirmados | Sí: llaves y secretos de Wompi |
| Unsplash CDN | Imágenes de perfumes de respaldo en el catálogo, carrito y páginas públicas | Integrado mediante enlaces HTTPS verificados; no es una API de búsqueda aleatoria ni requiere clave | No |

No hay una API de pago independiente implementada para Bancolombia, Nequi, Daviplata o PSE. Se ofrecen únicamente si Wompi los habilita para el comercio y el checkout de Wompi los presenta.

## Endpoints HTTP de la aplicación

Todos los endpoints siguientes son rutas propias del servidor Express (no credenciales de proveedores). La URL base local es `http://localhost:3000`.

### Estado, catálogo e imágenes

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/api/health` | Comprueba conexión a la base y muestra indicadores de configuración de Google, correo y pagos. |
| `GET` | `/api/products` | Catálogo activo; acepta filtros `category` y `search`. |
| `GET` | `/api/perfume-images?count=8` | Devuelve enlaces de una colección de imágenes de perfumes; `count` se limita a 1–24. |
| `GET` | `/api/auth/captcha/config` | Devuelve la site key pública de Turnstile y si está en modo de prueba. |

### Clientes y autenticación

| Método | Ruta | Uso |
|---|---|---|
| `POST` | `/api/auth/register` | Verifica Turnstile, crea un cliente activo e inicia sesión; no depende del correo. |
| `POST` | `/api/auth/resend-code`, `/api/auth/verify-email` | Rutas heredadas para códigos de cuentas antiguas; no se usan en el nuevo registro. |
| `POST` | `/api/auth/login` | Inicio con correo/contraseña de cliente, proveedor o administrador. |
| `GET` | `/api/auth/google/config` | Devuelve el Client ID público y token CSRF para iniciar el flujo de Google. |
| `POST` | `/api/auth/google` | Valida la credencial Google; inicia sesión si la cuenta existe o inicia el registro. |
| `GET` | `/api/auth/google/pending` | Consulta el perfil temporal pendiente del registro Google. |
| `POST` | `/api/auth/google/register` | Crea el cliente a partir del flujo Google pendiente. |
| `GET` | `/api/auth/session` | Consulta la sesión actual. |
| `POST` | `/api/auth/logout` | Cierra la sesión. |
| `GET` | `/api/account/summary` | Recupera datos del perfil, carrito y compras del cliente autenticado. |

### Proveedor

Estas rutas requieren una sesión con rol `proveedor`. Al iniciar el servidor, la cuenta configurada en `SUPPLIER_EMAIL` se crea o actualiza con la contraseña de `SUPPLIER_PASSWORD`.

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/api/supplier/summary` | Recupera productos activos, stock e historial de hasta 100 recepciones. |
| `POST` | `/api/supplier/receipts` | Registra cantidades recibidas y actualiza el stock dentro de una transacción PostgreSQL. |

### Administrador

Todas estas rutas requieren una sesión con rol `admin`.

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/api/admin/session` | Consulta si hay sesión de administrador. |
| `POST` | `/api/admin/logout` | Cierra la sesión de administrador. |
| `GET` | `/api/admin/summary` | Recupera resumen, productos, clientes, pedidos y ventas para el panel. |
| `PUT` | `/api/admin/customers/:id/status` | Activa o desactiva un cliente. |
| `POST` | `/api/admin/products` | Crea un producto. |
| `PUT` | `/api/admin/products/:id` | Actualiza un producto, incluido su inventario. |
| `PUT` | `/api/admin/orders/:id/status` | Cambia el estado permitido de un pedido. |

### Carrito, pedidos y pagos

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/api/cart` | Carga el carrito persistido en PostgreSQL. |
| `PUT` | `/api/cart` | Actualiza el carrito validando productos y stock. |
| `POST` | `/api/orders` | Crea el pedido, reserva/descuenta stock y devuelve los campos para el checkout alojado de Wompi. Requiere sesión de cliente. |
| `GET` | `/api/orders/:id/status` | Consulta el estado de pago de un pedido del cliente autenticado. |
| `POST` | `/api/payments/wompi/events` | Recibe el webhook `transaction.updated`, verifica su firma y concilia el pago con el pedido. |

## Credenciales: dónde se configuran

Crear `inventario/.env` a partir de `inventario/.env.example` y sustituir todos los marcadores. No se debe publicar, subir a Git ni compartir `.env`.

| Variable | Dónde obtenerla/configurarla | Nunca compartir |
|---|---|---|
| `DATABASE_URL` | Cadena de conexión de la única instancia PostgreSQL | Sí |
| `JWT_SECRET` | Generar aleatoriamente, mínimo 32 caracteres | Sí |
| `ADMIN_EMAIL` | Correo que se usará como usuario administrador | Tratar como dato privado |
| `ADMIN_PASSWORD` | Definir una contraseña única y robusta para el administrador | Sí |
| `SUPPLIER_EMAIL` | Identificador de la cuenta interna del proveedor | No |
| `SUPPLIER_PASSWORD` | Contraseña interna del proveedor; mínimo 8 caracteres | Sí |
| `SUPPLIER_NAME` | Nombre comercial que se muestra en el portal | No |
| `GOOGLE_CLIENT_ID` | Google Cloud Console, cliente OAuth web; autorizar el origen del sitio | Es público, pero mantenerlo en la configuración |
| `GOOGLE_CLIENT_SECRET` | Credencial OAuth del proyecto Google Cloud | Sí |
| `TURNSTILE_SITE_KEY` | Panel de Cloudflare Turnstile; clave pública del widget | No |
| `TURNSTILE_SECRET_KEY` | Panel de Cloudflare Turnstile; clave secreta para Siteverify | Sí |
| `GMAIL_REFRESH_TOKEN` | Flujo OAuth autorizado para enviar correo con permiso `https://www.googleapis.com/auth/gmail.send` | Sí |
| `GMAIL_SENDER` | Dirección remitente autorizada para Gmail API | No es una contraseña |
| `WOMPI_PUBLIC_KEY` | Panel de comercios Wompi; usar llave de pruebas en sandbox | Puede aparecer en el checkout; evitar publicarla fuera del sitio |
| `WOMPI_INTEGRITY_SECRET` | Panel Wompi, secreto para firmar el checkout | Sí |
| `WOMPI_EVENTS_SECRET` | Configuración de eventos/webhooks Wompi | Sí |
| `WOMPI_ENV` | `sandbox` para pruebas o `production` para producción | No |
| `WOMPI_REDIRECT_URL` | URL del sitio a la que Wompi regresa al comprador | No |
| `APP_URL` | URL base pública/local de la aplicación | No |

### Acceso del administrador

No hay credenciales de administrador universales en el código. `ADMIN_EMAIL` y `ADMIN_PASSWORD` se configuran localmente en `.env`; inicia sesión desde `formularios/login.html` y el sistema redirige al panel `admin.html`.

### Acceso del proveedor

Usa el correo configurado en `SUPPLIER_EMAIL` y la contraseña de `SUPPLIER_PASSWORD` para iniciar sesión desde `formularios/login.html`; el sistema redirige a `supplier.html`. El administrador consulta los movimientos de recepción desde su panel, pero no accede al portal del proveedor mediante un enlace. Al reiniciar, el servidor sincroniza la contraseña configurada con su hash en PostgreSQL.

## Recorrido del pago y destino del dinero

1. El comprador inicia sesión y envía dirección, ciudad y teléfono desde el checkout.
2. `POST /api/orders` valida el stock, crea el pedido en PostgreSQL, descuenta/reserva las unidades y devuelve un formulario con destino `https://checkout.wompi.co/p/`.
3. El comprador paga en la página alojada por Wompi. La tienda no captura ni almacena los datos de la tarjeta.
4. Wompi devuelve al comprador a `WOMPI_REDIRECT_URL` y, de forma independiente, envía el evento firmado a `POST /api/payments/wompi/events`.
5. El servidor comprueba firma, moneda y monto; el webhook es el que confirma el pedido como pagado. Si el pago es rechazado o vence, se libera el stock reservado.

**¿A dónde llega el dinero?** El pago se procesa en Wompi para el comercio dueño de las llaves configuradas. El código de la tienda no envía el dinero a una cuenta bancaria propia ni guarda fondos. El abono/liquidación depende de la cuenta de comercio, verificación y datos de desembolso configurados en el panel de Wompi. Hay que confirmar allí la cuenta receptora, tarifas, tiempos de liquidación y métodos de pago habilitados. La tienda por sí sola no determina esos datos.

El proyecto solo contiene integración de checkout y conciliación; no demuestra que existan credenciales válidas, un comercio aprobado, métodos habilitados ni cobros ya realizados. Para probar, se deben usar llaves sandbox. Para recibir pagos reales, hay que configurar llaves de producción, HTTPS, URL pública del webhook y cuenta de desembolso en Wompi.
