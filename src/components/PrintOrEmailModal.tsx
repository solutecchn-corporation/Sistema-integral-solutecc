import React from 'react'
import ZoomWrapper from './ZoomWrapper'

type Props = {
  open: boolean
  onClose: () => void
  onPrint: () => void
  onEmail: () => void
  docType?: 'factura' | 'cotizacion'
}

export default function PrintOrEmailModal({ open, onClose, onPrint, onEmail, docType = 'factura' }: Props) {
  if (!open) return null
  const label = docType === 'cotizacion' ? 'cotización' : 'factura'
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 13000,
      }}
      onClick={onClose}
    >
      <ZoomWrapper>
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 360, background: 'white', borderRadius: 12, padding: 24,
            boxShadow: '0 18px 50px rgba(2,6,23,0.35)',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>¿Cómo entregar la {label}?</h3>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#64748b' }}>✕</button>
          </div>

          {/* Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              onClick={onPrint}
              className="btn-opaque"
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: '#0f172a', color: 'white',
                padding: '14px 16px', borderRadius: 10, border: 'none',
                cursor: 'pointer', fontSize: 14, fontWeight: 600,
              }}
            >
              <span style={{ fontSize: 26 }}>🖨️</span>
              <div style={{ textAlign: 'left' }}>
                <div>Imprimir {label}</div>
                <div style={{ fontWeight: 400, fontSize: 11, opacity: 0.75, marginTop: 2 }}>Se abre ventana de impresión</div>
              </div>
            </button>

            <button
              onClick={onEmail}
              className="btn-opaque"
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: '#0ea5a4', color: 'white',
                padding: '14px 16px', borderRadius: 10, border: 'none',
                cursor: 'pointer', fontSize: 14, fontWeight: 600,
              }}
            >
              <span style={{ fontSize: 26 }}>📧</span>
              <div style={{ textAlign: 'left' }}>
                <div>Enviar por Correo</div>
                <div style={{ fontWeight: 400, fontSize: 11, opacity: 0.75, marginTop: 2 }}>Se envía como correo electrónico</div>
              </div>
            </button>
          </div>

          <button
            onClick={onClose}
            className="btn-opaque"
            style={{
              marginTop: 14, width: '100%', background: 'transparent',
              border: '1px solid #e6edf3', borderRadius: 8,
              padding: '8px', fontSize: 13, color: '#64748b', cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
        </div>
      </ZoomWrapper>
    </div>
  )
}
