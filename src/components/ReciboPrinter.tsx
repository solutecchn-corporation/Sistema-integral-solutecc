import React from 'react'
import { formatMoney } from '../lib/formatMoney';
import getCompanyData from '../lib/getCompanyData'

export type MovimientoForPrint = {
  id?: number | string
  concepto: string
  referencia?: string | null
  monto: number
  fecha: string
  usuario?: string
  tipo?: string
}

export async function printMovimientoReceipt(m: MovimientoForPrint) {
  try {
    // Fetch company data to include on the receipt (if available)
    const company = await getCompanyData()
    const companyName = company?.nombre || company?.name || company?.razon_social || company?.empresa || ''
    const companyRtn = company?.rtn || company?.RTN || company?.rut || ''
    const companyEmail = company?.correo || company?.email || company?.mail || ''

    const style = `
      body{font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; color:#0f1724; padding:18px}
      .header{display:flex;flex-direction:column;align-items:center;margin-bottom:12px}
      .company{font-size:14px;font-weight:700}
      .meta{font-size:12px;color:#475569}
      .line{height:1px;background:#e6eef6;margin:12px 0}
      table{width:100%;border-collapse:collapse}
      td{padding:6px 0;font-size:14px}
      .right{text-align:right}
      .total{font-weight:700;font-size:16px}
    `

    const html = `
      <html>
        <head>
          <title>Recibo - ${m.concepto}</title>
          <meta charset="utf-8" />
          <style>${style}</style>
        </head>
        <body>
          <div class="header">
            <div class="company">${escapeHtml(String(companyName || ''))}</div>
            <div class="meta">RTN: ${escapeHtml(String(companyRtn || '-'))} ${companyEmail ? '• ' + escapeHtml(String(companyEmail)) : ''}</div>
            <div style="height:8px"></div>
            <div class="meta">${new Date(m.fecha).toLocaleString()}</div>
          </div>
          <div class="line"></div>
          <table>
            <tbody>
              <tr><td><strong>ID</strong></td><td class="right">${m.id ?? '-'}</td></tr>
              <tr><td><strong>Tipo</strong></td><td class="right">${m.tipo ?? '-'}</td></tr>
              <tr><td><strong>Concepto</strong></td><td class="right">${escapeHtml(String(m.concepto))}</td></tr>
              <tr><td><strong>Referencia</strong></td><td class="right">${escapeHtml(String(m.referencia ?? '-'))}</td></tr>
            </tbody>
          </table>
          <div class="line"></div>
          <table>
            <tr><td class="total">Total</td><td class="right total">L${formatMoney(Number(m.monto))}</td></tr>
          </table>
          <div style="height:22px"></div>
          <div style="font-size:12px;color:#64748b">Usuario: ${escapeHtml(String(m.usuario ?? '-'))}</div>
          <div style="height:8px"></div>
          <div style="font-size:12px;color:#94a3b8">Gracias por usar el sistema</div>
        </body>
      </html>
    `

    // Create hidden iframe to print without opening new tab
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.style.overflow = 'hidden'
    document.body.appendChild(iframe)

    const idoc = iframe.contentWindow?.document || iframe.contentDocument
    if (!idoc) {
      document.body.removeChild(iframe)
      throw new Error('No se pudo acceder al documento del iframe')
    }

    idoc.open()
    idoc.write(html)
    idoc.close()

    // Give browser a moment to render then call print on the iframe's window
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
      } catch (e) {
        console.warn('Error printing recibo via iframe', e)
      } finally {
        // remove iframe after a short delay to avoid interrupting print in some browsers
        setTimeout(() => {
          try { document.body.removeChild(iframe) } catch (e) { /* ignore */ }
        }, 1000)
      }
    }, 250)
  } catch (err) {
    console.error('printMovimientoReceipt error', err)
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'} as any)[c])
}

export default function ReciboPrinterPreview({ movimiento }: { movimiento: MovimientoForPrint }) {
  return (
    <div style={{ padding: 12, border: '1px solid #e6eef6', borderRadius: 8, background: '#fff' }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Recibo (vista previa)</div>
      <div style={{ fontSize: 13, color: '#475569' }}>{movimiento.concepto}</div>
      <div style={{ marginTop: 8 }}><strong>Total:</strong> L{formatMoney(movimiento.monto)}</div>
      <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>Usuario: {movimiento.usuario}</div>
    </div>
  )
}
