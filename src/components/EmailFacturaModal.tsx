import React, { useState } from 'react'
import ZoomWrapper from './ZoomWrapper'

// URL del Google Apps Script desplegado (doPost)
// Cámbiala por la URL real de tu deployment en GAS
const GAS_EMAIL_URL = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GAS_EMAIL_URL) || ''

type Props = {
  open: boolean
  onClose: () => void
  initialEmail?: string
  htmlContent: string
  facturaNumero?: string
  docType?: 'factura' | 'cotizacion'
  onAfterSend?: () => Promise<void>
}

export default function EmailFacturaModal({
  open, onClose, initialEmail = '', htmlContent, facturaNumero = '', docType = 'factura', onAfterSend,
}: Props) {
  const [email, setEmail] = useState(initialEmail)
  const [subject, setSubject] = useState(
    docType === 'cotizacion'
      ? 'Cotización – SOLUCIONES TECNICAS CASTRO'
      : 'Factura de compra – SOLUCIONES TECNICAS CASTRO'
  )
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<'ok' | 'error' | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  // Sincroniza email inicial cuando cambia desde afuera
  React.useEffect(() => {
    if (open) {
      setEmail(initialEmail)
      setResult(null)
      setErrorMsg('')
      setSending(false)
    }
  }, [open, initialEmail])

  if (!open) return null

  const label = docType === 'cotizacion' ? 'cotización' : 'factura'
  const gasUrl = GAS_EMAIL_URL

  const handleSend = async () => {
    if (!email.trim()) { alert('Ingresa un correo electrónico'); return }
    if (!gasUrl) {
      alert('⚠️ No está configurada la URL del servicio de correo (VITE_GAS_EMAIL_URL). Configúrala en el archivo .env para usar esta función.')
      return
    }
    setSending(true)
    setResult(null)
    setErrorMsg('')
    try {
      // Siempre enviamos el HTML como fallback por si GAS no puede consultar la DB.
      // Si hay facturaNumero, GAS lo usa para consultar Supabase y construir un HTML
      // más actualizado; si la consulta falla, usa el htmlBody como respaldo.
      const bodyObj: any = {
        to: email.trim(),
        subject,
        htmlBody: htmlContent,   // fallback siempre presente
      }
      if (facturaNumero) {
        bodyObj.facturaNumero = facturaNumero
        bodyObj.type = docType
      }
      const body = JSON.stringify(bodyObj)
      const resp = await fetch(gasUrl, {
        method: 'POST',
        mode: 'no-cors',  // GAS require no-cors para evitar CORS preflight
        headers: { 'Content-Type': 'text/plain' },
        body,
      })
      // no-cors retorna opaque response (status 0), asumimos OK si no hay error de red
      setResult('ok')
      if (onAfterSend) {
        try { await onAfterSend() } catch (e) {}
      }
    } catch (e: any) {
      setResult('error')
      setErrorMsg(String(e?.message || e || 'Error desconocido'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 14000,
      }}
      onClick={onClose}
    >
      <ZoomWrapper>
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 400, background: 'white', borderRadius: 12, padding: 24,
            boxShadow: '0 18px 50px rgba(2,6,23,0.35)',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>📧 Enviar {label} por correo</h3>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#64748b' }}>✕</button>
          </div>

          {result === 'ok' ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 10 }}>✅</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#16a34a' }}>¡Correo enviado!</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>Se envió la {label} a <b>{email}</b></div>
              <button onClick={onClose} className="btn-opaque" style={{ marginTop: 16, background: '#0f172a', color: 'white', padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer' }}>
                Cerrar
              </button>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                  Correo del destinatario
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ejemplo@correo.com"
                  disabled={sending}
                  style={{
                    width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #d1d5db',
                    fontSize: 14, outline: 'none', boxSizing: 'border-box',
                    background: sending ? '#f9fafb' : 'white',
                  }}
                />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                  Asunto
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={sending}
                  style={{
                    width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #d1d5db',
                    fontSize: 14, outline: 'none', boxSizing: 'border-box',
                    background: sending ? '#f9fafb' : 'white',
                  }}
                />
              </div>

              {result === 'error' && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#b91c1c' }}>
                  ❌ Error al enviar: {errorMsg || 'Revisa la URL del servicio de correo (VITE_GAS_EMAIL_URL) en tu .env'}
                </div>
              )}

              {!gasUrl && (
                <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 11, color: '#92400e' }}>
                  ⚠️ <strong>VITE_GAS_EMAIL_URL</strong> no configurado. Despliega el <code>Code.gs</code> en Google Apps Script y agrega la URL a tu archivo <code>.env</code>.
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={onClose} className="btn-opaque" disabled={sending}
                  style={{ background: 'transparent', border: '1px solid #e6edf3', padding: '8px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#374151' }}>
                  Cancelar
                </button>
                <button onClick={handleSend} className="btn-opaque" disabled={sending || !email.trim()}
                  style={{
                    background: (!email.trim() || sending) ? '#94a3b8' : '#0ea5a4',
                    color: 'white', padding: '8px 18px', borderRadius: 8, border: 'none',
                    fontSize: 13, fontWeight: 600, cursor: sending || !email.trim() ? 'not-allowed' : 'pointer',
                  }}>
                  {sending ? '⏳ Enviando...' : '📤 Enviar'}
                </button>
              </div>
            </>
          )}
        </div>
      </ZoomWrapper>
    </div>
  )
}
