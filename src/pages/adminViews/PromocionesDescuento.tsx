import React, { useEffect, useState, useCallback } from "react";
import supabase from "../../lib/supabaseClient";

// ─── Tipos ───────────────────────────────────────────────────────────────────
type Porcentaje = {
  id: number;
  porcentaje: number;
  etiqueta: string | null;
  activo: boolean;
};

type Promocion = {
  id: number;
  nombre: string;
  categoria: string;
  porcentaje_descuento: number;
  fecha_inicio: string;
  fecha_fin: string;
  activo: boolean;
  created_at?: string;
};

const BLANK_PROMO: Omit<Promocion, "id" | "created_at"> = {
  nombre: "",
  categoria: "",
  porcentaje_descuento: 10,
  fecha_inicio: new Date().toISOString().slice(0, 10),
  fecha_fin: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  activo: true,
};

// ─── Estilos reutilizables ────────────────────────────────────────────────────
const TH: React.CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
  fontWeight: 700,
  fontSize: 12,
  color: "#374151",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  background: "#f8fafc",
  borderBottom: "2px solid #e2e8f0",
  whiteSpace: "nowrap",
};
const TD: React.CSSProperties = {
  padding: "11px 14px",
  fontSize: 13,
  color: "#1e293b",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "middle",
};
const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "8px 11px",
  border: "1px solid #cbd5e1",
  borderRadius: 7,
  fontSize: 13,
  boxSizing: "border-box",
};
const LABEL: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 4,
};

