import { useEffect, useMemo, useState } from 'react'
import './Principal.css'
import Actualizar from './Actualizar'
import Configuracion from './Configuracion'
import Agregar from './Agregar'
import Editar from './Editar'
import Eliminar from './Eliminar'
import AgregarMod from './AgregarMod'
import EliminarMod from './EliminarMod'
import EditarMod from './EditarMod'

type ModMeta = {
  name: string
  version?: string
  author?: string
  description?: string
  pageUrl?: string
  updateUrl?: string
  image?: string
  enabled?: boolean
  createdAt?: string
  updatedAt?: string
}

type ModItem = {
  folder: string
  dir: string
  meta: ModMeta
}

type Settings = { modsRoot?: string; imagesRoot?: string }
type CharacterItem = { name: string; imagePath?: string }
type CropMeta = { x: number; y: number; width: number; height: number; originalWidth: number; originalHeight: number; zoom?: number }

function Principal() {
  const [settings, setSettings] = useState<Settings>({})
  const [characters, setCharacters] = useState<CharacterItem[]>([])
  const [selectedChar, setSelectedChar] = useState<string>('')
  const [mods, setMods] = useState<ModItem[]>([])
  const [modImgSrcs, setModImgSrcs] = useState<Record<string, string>>({})
  const [charImgSrcs, setCharImgSrcs] = useState<Record<string, string>>({})
  const [charCrops, setCharCrops] = useState<Record<string, CropMeta | undefined>>({})
  const [showUpdatePanel, setShowUpdatePanel] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [showAgregar, setShowAgregar] = useState(false)
  const [showEditar, setShowEditar] = useState(false)
  const [showEliminar, setShowEliminar] = useState(false)
  const [showAgregarMod, setShowAgregarMod] = useState(false)
  const [showEliminarMod, setShowEliminarMod] = useState(false)
  const [showEditarMod, setShowEditarMod] = useState(false)
  const [modToEdit, setModToEdit] = useState<ModItem | null>(null)
  const [modToDelete, setModToDelete] = useState<string>('')
  const [pendingMod, setPendingMod] = useState<{ archivePath: string; archiveFileName: string } | null>(null)
  const hasRoot = useMemo(() => !!settings.modsRoot, [settings])

  useEffect(() => {
    window.api.getSettings().then((s) => setSettings(s))
  }, [])

  useEffect(() => {
    if (!hasRoot) return
    refreshCharacters()
  }, [hasRoot])

  useEffect(() => {
    if (!selectedChar || !hasRoot) return
    refreshMods(selectedChar)
  }, [selectedChar, hasRoot])

  async function refreshCharacters() {
    const list = await window.api.listCharactersWithImages()
    setCharacters(list)
    if (list.length && !selectedChar) setSelectedChar(list[0].name)
    // Load data URLs for images to avoid file:// restrictions in dev server
    const entries = await Promise.all(list.map(async (c) => {
      if (!c.imagePath) return [c.name, ''] as const
      const dataUrl = await window.api.readImageAsDataUrl(c.imagePath)
      return [c.name, dataUrl || ''] as const
    }))
    const map: Record<string, string> = {}
    for (const [name, src] of entries) { if (src) map[name] = src }
    setCharImgSrcs(map)

    // Load crop metadata per character
    const cropEntries = await Promise.all(list.map(async (c) => {
      try {
        const info = await window.api.getCharacterInfo(c.name)
        return [c.name, info.crop as CropMeta | undefined] as const
      } catch {
        return [c.name, undefined] as const
      }
    }))
    const cropMap: Record<string, CropMeta | undefined> = {}
    for (const [name, crop] of cropEntries) { cropMap[name] = crop }
    setCharCrops(cropMap)
  }

  async function refreshMods(character: string) {
    const list = await window.api.listMods(character)
    setMods(list)
    // Build data URLs for mod preview images to avoid file:// restrictions in dev server
    const entries = await Promise.all(list.map(async (m) => {
      const rel = m.meta.image
      if (!rel) return [m.dir, ''] as const
      try {
        const abs = `${m.dir.replace(/\\/g, '/')}/${rel}`
        const dataUrl = await window.api.readImageAsDataUrl(abs)
        return [m.dir, dataUrl || ''] as const
      } catch {
        return [m.dir, ''] as const
      }
    }))
    const map: Record<string, string> = {}
    for (const [dir, src] of entries) { if (src) map[dir] = src }
    setModImgSrcs(map)
  }

  async function refreshAll() {
    const chars = await window.api.listCharactersWithImages()
    setCharacters(chars)
    // Also rebuild image data URLs for preview
    const entries = await Promise.all(chars.map(async (c) => {
      if (!c.imagePath) return [c.name, ''] as const
      const dataUrl = await window.api.readImageAsDataUrl(c.imagePath)
      return [c.name, dataUrl || ''] as const
    }))
    const map: Record<string, string> = {}
    for (const [name, src] of entries) { if (src) map[name] = src }
    setCharImgSrcs(map)

    // Refresh crop metadata
    const cropEntries = await Promise.all(chars.map(async (c) => {
      try {
        const info = await window.api.getCharacterInfo(c.name)
        return [c.name, info.crop as CropMeta | undefined] as const
      } catch {
        return [c.name, undefined] as const
      }
    }))
    const cropMap: Record<string, CropMeta | undefined> = {}
    for (const [name, crop] of cropEntries) { cropMap[name] = crop }
    setCharCrops(cropMap)

    let cur = selectedChar
    const names = chars.map(c => c.name)
    if (!cur || !names.includes(cur)) cur = names[0] || ''
    setSelectedChar(cur)
  if (cur) await refreshMods(cur)
  else { setMods([]); setModImgSrcs({}) }
  }

  async function pickRoot() {
    const folder = await window.api.selectFolder()
    if (!folder) return
    const s = await window.api.setModsRoot(folder)
    setSettings(s)
  }

  async function addMod() {
    if (!selectedChar) return
    const archive = await window.api.selectArchive()
    if (!archive) return
    // Copy archive into a new mod folder named after archive
  setPendingMod({ archivePath: archive, archiveFileName: archive.split(/[/\\]/).pop() || 'mod.zip' })
  setShowAgregarMod(true)
  }

  async function editMeta(mod: ModItem) {
    setModToEdit(mod)
    setShowEditarMod(true)
  }

  async function removeMod(mod: ModItem) {
    // Open modal instead of inline confirm
    setModToDelete(mod.folder)
    setShowEliminarMod(true)
  }

  // removed per UI change: no standalone update button

  useEffect(() => {
    if (!hasRoot) return
    const debounced = debounce(() => { refreshAll() }, 400)
    const off = window.api.onFsChanged(() => debounced())
    return () => { try { off() } catch {} }
  }, [hasRoot, selectedChar])

  const header = (
    <header className="header">
      <div className="title">Syleaf Mod Manager for ZZZ</div>
      <div className="update-wrapper"><button onClick={() => setShowUpdatePanel(v => !v)} title="Actualizar">↻ Actualizar</button>{showUpdatePanel && (
        <Actualizar
          onAfterAction={refreshAll}
          onClose={() => setShowUpdatePanel(false)}
        />
      )}</div>
      <div className="update-wrapper"><button onClick={() => setShowConfig(true)} title="Configuración">⚙</button></div>
      <div className="spacer" />
      <div className="root">
        <span className="label">Carpeta de mods:</span>
        <span className="path">{settings.modsRoot || 'No seleccionada'}</span>
        <button onClick={pickRoot}>Cambiar…</button>
      </div>
    </header>
  )

  if (!hasRoot) {
    return (
      <div className="empty">
        {header}
        <main className="center">
          <p>Selecciona una carpeta raíz donde cada subcarpeta será un personaje.</p>
          <button onClick={pickRoot}>Elegir carpeta…</button>
        </main>
      </div>
    )
  }

  return (
    <div className="layout layout-2">
      {header}

      {/* Izquierda: Personajes */}
      <main className="characters-panel">
        <div className="panel-header">
          <h2>Personajes</h2>
          <div className="spacer" />
          <button onClick={() => setShowAgregar(true)} title="Agregar personaje">+ Agregar</button>
          <button onClick={() => setShowEditar(true)} title="Editar personaje">✎ Editar</button>
          <button className="danger" onClick={() => setShowEliminar(true)} title="Eliminar personaje" disabled={!selectedChar}>✖ Eliminar</button>
        </div>
        <div className="characters-grid">
          {characters.map((c) => (
            <div
              key={c.name}
              className={`char-card ${c.name === selectedChar ? 'active' : ''}`}
              onClick={() => setSelectedChar(c.name)}
            >
              {charImgSrcs[c.name] ? (
                (() => {
                  const crop = charCrops[c.name]
                  const baseStyle: any = { width: 'var(--char-thumb-width)', height: 'var(--char-thumb-height)', borderRadius: 8, overflow: 'hidden', backgroundColor: '#0e1320' }
                  if (crop && crop.originalWidth > 0 && crop.originalHeight > 0 && crop.width > 0 && crop.height > 0) {
                    const varW = getComputedStyle(document.documentElement).getPropertyValue('--char-thumb-width')
                    const varH = getComputedStyle(document.documentElement).getPropertyValue('--char-thumb-height')
                    const containerW = parseFloat(varW) || 180
                    const containerH = parseFloat(varH) || 135
                    // scale so that the crop area fits exactly the container (keep decimals for precision)
                    const scaleX = containerW / crop.width
                    const scaleY = containerH / crop.height
                    const scale = scaleX || scaleY || 1
                    const bgW = crop.originalWidth * scale
                    const bgH = crop.originalHeight * scale
                    // center-based positioning: align crop center to container center
                    const cx = crop.x + crop.width / 2
                    const cy = crop.y + crop.height / 2
                    const posX = containerW / 2 - (cx * scale)
                    const posY = containerH / 2 - (cy * scale)
                    return (
                      <div
                        className="char-thumb"
                        style={{
                          ...baseStyle,
                          backgroundImage: `url(${charImgSrcs[c.name]})`,
                          backgroundRepeat: 'no-repeat',
                          backgroundSize: `${bgW}px ${bgH}px`,
                          backgroundPosition: `${posX}px ${posY}px`,
                        }}
                      />
                    )
                  }
                  // Fallback: centered cover
                  return (
                    <div
                      className="char-thumb"
                      style={{
                        ...baseStyle,
                        backgroundImage: `url(${charImgSrcs[c.name]})`,
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: 'cover',
                        backgroundPosition: '50% 50%'
                      }}
                    />
                  )
                })()
              ) : (
                <div className="char-avatar">{c.name.charAt(0).toUpperCase()}</div>
              )}
              <div className="char-name">{c.name}</div>
            </div>
          ))}
          {characters.length === 0 && (
            <div className="empty-hint">No hay personajes. Crea carpetas dentro de la raíz para cada personaje.</div>
          )}
        </div>
      </main>

      {/* Derecha: Mods del personaje seleccionado */}
      <section className="mods-panel">
        <div className="panel-header">
          <h3>Mods {selectedChar ? `· ${selectedChar}` : ''}</h3>
          <div className="spacer" />
          <button onClick={addMod} disabled={!selectedChar}>+ Agregar Mod (ZIP/7z)</button>
        </div>
        {!selectedChar && <div className="empty-hint">Selecciona un personaje a la izquierda.</div>}
        {selectedChar && (
          <div className="mods-grid">
            {mods.map((m) => (
              <div key={m.folder} className="mod-card">
                <div className="mod-thumb" onClick={() => window.api.openFolder(selectedChar, m.folder)}>
                  {modImgSrcs[m.dir] ? (
                    <div style={{ width: '100%', height: '100%', backgroundImage: `url(${modImgSrcs[m.dir]})`, backgroundRepeat: 'no-repeat', backgroundSize: 'cover', backgroundPosition: '50% 50%' }} />
                  ) : (
                    <div className="placeholder">Sin imagen</div>
                  )}
                </div>
                <div className="mod-info">
                  <div className="mod-name">{m.meta.name || m.folder}</div>
                  {m.meta.pageUrl ? (
                    <a href="#" onClick={(e) => { e.preventDefault(); window.api.openModPage(selectedChar, m.folder) }} title={m.meta.pageUrl}>
                      {m.meta.pageUrl}
                    </a>
                  ) : (
                    <div className="muted">Sin URL</div>
                  )}
                </div>
                <div className="mod-actions">
                  <button onClick={() => editMeta(m)}>Editar</button>
                  <button className="danger" onClick={() => removeMod(m)}>Eliminar</button>
                </div>
              </div>
            ))}
            {mods.length === 0 && <div className="empty-hint">No hay mods para este personaje todavía.</div>}
          </div>
        )}
      </section>

      {showConfig && (
        <Configuracion
          onClose={() => setShowConfig(false)}
          onSettingsChanged={async (s) => {
            const prevRoot = settings.modsRoot
            setSettings(s)
            if (s.modsRoot !== prevRoot) {
              await refreshAll()
            }
          }}
        />
      )}
      {showAgregar && (
        <Agregar
          onClose={() => setShowAgregar(false)}
          onAdded={async (name) => {
            // Ensure we select the new character after adding
            await refreshAll()
            setSelectedChar(name)
          }}
        />
      )}
      {showEditar && selectedChar && (
        <Editar
          currentName={selectedChar}
          onClose={() => setShowEditar(false)}
          onUpdated={async (newName) => {
            await refreshAll()
            setSelectedChar(newName)
          }}
        />
      )}
      {showAgregarMod && selectedChar && pendingMod && (
        <AgregarMod
          character={selectedChar}
          archivePath={pendingMod.archivePath}
          archiveFileName={pendingMod.archiveFileName}
          onClose={() => { setShowAgregarMod(false); setPendingMod(null) }}
          onSaved={async () => { await refreshMods(selectedChar) }}
        />
      )}
      {showEliminarMod && selectedChar && modToDelete && (
        <EliminarMod
          character={selectedChar}
          modName={modToDelete}
          onClose={() => { setShowEliminarMod(false); setModToDelete('') }}
          onDeleted={async () => { await refreshMods(selectedChar) }}
        />
      )}
      {showEditarMod && selectedChar && modToEdit && (
        <EditarMod
          character={selectedChar}
          mod={modToEdit}
          onClose={() => { setShowEditarMod(false); setModToEdit(null) }}
          onSaved={async () => { await refreshMods(selectedChar) }}
        />
      )}
      {showEliminar && selectedChar && (
        <Eliminar
          character={selectedChar}
          onClose={() => setShowEliminar(false)}
          onDeleted={async () => {
            await refreshAll()
          }}
        />
      )}
    </div>
  )
}

function debounce<T extends (...args: any[]) => void>(fn: T, wait = 400) {
  let t: any
  return (...args: any[]) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), wait)
  }
}

export default Principal
