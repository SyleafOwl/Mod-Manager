import { useEffect, useRef, useState } from 'react'

// Modal to finalize adding a mod after copying the archive
// - Shows read-only archive file name (zip/7z)
// - Lets user enter Mod URL (pageUrl)
// - Lets user enter Image URL and preview it (no crop)
// - On save, writes preview image into mod folder and updates mod.json

type Props = {
  character: string
  archivePath: string // full selected path to the archive to copy on confirm
  archiveFileName: string // original archive filename with extension
  onClose: () => void
  onSaved?: () => void | Promise<void>
}

export default function AgregarMod({ character, archivePath, archiveFileName, onClose, onSaved }: Props) {
  const modalRef = useRef<HTMLDivElement | null>(null)
  const VIS_W = 360
  const VIS_H = 270

  const [pageUrl, setPageUrl] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imgOk, setImgOk] = useState(true)
  const [srcDataUrl, setSrcDataUrl] = useState<string>('')

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

  useEffect(() => {
    if (!imageUrl.trim()) { setSrcDataUrl(''); setImgOk(true) }
  }, [imageUrl])

  async function fetchPreviewFromUrl() {
    const u = imageUrl.trim()
    if (!u) { setSrcDataUrl(''); setImgOk(true); return }
    try {
      const data = await window.api.fetchImageDataUrl(u)
      setSrcDataUrl(data)
      setImgOk(true)
    } catch {
      setImgOk(false)
      setSrcDataUrl('')
    }
  }

  async function handleSave() {
    try {
      // Copy archive now and get the resulting mod folder name
      const { modName } = await window.api.copyArchiveToModFolder(character, archivePath)

      let imageRel: string | undefined
      if (srcDataUrl) {
        imageRel = await window.api.saveModImageFromDataUrl(character, modName, srcDataUrl)
      } else if (imageUrl.trim()) {
        imageRel = await window.api.saveModImageFromUrl(character, modName, imageUrl.trim())
      }
      // Also persist into DataBase JSON and save image as <Character>MOD<N>.*
      await window.api.addModEntryToDatabase(character, modName, {
        pageUrl: pageUrl.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        dataUrl: srcDataUrl || undefined,
      })
      await window.api.saveModMetadata(character, modName, {
        name: modName,
        pageUrl: pageUrl.trim() || undefined,
        image: imageRel || undefined,
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
          <div className="modal-title">Agregar Mod</div>
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
            <div className="muted" style={{ fontSize: 12, textAlign: 'center' }}>Sin recuadro: se muestra la imagen tal cual, ajustada al tamaño.</div>
          </div>

          {/* Archive name (read-only) */}
          <div className="field-row">
            <div className="label">Nombre del archivo</div>
            <input value={archiveFileName} readOnly />
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
          <div className="muted" style={{ fontSize: 12 }}>Pulsa Enter en el campo URL de Imagen para cargar la vista previa.</div>
          {!imgOk && imageUrl && (
            <div className="muted" style={{ color: '#d66', marginTop: 4 }}>No se pudo cargar la imagen desde la URL.</div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <button className="secondary" onClick={onClose}>Cancelar</button>
            <button onClick={handleSave}>Agregar Mod</button>
          </div>
        </div>
      </div>
    </div>
  )
}
