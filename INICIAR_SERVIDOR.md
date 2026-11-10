# Iniciar Less Perfum

## Requisitos

- Node.js 20 o posterior.
- PostgreSQL en ejecución.

## Configuración

Desde la carpeta `inventario`, instala dependencias y crea la configuración local:

```powershell
npm install
Copy-Item .env.example .env
```

En `.env`, configura `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL` y `ADMIN_PASSWORD`. El servidor crea la cuenta interna del proveedor con `SUPPLIER_EMAIL` y `SUPPLIER_PASSWORD` (mínimo 8 caracteres). El registro de clientes ya no requiere Gmail: se protege con Cloudflare Turnstile. En desarrollo usa llaves CAPTCHA de prueba; en producción configura `TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY` reales. Las llaves Wompi habilitan los pagos.

Crea la base y carga el esquema PostgreSQL una sola vez:

```powershell
createdb -U postgres less_perfums
psql -U postgres -d less_perfums -f database/data.sql
```

## Ejecutar

```powershell
npm start
```

Abre `http://localhost:3000`. Verifica la conexión en `http://localhost:3000/api/health`.

No hay modo demo ni almacenamiento en memoria. Gmail es opcional; Google social y Wompi requieren configurar sus credenciales para esos servicios. Consulta el [README](./README.md) para configurar Turnstile, el portal del proveedor, Google y Wompi.
