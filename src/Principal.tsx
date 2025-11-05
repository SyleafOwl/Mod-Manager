import { useEffect, useMemo, useState } from 'react'
import './Principal.css'
import Actualizar from './Actualizar'
import Configuracion from './Configuracion'

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

function Principal() {
  const [settings, setSettings] = useState<Settings>({})
  const [characters, setCharacters] = useState<string[]>([])
  const [selectedChar, setSelectedChar] = useState<string>('')
  const [mods, setMods] = useState<ModItem[]>([])
  const [showUpdatePanel, setShowUpdatePanel] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
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
    const list = await window.api.listCharacters()
    setCharacters(list)
    if (list.length && !selectedChar) setSelectedChar(list[0])
  }

  async function refreshMods(character: string) {
    const list = await window.api.listMods(character)
    setMods(list)
  }

  async function refreshAll() {
    const chars = await window.api.listCharacters()
    setCharacters(chars)
    let cur = selectedChar
    if (!cur || !chars.includes(cur)) cur = chars[0] || ''
    setSelectedChar(cur)
    if (cur) setMods(await window.api.listMods(cur))
    else setMods([])
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
    const name = prompt('Nombre del mod (carpeta a crear):')?.trim()
    if (!name) return
    const meta: Partial<ModMeta> = {
      version: prompt('Versión (opcional):') || undefined,
      author: prompt('Autor (opcional):') || undefined,
      pageUrl: prompt('URL de la página (opcional):') || undefined,
      updateUrl: prompt('URL de actualización/descarga directa (opcional):') || undefined,
    }
    await window.api.addModFromArchive(selectedChar, archive, name, meta)
    await refreshMods(selectedChar)
  }

  async function editMeta(mod: ModItem) {
    const name = mod.folder
    const version = prompt('Versión:', mod.meta.version || '') || undefined
    const author = prompt('Autor:', mod.meta.author || '') || undefined
    const pageUrl = prompt('URL de la página:', mod.meta.pageUrl || '') || undefined
    const updateUrl = prompt('URL de actualización:', mod.meta.updateUrl || '') || undefined
    const description = prompt('Descripción:', mod.meta.description || '') || undefined
    await window.api.saveModMetadata(selectedChar, name, { version, author, pageUrl, updateUrl, description })
    await refreshMods(selectedChar)
  }

  async function removeMod(mod: ModItem) {
    if (!confirm(`Eliminar mod "${mod.folder}"?`)) return
    await window.api.deleteMod(selectedChar, mod.folder)
    await refreshMods(selectedChar)
  }

  async function updateMod(mod: ModItem) {
    try {
      await window.api.updateFromUrl(selectedChar, mod.folder)
      alert('Actualizado')
      await refreshMods(selectedChar)
    } catch (e: any) {
      alert('No se pudo actualizar: ' + (e?.message || e))
    }
  }

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
        </div>
        <div className="characters-grid">
          {characters.map((c) => (
            <div
              key={c}
              className={`char-card ${c === selectedChar ? 'active' : ''}`}
              onClick={() => setSelectedChar(c)}
            >
              <div className="char-avatar">{c.charAt(0).toUpperCase()}</div>
              <div className="char-name">{c}</div>
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
          <button onClick={addMod} disabled={!selectedChar}>+ Añadir Mod (ZIP/7z)</button>
        </div>
        {!selectedChar && <div className="empty-hint">Selecciona un personaje a la izquierda.</div>}
        {selectedChar && (
          <div className="mods-grid">
            {mods.map((m) => (
              <div key={m.folder} className="mod-card">
                <div className="mod-thumb" onClick={() => window.api.openFolder(selectedChar, m.folder)}>
                  {m.meta.image ? (
                    <img src={`file://${m.dir.replace(/\\/g, '/')}/${m.meta.image}`} />
                  ) : (
                    <div className="placeholder">Sin imagen</div>
                  )}
                </div>
                <div className="mod-info">
                  <div className="mod-name">{m.meta.name || m.folder}</div>
                  <div className="muted">v{m.meta.version || '—'} {m.meta.author ? `· ${m.meta.author}` : ''}</div>
                </div>
                <div className="mod-actions">
                  <button onClick={() => editMeta(m)}>Editar</button>
                  <button onClick={() => window.api.openModPage(selectedChar, m.folder)} disabled={!m.meta.pageUrl}>Página</button>
                  <button onClick={() => updateMod(m)} disabled={!m.meta.updateUrl}>Actualizar</button>
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
