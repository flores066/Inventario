# Iniciar el servidor de Less Perfum

## Requisitos

- Node.js instalado.
- PostgreSQL instalado y ejecutándose.
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

## 2. Crear la base de datos PostgreSQL

Asegúrate de que el servicio de PostgreSQL esté iniciado. Después ejecuta el archivo SQL con `psql`:

```powershell
psql -U postgres -f database/data.sql
```

Escribe la contraseña de PostgreSQL cuando la solicite.

Si `psql` no es reconocido, usa la ruta completa, normalmente similar a:

```powershell
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -f database/data.sql
```

Cambia `16` por la versión instalada en tu equipo.

## 3. Crear la configuración `.env`

Copia el archivo de ejemplo:

```powershell
Copy-Item .env.example .env
```

Abre `.env` y confirma estos valores. Cambia el usuario, contraseña o puerto si tu instalación usa otros:

```env
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/less_perfum
JWT_SECRET=una-clave-larga-y-segura-para-less-perfum
NODE_ENV=development
```

No compartas el archivo `.env` ni la clave `JWT_SECRET`.

## 4. Instalar dependencias

Solo es necesario hacerlo la primera vez o después de modificar `package.json`:

```powershell
npm install
```

## 5. Iniciar el servidor

Ejecuta:

```powershell
npm start
```

Debe aparecer un mensaje similar a:

```text
Less Perfum disponible en http://localhost:3000
```

Mantén esa terminal abierta mientras uses la página.

## 6. Abrir la tienda

Abre esta dirección en el navegador:

```text
http://localhost:3000/index.html
```

No abras `index.html` directamente con doble clic, porque las peticiones `fetch()` necesitan pasar por el servidor.

## 7. Comprobar que todo funciona

En otra terminal, desde la carpeta `inventario`, ejecuta:

```powershell
Invoke-WebRequest http://localhost:3000/api/health
```

La respuesta esperada contiene:

```json
{"ok":true}
```

## Problemas frecuentes

### El puerto 3000 está ocupado

Cambia `PORT=3000` por otro puerto, por ejemplo `PORT=3001`, en `.env`. Luego abre:

```text
http://localhost:3001/index.html
```

### La API responde 503

PostgreSQL no está disponible o `DATABASE_URL` es incorrecta. Revisa que PostgreSQL esté ejecutándose, que la base `less_perfum` exista y que la contraseña de `.env` sea correcta.

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
