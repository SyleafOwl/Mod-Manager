import React from 'react'

type Props = {
  modsRoot?: string
  showUpdatePanel: boolean
  onToggleUpdatePanel: () => void
  updatePanel: React.ReactNode
  onOpenConfig: () => void
  onPickRoot: () => void
}

export default function BarraSuperior({
  modsRoot,
  showUpdatePanel,
  onToggleUpdatePanel,
  updatePanel,
  onOpenConfig,
  onPickRoot,
}: Props) {
  return (
    <header className="header">
      <div className="title">Mod Manager by Syleaf</div>
      <div className="update-wrapper">
        <button onClick={onToggleUpdatePanel} title="Actualizar">↻ Actualizar</button>
        {showUpdatePanel && updatePanel}
      </div>
      <div className="update-wrapper">
        <button onClick={onOpenConfig} title="Configuración">⚙</button>
      </div>
      <div className="spacer" />
      <div className="root">
        <span className="label">Carpeta de mods:</span>
        <span className="path">{modsRoot || 'No seleccionada'}</span>
        <button onClick={onPickRoot}>Cambiar…</button>
      </div>
    </header>
  )
}
