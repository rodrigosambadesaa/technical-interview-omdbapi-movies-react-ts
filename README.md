# CineFinder — prueba técnica React + TypeScript + OMDb

Aplicación de búsqueda de películas y series desarrollada con React, TypeScript y Vite. Esta solución completa el enunciado de la prueba técnica y amplía su primera iteración.

## Funcionalidad

- Búsqueda por título con botón, tecla Intro y **búsqueda automática con debounce de 500 ms** (a partir de dos caracteres).
- Evita solicitudes duplicadas y cancela peticiones obsoletas al cambiar de consulta.
- Cuadrícula responsive con título, año, tipo, póster y enlace a IMDb; imagen de reserva si no existe póster.
- Mensaje de validación al enviar el formulario vacío, **sin errores al iniciar la aplicación**.
- Ordenación opcional por título mediante checkbox, con posibilidad de restablecer el orden original.
- Paginación con «Cargar más»; filtrado de duplicados y recuperación ante errores de página.
- Favoritos persistentes en `localStorage` y filtrado «Solo favoritos».
- Estados de carga, vacío, errores de red y de OMDb, y botón de reintento.
- Diseño accesible (labels, avisos en vivo, botones con nombre, navegación por teclado y movimiento reducido).

## Ejecutar sin Docker

Requisitos: Node.js 22 y npm.

```bash
git clone https://github.com/rodrigosambadesaa/technical-interview-omdbapi-movies-react-ts.git
cd technical-interview-omdbapi-movies-react-ts
cp .env.example .env
# Sustituya VITE_API_KEY por una clave real en .env
npm ci
npm run dev
```

Abra **http://localhost:5173**. Para generar y servir la versión de producción sin Docker:

```bash
npm run build
npm run preview
```

## Ejecutar con Docker

Requisitos: Docker Engine + Docker Compose v2. **No necesita instalar Node.js en el host**.

```bash
cp .env.example .env
# Edite la clave de OMDb en .env
docker compose up --build -d
```

Abra **http://localhost:8080**. Para detenerlo: `docker compose down`.

También puede utilizar Docker sin Compose:

```bash
docker build --build-arg VITE_API_KEY=SU_CLAVE -t cinefinder .
docker run --rm -p 8080:80 cinefinder
```

Se utiliza una imagen **multietapa**: Node.js construye los archivos estáticos y Nginx los sirve desde una imagen de producción. La configuración incluye SPA fallback, cabeceras HTTP defensivas y un healthcheck.

### Consideraciones sobre la API key

Solicite su clave en [OMDb](https://www.omdbapi.com/apikey.aspx). `.env` está excluido de Git y Docker.

**Importante:** Vite sustituye `VITE_*` durante la compilación. En una aplicación **exclusivamente cliente** la clave se incluye en el JavaScript descargado y en las peticiones del navegador; no es un secreto. No utilice una clave que deba permanecer privada. Para una clave privada sería necesario desarrollar un backend/proxy con limitación de tasa y gestión de credenciales en el servidor. Cambiar las variables de entorno de un contenedor ya construido no modifica los archivos JavaScript; vuelva a ejecutar `docker compose up --build`.

## Calidad y tests

```bash
npm ci
npm run lint
npm run build
npx playwright install chromium firefox webkit
npm test
```

Los tests Playwright sustituyen las respuestas de OMDb con fixtures deterministas. **No necesitan una API key real ni realizan peticiones a OMDb**. Los escenarios cubren: carga inicial, validación, debounce, búsqueda manual, deduplicación, ordenación, resultados vacíos, errores, reintentos, reset, paginación, favoritos, concurrencia y diseño móvil.

El workflow [CI](.github/workflows/ci.yml) ejecuta automáticamente análisis estático, compilación, pruebas E2E en Chromium/Firefox/WebKit y Chromium móvil y smoke test del contenedor Docker en los pull requests y en los cambios a `main`. Los informes Playwright se adjuntan si hay fallos.

## Arquitectura

```text
src/
  api/omdb.ts       Cliente de OMDb con validación de respuestas y AbortSignal
  App.tsx           Componentes, estado, caché, paginación y favoritos
  index.css         Diseño responsive y accesibilidad visual
  types.ts          Tipos de dominio
tests/search.spec.ts Pruebas de extremo a extremo con interceptación de red
docker/nginx.conf    Servidor estático en producción
```

La API de OMDb devuelve un máximo de 10 resultados por página; la paginación solicita la siguiente página al pulsar «Cargar más». El diseño no almacena los resultados permanentemente; la caché de búsquedas dura mientras la aplicación permanece abierta.

## Enunciado original

Se cumplen: formulario con input y botón, listado de título/año/póster, grid adaptable, validación de campo vacío sin error inicial, ordenación por título y las tres tareas de la primera iteración (no repetir búsqueda, búsqueda automática y debounce).
