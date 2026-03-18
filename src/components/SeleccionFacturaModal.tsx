/**
 * SeleccionFacturaModal
 *
 * Se muestra cuando el usuario busca un número de factura que existe en múltiples
 * registros (diferente CAI). Permite seleccionar la factura correcta sin escribir
 * el CAI manualmente.
 *
 * Props:
 *  - ventas: array de registros de la tabla `ventas`
 *  - titulo: texto opcional del encabezado
 *  - onSelect: callback con la fila seleccionada
 *  - onClose: cerrar sin seleccionar
 */
import React from "react";
import { formatMoney } from "../lib/formatMoney";

type Props = {
  ventas: any[];
  titulo?: string;
  onSelect: (venta: any) => void;
  onClose: () => void;
};

const ESTADO_CHIP: Record<string, { bg: string; color: string }> = {
  pagada: { bg: "#dcfce7", color: "#166534" },
  pagado: { bg: "#dcfce7", color: "#166534" },
  anulada: { bg: "#fee2e2", color: "#991b1b" },
  anulado: { bg: "#fee2e2", color: "#991b1b" },
  devolucion: { bg: "#fef9c3", color: "#854d0e" },
  devolución: { bg: "#fef9c3", color: "#854d0e" },
};

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-HN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso).slice(0, 16);
  }
}

function truncateCai(cai: string | null | undefined): string {
  if (!cai) return "Sin CAI";
  // Mostrar completo pero partido para legibilidad
  return cai;
}

export default function SeleccionFacturaModal({
  ventas,
  titulo,
  onSelect,
  onClose,
}: Props) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,6,23,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 11000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: 16,
          padding: "28px 28px 22px",
          width: 680,
          maxWidth: "96vw",
          maxHeight: "88vh",
          overflowY: "auto",
          boxShadow: "0 24px 60px rgba(2,6,23,0.30)",
        }}
      >
        {/* Encabezado */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 20,
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: "1.1rem",
                fontWeight: 700,
                color: "#0f172a",
              }}
            >
              ⚠️ {titulo || "Múltiples facturas encontradas"}
            </h3>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748b" }}>
              Se encontraron <strong>{ventas.length} registros</strong> con ese
              número de factura.
              <br />
              Selecciona la factura correcta identificándola por su{" "}
              <strong>CAI</strong>.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 24,
              cursor: "pointer",
              color: "#94a3b8",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Lista de facturas */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {ventas.map((v, idx) => {
            const estKey = String(v.estado || "").toLowerCase();
            const chip = ESTADO_CHIP[estKey];
            return (
              <div
                key={v.id || idx}
                style={{
                  border: "1.5px solid #e2e8f0",
                  borderRadius: 12,
                  padding: "16px 18px",
                  background: "#f8fafc",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                }}
              >
                {/* Fila superior: factura + estado + total */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontWeight: 800,
                        fontSize: 15,
                        color: "#0f172a",
                      }}
                    >
                      Factura: {v.factura || "—"}
                    </span>
                    {chip && (
                      <span
                        style={{
                          marginLeft: 10,
                          display: "inline-block",
                          padding: "2px 10px",
                          borderRadius: 10,
                          fontSize: 11,
                          fontWeight: 700,
                          background: chip.bg,
                          color: chip.color,
                          textTransform: "capitalize",
                        }}
                      >
                        {v.estado || "—"}
                      </span>
                    )}
                  </div>
                  <span
                    style={{ fontWeight: 700, fontSize: 15, color: "#1e3a6e" }}
                  >
                    L {formatMoney(Number(v.total || 0))}
                  </span>
                </div>

                {/* CAI — clave de identificación */}
                <div
                  style={{
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    borderRadius: 8,
                    padding: "8px 12px",
                    marginBottom: 10,
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: "#1d4ed8",
                      minWidth: 32,
                      paddingTop: 1,
                    }}
                  >
                    CAI:
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontFamily: "monospace",
                      color: "#1e3a6e",
                      wordBreak: "break-all",
                      fontWeight: 600,
                    }}
                  >
                    {truncateCai(v.cai)}
                  </span>
                </div>

                {/* Detalles secundarios */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "4px 16px",
                    fontSize: 12,
                    color: "#475569",
                    marginBottom: 12,
                  }}
                >
                  <span>
                    <b>Fecha:</b> {fmtFecha(v.fecha_venta)}
                  </span>
                  <span>
                    <b>Cliente:</b> {v.nombre_cliente || "Consumidor Final"}
                  </span>
                  {v.rtn && (
                    <span>
                      <b>RTN:</b> {v.rtn}
                    </span>
                  )}
                  {v.rango_desde && (
                    <span>
                      <b>Rango:</b> {v.rango_desde} – {v.rango_hasta || "?"}
                    </span>
                  )}
                </div>

                {/* Botón seleccionar */}
                <button
                  onClick={() => onSelect(v)}
                  style={{
                    width: "100%",
                    padding: "10px 0",
                    borderRadius: 8,
                    border: "none",
                    background:
                      "linear-gradient(135deg, #1e3a6e 0%, #1d4ed8 100%)",
                    color: "white",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                    letterSpacing: "0.03em",
                  }}
                >
                  ✔ Seleccionar esta factura
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 18, textAlign: "right" }}>
          <button
            onClick={onClose}
            style={{
              padding: "9px 22px",
              borderRadius: 8,
              border: "1.5px solid #e2e8f0",
              background: "white",
              color: "#475569",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
