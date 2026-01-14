# Mod Manager by Syleaf

Administrador de mods para Zenless Zone Zero (ZZZ) o Genshin Impact. Organiza tus mods por personaje sin tocar ni ejecutar el juego. Hecho con Electron + React + TypeScript.

## Cómo funciona

- Eliges una carpeta raíz (**modsRoot**) donde cada subcarpeta es un personaje.
- Dentro de cada personaje, cada subcarpeta es un mod.
- Guarda metadatos (URLs, preview e info) y muestra miniaturas en la UI.

Estructura típica:

```
modsRoot/
  <Personaje>/
    <Mod A>/
      mod.json
      preview.png (opcional)
      <archivo-original>.zip/.7z/.rar (copiado al agregar)
    <Mod B>/

imagesRoot/ (opcional)
  <Personaje>/
    <Personaje>.(png|jpg|webp)
    <Personaje>.txt (JSON: url/crop y mods[])
```

## Lo principal que puedes hacer

- Configurar `modsRoot` e (opcional) `imagesRoot`.
- Agregar / editar / eliminar personajes.
- Agregar / editar / eliminar mods.
- Activar/desactivar mods (y modo exclusivo cuando aplique).

## Desarrollo

Requisitos: Node.js 18+

```
npm install
npm run dev
```

## Build (instalador)

```
npm run build
```

Notas:
- La UI recorta/encuadra imágenes visualmente; no modifica el archivo original.
- Se usa un watcher para refrescar la UI cuando cambian archivos.
- IMPORTANTE: Puede que haya bug o lag visuales al generar varios personajes o cargar varios mods

