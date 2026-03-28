import React, { useEffect, useRef, useState, type CSSProperties } from 'react'
import { FixedSizeList as List } from 'react-window'
import type { ModItem } from '../types'

type Props = {
  selectedChar: string
  mods: ModItem[]
  isLoadingMods: boolean
  modImgSrcs: Record<string, string>
  modInternalNames: Record<string, string>
  modPageUrls: Record<string, string>
  onAddMod: () => void
  onEditMeta: (mod: ModItem) => void
  onOpenFolder: (mod: ModItem) => void
  onToggleEnabled: (mod: ModItem) => void
  onRemoveMod: (mod: ModItem) => void
  onOpenModPage: (mod: ModItem) => void
  onPreview: (src: string) => void
  onInstalledMod?: () => void | Promise<void>
}

export default function ModsPanel({
  selectedChar,
  mods,
  isLoadingMods,
  modImgSrcs,
  modInternalNames,
  modPageUrls,
  onAddMod,
  onEditMeta,
  onOpenFolder,
  onToggleEnabled,
  onRemoveMod,
  onOpenModPage,
  onPreview,
  onInstalledMod,
}: Props) {
  const modsPanelRef = useRef<HTMLElement | null>(null)
  const [modsPanelDims, setModsPanelDims] = useState<{ width: number; height: number }>({ width: 360, height: 600 })
  const [isDragover, setIsDragover] = useState(false)
  const dragDepthRef = useRef(0)
  
  // Helper: format bytes to human-readable size
  const formatSize = (bytes?: number): string => {
    if (!bytes) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  
  // Helper: format timestamp to readable date
  const formatDate = (timestamp?: number): string => {
    if (!timestamp) return '-'
    return new Date(timestamp).toLocaleDateString('es-ES', { year: '2-digit', month: '2-digit', day: '2-digit' })
  }

  useEffect(() => {
    const el = modsPanelRef.current
    if (!el) return

    const update = () => {
      const cs = getComputedStyle(el)
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
      const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
      const width = Math.max(300, Math.floor(el.clientWidth - padX))
      const height = Math.max(300, Math.floor(el.clientHeight - padY))
      setModsPanelDims({ width, height })
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      try {
        ro.disconnect()
      } catch {}
    }
  }, [])

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

  const OuterContainer = React.forwardRef<HTMLDivElement, React.HTMLProps<HTMLDivElement>>((props, ref) => {
    const style: React.CSSProperties = { ...(props.style || {}), overflowX: 'hidden', overflowY: 'auto' }
    const className = ['mods-virtual-scroll', props.className].filter(Boolean).join(' ')
    return <div ref={ref} {...props} className={className} style={style} />
  })
  OuterContainer.displayName = 'OuterContainer'

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

    if (!selectedChar) {
      alert('Por favor selecciona un personaje primero')
      return
    }

    const dropped = extractDroppedFile(e)
    if (!dropped?.filePath) {
      alert('No se pudo leer la ruta del archivo. Prueba con + Agregar Mod > Buscar Archivo.')
      return
    }
    const fileName = dropped.fileName.toLowerCase()

    // Validate file extension
    if (!/\.(zip|7z|rar)$/.test(fileName)) {
      alert('Solo se aceptan archivos ZIP, 7z o RAR')
      return
    }

    try {
      // Install the mod from the dragged file
      const result = await window.api.installFromFile(selectedChar, dropped.filePath)
      console.log('Mod installed:', result)
      await onInstalledMod?.()
    } catch (err) {
      alert(`Error al instalar el mod: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <>
      <div className="panel-header subheader-right">
        <h3>Mods</h3>
        <div className="spacer" />
        <button onClick={onAddMod} disabled={!selectedChar}>
          + Agregar Mod (ZIP/7z/RAR)
        </button>
      </div>

      <section className="mods-panel" ref={modsPanelRef as any}>
        {!selectedChar && <div className="empty-hint">Selecciona un personaje a la izquierda.</div>}

        {selectedChar && (
          <div
            style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={isDragover ? 'mods-container-dragover' : ''}
          >
            {/* Drag & Drop overlay indicator */}
            {isDragover && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(76, 175, 80, 0.15)',
                border: '2px dashed #4CAF50',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
                pointerEvents: 'none',
                fontSize: '1.2rem',
                fontWeight: 'bold',
                color: '#4CAF50',
              }}>
                📦 Suelta aquí para instalar
              </div>
            )}

            {isLoadingMods && mods.length === 0 && (
              <div className="loading-state">
                <div className="spinner" />
                <div>Cargando mods…</div>
              </div>
            )}

            {mods.length > 0 && (
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <List
                  height={modsPanelDims.height}
                  width={modsPanelDims.width}
                  itemCount={mods.length}
                  itemSize={340}
                  outerElementType={OuterContainer}
                  className="mods-virtual-scroll"
                >
                  {({ index, style }: { index: number; style: CSSProperties }) => {
                    const m = mods[index]
                    const key = m.dir + '::' + m.folder
                    const src = modImgSrcs[key]
                    const url = modPageUrls[key]

                    return (
                      <div
                        style={{ ...style, padding: '0 0 0 0', display: 'flex', justifyContent: 'flex-start' }}
                        key={m.folder}
                      >
                        <div 
                          className="mod-card"
                          style={{
                            opacity: m.meta.enabled ? 1 : 0.55,
                            filter: m.meta.enabled ? 'none' : 'grayscale(30%)',
                          }}
                        >
                          <div
                            className="mod-thumb"
                            onClick={() => {
                              if (src) onPreview(src)
                            }}
                          >
                            {src ? (
                              <div
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  backgroundImage: `url(${src})`,
                                  backgroundRepeat: 'no-repeat',
                                  backgroundSize: 'cover',
                                  backgroundPosition: '50% 50%',
                                }}
                              />
                            ) : (
                              <div className="placeholder">Sin imagen</div>
                            )}
                          </div>

                          <div className="mod-info">
                            <div className="mod-name">{modInternalNames[key] || m.meta.name || m.folder}</div>
                            <div className="muted" title={m.folder}>
                              {m.folder}
                            </div>
                            {/* Size and Date Details */}
                            <div className="mod-details" style={{ marginTop: '0.3rem', fontSize: '0.8rem', color: 'var(--muted-color)' }}>
                              <span title="Tamaño del mod">📦 {formatSize(m.size)}</span>
                              <span style={{ marginLeft: '0.8rem' }} title="Fecha de modificación">📅 {formatDate(m.timestamp)}</span>
                            </div>
                            {url ? (
                              <a
                                href="#"
                                onClick={(e) => {
                                  e.preventDefault()
                                  onOpenModPage(m)
                                }}
                                title={url}
                              >
                                {url}
                              </a>
                            ) : (
                              <div className="muted">Sin URL</div>
                            )}
                          </div>

                          <div className="mod-actions">
                            <button onClick={() => onEditMeta(m)}>Editar</button>
                            <button onClick={() => onOpenFolder(m)}>Carpeta</button>
                            {m.meta.enabled ? (
                              <button onClick={() => onToggleEnabled(m)}>Desactivar</button>
                            ) : (
                              <button onClick={() => onToggleEnabled(m)}>Activar</button>
                            )}
                            <button className="danger" onClick={() => onRemoveMod(m)}>
                              Eliminar
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  }}
                </List>
              </div>
            )}

            {!isLoadingMods && mods.length === 0 && (
              <div
                className="empty-hint"
                style={{
                  border: '2px dashed #666',
                  borderRadius: 8,
                  padding: '20px',
                  margin: '10px',
                  background: isDragover ? 'rgba(76, 175, 80, 0.1)' : 'transparent',
                  borderColor: isDragover ? '#4CAF50' : '#666',
                }}
              >
                No hay mods para este personaje todavía.
                <br />
                Arrastra aqui el ZIP o usa + Agregar Mod.
              </div>
            )}
            {!isLoadingMods && mods.length > 0 && (
              <div className="muted" style={{ textAlign: 'center', padding: '8px 0 0 0', fontSize: 12 }}>
                Arrastra aqui el ZIP para instalar rapido o usa + Agregar Mod.
              </div>
            )}
          </div>
        )}
      </section>
    </>
  )
}
