# Iniciar el servidor de Less Perfum

## Requisitos

- Node.js instalado.
- Node.js instalado.
- El proyecto ubicado en la carpeta `inventario`.

## 1. Abrir la carpeta correcta

En VS Code, abre esta carpeta:

```text
c:\Users\SENA\Downloads\inventario-20260825T202423Z-1-001\inventario
```

También puedes abrir PowerShell y ejecutar:

```powershell
cd "c:\Users\SENA\Downloads\inventario-20260825T202423Z-1-001\inventario"
```

## 2. Probar sin credenciales (modo demostración)

No necesitas instalar PostgreSQL ni tener credenciales. `.env` ya está configurado con `DEMO_MODE=true`. Desde la carpeta del proyecto ejecuta:

```powershell
npm install
npm start
```

Abre `http://localhost:3000/index.html`. Catálogo, registro, inicio de sesión, carrito y checkout funcionan con datos temporales que se borran al detener el servidor.

Usa el mismo formulario `http://localhost:3000/formularios/login.html` para clientes y administrador. Para el panel demo, ingresa `admin@email.com` / `admin123`; el sistema te enviará a `admin.html` automáticamente. Si visitas el panel sin sesión, volverás a ese mismo login.

## 3. PostgreSQL opcional (datos persistentes)

Solo si quieres guardar los datos entre reinicios, inicia PostgreSQL y ejecuta el archivo SQL con `psql`:

```powershell
psql -U postgres -f database/data.sql
```

Escribe la contraseña de PostgreSQL cuando la solicite.

Si `psql` no es reconocido, usa la ruta completa, normalmente similar a:

```powershell
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -f database/data.sql
```

Cambia `16` por la versión instalada en tu equipo.

## 4. Configurar `.env` para PostgreSQL

Copia el archivo de ejemplo:

```powershell
Copy-Item .env.example .env
```

En `.env`, cambia `DEMO_MODE=true` a `DEMO_MODE=false` y configura la URL con tus propios datos de PostgreSQL:

```env
PORT=3000
DEMO_MODE=false
DATABASE_URL=postgresql://usuario:contraseña@localhost:5432/less_perfum
JWT_SECRET=una-clave-larga-y-segura-para-less-perfum
NODE_ENV=development
ADMIN_EMAIL=admin@tudominio.com
ADMIN_PASSWORD=una-contraseña-larga-y-única
```

No compartas el archivo `.env` ni la clave `JWT_SECRET`.

## 5. Instalar dependencias

Solo es necesario hacerlo la primera vez o después de modificar `package.json`:

```powershell
npm install
```

## 6. Iniciar el servidor

Ejecuta:

```powershell
npm start
```

Debe aparecer un mensaje similar a:

```text
Less Perfum disponible en http://localhost:3000
```

Mantén esa terminal abierta mientras uses la página.

## 7. Abrir la tienda

Abre esta dirección en el navegador:

```text
http://localhost:3000/index.html
```

No abras `index.html` directamente con doble clic, porque las peticiones `fetch()` necesitan pasar por el servidor.

## 8. Comprobar que todo funciona

En otra terminal, desde la carpeta `inventario`, ejecuta:

```powershell
Invoke-WebRequest http://localhost:3000/api/health
```

En modo demo, la respuesta esperada es:

```json
{"ok":true,"mode":"demo"}
```

## Problemas frecuentes

### El puerto 3000 está ocupado

Cambia `PORT=3000` por otro puerto, por ejemplo `PORT=3001`, en `.env`. Luego abre:

```text
http://localhost:3001/index.html
```

### La API no conecta con PostgreSQL

Si no tienes credenciales, vuelve a `DEMO_MODE=true` (o elimina `DATABASE_URL`) y reinicia el servidor. Para persistencia, revisa que PostgreSQL esté ejecutándose, que la base `less_perfum` exista y que la URL sea correcta.

### La página no carga productos

Comprueba que:

1. La terminal del servidor siga abierta.
2. La página se abra con `http://localhost:3000/index.html`.
3. `http://localhost:3000/api/health` responda `{"ok":true}`.
4. El archivo `database/data.sql` se haya ejecutado correctamente.

### Detener el servidor

En la terminal donde está ejecutándose, presiona:

```text
Ctrl + C
```
