import React from 'react'
import ZoomWrapper from './ZoomWrapper'
import ClienteSearchModal from './ClienteSearchModal'

type Props = {
  open: boolean
  onClose: () => void
  clienteTipo: 'final'|'normal'|'juridico'
  clienteRTN: string
  clienteNombre: string
  clienteTelefono: string
  clienteCorreo: string
  clienteExonerado: boolean
  clienteSearchOpen: boolean
  setClienteSearchOpen: (v: boolean) => void
  onRTNChange: (v: string) => void
  onNombreChange: (v: string) => void
  onTelefonoChange: (v: string) => void
  onCorreoChange: (v: string) => void
  onExoneradoChange: (v: boolean) => void
  onCreateCliente: () => void
  onCancel: () => void
  onOpenCreateCliente: () => void
  onOpenPayment: () => void
  paymentDone: boolean
  submitClienteNormal: () => Promise<void>
  clienteDireccion: string
  onDireccionChange: (v: string) => void
}

export default function ClienteNormalModal({ open, onClose, clienteTipo, clienteRTN, clienteNombre, clienteTelefono, clienteCorreo, clienteExonerado, clienteSearchOpen, setClienteSearchOpen, onRTNChange, onNombreChange, onTelefonoChange, onCorreoChange, onExoneradoChange, onCreateCliente, onCancel, onOpenCreateCliente, onOpenPayment, paymentDone, submitClienteNormal, clienteDireccion, onDireccionChange }: Props) {
  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <ZoomWrapper>
        <div style={{ width: 600, maxWidth: '95%', background: 'white', borderRadius: 12, padding: 20, boxShadow: '0 18px 50px rgba(2,6,23,0.35)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>{clienteTipo === 'juridico' ? 'Datos del Cliente (Jurídico)' : 'Datos del Cliente'}</h3>
          <button onClick={onClose} className="btn-opaque" style={{ padding: '6px 10px' }}>Cerrar</button>
        </div>

        <p style={{ color: '#475569', marginTop: 6 }}>{clienteTipo === 'juridico' ? 'Ingrese número de identificación (RTN) y razón social del cliente jurídico. Estos datos se incluirán en la factura.' : 'Ingrese número de identificación (RTN) y nombre completo del cliente. Estos datos se incluirán en la factura.'}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
          <label style={{ fontSize: 13, color: '#334155' }}>Dirección del cliente (opcional)</label>
          <input value={clienteDireccion} onChange={e => onDireccionChange(e.target.value)} placeholder="Dirección del cliente" style={{ padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, color: '#334155' }}>RTN o Identificación</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={clienteRTN} onChange={e => onRTNChange(e.target.value)} placeholder="00000000000000" style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }} />
              {clienteTipo === 'juridico' && (
                <button onClick={() => setClienteSearchOpen(true)} className="btn-opaque" style={{ padding: '8px 10px' }}>Buscar</button>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, color: '#334155' }}>{clienteTipo === 'juridico' ? 'Razón social' : 'Nombre completo'}</label>
            <input value={clienteNombre} onChange={e => onNombreChange(e.target.value)} placeholder={clienteTipo === 'juridico' ? 'Razón social de la empresa' : 'Nombre del cliente'} style={{ padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <ClienteSearchModal open={clienteSearchOpen} onClose={() => setClienteSearchOpen(false)} onSelect={(c: any) => {
            // llenar campos con cliente seleccionado
            try {
              if (c && typeof c === 'object') {
                const rtn = c.rtn || ''
                const nombre = c.nombre || ''
                const telefono = c.telefono || ''
                const correo = c.correo_electronico || ''
                const exo = Boolean((c as any).exonerado)
                try { onRTNChange(String(rtn || '')) } catch (e) {}
                try { onNombreChange(String(nombre || '')) } catch (e) {}
                try { onTelefonoChange(String(telefono || '')) } catch (e) {}
                try { onCorreoChange(String(correo || '')) } catch (e) {}
                try { onExoneradoChange(Boolean(exo)) } catch (e) {}
              }
            } catch (e) {}
            setClienteSearchOpen(false)
          }} />
          <button onClick={onCancel} className="btn-opaque" style={{ background: 'transparent', color: '#111' }}>Cancelar</button>
          <button onClick={onOpenCreateCliente} className="btn-opaque" style={{ background: 'transparent', color: '#0b5cff' }}>Crear cliente</button>
          {!paymentDone ? (
            <button onClick={onOpenPayment} className="btn-opaque" disabled={!clienteNombre || !clienteRTN} style={{ opacity: (!clienteNombre || !clienteRTN) ? 0.6 : 1 }}>Realizar pago</button>
          ) : (
            <button onClick={submitClienteNormal} className="btn-opaque" disabled={!clienteNombre || !clienteRTN} style={{ opacity: (!clienteNombre || !clienteRTN) ? 0.6 : 1 }}>Generar Factura</button>
          )}
        </div>
        </div>
      </ZoomWrapper>
    </div>
  )
}
