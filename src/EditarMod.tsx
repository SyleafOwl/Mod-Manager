import { useEffect, useMemo, useRef, useState } from 'react'

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

type Props = {
  character: string
  mod: ModItem
  onClose: () => void
  onSaved?: () => void | Promise<void>
}

export default function EditarMod({ character, mod, onClose, onSaved }: Props) {
  const modalRef = useRef<HTMLDivElement | null>(null)
  const VIS_W = 360
  const VIS_H = 270

  // Display-only base info
  const fileName = useMemo(() => {
    // Try to find a copied archive name inside the mod folder based on common extensions
    // If not available, show the folder name as a fallback
    try {
      // We cannot read the directory directly from the renderer; show folder as a stable fallback
      return mod.folder
    } catch {
      return mod.folder
    }
  }, [mod.folder])

  const [pageUrl, setPageUrl] = useState(mod.meta.pageUrl || '')
  const [imageUrl, setImageUrl] = useState('')
  const [imgOk, setImgOk] = useState(true)
  const [srcDataUrl, setSrcDataUrl] = useState<string>('')
  const [previewFromUrl, setPreviewFromUrl] = useState(false)

  // Load existing preview image from disk if present
  useEffect(() => {
    let cancelled = false
    async function loadImage() {
      const rel = mod.meta.image
      if (!rel) { setSrcDataUrl(''); return }
      try {
        const abs = `${mod.dir.replace(/\\/g, '/')}/${rel}`
        const data = await window.api.readImageAsDataUrl(abs)
        if (!cancelled && data) setSrcDataUrl(data)
      } catch {
        if (!cancelled) setSrcDataUrl('')
      }
    }
    loadImage()
    return () => { cancelled = true }
  }, [mod.dir, mod.meta.image])

  // Load imageUrl (and optionally pageUrl) from the character DataBase JSON if present
  useEffect(() => {
    let cancelled = false
    async function loadDb() {
      try {
        const entry = await window.api.getModEntryFromDatabase(character, mod.folder)
        if (cancelled) return
        if (entry?.imageUrl) setImageUrl((prev) => prev || entry.imageUrl || '')
        if (!pageUrl && entry?.pageUrl) setPageUrl(entry.pageUrl)
      } catch {}
    }
    loadDb()
    return () => { cancelled = true }
  }, [character, mod.folder])

  // Dismiss when clicking outside or pressing Esc
  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      const el = e.target as HTMLElement
      if (!modalRef.current) return
      if (!modalRef.current.contains(el)) onClose()
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDocDown); document.removeEventListener('keydown', onKey) }
  }, [onClose])

  // Fetch and preview new image from URL on Enter
  async function fetchPreviewFromUrl() {
    const u = imageUrl.trim()
    if (!u) { setImgOk(true); return }
    try {
      const data = await window.api.fetchImageDataUrl(u)
      setSrcDataUrl(data)
      setImgOk(true)
      setPreviewFromUrl(true)
    } catch {
      setImgOk(false)
    }
  }

  async function handleSave() {
    try {
      let imageRel: string | undefined
      if (previewFromUrl && srcDataUrl) {
        // Save the preview we just fetched as the mod preview image
        imageRel = await window.api.saveModImageFromDataUrl(character, mod.folder, srcDataUrl)
      } else if (imageUrl.trim()) {
        imageRel = await window.api.saveModImageFromUrl(character, mod.folder, imageUrl.trim())
      }

      await window.api.saveModMetadata(character, mod.folder, {
        name: mod.folder,
        pageUrl: pageUrl.trim() || undefined,
        // If a new image was saved, update the meta.image reference
        image: imageRel || mod.meta.image || undefined,
      })
      // Keep the character DataBase (<Personaje>.txt mods[]) in sync for this mod entry
      await window.api.updateModEntryInDatabase(character, mod.folder, {
        pageUrl: pageUrl.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
      })
      await onSaved?.()
    } finally {
      onClose()
    }
  }

  return (
    <div className="overlay">
      <div ref={modalRef} className="modal">
        <div className="modal-header">
          <div className="modal-title">Editar Mod</div>
          <button className="icon" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {/* Image preview (no crop) */}
          <div style={{ display: 'grid', gap: 8, justifyItems: 'center' }}>
            <div style={{
              width: VIS_W,
              height: VIS_H,
              maxWidth: 'min(90vw, 420px)',
              maxHeight: 'min(60vh, 320px)',
              position: 'relative',
              background: '#12100b',
              borderRadius: 8,
              overflow: 'hidden',
              border: '1px solid #3333',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              {srcDataUrl ? (
                <img src={srcDataUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <div style={{ color: '#999' }}>Vista previa</div>
              )}
            </div>
            <div className="muted" style={{ fontSize: 12, textAlign: 'center' }}>Vista previa sin recorte (se ajusta al contenedor).</div>
          </div>

          {/* File name (read-only). Using folder name as stable fallback. */}
          <div className="field-row">
            <div className="label">Nombre del archivo</div>
            <input value={fileName} readOnly />
          </div>

          {/* Mod URL */}
          <div className="field-row">
            <div className="label">URL del Mod</div>
            <input
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          {/* Image URL */}
          <div className="field-row">
            <div className="label">URL de Imagen</div>
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') fetchPreviewFromUrl() }}
              placeholder="https://.../preview.png"
              className="input-url"
            />
          </div>
          <div className="muted" style={{ fontSize: 12 }}>Pulsa Enter en URL de Imagen para cargar la vista previa.</div>
          {!imgOk && imageUrl && (
            <div className="muted" style={{ color: '#d66', marginTop: 4 }}>No se pudo cargar la imagen desde la URL.</div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <button className="secondary" onClick={onClose}>Cancelar</button>
            <button onClick={handleSave}>Editar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
