import { useEffect, useRef, useState } from 'react'

// Modal to finalize adding a mod after copying the archive
// - Shows read-only archive file name (zip/7z/rar)
// - Lets user enter Mod URL (pageUrl)
// - Lets user enter Image URL and preview it (no crop)
// - On save, writes preview image into mod folder and updates mod.json

type Props = {
  character: string
  archivePath?: string // full selected path to the archive to copy on confirm (optional at first)
  archiveFileName?: string // original archive filename with extension (optional at first)
  onClose: () => void
  onSaved?: () => void | Promise<void>
}

export default function AgregarMod({ character, archivePath: initialArchivePath, archiveFileName: initialArchiveFileName, onClose, onSaved }: Props) {
  const modalRef = useRef<HTMLDivElement | null>(null)
  const VIS_W = 360
  const VIS_H = 270

  // File selection state
  const [archivePath, setArchivePath] = useState(initialArchivePath || '')
  const [archiveFileName, setArchiveFileName] = useState(initialArchiveFileName || '')
  const [isDragover, setIsDragover] = useState(false)
  const dragDepthRef = useRef(0)

  // modName se obtiene solo al confirmar (después de copiar el archivo)
  const [internalName, setInternalName] = useState<string>('')
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
    const reset = () => {
      dragDepthRef.current = 0
      setIsDragover(false)
    }
    window.addEventListener('drop', reset, true)
    window.addEventListener('dragend', reset, true)
    return () => {
      window.removeEventListener('drop', reset, true)
      window.removeEventListener('dragend', reset, true)
    }
  }, [])

  useEffect(() => {
    if (!imageUrl.trim()) { setSrcDataUrl(''); setImgOk(true) }
  }, [imageUrl])

  // Al montar: solo inspeccionar el archivo original para prellenar nombre interno (sin copiar aún)
  useEffect(() => {
    if (!archivePath) return
    let cancelled = false
    async function peek() {
      try {
        const name = await window.api.peekPrimaryInternalName(archivePath)
        if (!cancelled && name) setInternalName(name)
      } catch {}
    }
    peek()
    return () => { cancelled = true }
  }, [archivePath])

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

  function extractDroppedFile(e: React.DragEvent<HTMLDivElement>): { filePath: string; fileName: string } | null {
    const files = e.dataTransfer?.files
    if (files && files.length > 0) {
      const f = files[0] as any
      if (typeof f?.path === 'string' && f.path.trim()) {
        return { filePath: f.path, fileName: f.name || '' }
      }
    }
    const items = e.dataTransfer?.items
    if (items && items.length > 0) {
      const f = items[0].getAsFile() as any
      if (f && typeof f?.path === 'string' && f.path.trim()) {
        return { filePath: f.path, fileName: f.name || '' }
      }
    }
    const maybeUri = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
    if (maybeUri && maybeUri.startsWith('file://')) {
      let decoded = decodeURI(maybeUri.split(/\r?\n/)[0].replace('file://', ''))
      if (/^\/[A-Za-z]:\//.test(decoded)) decoded = decoded.slice(1)
      decoded = decoded.replace(/\//g, '\\')
      const name = decoded.split(/[\\/]/).pop() || ''
      return { filePath: decoded, fileName: name }
    }
    return null
  }

  // Drag & Drop handlers
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepthRef.current += 1
    setIsDragover(true)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragover(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) {
      setIsDragover(false)
    }
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragover(false)

    const dropped = extractDroppedFile(e)
    if (!dropped?.filePath) {
      alert('No se pudo leer la ruta del archivo. Usa Buscar Archivo.')
      return
    }
    const fileName = dropped.fileName.toLowerCase()

    if (!/\.(zip|7z|rar)$/.test(fileName)) {
      alert('Solo se aceptan archivos ZIP, 7z o RAR')
      return
    }

    setArchivePath(dropped.filePath)
    setArchiveFileName(dropped.fileName)
  }

  // Abrirtexto diálogo de archivo
  const handleBrowseFile = async () => {
    const selected = await window.api.selectArchive()
    if (selected) {
      setArchivePath(selected)
      setArchiveFileName(selected.split(/[\\\/]/).pop() || 'mod.zip')
    }
  }

  // Reset selection
  const handleResetSelection = () => {
    setArchivePath('')
    setArchiveFileName('')
  }

  async function handleSave() {
    if (!archivePath) {
      alert('Selecciona un archivo ZIP, 7z o RAR primero.')
      return
    }
    try {
      // Convertir el archivo a carpeta de mod (confirmación explícita)
      const { modName } = await window.api.createModFromArchive(character, archivePath)
      // Guardar preview si se proporcionó
      if (srcDataUrl) {
        await window.api.saveModImageFromDataUrl(character, modName, srcDataUrl)
      } else if (imageUrl.trim()) {
        await window.api.saveModImageFromUrl(character, modName, imageUrl.trim())
      }
      // Escribir data.txt
      await window.api.setModData(character, modName, {
        pageUrl: pageUrl.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
      })
      // Renombrar interno si cambió (handler valida). En carpeta renombra la entrada principal.
      if (internalName.trim()) {
        try { await window.api.renamePrimaryInternal(character, modName, internalName.trim()) } catch {}
      }
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
          {/* PANTALLA 1: Seleccionar archivo */}
          {!archivePath ? (
            <div
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{
                padding: '2rem',
                textAlign: 'center',
                border: isDragover ? '2px dashed #4CAF50' : '2px dashed #666',
                borderRadius: '8px',
                backgroundColor: isDragover ? 'rgba(76, 175, 80, 0.1)' : 'transparent',
                transition: 'all 0.3s ease',
              }}
            >
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📦</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Arrastra un ZIP aquí</div>
              <div style={{ fontSize: '0.9rem', color: '#999', marginBottom: '1.5rem' }}>O usa el botón de abajo</div>
              
              <button 
                onClick={handleBrowseFile}
                style={{
                  padding: '0.6rem 1.2rem',
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                }}
              >
                🔍 Buscar Archivo
              </button>
              
              <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '1rem' }}>Soporta: ZIP, 7z, RAR</div>
            </div>
          ) : (
            <>
              {/* PANTALLA 2: Editar metadatos */}
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

          {/* Internal mod name (editable) */}
          <div className="field-row">
            <div className="label">Nombre del Mod</div>
            <input value={internalName} onChange={(e) => setInternalName(e.target.value)} placeholder="Carpeta o archivo principal dentro del archivo" />
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
            <button className="secondary" onClick={handleResetSelection}>⬅ Atrás</button>
            <button className="secondary" onClick={onClose}>Cancelar</button>
            <button onClick={handleSave}>Agregar Mod</button>
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
