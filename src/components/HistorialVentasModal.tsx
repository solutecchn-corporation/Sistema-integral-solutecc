import React, { useEffect, useState } from "react";
import supabase from "../lib/supabaseClient";
import { generateFacturaHTML } from "../lib/generateFacturaHTML";
import { formatMoney } from "../lib/formatMoney";

interface HistorialVentasModalProps {
  open: boolean;
  onClose: () => void;
  caiInfo?: any;
  userName?: string;
  sessionStart?: string | null; // fecha_apertura de la sesión de caja activa
}

const ESTADO_COLORS: Record<string, { bg: string; color: string }> = {
  pagada: { bg: "#dcfce7", color: "#166534" },
  pagado: { bg: "#dcfce7", color: "#166534" },
};

export default function HistorialVentasModal({
  open,
  onClose,
  caiInfo,
  userName,
  sessionStart,
}: HistorialVentasModalProps) {
  const [ventas, setVentas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [reprinting, setReprinting] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    fetchHistorial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionStart]);

  const fetchHistorial = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("ventas")
        .select("*")
        .in("estado", ["pagada", "pagado", "Pagada", "Pagado"])
        .order("fecha_venta", { ascending: false });

      // filtrar por cajero
      if (userName) {
        query = query.eq("usuario", userName);
      }
      // filtrar por CAI de la sesión actual
      if (caiInfo?.cai) {
        query = query.eq("cai", caiInfo.cai);
      }
      // filtrar desde la apertura de caja de esta sesión
      if (sessionStart) {
        query = query.gte("fecha_venta", sessionStart);
      }

      const { data, error } = await query;
      if (error) throw error;
      setVentas(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error cargando historial de ventas:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleReimprimir = async (venta: any) => {
    setReprinting(venta.id);
    try {
      const { data: detalles } = await supabase
        .from("ventas_detalle")
        .select("*")
        .eq("venta_id", venta.id)
        .order("id", { ascending: true });

      const { data: pagosData } = await supabase
        .from("pagos")
        .select("*")
        .eq("factura", venta.factura);

      const carrito = (detalles || []).map((d: any) => ({
        producto: {
          nombre: d.producto_nombre || d.nombre || d.descripcion || "",
        },
        descripcion: d.descripcion || d.producto_nombre || "",
        cantidad: d.cantidad,
        precio_unitario: d.precio_unitario,
        precio: d.precio_unitario,
        subtotal: d.subtotal,
        descuento: d.descuento || 0,
        exento: d.exento,
        aplica_impuesto_18: d.aplica_impuesto_18,
        aplica_impuesto_turistico: d.aplica_impuesto_turistico,
      }));

      let efectivo = 0,
        tarjeta = 0,
        transferencia = 0;
      for (const p of pagosData || []) {
        const tipo = String(p.tipo || "").toLowerCase();
        if (tipo === "efectivo") efectivo += Number(p.monto || 0);
        else if (tipo === "tarjeta") tarjeta += Number(p.monto || 0);
        else if (tipo === "transferencia")
          transferencia += Number(p.monto || 0);
      }

      const html = await generateFacturaHTML(
        {
          factura: venta.factura,
          CAI: venta.cai,
          rangoAutorizadoDe: venta.rango_desde,
          rangoAutorizadoHasta: venta.rango_hasta,
          fechaLimiteEmision: venta.fecha_limite_emision,
          cliente: venta.nombre_cliente || "Consumidor Final",
          rtn: venta.rtn,
        },
        "factura",
        {
          carrito,
          subtotal: Number(venta.subtotal || venta.total || 0),
          isvTotal: Number(venta.isv_15 || 0),
          imp18Total: Number(venta.isv_18 || 0),
          total: Number(venta.total || 0),
          gravado: Number(venta.sub_gravado || 0),
          exento: Number(venta.sub_exento || 0),
          exonerado: Number(venta.sub_exonerado || 0),
          pagos: {
            efectivo,
            tarjeta,
            transferencia,
            cambio: Number(venta.cambio || 0),
          },
        },
      );

      const win = window.open("", "_blank");
      if (win) {
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 600);
      }
    } catch (err) {
      console.error("Error al reimprimir:", err);
      alert("No se pudo reimprimir la factura.");
    } finally {
      setReprinting(null);
    }
  };

  if (!open) return null;

  const totalVentas = ventas.reduce((s, v) => s + Number(v.total || 0), 0);

  return (
    <div
      className="pv-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 11000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "40px 16px 16px",
        overflowY: "auto",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: 12,
          width: "100%",
          maxWidth: 900,
          boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "calc(100vh - 80px)",
        }}
      >
        {/* Encabezado */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: "1.15rem",
                fontWeight: 700,
                color: "#0b1724",
              }}
            >
              Historial de ventas
            </h2>
            {caiInfo?.cai && (
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: "0.78rem",
                  color: "#6b7280",
                }}
              >
                CAI:{" "}
                <span style={{ fontFamily: "monospace", color: "#1e40af" }}>
                  {caiInfo.cai}
                </span>
                {userName ? ` · Cajero: ${userName}` : ""}
              </p>
            )}
            {sessionStart && (
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: "0.78rem",
                  color: "#059669",
                }}
              >
                ⏰ Apertura de caja:{" "}
                {new Date(sessionStart).toLocaleString("es-HN", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "1.4rem",
              color: "#6b7280",
              lineHeight: 1,
              padding: "0 4px",
            }}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        {/* Resumen */}
        <div
          style={{
            padding: "12px 24px",
            borderBottom: "1px solid #f3f4f6",
            background: "#f8fafc",
            display: "flex",
            gap: 24,
            flexShrink: 0,
          }}
        >
          <div>
            <span style={{ fontSize: "0.78rem", color: "#6b7280" }}>
              Facturas pagadas
            </span>
            <div
              style={{ fontWeight: 700, fontSize: "1.1rem", color: "#166534" }}
            >
              {ventas.length}
            </div>
          </div>
          <div>
            <span style={{ fontSize: "0.78rem", color: "#6b7280" }}>
              Total recaudado
            </span>
            <div
              style={{ fontWeight: 700, fontSize: "1.1rem", color: "#0b1724" }}
            >
              {formatMoney(totalVentas)}
            </div>
          </div>
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
            }}
          >
            <button
              onClick={fetchHistorial}
              style={{
                background: "#e0e7ff",
                color: "#3730a3",
                border: "none",
                borderRadius: 6,
                padding: "6px 14px",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "0.82rem",
              }}
            >
              ↻ Actualizar
            </button>
          </div>
        </div>

        {/* Tabla */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: "center", color: "#6b7280" }}>
              Cargando ventas…
            </div>
          ) : ventas.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>
              No se encontraron ventas pagadas para esta sesión.
            </div>
          ) : (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.85rem",
              }}
            >
              <thead>
                <tr
                  style={{ background: "#f1f5f9", position: "sticky", top: 0 }}
                >
                  <th style={thStyle}>Factura</th>
                  <th style={thStyle}>Fecha</th>
                  <th style={thStyle}>Cliente</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
                  <th style={thStyle}>Estado</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ventas.map((v, idx) => {
                  const estadoLow = String(v.estado || "").toLowerCase();
                  const chip = ESTADO_COLORS[estadoLow] || {
                    bg: "#f3f4f6",
                    color: "#374151",
                  };
                  const fecha = v.fecha_venta
                    ? new Date(v.fecha_venta).toLocaleString("es-HN", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })
                    : "—";
                  return (
                    <tr
                      key={v.id}
                      style={{
                        background: idx % 2 === 0 ? "white" : "#f9fafb",
                        borderBottom: "1px solid #f3f4f6",
                      }}
                    >
                      <td
                        style={{
                          ...tdStyle,
                          fontFamily: "monospace",
                          fontSize: "0.8rem",
                        }}
                      >
                        {v.factura || "—"}
                      </td>
                      <td style={tdStyle}>{fecha}</td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 500 }}>
                          {v.nombre_cliente || "Consumidor Final"}
                        </div>
                        {v.rtn && (
                          <div
                            style={{ fontSize: "0.75rem", color: "#6b7280" }}
                          >
                            RTN: {v.rtn}
                          </div>
                        )}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: "right",
                          fontWeight: 600,
                        }}
                      >
                        {formatMoney(Number(v.total || 0))}
                      </td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            background: chip.bg,
                            color: chip.color,
                            borderRadius: 12,
                            padding: "2px 10px",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            textTransform: "capitalize",
                          }}
                        >
                          {v.estado || "—"}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <button
                          onClick={() => handleReimprimir(v)}
                          disabled={reprinting === v.id}
                          style={{
                            background:
                              reprinting === v.id ? "#e5e7eb" : "#1e40af",
                            color: reprinting === v.id ? "#9ca3af" : "white",
                            border: "none",
                            borderRadius: 6,
                            padding: "5px 12px",
                            cursor:
                              reprinting === v.id ? "not-allowed" : "pointer",
                            fontWeight: 600,
                            fontSize: "0.78rem",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {reprinting === v.id
                            ? "Imprimiendo…"
                            : "🖨 Reimprimir"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pie */}
        <div
          style={{
            padding: "12px 24px",
            borderTop: "1px solid #e5e7eb",
            textAlign: "right",
            flexShrink: 0,
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: "#f3f4f6",
              border: "none",
              borderRadius: 8,
              padding: "8px 20px",
              cursor: "pointer",
              fontWeight: 600,
              color: "#374151",
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "left",
  fontWeight: 600,
  fontSize: "0.8rem",
  color: "#374151",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  verticalAlign: "middle",
};
