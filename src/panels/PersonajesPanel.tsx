import React from 'react'
import type { CharacterItem, CropMeta } from '../types'

type Props = {
  characters: CharacterItem[]
  selectedChar: string
  onSelectChar: (name: string) => void
  charImgSrcs: Record<string, string>
  charCrops: Record<string, CropMeta | undefined>
  onAdd: () => void
  onEdit: () => void
  onDelete: () => void
}

export default function PersonajesPanel({
  characters,
  selectedChar,
  onSelectChar,
  charImgSrcs,
  charCrops,
  onAdd,
  onEdit,
  onDelete,
}: Props) {
  return (
    <>
      <div className="panel-header subheader-left">
        <h2>Personajes</h2>
        <div className="spacer" />
        <button onClick={onAdd} title="Agregar personaje">+ Agregar</button>
        <button onClick={onEdit} title="Editar personaje">✎ Editar</button>
        <button className="danger" onClick={onDelete} title="Eliminar personaje" disabled={!selectedChar}>
          ✖ Eliminar
        </button>
      </div>

      <main className="characters-panel">
        <div className="characters-grid">
          {characters.map((c) => (
            <div
              key={c.name}
              className={`char-card ${c.name === selectedChar ? 'active' : ''}`}
              onClick={() => onSelectChar(c.name)}
            >
              {charImgSrcs[c.name] ? (
                (() => {
                  const crop = charCrops[c.name]
                  const baseStyle: React.CSSProperties = {
                    width: 'var(--char-thumb-width)',
                    height: 'var(--char-thumb-height)',
                    borderRadius: 0,
                    overflow: 'visible',
                    backgroundColor: '#0e1320',
                  }

                  if (crop && crop.originalWidth > 0 && crop.originalHeight > 0 && crop.width > 0 && crop.height > 0) {
                    const varW = getComputedStyle(document.documentElement).getPropertyValue('--char-thumb-width')
                    const varH = getComputedStyle(document.documentElement).getPropertyValue('--char-thumb-height')
                    const containerW = parseFloat(varW) || 180
                    const containerH = parseFloat(varH) || 135

                    const scaleX = containerW / crop.width
                    const scaleY = containerH / crop.height
                    const scale = Math.max(scaleX, scaleY) || 1

                    const bgW = crop.originalWidth * scale
                    const bgH = crop.originalHeight * scale

                    const cx = crop.x + crop.width / 2
                    const cy = crop.y + crop.height / 2
                    const posX = containerW / 2 - cx * scale
                    const posY = containerH / 2 - cy * scale

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

                  return (
                    <div
                      className="char-thumb"
                      style={{
                        ...baseStyle,
                        backgroundImage: `url(${charImgSrcs[c.name]})`,
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: 'cover',
                        backgroundPosition: '50% 50%',
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
    </>
  )
}
