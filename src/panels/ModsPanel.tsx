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
}: Props) {
  const modsPanelRef = useRef<HTMLElement | null>(null)
  const [modsPanelDims, setModsPanelDims] = useState<{ width: number; height: number }>({ width: 360, height: 600 })

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

  const OuterContainer = React.forwardRef<HTMLDivElement, React.HTMLProps<HTMLDivElement>>((props, ref) => {
    const style: React.CSSProperties = { ...(props.style || {}), overflowX: 'hidden', overflowY: 'auto' }
    const className = ['mods-virtual-scroll', props.className].filter(Boolean).join(' ')
    return <div ref={ref} {...props} className={className} style={style} />
  })
  OuterContainer.displayName = 'OuterContainer'

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
          <div style={{ width: '100%', height: '100%' }}>
            {isLoadingMods && mods.length === 0 && (
              <div className="loading-state">
                <div className="spinner" />
                <div>Cargando mods…</div>
              </div>
            )}

            {mods.length > 0 && (
              <List
                height={modsPanelDims.height}
                width={modsPanelDims.width}
                itemCount={mods.length}
                itemSize={320}
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
                      <div className="mod-card">
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
            )}

            {!isLoadingMods && mods.length === 0 && <div className="empty-hint">No hay mods para este personaje todavía.</div>}
          </div>
        )}
      </section>
    </>
  )
}
