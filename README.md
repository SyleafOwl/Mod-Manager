# Syleaf Mod Manager for ZZZ

Aplicación de escritorio (Electron + React) para instalar y administrar mods de Zenless Zone Zero sin complicaciones.

## Características

- Carpeta raíz configurable. Cada subcarpeta dentro de la raíz es un personaje y cada subcarpeta dentro de un personaje es un mod.
- Agregar mods desde archivos .zip/.7z/.rar (se extraen automáticamente).
- Editar metadatos del mod (versión, autor, descripción, página, URL de actualización).
- Abrir la carpeta del mod o la página del mod en el navegador.
- Actualizar con un clic si el mod tiene `updateUrl` directo.
- Eliminar mods.

## Desarrollo

Requisitos: Node.js 18+.

- `npm install`
- `npm run dev` para desarrollo.
- `npm run build` para compilar y empaquetar.

