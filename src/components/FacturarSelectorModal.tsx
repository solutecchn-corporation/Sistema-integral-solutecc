import React, { useState } from 'react'
import ZoomWrapper from './ZoomWrapper'

type Props = {
  open: boolean
  onClose: () => void
  doFacturaClienteFinal: (direccion: string) => void
  doFacturaClienteNormal: () => void
  doFacturaClienteJuridico: () => void
  carritoLength: number
  subtotal: number
  taxRate: number
  taxableSubtotal: number
}

export default function FacturarSelectorModal({ open, onClose, doFacturaClienteFinal, doFacturaClienteNormal, doFacturaClienteJuridico, carritoLength, subtotal, taxRate, taxableSubtotal }: Props) {
  const [direccionFinal, setDireccionFinal] = useState('')

  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <ZoomWrapper>
        <div style={{ width: 660, maxWidth: '95%', background: 'white', borderRadius: 12, padding: 20, boxShadow: '0 18px 50px rgba(2,6,23,0.35)', display: 'flex', gap: 16, alignItems: 'stretch' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Seleccionar tipo de cliente</h3>
            <button onClick={onClose} className="btn-opaque" style={{ padding: '6px 10px' }}>Cerrar</button>
          </div>

          {/* Input de dirección — aplica para Cliente Final */}
          <div style={{ marginTop: 10, marginBottom: 4 }}>
            <label style={{ fontSize: 13, color: '#334155', display: 'block', marginBottom: 4 }}>Dirección del cliente (opcional)</label>
            <input
              value={direccionFinal}
              onChange={e => setDireccionFinal(e.target.value)}
              placeholder="Ej: Col. Kennedy, Tegucigalpa"
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <div onClick={() => doFacturaClienteFinal(direccionFinal)} role="button" tabIndex={0} style={{ flex: 1, borderRadius: 10, padding: 14, cursor: 'pointer', boxShadow: '0 6px 18px rgba(2,6,23,0.08)', border: '1px solid #e6edf3', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 28 }}>👤</div>
              <div style={{ fontWeight: 700 }}>Cliente Final</div>
              <div style={{ color: '#64748b', fontSize: 13 }}>Consumidor final</div>
            </div>
            <div onClick={doFacturaClienteNormal} role="button" tabIndex={0} style={{ flex: 1, borderRadius: 10, padding: 14, cursor: 'pointer', boxShadow: '0 6px 18px rgba(2,6,23,0.08)', border: '1px solid #e6edf3', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 28 }}>🏷️</div>
              <div style={{ fontWeight: 700 }}>Cliente Normal</div>
              <div style={{ color: '#64748b', fontSize: 13 }}>Ingresar datos del cliente</div>
            </div>
            <div onClick={doFacturaClienteJuridico} role="button" tabIndex={0} style={{ flex: 1, borderRadius: 10, padding: 14, cursor: 'pointer', boxShadow: '0 6px 18px rgba(2,6,23,0.08)', border: '1px solid #e6edf3', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 28 }}>🏢</div>
              <div style={{ fontWeight: 700 }}>Cliente Jurídico</div>
              <div style={{ color: '#64748b', fontSize: 13 }}>Razón social / RTN</div>
            </div>
          </div>
        </div>
        </div>
      </ZoomWrapper>
    </div>
  )
}
