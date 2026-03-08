import React, { useEffect, useState, useCallback } from "react";
import supabase from "../lib/supabaseClient";

type Pedido = {
  id: string;
  pedido_numero: number;
  fecha_pedido: string | null;
  subtotal: number;
  impuesto: number;
  total: number;
  estado: "pendiente" | "pagado" | "cancelado" | "enviado";
  usuario_id: string;
  cliente_nombre?: string | null;
  cliente_correo?: string | null;
};

type DetallePedido = {
  id: number;
  pedido_id: string;
  producto_id: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  descuento: number;
  total: number;
  nombre?: string | null;
  sku?: string | null;
};

const ESTADO_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  pendiente: { label: "Pendiente", bg: "#fef9c3", color: "#854d0e" },
  pagado:    { label: "Pagado",    bg: "#dcfce7", color: "#166534" },
  cancelado: { label: "Cancelado", bg: "#fee2e2", color: "#991b1b" },
  enviado:   { label: "Tomado",    bg: "#dbeafe", color: "#1e40af" },
};

export default function PedidosEnLinea({ onBack }: { onBack: () => void }) {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detalles, setDetalles] = useState<Record<string, DetallePedido[]>>({});
  const [loadingDetalle, setLoadingDetalle] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<string>("pendiente");
  const [confirmCancelar, setConfirmCancelar] = useState<string | null>(null);

  const fetchPedidos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let q = (supabase as any)
        .from("pedidos_web")
        .select("id, pedido_numero, fecha_pedido, subtotal, impuesto, total, estado, usuario_id")
        .order("fecha_pedido", { ascending: false });
      if (filtroEstado !== "todos") q = q.eq("estado", filtroEstado);
      const { data, error: err } = await q;
      if (err) throw err;
      const rows: Pedido[] = Array.isArray(data) ? (data as Pedido[]) : [];

      // Enrich con datos de usuarios_web
      const userIds = Array.from(new Set(rows.map((r) => r.usuario_id).filter(Boolean)));
      let userMap: Record<string, { nombre?: string; correo?: string }> = {};
      if (userIds.length > 0) {
        try {
          const { data: usersData } = await supabase
            .from("usuarios_web" as any)
            .select("id, nombre, correo")
            .in("id", userIds);
          if (Array.isArray(usersData)) {
            for (const u of usersData as any[]) {
              userMap[String(u.id)] = { nombre: u.nombre, correo: u.correo };
            }
          }
        } catch (e) {
          console.warn("Error cargando usuarios_web:", e);
        }
      }

      setPedidos(rows.map((r) => ({
        ...r,
        cliente_nombre: userMap[r.usuario_id]?.nombre ?? null,
        cliente_correo: userMap[r.usuario_id]?.correo ?? null,
      })));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [filtroEstado]);

  useEffect(() => { fetchPedidos(); }, [fetchPedidos]);

  const loadDetalle = async (pedidoId: string) => {
    if (detalles[pedidoId]) return;
    setLoadingDetalle(pedidoId);
    try {
      const { data, error: err } = await (supabase as any)
        .from("pedidos_web_detalle")
        .select("id, pedido_id, producto_id, cantidad, precio_unitario, subtotal, descuento, total")
        .eq("pedido_id", pedidoId);
      if (err) throw err;
      let rows: DetallePedido[] = Array.isArray(data) ? (data as DetallePedido[]) : [];

      // Enrich con nombres del inventario
      const prodIds = Array.from(new Set(rows.map((d) => d.producto_id).filter(Boolean)));
      if (prodIds.length > 0) {
        try {
          const { data: prods } = await supabase.from("inventario").select("id, nombre, sku").in("id", prodIds);
          if (Array.isArray(prods)) {
            const pm: Record<string, any> = {};
            for (const p of prods as any[]) pm[String(p.id)] = p;
            rows = rows.map((d) => ({ ...d, nombre: pm[d.producto_id]?.nombre ?? null, sku: pm[d.producto_id]?.sku ?? null }));
          }
        } catch (e) { console.warn("Error enriching detalles:", e); }
      }
      setDetalles((prev) => ({ ...prev, [pedidoId]: rows }));
    } catch (e: any) {
      console.warn("Error cargando detalle pedido:", e);
    } finally {
      setLoadingDetalle(null);
    }
  };

  const toggleExpand = async (pedidoId: string) => {
    if (expanded === pedidoId) { setExpanded(null); return; }
    setExpanded(pedidoId);
    await loadDetalle(pedidoId);
  };

  const tomarPedido = async (pedido: Pedido) => {
    setActionLoading(pedido.id);
    try {
      if (!detalles[pedido.id]) await loadDetalle(pedido.id);
      const det = detalles[pedido.id] ?? [];

      // Marcar como tomado
      const { error: upErr } = await (supabase as any)
        .from("pedidos_web")
        .update({ estado: "enviado" })
        .eq("id", pedido.id);
      if (upErr) throw upErr;

      // Disparar evento para cargar al carrito de PuntoDeVentas
      const payload = {
        pedido_id: pedido.id,
        pedido_numero: pedido.pedido_numero,
        detalles: det.map((d) => ({
          producto_id: d.producto_id,
          sku: d.sku,
          descripcion: d.nombre || `Producto ${d.producto_id}`,
          cantidad: d.cantidad,
          precio_unitario: d.precio_unitario,
        })),
      };
      window.dispatchEvent(new CustomEvent("pedido:cargar", { detail: payload }));
      onBack();
    } catch (e: any) {
      alert("Error al tomar pedido: " + (e?.message || String(e)));
      setActionLoading(null);
    }
  };

  const rechazarPedido = async (pedidoId: string) => {
    setActionLoading(pedidoId);
    try {
      const { error: upErr } = await (supabase as any)
        .from("pedidos_web")
        .update({ estado: "cancelado" })
        .eq("id", pedidoId);
      if (upErr) throw upErr;
      setConfirmCancelar(null);
      await fetchPedidos();
    } catch (e: any) {
      alert("Error al rechazar pedido: " + (e?.message || String(e)));
    } finally {
      setActionLoading(null);
    }
  };

  const fmtDate = (s: string | null) => {
    if (!s) return "-";
    try {
      return new Date(s).toLocaleString("es-HN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch { return s; }
  };
  const fmtMoney = (n: number) =>
    "L " + Number(n || 0).toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div style={{ padding: "clamp(12px,2vw,20px)", maxWidth: 1100, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: "clamp(18px,3vw,24px)" }}>Pedidos en Línea</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={fetchPedidos} className="btn-opaque" style={{ fontSize: 13 }}>Recargar</button>
          <button onClick={onBack} className="btn-opaque" style={{ fontSize: 13 }}>Volver</button>
        </div>
      </header>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {["todos", "pendiente", "enviado", "pagado", "cancelado"].map((e) => (
          <button
            key={e}
            onClick={() => setFiltroEstado(e)}
            className={filtroEstado === e ? "btn-primary" : "btn-opaque"}
            style={{ fontSize: 12, padding: "5px 12px", borderRadius: 20 }}
          >
            {e === "todos" ? "Todos" : (ESTADO_BADGE[e]?.label ?? e)}
          </button>
        ))}
      </div>

      {error && <div style={{ color: "#b91c1c", marginBottom: 12 }}>Error: {error}</div>}
      {loading && <div style={{ color: "#6b7280", marginBottom: 12 }}>Cargando pedidos...</div>}

      {!loading && pedidos.length === 0 && (
        <div style={{ background: "#fff", borderRadius: 8, padding: 32, textAlign: "center", color: "#6b7280" }}>
          No hay pedidos {filtroEstado !== "todos" ? `con estado "${ESTADO_BADGE[filtroEstado]?.label ?? filtroEstado}"` : ""}.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {pedidos.map((pedido) => {
          const badge = ESTADO_BADGE[pedido.estado] ?? { label: pedido.estado, bg: "#f3f4f6", color: "#374151" };
          const isExpanded = expanded === pedido.id;
          const isActing = actionLoading === pedido.id;
          const isPendiente = pedido.estado === "pendiente";

          return (
            <div key={pedido.id} style={{ background: "#fff", borderRadius: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.07)", border: "1px solid #e5e7eb", overflow: "hidden" }}>
              {/* Fila principal */}
              <div
                style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "clamp(8px,1.5vw,14px)", padding: "clamp(10px,1.5vw,14px) clamp(12px,2vw,18px)", cursor: "pointer" }}
                onClick={() => toggleExpand(pedido.id)}
              >
                <div style={{ fontWeight: 700, fontSize: 15, minWidth: 90 }}>#{pedido.pedido_numero}</div>

                <span style={{ background: badge.bg, color: badge.color, borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 600 }}>
                  {badge.label}
                </span>

                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{pedido.cliente_nombre ?? "Cliente sin nombre"}</div>
                  {pedido.cliente_correo && <div style={{ fontSize: 11, color: "#6b7280" }}>{pedido.cliente_correo}</div>}
                </div>

                <div style={{ fontSize: 12, color: "#6b7280", minWidth: 130 }}>{fmtDate(pedido.fecha_pedido)}</div>

                <div style={{ fontWeight: 700, fontSize: 15, minWidth: 100, textAlign: "right" }}>{fmtMoney(pedido.total)}</div>

                <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                  {isPendiente && (
                    <>
                      <button
                        className="btn-primary"
                        style={{ fontSize: 12, padding: "5px 12px" }}
                        disabled={isActing}
                        onClick={() => tomarPedido(pedido)}
                        title="Tomar el pedido y cargar al carrito"
                      >
                        {isActing ? "..." : "Tomar"}
                      </button>
                      <button
                        className="btn-primary"
                        style={{ fontSize: 12, padding: "5px 12px", background: "#059669" }}
                        disabled={isActing}
                        onClick={() => tomarPedido(pedido)}
                        title="Cargar al carrito para facturar"
                      >
                        {isActing ? "..." : "Facturar"}
                      </button>
                      <button
                        className="btn-opaque"
                        style={{ fontSize: 12, padding: "5px 10px", color: "#b91c1c" }}
                        disabled={isActing}
                        onClick={() => setConfirmCancelar(pedido.id)}
                      >
                        Rechazar
                      </button>
                    </>
                  )}
                  <button className="btn-opaque" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => toggleExpand(pedido.id)}>
                    {isExpanded ? "▲ Ocultar" : "▼ Detalle"}
                  </button>
                </div>
              </div>

              {/* Detalle expandible */}
              {isExpanded && (
                <div style={{ borderTop: "1px solid #e5e7eb", padding: "clamp(10px,1.5vw,14px) clamp(12px,2vw,18px)", background: "#f9fafb" }}>
                  {loadingDetalle === pedido.id ? (
                    <div style={{ color: "#6b7280", fontSize: 13 }}>Cargando detalle...</div>
                  ) : (detalles[pedido.id] ?? []).length === 0 ? (
                    <div style={{ color: "#6b7280", fontSize: 13 }}>Sin líneas de detalle.</div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "#f3f4f6" }}>
                          <th style={{ padding: "6px 8px", textAlign: "left" }}>Codigo</th>
                          <th style={{ padding: "6px 8px", textAlign: "left" }}>Producto</th>
                          <th style={{ padding: "6px 8px", textAlign: "right" }}>Cant.</th>
                          <th style={{ padding: "6px 8px", textAlign: "right" }}>Precio Unit.</th>
                          <th style={{ padding: "6px 8px", textAlign: "right" }}>Descuento</th>
                          <th style={{ padding: "6px 8px", textAlign: "right" }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(detalles[pedido.id] ?? []).map((d) => (
                          <tr key={d.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                            <td style={{ padding: "5px 8px", color: "#6b7280" }}>{d.sku ?? "-"}</td>
                            <td style={{ padding: "5px 8px" }}>{d.nombre ?? d.producto_id}</td>
                            <td style={{ padding: "5px 8px", textAlign: "right" }}>{d.cantidad}</td>
                            <td style={{ padding: "5px 8px", textAlign: "right" }}>{fmtMoney(d.precio_unitario)}</td>
                            <td style={{ padding: "5px 8px", textAlign: "right" }}>{fmtMoney(d.descuento ?? 0)}</td>
                            <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600 }}>{fmtMoney(d.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={4} />
                          <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600 }}>Subtotal</td>
                          <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600 }}>{fmtMoney(pedido.subtotal)}</td>
                        </tr>
                        <tr>
                          <td colSpan={4} />
                          <td style={{ padding: "4px 8px", textAlign: "right", color: "#6b7280" }}>Impuesto</td>
                          <td style={{ padding: "4px 8px", textAlign: "right", color: "#6b7280" }}>{fmtMoney(pedido.impuesto)}</td>
                        </tr>
                        <tr>
                          <td colSpan={4} />
                          <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, fontSize: 14 }}>TOTAL</td>
                          <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, fontSize: 14 }}>{fmtMoney(pedido.total)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal confirmar rechazo */}
      {confirmCancelar && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setConfirmCancelar(null)}>
          <div style={{ background: "#fff", borderRadius: 10, padding: 28, width: 340, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>¿Rechazar pedido?</div>
            <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 20 }}>
              El pedido se marcará como <strong>Cancelado</strong>. Esta acción no se puede deshacer.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button className="btn-opaque" onClick={() => setConfirmCancelar(null)}>No</button>
              <button
                className="btn-primary"
                style={{ background: "#dc2626" }}
                disabled={!!actionLoading}
                onClick={() => rechazarPedido(confirmCancelar)}
              >
                {actionLoading ? "..." : "Sí, rechazar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
