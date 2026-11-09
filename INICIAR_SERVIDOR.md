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

En `.env`, configura `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL` y `ADMIN_PASSWORD`. Para registrar clientes con correo se requieren además `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` y `GMAIL_SENDER`. Las llaves Wompi habilitan los pagos.

Crea la base y carga el esquema PostgreSQL una sola vez:

```powershell
createdb -U postgres less_perfum
psql -U postgres -d less_perfum -f database/data.sql
```

## Ejecutar

```powershell
npm start
```

Abre `http://localhost:3000`. Verifica la conexión en `http://localhost:3000/api/health`.

No hay modo demo ni almacenamiento en memoria: si falta PostgreSQL, Gmail o Wompi, el servidor/API informará el problema de configuración en los flujos que dependan del servicio. Consulta el [README](./README.md) para crear credenciales de Google y Wompi.
