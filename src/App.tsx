import { useEffect, useMemo, useState } from 'react'
import './App.css'

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

type Settings = { modsRoot?: string }

function App() {
  const [settings, setSettings] = useState<Settings>({})
  const [characters, setCharacters] = useState<string[]>([])
  const [selectedChar, setSelectedChar] = useState<string>('')
  const [mods, setMods] = useState<ModItem[]>([])
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

  async function pickRoot() {
    const folder = await window.api.selectFolder()
    if (!folder) return
    const s = await window.api.setModsRoot(folder)
    setSettings(s)
  }

  async function addCharacter() {
    const name = prompt('Nombre del personaje:')?.trim()
    if (!name) return
    await window.api.addCharacter(name)
    await refreshCharacters()
    setSelectedChar(name)
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

  const header = (
    <header className="header">
      <div className="title">ZZZ Mod Manager</div>
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
    <div className="layout">
      {header}
      <aside className="sidebar">
        <div className="sidebar-header">
          <span>Personajes</span>
          <button onClick={addCharacter}>+ Añadir</button>
        </div>
        <ul className="char-list">
          {characters.map((c) => (
            <li key={c} className={c === selectedChar ? 'active' : ''} onClick={() => setSelectedChar(c)}>
              {c}
            </li>
          ))}
        </ul>
        <div className="sidebar-actions">
          <button onClick={() => window.api.openFolder(selectedChar)}>Abrir carpeta del personaje</button>
        </div>
      </aside>
      <main className="content">
        <div className="toolbar">
          <h2>{selectedChar}</h2>
          <div className="spacer" />
          <button onClick={addMod}>+ Añadir mod (ZIP/7z)</button>
        </div>
        <div className="mods-grid">
          {mods.map((m) => (
            <div key={m.folder} className="mod-card">
              <div className="mod-thumb" onClick={() => window.api.openFolder(selectedChar, m.folder)}>
                {m.meta.image ? (
                  // Render via file:// path
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
      </main>
    </div>
  )
}

export default App
