import React, { useEffect, useState } from "react";
import supabase from "../../lib/supabaseClient";
import CaiEditModal from "../../components/CaiEditModal";
import CaiCreateModal from "../../components/CaiCreateModal";

type CaiRow = {
  id: number;
  cai: string;
  identificador?: string | null;
  rango_de: string | null;
  rango_hasta: string | null;
  fecha_vencimiento: string | null;
  secuencia_actual?: string | null;
  caja: number | null;
  cajero?: string | null;
  usuario_id?: number | null;
};

export default function CAIView() {
  const [rows, setRows] = useState<CaiRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cajeros, setCajeros] = useState<any[]>([]);

  const [modalRow, setModalRow] = useState<CaiRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  async function loadCais() {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("cai")
        .select(
          "id, cai, identificador, rango_de, rango_hasta, fecha_vencimiento, secuencia_actual, caja, cajero, usuario_id",
        )
        .order("id", { ascending: true });
      if (error) throw error;
      setRows(Array.isArray(data) ? (data as CaiRow[]) : []);
    } catch (err: any) {
      setError(err?.message || String(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadCajeros() {
    try {
      const { data } = await supabase
        .from("users")
        .select("id, username, nombre_usuario")
        .eq("role", "cajero")
        .order("username", { ascending: true });
      setCajeros(Array.isArray(data) ? data : []);
    } catch (err) {
      // ignore silently
    }
  }

  useEffect(() => {
    loadCais();
    loadCajeros();
  }, []);

  // compute assigned cajeros and cajas from current rows
  const assignedCajeros = new Set(
    rows.filter((r) => r.cajero).map((r) => String(r.cajero)),
  );
  const assignedCajas = new Set<number>(
    rows.filter((r) => r.caja != null).map((r) => Number(r.caja)),
  );

  function openEditModal(r: CaiRow) {
    setModalRow(r);
    setModalOpen(true);
    setError(null);
  }

  function closeModal() {
    setModalOpen(false);
    setModalRow(null);
  }

  async function handleModalSave(
    id: number,
    payload: {
      cai?: string | null;
      identificador?: string | null;
      secuencia_actual?: string | null;
      rango_de?: string | null;
      rango_hasta?: string | null;
      fecha_vencimiento?: string | null;
      caja?: number | null;
      cajero?: string | null;
      usuario_id?: number | null;
    },
  ) {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.from("cai").update(payload).eq("id", id);
      if (error) throw error;
      await loadCais();
    } catch (err: any) {
      setError(err?.message || String(err));
      throw err;
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 18 }}>
      <h2
        style={{
          marginTop: 0,
          fontWeight: 700,
          fontSize: "1.35rem",
          color: "#0f172a",
        }}
      >
        Gestión de CAI por Cajas
      </h2>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <button className="btn-opaque" onClick={() => loadCais()}>
          Recargar
        </button>
        <button
          onClick={() => setCreateOpen(true)}
          style={{
            padding: "8px 18px",
            background: "#1e40af",
            color: "white",
            border: "none",
            borderRadius: 7,
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
            marginLeft: 6,
          }}
        >
          + Agregar
        </button>
        <div style={{ marginLeft: "auto", color: "#64748b" }}>
          {loading ? "Cargando..." : `${rows.length} registros`}
        </div>
      </div>

      {error && <div style={{ color: "red", marginBottom: 12 }}>{error}</div>}

      <div
        style={{
          background: "#fff",
          padding: 12,
          borderRadius: 8,
          overflowX: "auto",
        }}
      >
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>CAI</th>
              <th>Identificador</th>
              <th>Rango Desde</th>
              <th>Rango Hasta</th>
              <th>Vencimiento</th>
              <th>Secuencia actual</th>
              <th>Cajero</th>
              <th>Usuario ID</th>
              <th>Caja</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ width: 80 }}>{r.id}</td>
                <td style={{ minWidth: 200 }}>{r.cai}</td>
                <td style={{ minWidth: 160 }}>{r.identificador ?? "-"}</td>
                <td>{r.rango_de}</td>
                <td>{r.rango_hasta}</td>
                <td>{r.fecha_vencimiento}</td>
                <td>{r.secuencia_actual ?? "-"}</td>
                <td style={{ minWidth: 180 }}>{r.cajero || "-"}</td>
                <td style={{ minWidth: 160 }}>{r.usuario_id ?? "-"}</td>
                <td style={{ width: 120 }}>{r.caja ?? "-"}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <>
                    <button
                      onClick={() => openEditModal(r)}
                      className="btn-opaque"
                      style={{ marginRight: 6 }}
                    >
                      Editar
                    </button>
                  </>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !loading && (
          <div style={{ padding: 12 }}>No se encontraron registros.</div>
        )}
      </div>
      {/* prepare available options for create */}
      <CaiEditModal
        open={modalOpen}
        onClose={closeModal}
        row={modalRow}
        cajeros={cajeros}
        availableCajeros={
          modalRow
            ? cajeros.filter(
                (c) =>
                  !assignedCajeros.has(c.username) ||
                  c.username === modalRow.cajero,
              )
            : cajeros.filter((c) => !assignedCajeros.has(c.username))
        }
        availableCajas={
          modalRow
            ? [1, 2, 3, 4, 5].filter(
                (n) => !assignedCajas.has(n) || n === modalRow.caja,
              )
            : [1, 2, 3, 4, 5].filter((n) => !assignedCajas.has(n))
        }
        onSave={handleModalSave}
      />
      <CaiCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        cajeros={cajeros}
        availableCajeros={cajeros.filter(
          (c) => !assignedCajeros.has(c.username),
        )}
        availableCajas={[1, 2, 3, 4, 5].filter((n) => !assignedCajas.has(n))}
        onCreate={async (payload) => {
          setLoading(true);
          setError(null);
          try {
            const { error } = await supabase.from("cai").insert(payload);
            if (error) throw error;
            await loadCais();
            setCreateOpen(false);
          } catch (err: any) {
            setError(err?.message || String(err));
            throw err;
          } finally {
            setLoading(false);
          }
        }}
      />
    </div>
  );
}
