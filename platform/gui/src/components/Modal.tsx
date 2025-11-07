import type { PropsWithChildren, ReactNode } from "react"

interface ModalProps {
  title: string
  subtitle?: ReactNode
  onClose: () => void
}

export function Modal({ title, subtitle, onClose, children }: PropsWithChildren<ModalProps>) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal">
        <header className="modal-header">
          <div>
            <h3>{title}</h3>
            {subtitle ? <div className="muted">{subtitle}</div> : null}
          </div>
          <button className="close-button" onClick={onClose} aria-label="Close details">
            ×
          </button>
        </header>
        <div className="modal-content">{children}</div>
      </div>
    </div>
  )
}