// ─── Componente principal ─────────────────────────────────────────────────────
export default function PromocionesDescuento() {
  const [porcentajes, setPorcentajes] = useState<Porcentaje[]>([]);
  const [promociones, setPromociones] = useState<Promocion[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  // Estado del formulario de nueva/editar promoción
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] =
    useState<Omit<Promocion, "id" | "created_at">>(BLANK_PROMO);

  // Estado para editar un porcentaje
  const [editPct, setEditPct] = useState<{ id: number; val: string } | null>(
    null,
  );
  const [newPctVal, setNewPctVal] = useState("");

  const today = new Date().toISOString().slice(0, 10);

  // ── Carga de datos ─────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: pcts }, { data: promos }, { data: inv }] =
        await Promise.all([
          supabase
            .from("descuentos_porcentajes")
            .select("*")
            .order("porcentaje"),
          supabase
            .from("promociones_descuento")
            .select("*")
            .order("fecha_inicio", { ascending: false }),
          supabase.from("inventario").select("categoria").order("categoria"),
        ]);
      setPorcentajes(Array.isArray(pcts) ? pcts : []);
      setPromociones(Array.isArray(promos) ? promos : []);
      // Categorías únicas
      const cats = Array.from(
        new Set((inv || []).map((r: any) => r.categoria).filter(Boolean)),
      ) as string[];
      setCategorias(cats.sort());
    } catch (err: any) {
      showMsg("err", "Error cargando datos: " + (err.message || err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const showMsg = (type: "ok" | "err", text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3500);
  };

  // ── CRUD Porcentajes ───────────────────────────────────────────────────────
  const handleAddPct = async () => {
    const val = parseFloat(newPctVal);
    if (isNaN(val) || val <= 0 || val > 100) {
      showMsg("err", "Ingresa un porcentaje válido (1–100)");
      return;
    }
    const { error } = await supabase.from("descuentos_porcentajes").insert({
      porcentaje: val,
      etiqueta: `${val}%`,
      activo: true,
    });
    if (error) {
      showMsg("err", error.message);
      return;
    }
    setNewPctVal("");
    showMsg("ok", `Descuento ${val}% agregado`);
    loadAll();
  };

  const handleSavePct = async (id: number, val: string) => {
    const num = parseFloat(val);
    if (isNaN(num) || num <= 0 || num > 100) {
      showMsg("err", "Valor inválido");
      return;
    }
    const { error } = await supabase
      .from("descuentos_porcentajes")
      .update({ porcentaje: num, etiqueta: `${num}%` })
      .eq("id", id);
    if (error) {
      showMsg("err", error.message);
      return;
    }
    setEditPct(null);
    showMsg("ok", "Guardado");
    loadAll();
  };

  const handleTogglePct = async (p: Porcentaje) => {
    const { error } = await supabase
      .from("descuentos_porcentajes")
      .update({ activo: !p.activo })
      .eq("id", p.id);
    if (error) {
      showMsg("err", error.message);
      return;
    }
    loadAll();
  };

  const handleDeletePct = async (id: number) => {
    if (!window.confirm("¿Eliminar este porcentaje?")) return;
    const { error } = await supabase
      .from("descuentos_porcentajes")
      .delete()
      .eq("id", id);
    if (error) {
      showMsg("err", error.message);
      return;
    }
    showMsg("ok", "Eliminado");
    loadAll();
  };

  // ── CRUD Promociones ───────────────────────────────────────────────────────
  const openNew = () => {
    setEditingId(null);
    setForm({ ...BLANK_PROMO });
    setFormOpen(true);
  };

  const openEdit = (promo: Promocion) => {
    setEditingId(promo.id);
    setForm({
      nombre: promo.nombre,
      categoria: promo.categoria,
      porcentaje_descuento: promo.porcentaje_descuento,
      fecha_inicio: promo.fecha_inicio,
      fecha_fin: promo.fecha_fin,
      activo: promo.activo,
    });
    setFormOpen(true);
  };

  const handleSavePromo = async () => {
    if (!form.nombre.trim()) {
      showMsg("err", "Nombre es obligatorio");
      return;
    }
    if (!form.categoria) {
      showMsg("err", "Selecciona una categoría");
      return;
    }
    if (!form.fecha_inicio || !form.fecha_fin) {
      showMsg("err", "Las fechas son obligatorias");
      return;
    }
    if (form.fecha_inicio > form.fecha_fin) {
      showMsg("err", "Fecha inicio no puede ser mayor a fecha fin");
      return;
    }

    const payload = {
      nombre: form.nombre.trim(),
      categoria: form.categoria,
      porcentaje_descuento: form.porcentaje_descuento,
      fecha_inicio: form.fecha_inicio,
      fecha_fin: form.fecha_fin,
      activo: form.activo,
      updated_at: new Date().toISOString(),
    };

    const { error } = editingId
      ? await supabase
          .from("promociones_descuento")
          .update(payload)
          .eq("id", editingId)
      : await supabase.from("promociones_descuento").insert(payload);

    if (error) {
      showMsg("err", error.message);
      return;
    }
    showMsg("ok", editingId ? "Promoción actualizada" : "Promoción creada");
    setFormOpen(false);
    loadAll();
  };

  const handleDeletePromo = async (id: number) => {
    if (!window.confirm("¿Eliminar esta promoción?")) return;
    const { error } = await supabase
      .from("promociones_descuento")
      .delete()
      .eq("id", id);
    if (error) {
      showMsg("err", error.message);
      return;
    }
    showMsg("ok", "Eliminada");
    loadAll();
  };

  const handleTogglePromo = async (p: Promocion) => {
    const { error } = await supabase
      .from("promociones_descuento")
      .update({ activo: !p.activo, updated_at: new Date().toISOString() })
      .eq("id", p.id);
    if (error) {
      showMsg("err", error.message);
      return;
    }
    loadAll();
  };

  // Promociones activas hoy
  const activeToday = promociones.filter(
    (p) => p.activo && p.fecha_inicio <= today && p.fecha_fin >= today,
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2
          style={{
            margin: 0,
            fontSize: "1.4rem",
            fontWeight: 700,
            color: "#0f172a",
          }}
        >
          🏷️ Configuración de Promociones
        </h2>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
          Programa descuentos por categoría y gestiona los porcentajes
          disponibles en punto de venta.
        </p>
      </div>

      {/* Mensaje */}
      {msg && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 13,
            fontWeight: 600,
            background: msg.type === "ok" ? "#dcfce7" : "#fee2e2",
            color: msg.type === "ok" ? "#166534" : "#991b1b",
            border: `1px solid ${msg.type === "ok" ? "#bbf7d0" : "#fecaca"}`,
          }}
        >
          {msg.type === "ok" ? "✅ " : "❌ "}
          {msg.text}
        </div>
      )}

      {/* ── Sección: Descuentos activos hoy ── */}
      {activeToday.length > 0 && (
        <div
          style={{
            background: "#fffbeb",
            border: "2px solid #fde68a",
            borderRadius: 10,
            padding: "14px 18px",
            marginBottom: 24,
          }}
        >
          <div
            style={{
              fontWeight: 700,
              fontSize: 14,
              color: "#92400e",
              marginBottom: 10,
            }}
          >
            ✨ Promociones activas HOY ({today})
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {activeToday.map((p) => (
              <div
                key={p.id}
                style={{
                  background: "#fef3c7",
                  border: "1px solid #fde68a",
                  borderRadius: 8,
                  padding: "8px 14px",
                  fontSize: 13,
                }}
              >
                <span style={{ fontWeight: 700, color: "#b45309" }}>
                  {p.porcentaje_descuento}%
                </span>
                <span style={{ color: "#78350f", marginLeft: 6 }}>
                  {p.categoria}
                </span>
                <span style={{ color: "#a16207", marginLeft: 8, fontSize: 11 }}>
                  ({p.fecha_inicio} → {p.fecha_fin})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          SECCIÓN 1: Porcentajes de descuento disponibles
      ══════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          background: "white",
          borderRadius: 10,
          border: "1px solid #e2e8f0",
          marginBottom: 28,
          padding: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>
              Porcentajes de descuento disponibles
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
              Estos son los porcentajes que aparecen en el modal "🏷️ Aplicar
              Descuento" del punto de venta.
            </div>
          </div>
        </div>

        {/* Tabla de porcentajes */}
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginBottom: 16,
          }}
        >
          <thead>
            <tr>
              <th style={TH}>Porcentaje</th>
              <th style={TH}>Etiqueta</th>
              <th style={TH}>Estado</th>
              <th style={{ ...TH, textAlign: "center" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {porcentajes.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  style={{ ...TD, textAlign: "center", color: "#94a3b8" }}
                >
                  Sin porcentajes registrados
                </td>
              </tr>
            )}
            {porcentajes.map((p) => (
              <tr key={p.id}>
                <td style={TD}>
                  {editPct?.id === p.id ? (
                    <input
                      style={{ ...INPUT, width: 90 }}
                      type="number"
                      min={1}
                      max={100}
                      value={editPct.val}
                      onChange={(e) =>
                        setEditPct({ id: p.id, val: e.target.value })
                      }
                    />
                  ) : (
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: 16,
                        color: "#1e40af",
                      }}
                    >
                      {p.porcentaje}%
                    </span>
                  )}
                </td>
                <td style={TD}>{p.etiqueta || `${p.porcentaje}%`}</td>
                <td style={TD}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 10px",
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: 700,
                      background: p.activo ? "#dcfce7" : "#f1f5f9",
                      color: p.activo ? "#166534" : "#64748b",
                    }}
                  >
                    {p.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td style={{ ...TD, textAlign: "center" }}>
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      justifyContent: "center",
                    }}
                  >
                    {editPct?.id === p.id ? (
                      <>
                        <button
                          className="btn-opaque"
                          style={{
                            padding: "4px 12px",
                            fontSize: 12,
                            background: "#22c55e",
                            color: "white",
                          }}
                          onClick={() => handleSavePct(p.id, editPct.val)}
                        >
                          Guardar
                        </button>
                        <button
                          className="btn-opaque"
                          style={{ padding: "4px 10px", fontSize: 12 }}
                          onClick={() => setEditPct(null)}
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn-opaque"
                          style={{ padding: "4px 12px", fontSize: 12 }}
                          onClick={() =>
                            setEditPct({ id: p.id, val: String(p.porcentaje) })
                          }
                        >
                          Editar
                        </button>
                        <button
                          className="btn-opaque"
                          style={{
                            padding: "4px 10px",
                            fontSize: 12,
                            background: p.activo ? "#f59e0b" : "#22c55e",
                            color: "white",
                          }}
                          onClick={() => handleTogglePct(p)}
                        >
                          {p.activo ? "Desactivar" : "Activar"}
                        </button>
                        <button
                          className="btn-opaque"
                          style={{
                            padding: "4px 10px",
                            fontSize: 12,
                            background: "#ef4444",
                            color: "white",
                          }}
                          onClick={() => handleDeletePct(p.id)}
                        >
                          🗑
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Agregar porcentaje */}
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div>
            <label style={LABEL}>Nuevo porcentaje (%)</label>
            <input
              style={{ ...INPUT, width: 120 }}
              type="number"
              placeholder="ej. 25"
              min={1}
              max={100}
              value={newPctVal}
              onChange={(e) => setNewPctVal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddPct()}
            />
          </div>
          <button
            className="btn-opaque"
            style={{
              padding: "8px 20px",
              background: "#1e3a6e",
              color: "white",
              fontWeight: 700,
            }}
            onClick={handleAddPct}
          >
            + Agregar
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECCIÓN 2: Promociones programadas
      ══════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          background: "white",
          borderRadius: 10,
          border: "1px solid #e2e8f0",
          padding: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>
              Promociones programadas por mes / categoría
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
              Cada promoción aplica un descuento a todos los productos de una
              categoría en un rango de fechas.
            </div>
          </div>
          <button
            className="btn-opaque"
            style={{
              padding: "9px 20px",
              background: "#1e3a6e",
              color: "white",
              fontWeight: 700,
              fontSize: 13,
            }}
            onClick={openNew}
          >
            + Nueva promoción
          </button>
        </div>

        {loading && (
          <div style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>
            Cargando...
          </div>
        )}

        {!loading && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={TH}>Nombre</th>
                  <th style={TH}>Categoría</th>
                  <th style={TH}>Descuento</th>
                  <th style={TH}>Fecha inicio</th>
                  <th style={TH}>Fecha fin</th>
                  <th style={TH}>Estado</th>
                  <th style={{ ...TH, textAlign: "center" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {promociones.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        ...TD,
                        textAlign: "center",
                        color: "#94a3b8",
                        padding: 32,
                      }}
                    >
                      No hay promociones registradas. Crea la primera.
                    </td>
                  </tr>
                )}
                {promociones.map((p) => {
                  const isActiveNow =
                    p.activo && p.fecha_inicio <= today && p.fecha_fin >= today;
                  const isPast = p.fecha_fin < today;
                  const isFuture = p.fecha_inicio > today;
                  let statusBadge = {
                    bg: "#f1f5f9",
                    color: "#64748b",
                    label: "Inactiva",
                  };
                  if (!p.activo)
                    statusBadge = {
                      bg: "#f1f5f9",
                      color: "#64748b",
                      label: "Desactivada",
                    };
                  else if (isActiveNow)
                    statusBadge = {
                      bg: "#dcfce7",
                      color: "#166534",
                      label: "🟢 Activa hoy",
                    };
                  else if (isFuture)
                    statusBadge = {
                      bg: "#dbeafe",
                      color: "#1e40af",
                      label: "⏳ Programada",
                    };
                  else if (isPast)
                    statusBadge = {
                      bg: "#fef3c7",
                      color: "#b45309",
                      label: "Expirada",
                    };

                  return (
                    <tr
                      key={p.id}
                      style={{ background: isActiveNow ? "#f0fdf4" : "white" }}
                    >
                      <td style={TD}>
                        <span style={{ fontWeight: 600 }}>{p.nombre}</span>
                      </td>
                      <td style={TD}>
                        <span
                          style={{
                            background: "#eff6ff",
                            color: "#1d4ed8",
                            padding: "2px 10px",
                            borderRadius: 10,
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {p.categoria}
                        </span>
                      </td>
                      <td style={TD}>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: 16,
                            color: "#d97706",
                          }}
                        >
                          {p.porcentaje_descuento}%
                        </span>
                      </td>
                      <td style={TD}>{p.fecha_inicio}</td>
                      <td style={TD}>{p.fecha_fin}</td>
                      <td style={TD}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 10px",
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 700,
                            background: statusBadge.bg,
                            color: statusBadge.color,
                          }}
                        >
                          {statusBadge.label}
                        </span>
                      </td>
                      <td style={{ ...TD, textAlign: "center" }}>
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            justifyContent: "center",
                          }}
                        >
                          <button
                            className="btn-opaque"
                            style={{ padding: "4px 12px", fontSize: 12 }}
                            onClick={() => openEdit(p)}
                          >
                            ✏️ Editar
                          </button>
                          <button
                            className="btn-opaque"
                            style={{
                              padding: "4px 10px",
                              fontSize: 12,
                              background: p.activo ? "#f59e0b" : "#22c55e",
                              color: "white",
                            }}
                            onClick={() => handleTogglePromo(p)}
                          >
                            {p.activo ? "Desactivar" : "Activar"}
                          </button>
                          <button
                            className="btn-opaque"
                            style={{
                              padding: "4px 10px",
                              fontSize: 12,
                              background: "#ef4444",
                              color: "white",
                            }}
                            onClick={() => handleDeletePromo(p.id)}
                          >
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal de formulario ─────────────────────────────────────────────── */}
      {formOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => setFormOpen(false)}
        >
          <div
            style={{
              background: "white",
              borderRadius: 14,
              padding: 28,
              width: 500,
              maxWidth: "95vw",
              boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 22,
                borderBottom: "1px solid #e2e8f0",
                paddingBottom: 14,
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  color: "#0f172a",
                }}
              >
                {editingId ? "✏️ Editar promoción" : "➕ Nueva promoción"}
              </h3>
              <button
                onClick={() => setFormOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 22,
                  cursor: "pointer",
                  color: "#94a3b8",
                }}
              >
                ×
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={LABEL}>Nombre de la promoción *</label>
                <input
                  style={INPUT}
                  placeholder="ej. Promoción de verano estufas"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                />
              </div>

              <div>
                <label style={LABEL}>Categoría *</label>
                {categorias.length > 0 ? (
                  <select
                    style={{ ...INPUT }}
                    value={form.categoria}
                    onChange={(e) =>
                      setForm({ ...form, categoria: e.target.value })
                    }
                  >
                    <option value="">Selecciona una categoría</option>
                    {categorias.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    style={INPUT}
                    placeholder="ej. Estufas"
                    value={form.categoria}
                    onChange={(e) =>
                      setForm({ ...form, categoria: e.target.value })
                    }
                  />
                )}
              </div>

              <div>
                <label style={LABEL}>Porcentaje de descuento *</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {/* Mostrar porcentajes configurados */}
                  {[
                    ...porcentajes
                      .filter((p) => p.activo)
                      .map((p) => p.porcentaje),
                  ]
                    .sort((a, b) => a - b)
                    .map((pct) => (
                      <button
                        key={pct}
                        onClick={() =>
                          setForm({ ...form, porcentaje_descuento: pct })
                        }
                        style={{
                          padding: "8px 18px",
                          borderRadius: 8,
                          border: `2px solid ${form.porcentaje_descuento === pct ? "#1e3a6e" : "#e2e8f0"}`,
                          background:
                            form.porcentaje_descuento === pct
                              ? "#1e3a6e"
                              : "white",
                          color:
                            form.porcentaje_descuento === pct
                              ? "white"
                              : "#374151",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {pct}%
                      </button>
                    ))}
                  {/* Input libre por si el porcentaje no está en la lista */}
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <input
                      style={{ ...INPUT, width: 80 }}
                      type="number"
                      min={1}
                      max={100}
                      placeholder="Otro"
                      value={String(form.porcentaje_descuento)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          porcentaje_descuento: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                    <span style={{ fontSize: 12, color: "#64748b" }}>%</span>
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <div>
                  <label style={LABEL}>Fecha inicio *</label>
                  <input
                    style={INPUT}
                    type="date"
                    value={form.fecha_inicio}
                    onChange={(e) =>
                      setForm({ ...form, fecha_inicio: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label style={LABEL}>Fecha fin *</label>
                  <input
                    style={INPUT}
                    type="date"
                    value={form.fecha_fin}
                    onChange={(e) =>
                      setForm({ ...form, fecha_fin: e.target.value })
                    }
                  />
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="checkbox"
                  id="activo-promo"
                  checked={form.activo}
                  onChange={(e) =>
                    setForm({ ...form, activo: e.target.checked })
                  }
                />
                <label
                  htmlFor="activo-promo"
                  style={{ fontSize: 13, color: "#374151", cursor: "pointer" }}
                >
                  Promoción activa
                </label>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 22,
                paddingTop: 16,
                borderTop: "1px solid #e2e8f0",
              }}
            >
              <button
                className="btn-opaque"
                style={{ padding: "9px 20px" }}
                onClick={() => setFormOpen(false)}
              >
                Cancelar
              </button>
              <button
                className="btn-opaque"
                style={{
                  padding: "9px 24px",
                  background: "#1e3a6e",
                  color: "white",
                  fontWeight: 700,
                }}
                onClick={handleSavePromo}
              >
                {editingId ? "Guardar cambios" : "Crear promoción"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
