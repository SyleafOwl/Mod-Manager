import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import Actualizar from './modals/Actualizar'
import Configuracion from './modals/Configuracion'
import Agregar from './modals/Agregar'
import Editar from './modals/Editar'
import Eliminar from './modals/Eliminar'
import AgregarMod from './modals/AgregarMod'
import EliminarMod from './modals/EliminarMod'
import EditarMod from './modals/EditarMod'
import BarraSuperior from './panels/BarraSuperior'
import PersonajesPanel from './panels/PersonajesPanel'
import ModsPanel from './panels/ModsPanel'
import type { CharacterItem, CropMeta, ModItem } from './types'

type Settings = { modsRoot?: string; imagesRoot?: string }

function App() {
  const [settings, setSettings] = useState<Settings>({})
  const [characters, setCharacters] = useState<CharacterItem[]>([])
  const [selectedChar, setSelectedChar] = useState<string>('')
  const [mods, setMods] = useState<ModItem[]>([])
  const [isLoadingMods, setIsLoadingMods] = useState(false)
  const [modImgSrcs, setModImgSrcs] = useState<Record<string, string>>({})
  const [modInternalNames, setModInternalNames] = useState<Record<string, string>>({})
  const [modPageUrls, setModPageUrls] = useState<Record<string, string>>({})
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
  const [previewSrc, setPreviewSrc] = useState<string>('')
  const [showPreview, setShowPreview] = useState(false)
  const readyRef = useRef(false)
  const hasRoot = useMemo(() => !!settings.modsRoot, [settings])

  // In-memory per-character cache (no files, no extra processes)
  type CacheEntry = {
    mods: ModItem[]
    modImgSrcs: Record<string, string>
    modInternalNames: Record<string, string>
    modPageUrls: Record<string, string>
    ts: number
  }
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map())
  const MAX_CACHE = 5

  function applyCache(charName: string) {
    const entry = cacheRef.current.get(charName)
    if (!entry) return false
    setMods(entry.mods)
    setModImgSrcs(entry.modImgSrcs)
    setModInternalNames(entry.modInternalNames)
    setModPageUrls(entry.modPageUrls)
    // touch LRU timestamp
    entry.ts = Date.now()
    cacheRef.current.set(charName, entry)
    return true
  }

  function writeCache(charName: string, entry: Omit<CacheEntry, 'ts'>) {
    cacheRef.current.set(charName, { ...entry, ts: Date.now() })
    // Also persist to main process (survives app restart)
    window.api.setCachedMods(charName, entry.mods, {}, entry.modInternalNames).catch(() => {})
    // Enforce simple LRU by timestamp
    if (cacheRef.current.size > MAX_CACHE) {
      let oldestKey: string | null = null
      let oldestTs = Number.POSITIVE_INFINITY
      for (const [k, v] of cacheRef.current.entries()) {
        if (v.ts < oldestTs) { oldestTs = v.ts; oldestKey = k }
      }
      if (oldestKey) cacheRef.current.delete(oldestKey)
    }
  }

  useEffect(() => {
    window.api.getSettings().then((s) => setSettings(s))
  }, [])

  useEffect(() => {
    if (!hasRoot) return
    refreshCharacters()
  }, [hasRoot])

  useEffect(() => {
    if (!selectedChar || !hasRoot) return
    
    // Debounce: wait 300ms before loading to avoid multiple rapid loads
    if (charChangeTimeoutRef.current) {
      clearTimeout(charChangeTimeoutRef.current)
    }
    
    // If we have cache for this character, hydrate immediately to avoid blank flicker
    const hadCache = applyCache(selectedChar)
    if (!hadCache) {
      // No cache yet: clear to avoid showing stale data
      setMods([])
      setModImgSrcs({})
      setModInternalNames({})
      setModPageUrls({})
      setIsLoadingMods(true)
    }
    
    // Guard against race conditions: capture a load identifier
    const loadId = Date.now()
    charChangeTimeoutRef.current = setTimeout(async () => {
      await refreshMods(selectedChar, loadId)
    }, 300)
    
    return () => {
      if (charChangeTimeoutRef.current) {
        clearTimeout(charChangeTimeoutRef.current)
      }
    }
  }, [selectedChar, hasRoot])

  async function refreshCharacters() {
    const list = await window.api.listCharactersWithImages()
    setCharacters(list)
    if (list.length && !selectedChar) {
      setSelectedChar(list[0].name)
    }
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

  const latestLoadRef = useRef<number>(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const charChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  async function refreshMods(characterFolder: string, loadId?: number, forceFresh = false) {
    // Cancel previous load if still in progress
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()
    
    if (loadId) latestLoadRef.current = loadId
    
    // Try to load from persistent cache first (faster), unless a fresh scan was requested
    const cachedEntry = forceFresh ? null : await window.api.getCachedMods(characterFolder)
    if (!forceFresh && cachedEntry && cachedEntry.mods && cachedEntry.mods.length > 0) {
      if (loadId && loadId !== latestLoadRef.current) return
      // Use cached mod list instantly
      const list = cachedEntry.mods
      setMods(list)
      setModInternalNames(cachedEntry.modInternalNames)
      setIsLoadingMods(false)
      // Reload images in background without blocking UI
      setTimeout(async () => {
        if (loadId && loadId !== latestLoadRef.current) return
        const imgMap: Record<string, string> = {}
        const urlsMap: Record<string, string> = {}
        for (const m of list) {
          const key = m.dir + '::' + m.folder
          try {
            let src = ''
            if (!m.meta.image) {
              src = (await window.api.getModPreviewDataUrl(characterFolder, m.folder)) || ''
            } else {
              const abs = `${m.dir.replace(/\\\\/g, '/')}/${m.meta.image}`
              src = (await window.api.readImageAsDataUrl(abs)) || ''
            }
            if (src) imgMap[key] = src
          } catch {}
          try {
            const d = await window.api.getModData(characterFolder, m.folder)
            if (d?.pageUrl) urlsMap[key] = d.pageUrl
          } catch {}
        }
        if (loadId && loadId !== latestLoadRef.current) return
        setModImgSrcs((prev) => ({ ...prev, ...imgMap }))
        setModPageUrls((prev) => ({ ...prev, ...urlsMap }))
      }, 100)
      if (!readyRef.current) {
        try { window.api.notifyReady() } catch {}
        readyRef.current = true
      }
      return
    }
    
    const list = await window.api.listMods(characterFolder)
    // If another load started after this one, abort applying results
    if (loadId && loadId !== latestLoadRef.current) return
    // active mods first
    list.sort((a: any, b: any) => {
      const ae = a?.meta?.enabled ? 1 : 0
      const be = b?.meta?.enabled ? 1 : 0
      if (ae !== be) return be - ae
      return (a.folder || '').localeCompare(b.folder || '', undefined, { sensitivity: 'base' })
    })
    setMods(list)
    // Incremental loading with limited concurrency to reduce I/O spikes
    const CONCURRENCY = 4
    // Local maps so we can write cache at the end, while updating UI progressively
    const imgMap: Record<string, string> = {}
    const namesMap: Record<string, string> = {}
    const urlsMap: Record<string, string> = {}

    const tasks = list.map((m) => async () => {
      const key = m.dir + '::' + m.folder
      if (loadId && loadId !== latestLoadRef.current) return
      // 1) Preview image
      try {
        let dataUrl = ''
        if (!m.meta.image) {
          dataUrl = (await window.api.getModPreviewDataUrl(characterFolder, m.folder)) || ''
        } else {
          const abs = `${m.dir.replace(/\\/g, '/')}/${m.meta.image}`
          dataUrl = (await window.api.readImageAsDataUrl(abs)) || ''
        }
        if (dataUrl) {
          imgMap[key] = dataUrl
          if (!loadId || loadId === latestLoadRef.current) {
            setModImgSrcs((prev) => (prev[key] ? prev : { ...prev, [key]: dataUrl }))
          }
        }
      } catch {}
      if (loadId && loadId !== latestLoadRef.current) return
      // 2) Internal name
      try {
        const n = (await window.api.getPrimaryInternalName(characterFolder, m.folder)) || ''
        if (n) {
          namesMap[key] = n
          if (!loadId || loadId === latestLoadRef.current) {
            setModInternalNames((prev) => (prev[key] ? prev : { ...prev, [key]: n }))
          }
        }
      } catch {}
      if (loadId && loadId !== latestLoadRef.current) return
      // 3) Page URL
      try {
        const d = await window.api.getModData(characterFolder, m.folder)
        const url = d?.pageUrl || ''
        if (url) {
          urlsMap[key] = url
          if (!loadId || loadId === latestLoadRef.current) {
            setModPageUrls((prev) => (prev[key] ? prev : { ...prev, [key]: url }))
          }
        }
      } catch {}
    })

    async function runLimited(fns: Array<() => Promise<void>>, limit: number) {
      let idx = 0
      const workers = Array(Math.min(limit, fns.length)).fill(0).map(async () => {
        while (idx < fns.length) {
          const cur = idx++
          await fns[cur]()
        }
      })
      await Promise.all(workers)
    }

    await runLimited(tasks, CONCURRENCY)
    if (loadId && loadId !== latestLoadRef.current) return

    // Final cache write-through with full maps
    writeCache(characterFolder, {
      mods: list,
      modImgSrcs: { ...modImgSrcs, ...imgMap },
      modInternalNames: { ...modInternalNames, ...namesMap },
      modPageUrls: { ...modPageUrls, ...urlsMap },
    })
    if (!loadId || loadId === latestLoadRef.current) setIsLoadingMods(false)

    if (!readyRef.current) {
      try { window.api.notifyReady() } catch {}
      readyRef.current = true
    }
  }

  async function refreshAll() {
    const chars = await window.api.listCharactersWithImages()
    setCharacters(chars)
    // Purge cache entries for removed characters
    const valid = new Set(chars.map(c => c.name))
    for (const key of Array.from(cacheRef.current.keys())) {
      if (!valid.has(key)) cacheRef.current.delete(key)
    }
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
    if (cur) await refreshMods(cur, undefined, true)
    else { setMods([]); setModImgSrcs({}) }
  }

  async function pickRoot() {
    const folder = await window.api.selectFolder()
    if (!folder) return
    const s = await window.api.setModsRoot(folder)
    // Root changed => clear caches completely
    cacheRef.current.clear()
    setSettings(s)
  }

  async function addMod() {
    if (!selectedChar) return
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

  useEffect(() => {
    if (!hasRoot) return
    const debounced = debounce(() => { refreshAll() }, 400)
    const off = window.api.onFsChanged(() => debounced())
    return () => { try { off() } catch {} }
  }, [hasRoot, selectedChar])

  const header = (
    <BarraSuperior
      modsRoot={settings.modsRoot}
      showUpdatePanel={showUpdatePanel}
      onToggleUpdatePanel={() => setShowUpdatePanel((v) => !v)}
      updatePanel={(
        <Actualizar
          onAfterAction={refreshAll}
          onClose={() => setShowUpdatePanel(false)}
        />
      )}
      onOpenConfig={() => setShowConfig(true)}
      onPickRoot={pickRoot}
    />
  )

  if (!hasRoot) {
    return (
      <div className="empty" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <main className="center" style={{ width: 'min(520px, 92vw)', textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 12px 0' }}>Carpeta de Mods</h2>
          <p>Selecciona la carpeta donde guardas tus mods para empezar.</p>
          <button onClick={pickRoot}>Elegir</button>
        </main>
      </div>
    )
  }

  return (
    <div className="layout layout-2">
      {header}

      <PersonajesPanel
        characters={characters}
        selectedChar={selectedChar}
        onSelectChar={(name) => setSelectedChar(name)}
        charImgSrcs={charImgSrcs}
        charCrops={charCrops}
        onAdd={() => setShowAgregar(true)}
        onEdit={() => setShowEditar(true)}
        onDelete={() => setShowEliminar(true)}
      />

      <ModsPanel
        selectedChar={selectedChar}
        mods={mods}
        isLoadingMods={isLoadingMods}
        modImgSrcs={modImgSrcs}
        modInternalNames={modInternalNames}
        modPageUrls={modPageUrls}
        onAddMod={addMod}
        onEditMeta={editMeta}
        onOpenFolder={(m) => {
          if (!selectedChar) return
          window.api.openFolder(selectedChar, m.folder)
        }}
        onToggleEnabled={async (m) => {
          if (!selectedChar) return
          cacheRef.current.delete(selectedChar)
          if (m.meta.enabled) await window.api.disableMod(selectedChar, m.folder)
          else await window.api.enableMod(selectedChar, m.folder)
          await refreshMods(selectedChar, undefined, true)
        }}
        onRemoveMod={removeMod}
        onOpenModPage={(m) => {
          if (!selectedChar) return
          window.api.openModPage(selectedChar, m.folder)
        }}
        onPreview={(src) => {
          setPreviewSrc(src)
          setShowPreview(true)
        }}
        onInstalledMod={async () => {
          if (!selectedChar) return
          cacheRef.current.delete(selectedChar)
          await refreshMods(selectedChar, undefined, true)
        }}
      />

      {showConfig && (
        <Configuracion
          onClose={() => setShowConfig(false)}
          onSettingsChanged={async (s) => {
            const prevRoot = settings.modsRoot
            setSettings(s)
            if (s.modsRoot !== prevRoot) {
              cacheRef.current.clear()
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
            // Rename: move cache entry to new key if present
            const old = cacheRef.current.get(selectedChar)
            if (old) {
              cacheRef.current.delete(selectedChar)
              cacheRef.current.set(newName, { ...old, ts: Date.now() })
            }
            await refreshAll()
            setSelectedChar(newName)
          }}
        />
      )}
      {showAgregarMod && selectedChar && (
        <AgregarMod
          character={selectedChar}
          onClose={() => { setShowAgregarMod(false) }}
          onSaved={async () => {
            // Invalidate cache for this character and refresh
            cacheRef.current.delete(selectedChar)
            await refreshMods(selectedChar, undefined, true)
          }}
        />
      )}
      {showEliminarMod && selectedChar && modToDelete && (
        <EliminarMod
          character={selectedChar}
          modName={modToDelete}
          onClose={() => { setShowEliminarMod(false); setModToDelete('') }}
          onDeleted={async () => {
            cacheRef.current.delete(selectedChar)
            await refreshMods(selectedChar, undefined, true)
          }}
        />
      )}
      {showEditarMod && selectedChar && modToEdit && (
        <EditarMod
          character={selectedChar}
          mod={modToEdit as any}
          onClose={() => { setShowEditarMod(false); setModToEdit(null) }}
          onSaved={async () => {
            cacheRef.current.delete(selectedChar)
            await refreshMods(selectedChar, undefined, true)
          }}
        />
      )}
      {showEliminar && selectedChar && (
        <Eliminar
          character={selectedChar}
          onClose={() => setShowEliminar(false)}
          onDeleted={async () => {
            cacheRef.current.delete(selectedChar)
            await refreshAll()
          }}
        />
      )}
      {showPreview && (
        <div className="overlay" onClick={() => setShowPreview(false)}>
          <div className="preview-box" onClick={(e) => e.stopPropagation()}>
            {previewSrc ? (
              <>
                <img className="preview-img" src={previewSrc} alt="Vista previa" />
                <button className="preview-close" onClick={() => setShowPreview(false)}>×</button>
              </>
            ) : (
              <div className="placeholder">Sin imagen</div>
            )}
          </div>
        </div>
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

export default App
