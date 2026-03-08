import React, { useEffect, useState } from 'react';
import { formatMoney } from '../../lib/formatMoney';
import supabase from '../../lib/supabaseClient';
import ModalWrapper from '../../components/ModalWrapper';
import generateCotizacionHTML from '../../lib/cotizaconhtmlimp';

export default function Cotizaciones() {
  const [cotizaciones, setCotizaciones] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchText, setSearchText] = useState<string>('');

  const [openDetail, setOpenDetail] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [detalleItems, setDetalleItems] = useState<any[]>([]);

  const loadCotizaciones = async () => {
    setLoading(true);
    try {
      let q: any = supabase.from('cotizaciones').select('*').order('fecha_cotizacion', { ascending: false });

      if (startDate) {
        const startISO = new Date(startDate + 'T00:00:00').toISOString();
        q = q.gte('fecha_cotizacion', startISO);
      }
      if (endDate) {
        const endISO = new Date(endDate + 'T23:59:59').toISOString();
        q = q.lte('fecha_cotizacion', endISO);
      }

      const { data, error } = await q;
      if (error) throw error;

      let results = Array.isArray(data) ? data : [];

      // Resolve client names if cliente_id present
      const clienteIds = Array.from(new Set(results.map((r: any) => r.cliente_id).filter(Boolean)));
      let clienteMap: Record<string, string> = {};
      if (clienteIds.length > 0) {
        try {
          const { data: clientsData } = await supabase.from('clientes').select('id,nombre').in('id', clienteIds);
          if (Array.isArray(clientsData)) {
            for (const c of clientsData) clienteMap[String((c as any).id)] = (c as any).nombre || '';
          }
        } catch (e) {
          console.warn('Error cargando nombres de clientes para cotizaciones', e);
        }
      }

      results = results.map((r: any) => ({ ...r, cliente_nombre: clienteMap[String(r.cliente_id)] || r.cliente_nombre || null }));

      if (searchText && searchText.trim() !== '') {
        const st = searchText.trim().toLowerCase();
        results = results.filter(r => {
          const nro = (r.numero_cotizacion || r.numero || r.id || '') + '';
          const cliente = (r.cliente_nombre || r.cliente || '') + '';
          const obs = (r.observaciones || r.nota || '') + '';
          return (nro + ' ' + cliente + ' ' + obs).toLowerCase().includes(st);
        });
      }

      setCotizaciones(results);
    } catch (err) {
      console.error('Error loading cotizaciones', err);
      setCotizaciones([]);
    } finally {
      setLoading(false);
    }
  };

  const openCotizacionDetail = async (row: any) => {
    setSelected(row);
    setOpenDetail(true);
    try {
      const { data, error } = await supabase.from('cotizaciones_detalle').select('*').eq('cotizacion_id', row.id).order('id', { ascending: true });
      if (error) throw error;
      setDetalleItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error loading cotizaciones_detalle', err);
      setDetalleItems([]);
    }
  };

  async function printHtmlInHiddenIframe(html: string) {
    return new Promise<void>((resolve) => {
      try {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.top = '0';
        iframe.style.left = '0';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = '0';
        iframe.style.zIndex = '9999';
        iframe.style.backgroundColor = 'white';
        document.body.appendChild(iframe);
        const doc = iframe.contentWindow?.document;
        if (!doc) {
          resolve();
          return;
        }
        doc.open();
        doc.write(html);
        doc.close();
        const win = iframe.contentWindow as Window;
        setTimeout(() => {
          try {
            win.focus();
            win.print();
          } catch (e) {
            console.debug('print error', e);
          }
          setTimeout(() => {
            try { document.body.removeChild(iframe); } catch (e) {}
            resolve();
          }, 500);
        }, 500);
      } catch (e) {
        console.debug('printHtmlInHiddenIframe exception', e);
        resolve();
      }
    });
  }

  const reprintCotizacion = async () => {
    if (!selected) return;
    try {
      // ensure we have detalleItems
      let items = detalleItems;
      if (!items || items.length === 0) {
        const { data, error } = await supabase.from('cotizaciones_detalle').select('*').eq('cotizacion_id', selected.id);
        if (!error && Array.isArray(data)) items = data;
      }

      const carrito = (items || []).map((it: any) => {
        const nombre = it.producto_nombre || (it.producto && (it.producto.nombre || it.producto)) || it.nombre || '';
        const descripcion = it.descripcion || it.producto_descripcion || (it.producto && it.producto.descripcion) || '';
        const sku = it.sku || (it.producto && it.producto.sku) || '';
        const cantidad = Number(it.cantidad || it.cantidad_producto || 0);
        const precioUnit = Number(it.precio_unitario ?? it.precio ?? (it.producto && (it.producto.precio ?? it.producto.precio_unitario)) ?? 0);
        const subtotal = it.subtotal != null ? Number(it.subtotal) : Number(cantidad * precioUnit);
        return {
          producto: { nombre, descripcion, sku, precio: precioUnit },
          descripcion,
          sku,
          cantidad,
          precio: precioUnit,
          subtotal
        };
      });

      const subtotal = carrito.reduce((s: number, it: any) => s + (Number(it.subtotal || 0) || 0), 0);

      const params: any = {
        carrito,
        subtotal,
        total: Number(selected.total || selected.total_cotizacion || 0),
        descuento: Number(selected.descuento || 0),
      };

      const opts: any = {
        cotizacion: selected.numero_cotizacion || selected.numero || selected.id,
        cliente: selected.cliente_nombre || selected.cliente || '',
        identidad: selected.rtn || selected.identidad || ''
      };

      const html = await generateCotizacionHTML(opts, 'cotizacion', params);
      await printHtmlInHiddenIframe(html);
    } catch (e) {
      console.error('Error reimprimiendo cotización', e);
    }
  };

  useEffect(() => {
    loadCotizaciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, searchText]);

  // summary
  const totalCount = cotizaciones.length;
  const totalSum = cotizaciones.reduce((s, c) => s + (Number(c.total || 0) || 0), 0);
  const avg = totalCount > 0 ? totalSum / totalCount : 0;
  const estadoCounts = cotizaciones.reduce((acc: Record<string, number>, c: any) => {
    const e = (c.estado || 'desconocido').toString();
    acc[e] = (acc[e] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div style={{ padding: 18 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0 }}>Cotizaciones</h2>
          <div style={{ color: '#64748b', fontSize: 13 }}>Vista profesional (solo lectura) — cotizaciones y detalle</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-opaque" onClick={() => loadCotizaciones()}>Actualizar</button>
        </div>
      </header>

      <section style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
        <div>
          <label style={{ fontSize: 12, color: '#475569' }}>Fecha inicio</label>
          <input className="input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: '#475569' }}>Fecha fin</label>
          <input className="input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 12, color: '#475569' }}>Buscar</label>
          <input className="input" placeholder="Número, cliente o observaciones" value={searchText} onChange={e => setSearchText(e.target.value)} />
        </div>
      </section>

      <section style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{ background: 'white', padding: 12, borderRadius: 8, minWidth: 160 }}>
          <div style={{ color: '#475569', fontSize: 12 }}>Total cotizaciones</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{totalCount}</div>
        </div>
        <div style={{ background: 'white', padding: 12, borderRadius: 8, minWidth: 160 }}>
          <div style={{ color: '#475569', fontSize: 12 }}>Suma total</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>L {formatMoney(totalSum)}</div>
        </div>
        <div style={{ background: 'white', padding: 12, borderRadius: 8, minWidth: 160 }}>
          <div style={{ color: '#475569', fontSize: 12 }}>Promedio</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>L {formatMoney(avg)}</div>
        </div>
        <div style={{ background: 'white', padding: 12, borderRadius: 8, minWidth: 220 }}>
          <div style={{ color: '#475569', fontSize: 12 }}>Por estado</div>
          <div style={{ marginTop: 6 }}>
            {Object.keys(estadoCounts).length === 0 ? (
              <div style={{ color: '#94a3b8' }}>—</div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.entries(estadoCounts).map(([k, v]) => (
                  <div key={k} style={{ background: '#f1f5f9', padding: '6px 8px', borderRadius: 6, fontSize: 13 }}>
                    <strong style={{ marginRight: 6 }}>{k}:</strong> {v}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <div style={{ background: 'white', padding: 12, borderRadius: 8 }}>
        {loading ? (
          <div style={{ color: '#64748b' }}>Cargando...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                  <th style={{ padding: 10 }}>Número</th>
                  <th style={{ padding: 10 }}>Fecha cotización</th>
                  <th style={{ padding: 10 }}>Cliente</th>
                  <th style={{ padding: 10, textAlign: 'right' }}>Total</th>
                  <th style={{ padding: 10 }}>Estado</th>
                  <th style={{ padding: 10 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cotizaciones.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>No hay cotizaciones</td>
                  </tr>
                ) : cotizaciones.map((c: any) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: 10 }}>{c.numero_cotizacion || c.numero || c.id}</td>
                      <td style={{ padding: 10 }}>{c.fecha_cotizacion ? new Date(c.fecha_cotizacion).toLocaleString() : (c.fecha ? new Date(c.fecha).toLocaleString() : '')}</td>
                      <td style={{ padding: 10 }}>{c.cliente_nombre || c.cliente || ''}</td>
                    <td style={{ padding: 10, textAlign: 'right' }}>L {formatMoney(Number(c.total || 0))}</td>
                    <td style={{ padding: 10 }}>{c.estado || ''}</td>
                    <td style={{ padding: 10 }}>
                      <button className="btn-opaque" onClick={() => openCotizacionDetail(c)}>Ver detalle</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ModalWrapper open={openDetail} onClose={() => { setOpenDetail(false); setDetalleItems([]); setSelected(null); }} width={760}>
        <div style={{ padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ marginTop: 0 }}>Detalle cotización</h3>
            <div>
              <button className="btn-opaque" onClick={reprintCotizacion}>Reimprimir cotización</button>
            </div>
          </div>
          {selected ? (
            <div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                <div><strong>#:</strong> {selected.numero_cotizacion || selected.numero || selected.id}</div>
                <div><strong>Fecha:</strong> {selected.fecha_cotizacion ? new Date(selected.fecha_cotizacion).toLocaleString() : (selected.fecha ? new Date(selected.fecha).toLocaleString() : '')}</div>
                <div><strong>Cliente:</strong> {selected.cliente_nombre || selected.cliente || ''}</div>
                <div><strong>Total:</strong> L {formatMoney(Number(selected.total || 0))}</div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                      <th style={{ padding: 8 }}>Producto</th>
                      <th style={{ padding: 8 }}>Cantidad</th>
                      <th style={{ padding: 8 }}>Precio</th>
                      <th style={{ padding: 8, textAlign: 'right' }}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalleItems.length === 0 ? (
                      <tr><td colSpan={4} style={{ padding: 12, color: '#94a3b8' }}>No hay ítems</td></tr>
                    ) : detalleItems.map((it: any) => {
                      const nombre = it.producto_nombre || (it.producto && (it.producto.nombre || it.producto)) || it.nombre || '';
                      const descripcion = it.descripcion || it.producto_descripcion || (it.producto && (it.producto.descripcion || '')) || '';
                      const sku = it.sku || (it.producto && it.producto.sku) || '';
                      const cantidad = Number(it.cantidad || it.cantidad_producto || 0);
                      const precio = Number(it.precio_unitario ?? it.precio ?? (it.producto && (it.producto.precio ?? it.producto.precio_unitario)) ?? 0);
                      const subtotal = it.subtotal != null ? Number(it.subtotal) : Number(cantidad * precio);
                      return (
                        <tr key={it.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: 8 }}>
                            <div style={{ fontWeight: 600 }}>{nombre}</div>
                            {(descripcion || sku) ? (
                              <div style={{ fontSize: 12, color: '#64748b' }}>{descripcion}{descripcion && sku ? ' · ' : ''}{sku}</div>
                            ) : null}
                          </td>
                          <td style={{ padding: 8 }}>{cantidad}</td>
                          <td style={{ padding: 8 }}>L {formatMoney(precio)}</td>
                          <td style={{ padding: 8, textAlign: 'right' }}>L {formatMoney(subtotal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div style={{ color: '#64748b' }}>Cargando detalle...</div>
          )}
        </div>
      </ModalWrapper>
    </div>
  );
}
