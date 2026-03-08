import React, { useEffect, useState } from 'react';
import { formatMoney } from '../../lib/formatMoney';
import supabase from '../../lib/supabaseClient';
import useHondurasTime from '../../lib/useHondurasTime';

export default function MovimientosCaja() {
  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [usuarios, setUsuarios] = useState<string[]>([]);

  const [filterUsuario, setFilterUsuario] = useState<string>('');
  const [filterTipo, setFilterTipo] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const { hondurasNowISO } = useHondurasTime();

  const loadUsuarios = async () => {
    try {
      const { data, error } = await supabase
        .from('caja_movimientos')
        .select('usuario')
        .limit(1000);
      if (error) throw error;
      const list = Array.isArray(data) ? data.map((r: any) => r.usuario).filter(Boolean) : [];
      const uniq = Array.from(new Set(list)).slice(0, 200);
      setUsuarios(uniq as string[]);
    } catch (err) {
      console.debug('Error loading usuarios for movimientos', err);
      setUsuarios([]);
    }
  };

  const loadMovimientos = async () => {
    setLoading(true);
    try {
      // Only apply date filters server-side for performance; apply usuario/tipo filtering client-side
      let q: any = supabase.from('caja_movimientos').select('*').order('fecha', { ascending: false });

      if (startDate) {
        const startISO = new Date(startDate + 'T00:00:00').toISOString();
        q = q.gte('fecha', startISO);
      }
      if (endDate) {
        const endISO = new Date(endDate + 'T23:59:59').toISOString();
        q = q.lte('fecha', endISO);
      }

      const { data, error } = await q;
      if (error) throw error;

      let results = Array.isArray(data) ? data : [];

      // Cliente-side: filtrar por usuario (soporta `usuario` o `user`)
      if (filterUsuario) {
        const fu = filterUsuario.trim();
        results = results.filter(r => {
          const val = (r.usuario || r.user || '').toString().trim();
          return val === fu;
        });
      }

      // Cliente-side: filtrar por tipo (soporta `tipo_movimiento` o `tipo`, case-insensitive)
      if (filterTipo) {
        const ft = filterTipo.trim().toLowerCase();
        results = results.filter(r => {
          const val = (r.tipo_movimiento || r.tipo || '')?.toString().trim().toLowerCase();
          return val === ft;
        });
      }

      setMovimientos(results);
    } catch (err: any) {
      console.error('Error loading movimientos', err);
      setMovimientos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsuarios();
  }, []);

  useEffect(() => {
    loadMovimientos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterUsuario, filterTipo, startDate, endDate]);

  return (
    <div style={{ padding: 18 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0 }}>Movimientos de caja</h2>
          <div style={{ color: '#64748b', fontSize: 13 }}>Visualización de movimientos (solo lectura)</div>
        </div>
        <div>
          <button className="btn-opaque" onClick={() => loadMovimientos()}>Actualizar</button>
        </div>
      </header>

      <section style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
        <div>
          <label style={{ fontSize: 12, color: '#475569' }}>Usuario</label>
          <select className="input" value={filterUsuario} onChange={e => setFilterUsuario(e.target.value)}>
            <option value="">Todos</option>
            {usuarios.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, color: '#475569' }}>Tipo</label>
          <select className="input" value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
            <option value="">Todos</option>
            <option value="ingreso">Ingresos</option>
            <option value="egreso">Egresos</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, color: '#475569' }}>Fecha inicio</label>
          <input className="input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: '#475569' }}>Fecha fin</label>
          <input className="input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
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
                  <th style={{ padding: 10 }}>Concepto</th>
                  <th style={{ padding: 10 }}>Referencia</th>
                  <th style={{ padding: 10, textAlign: 'right' }}>Monto</th>
                  <th style={{ padding: 10 }}>Fecha</th>
                  <th style={{ padding: 10 }}>Usuario</th>
                  <th style={{ padding: 10 }}>Tipo</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>No hay movimientos</td>
                  </tr>
                ) : movimientos.map((m: any) => (
                  <tr key={m.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: 10 }}>{m.concepto || m.motivo || m.descripcion || ''}</td>
                    <td style={{ padding: 10 }}>{m.referencia || ''}</td>
                    <td style={{ padding: 10, textAlign: 'right' }}>L {formatMoney(Number(m.monto || 0))}</td>
                    <td style={{ padding: 10 }}>{m.fecha ? new Date(m.fecha).toLocaleString() : ''}</td>
                    <td style={{ padding: 10 }}>{m.usuario || m.user || ''}</td>
                    <td style={{ padding: 10 }}>{m.tipo_movimiento || m.tipo || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
