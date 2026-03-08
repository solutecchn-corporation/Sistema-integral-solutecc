import React, { useEffect, useState } from 'react';
import { formatMoney } from '../../lib/formatMoney';
import supabase from '../../lib/supabaseClient';
import ModalWrapper from '../../components/ModalWrapper';
import Confirmado from '../../components/Confirmado';
import useHondurasTime from '../../lib/useHondurasTime';

export default function SesionesCaja() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterEstado, setFilterEstado] = useState<'todas'|'abierta'|'cerrada'>('todas');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const [openCreate, setOpenCreate] = useState(false);
  const [openClose, setOpenClose] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const [openDetail, setOpenDetail] = useState(false);

  const [montoInicial, setMontoInicial] = useState<number>(0);
  const [closeData, setCloseData] = useState<{ total_ingresos:number; total_egresos:number; saldo_final:number }>({ total_ingresos:0, total_egresos:0, saldo_final:0 });

  const [message, setMessage] = useState<string | null>(null);
  const { hondurasNowISO } = useHondurasTime();

  const loadSessions = async () => {
    setLoading(true);
    try {
      let q = supabase.from('caja_sesiones').select('*').order('fecha_apertura', { ascending: false });
      if (filterEstado !== 'todas') q = q.eq('estado', filterEstado);

      // startDate filters by fecha_apertura (from 00:00 of that day)
      if (startDate) {
        const startISO = new Date(startDate + 'T00:00:00').toISOString();
        q = q.gte('fecha_apertura', startISO);
      }

      // endDate filters by fecha_cierre (up to 23:59 of that day)
      if (endDate) {
        const endISO = new Date(endDate + 'T23:59:59').toISOString();
        q = q.lte('fecha_cierre', endISO);
      }

      const { data, error } = await q;
      if (error) throw error;
      setSessions(Array.isArray(data) ? data : []);
    } catch (err:any) {
      console.error('Error loading sessions', err);
      setMessage('Error cargando sesiones: ' + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterEstado, startDate, endDate]);

  const getUserName = () => {
    try {
      const raw = localStorage.getItem('user');
      const parsed = raw ? JSON.parse(raw) : null;
      return (
        parsed && (parsed.username || parsed.user?.username || parsed.name || parsed.user?.name)
      ) || 'admin';
    } catch (e) {
      return 'admin';
    }
  };

  const handleCreate = async () => {
    try {
      setMessage(null);
      const payload = {
        usuario: getUserName(),
        fecha_apertura: hondurasNowISO(),
        monto_inicial: Number(montoInicial || 0),
        total_ingresos: 0,
        total_egresos: 0,
        saldo_final: null,
        fecha_cierre: null,
        estado: 'abierta',
      };
      const { data, error } = await supabase.from('caja_sesiones').insert([payload]).select('*').single();
      if (error) throw error;
      setOpenCreate(false);
      setMontoInicial(0);
      setMessage('Sesión creada correctamente');
      await loadSessions();
    } catch (err:any) {
      console.error('Error creating session', err);
      setMessage('Error creando sesión: ' + (err.message || String(err)));
    }
  };

  const handleOpenCloseModal = (s:any) => {
    setSelectedSession(s);
    setCloseData({ total_ingresos: s.total_ingresos || 0, total_egresos: s.total_egresos || 0, saldo_final: s.saldo_final || 0 });
    setOpenClose(true);
  };

  const handleCloseSession = async () => {
    if (!selectedSession) return;
    try {
      setMessage(null);
      const payload = {
        ...closeData,
        fecha_cierre: hondurasNowISO(),
        estado: 'cerrada',
      };
      const { data, error } = await supabase.from('caja_sesiones').update(payload).eq('id', selectedSession.id).select('*').single();
      if (error) throw error;
      setOpenClose(false);
      setSelectedSession(null);
      setMessage('Sesión cerrada correctamente');
      await loadSessions();
    } catch (err:any) {
      console.error('Error closing session', err);
      setMessage('Error cerrando sesión: ' + (err.message || String(err)));
    }
  };

  return (
    <div style={{ padding: 18 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0 }}>Sesiones de caja</h2>
          <div style={{ color: '#64748b', fontSize: 13 }}>Gestión de aperturas y cierres de cajas</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Acciones de crear/cerrar sesiones deshabilitadas por política */}
          <button className="btn-opaque" onClick={() => loadSessions()}>Actualizar</button>
        </div>
      </header>

      <section style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
        <div>
          <label style={{ fontSize: 12, color: '#475569' }}>Estado</label>
          <select className="input" value={filterEstado} onChange={e => setFilterEstado(e.target.value as any)}>
            <option value="todas">Todas</option>
            <option value="abierta">Abierta</option>
            <option value="cerrada">Cerrada</option>
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
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
              <th style={{ padding: 10 }}>Usuario</th>
              <th style={{ padding: 10 }}>Apertura</th>
              <th style={{ padding: 10 }}>Cierre</th>
              <th style={{ padding: 10 }}>Estado</th>
              <th style={{ padding: 10, textAlign: 'right' }}>Diferencia</th>
              
            </tr>
          </thead>
          <tbody>
            {sessions.map(s => (
              <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={() => { setSelectedSession(s); setOpenDetail(true); }}>
                <td style={{ padding: 10 }}>{s.usuario}</td>
                <td style={{ padding: 10 }}>{s.fecha_apertura ? new Date(s.fecha_apertura).toLocaleString() : '-'}</td>
                <td style={{ padding: 10 }}>{s.fecha_cierre ? new Date(s.fecha_cierre).toLocaleString() : '-'}</td>
                <td style={{ padding: 10 }}>{s.estado}</td>
                <td style={{ padding: 10, textAlign: 'right' }}>{s.diferencia != null ? `L ${Number(s.diferencia).toFixed(2)}` : 'L 0.00'}</td>
                
              </tr>
            ))}
          </tbody>
        </table>

        {sessions.length === 0 && <div style={{ padding: 16, color: '#94a3b8' }}>No hay sesiones en este rango</div>}
      </div>

      <ModalWrapper open={openCreate} onClose={() => setOpenCreate(false)} width={520}>
        <h3 style={{ marginTop: 0 }}>Nueva sesión</h3>
        <div style={{ marginTop: 8 }}>
          <label style={{ display: 'block', fontSize: 13, color: '#475569' }}>Monto inicial</label>
          <input className="input" type="number" value={montoInicial} onChange={e => setMontoInicial(Number(e.target.value))} />
        </div>
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-opaque" onClick={() => setOpenCreate(false)}>Cancelar</button>
          <button className="btn-primary" onClick={handleCreate}>Crear sesión</button>
        </div>
      </ModalWrapper>

      <ModalWrapper open={openClose} onClose={() => setOpenClose(false)} width={600}>
        <h3 style={{ marginTop: 0 }}>Cerrar sesión</h3>
        {selectedSession && (
          <div>
            <div style={{ marginTop: 8 }}>
              <div><strong>Factura:</strong> Sesión #{selectedSession.id} — Usuario: {selectedSession.usuario}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#475569' }}>Total ingresos</label>
                <input className="input" type="number" value={closeData.total_ingresos} onChange={e => setCloseData(d => ({ ...d, total_ingresos: Number(e.target.value) }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#475569' }}>Total egresos</label>
                <input className="input" type="number" value={closeData.total_egresos} onChange={e => setCloseData(d => ({ ...d, total_egresos: Number(e.target.value) }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#475569' }}>Saldo final</label>
                <input className="input" type="number" value={closeData.saldo_final} onChange={e => setCloseData(d => ({ ...d, saldo_final: Number(e.target.value) }))} />
              </div>
            </div>

            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn-opaque" onClick={() => setOpenClose(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleCloseSession}>Confirmar cierre</button>
            </div>
          </div>
        )}
      </ModalWrapper>

      <ModalWrapper open={openDetail} onClose={() => setOpenDetail(false)} width={720}>
        {selectedSession ? (
          <div>
            <h3 style={{ marginTop: 0 }}>Detalle sesión #{selectedSession.id}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><strong>Usuario:</strong><br />{selectedSession.usuario}</div>
              <div><strong>Estado:</strong><br />{selectedSession.estado}</div>
              <div><strong>Fecha apertura:</strong><br />{selectedSession.fecha_apertura ? new Date(selectedSession.fecha_apertura).toLocaleString() : '-'}</div>
              <div><strong>Fecha cierre:</strong><br />{selectedSession.fecha_cierre ? new Date(selectedSession.fecha_cierre).toLocaleString() : '-'}</div>
              <div><strong>Monto inicial:</strong><br />L {formatMoney(Number(selectedSession.monto_inicial || 0))}</div>
              <div><strong>Total ingresos:</strong><br />L {formatMoney(Number(selectedSession.total_ingresos || 0))}</div>
              <div><strong>Total egresos:</strong><br />L {formatMoney(Number(selectedSession.total_egresos || 0))}</div>
              <div><strong>Saldo final:</strong><br />{selectedSession.saldo_final != null ? `L ${Number(selectedSession.saldo_final).toFixed(2)}` : '-'}</div>
              <div><strong>Efectivo obtenido:</strong><br />L {formatMoney(Number(selectedSession.efectivo_obtenido || 0))}</div>
              <div><strong>Dólares obtenido:</strong><br />L {formatMoney(Number(selectedSession.dolares_obtenido || 0))}</div>
              <div><strong>Tarjeta obtenido:</strong><br />L {formatMoney(Number(selectedSession.tarjeta_obtenido || 0))}</div>
              <div><strong>Transferencia obtenido:</strong><br />L {formatMoney(Number(selectedSession.transferencia_obtenido || 0))}</div>
              <div><strong>Efectivo registrado:</strong><br />L {formatMoney(Number(selectedSession.efectivo_registrado || 0))}</div>
              <div><strong>Dólares registrado:</strong><br />L {formatMoney(Number(selectedSession.dolares_registrado || 0))}</div>
              <div><strong>Tarjeta registrado:</strong><br />L {formatMoney(Number(selectedSession.tarjeta_registrado || 0))}</div>
              <div><strong>Transferencia registrado:</strong><br />L {formatMoney(Number(selectedSession.transferencia_registrado || 0))}</div>
              <div><strong>Diferencia:</strong><br />L {formatMoney(Number(selectedSession.diferencia || 0))}</div>
            </div>

            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn-opaque" onClick={() => setOpenDetail(false)}>Cerrar</button>
              {selectedSession.estado === 'abierta' && (
                <button className="btn-primary" onClick={() => { setOpenDetail(false); handleOpenCloseModal(selectedSession); }}>Cerrar sesión</button>
              )}
            </div>
          </div>
        ) : null}
      </ModalWrapper>

      <div style={{ marginTop: 12 }}>
        {message && <div style={{ color: message.startsWith('Error') ? '#ef4444' : '#10b981' }}>{message}</div>}
      </div>
    </div>
  );
}
