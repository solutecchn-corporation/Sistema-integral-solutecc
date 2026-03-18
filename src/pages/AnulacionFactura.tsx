import React, { useState } from "react";
import { formatMoney } from "../lib/formatMoney";
import supabase from "../lib/supabaseClient";
import ModalWrapper from "../components/ModalWrapper";
import Confirmado from "../components/Confirmado";
import { generateAnulacionHTML } from "../lib/anulacionhtmlimpresion";
import SeleccionFacturaModal from "../components/SeleccionFacturaModal";

export default function AnulacionFactura({ onBack }: { onBack: () => void }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [invoiceData, setInvoiceData] = useState<any | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  // Selector para facturas con el mismo número (diferente CAI)
  const [resultadosBusqueda, setResultadosBusqueda] = useState<any[]>([]);
  const [showSelectorFactura, setShowSelectorFactura] = useState(false);

  // Procesa la venta ya seleccionada (único resultado o elegida en el selector)
  const procesarVentaSeleccionada = async (venta: any) => {
    setShowSelectorFactura(false);
    setLoading(true);
    try {
      if (venta.estado && String(venta.estado).toLowerCase() === "anulado") {
        setErrorMessage(
          "Esta factura ya está anulada. No se puede anular nuevamente.",
        );
        setErrorOpen(true);
        return;
      }

      const { data: existsDev } = await supabase
        .from("devoluciones_ventas")
        .select("id")
        .eq("venta_id", venta.id)
        .limit(1);
      if (Array.isArray(existsDev) && existsDev.length > 0) {
        setErrorMessage(
          "La factura ya posee devoluciones registradas. No se puede anular.",
        );
        setErrorOpen(true);
        return;
      }

      const { data: detalles, error: detallesError } = await supabase
        .from("ventas_detalle")
        .select("*")
        .eq("venta_id", venta.id);
      if (detallesError) throw detallesError;

      const enrichedDetalles = await Promise.all(
        (detalles || []).map(async (d: any) => {
          const { data: prod } = await supabase
            .from("inventario")
            .select("nombre, sku")
            .eq("id", d.producto_id)
            .maybeSingle();
          return {
            ...d,
            nombre_producto: prod?.nombre || "Producto desconocido",
            sku: prod?.sku || "",
          };
        }),
      );

      setInvoiceData({ ...venta, items: enrichedDetalles });
      setDetailsModalOpen(true);
    } catch (error: any) {
      console.error("Error procesando factura:", error);
      setErrorMessage(
        "Error al procesar la factura: " +
          (error.message || "Error desconocido"),
      );
      setErrorOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setErrorMessage("Por favor ingresa un número de factura");
      setErrorOpen(true);
      return;
    }

    setLoading(true);
    try {
      // Buscar TODAS las ventas con ese número de factura
      const { data: ventas, error: ventaError } = await supabase
        .from("ventas")
        .select("*")
        .eq("factura", searchTerm.trim())
        .order("fecha_venta", { ascending: false });

      if (ventaError) throw ventaError;
      if (!ventas || ventas.length === 0) {
        setErrorMessage("Factura no encontrada");
        setErrorOpen(true);
        setLoading(false);
        return;
      }

      // Si hay más de 1 resultado con diferente CAI → mostrar selector
      if (ventas.length > 1) {
        setResultadosBusqueda(ventas);
        setShowSelectorFactura(true);
        setLoading(false);
        return;
      }

      // Solo 1 resultado → continuar directamente
      await procesarVentaSeleccionada(ventas[0]);
    } catch (error: any) {
      console.error("Error buscando factura:", error);
      setErrorMessage(
        "Error al buscar la factura: " + (error.message || "Error desconocido"),
      );
      setErrorOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const handleAnular = () => {
    setConfirmModalOpen(true);
  };

  const confirmAnulacion = async () => {
    if (!invoiceData || !invoiceData.id) return;

    setLoading(true);
    try {
      const now = new Date().toLocaleString("es-HN");
      const currentObs = invoiceData.observaciones || "";
      const newObs = currentObs
        ? `${currentObs} | anulado el dia (${now})`
        : `anulado el dia (${now})`;

      // 1. Actualizar estado de la venta
      const { error: updateError } = await supabase
        .from("ventas")
        .update({
          estado: "Anulado",
          observaciones: newObs,
        })
        .eq("id", invoiceData.id);

      if (updateError) throw updateError;

      // 2. Registrar reingreso en inventario
      const rawUser = localStorage.getItem("user");
      const parsed = rawUser ? JSON.parse(rawUser) : null;
      const userName =
        parsed &&
        (parsed.username ||
          parsed.user?.username ||
          parsed.name ||
          parsed.user?.name)
          ? parsed.username ||
            parsed.user?.username ||
            parsed.name ||
            parsed.user?.name
          : "sistema";

      const inventoryMoves = invoiceData.items.map((item: any) => ({
        producto_id: item.producto_id,
        cantidad: item.cantidad,
        tipo_de_movimiento: "ENTRADA",
        referencia: `Anulación Factura #${invoiceData.factura}`,
        usuario: userName,
        fecha_salida: new Date().toISOString(), // Usamos fecha_salida como fecha de registro según esquema visto
      }));

      const { error: invError } = await supabase
        .from("registro_de_inventario")
        .insert(inventoryMoves);

      if (invError) {
        console.error("Error registrando inventario:", invError);
        // No detenemos el flujo principal, but show error modal
        setErrorMessage(
          "La factura se anuló, pero hubo un error registrando el reingreso al inventario. Por favor verifique manualmente.",
        );
        setErrorOpen(true);
      } else {
        setSuccessOpen(true);
      }

      // Generar e imprimir comprobante
      const html = await generateAnulacionHTML(
        {
          factura: invoiceData.factura,
          CAI: invoiceData.cai,
          cliente: invoiceData.nombre_cliente,
          identidad: invoiceData.rtn,
          fechaAnulacion: now,
        },
        {
          carrito: invoiceData.items.map((i: any) => ({
            producto: { nombre: i.nombre_producto, sku: i.sku },
            cantidad: i.cantidad,
            precio: i.precio_unitario,
          })),
          total: invoiceData.total,
        },
      );

      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 500);
      }

      setConfirmModalOpen(false);
      setDetailsModalOpen(false);
      setInvoiceData(null);
      setSearchTerm("");
    } catch (error: any) {
      console.error("Error anulando factura:", error);
      alert(
        "Error al anular la factura: " + (error.message || "Error desconocido"),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        padding: 28,
        maxWidth: 1200,
        margin: "32px auto",
        fontSize: "13px",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "24px",
            fontWeight: 700,
            color: "#1e293b",
          }}
        >
          Anulación de Factura
        </h2>
        <button
          onClick={onBack}
          className="btn-opaque"
          style={{
            padding: "8px 16px",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          ← Volver
        </button>
      </header>

      <section
        style={{
          background: "white",
          padding: 40,
          borderRadius: 16,
          boxShadow:
            "0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)",
        }}
      >
        <div style={{ maxWidth: 540, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <h3
              style={{
                margin: "0 0 8px 0",
                color: "#1e293b",
                fontSize: "18px",
                fontWeight: 600,
              }}
            >
              Buscar Factura para Anular
            </h3>
            <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
              Ingresa el número de factura completo para ver sus detalles.
            </p>
          </div>

          <div
            style={{
              position: "relative",
              display: "flex",
              gap: 12,
              alignItems: "stretch",
            }}
          >
            <div style={{ position: "relative", flex: 1 }}>
              <div
                style={{
                  position: "absolute",
                  left: 14,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#94a3b8",
                }}
              >
                <svg
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  ></path>
                </svg>
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Ej: 000-001-01-00000001"
                className="input"
                style={{
                  paddingLeft: 42,
                  height: 48,
                  fontSize: "15px",
                  borderRadius: 12,
                }}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={loading}
              className="btn-primary"
              style={{
                width: "auto",
                padding: "0 24px",
                height: 48,
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: "15px",
              }}
            >
              {loading ? (
                <>Buscando...</>
              ) : (
                <>
                  <span>Buscar</span>
                  <svg
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M14 5l7 7m0 0l-7 7m7-7H3"
                    ></path>
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* Modal de Detalles de Factura */}
      {invoiceData && (
        <ModalWrapper
          open={detailsModalOpen}
          onClose={() => setDetailsModalOpen(false)}
          width={800}
        >
          <div style={{ padding: "0 8px" }}>
            <div
              style={{
                borderBottom: "1px solid #e2e8f0",
                paddingBottom: 16,
                marginBottom: 20,
              }}
            >
              <h3
                style={{
                  margin: "0 0 8px 0",
                  fontSize: "20px",
                  color: "#1e293b",
                }}
              >
                Detalles de Factura #{invoiceData.factura}
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 16,
                  fontSize: "14px",
                  color: "#475569",
                }}
              >
                <div>
                  <strong>Fecha:</strong>
                  <br />
                  {new Date(invoiceData.created_at).toLocaleString()}
                </div>
                <div>
                  <strong>Cliente:</strong>
                  <br />
                  {invoiceData.nombre_cliente || "Consumidor Final"}
                </div>
                <div>
                  <strong>RTN:</strong>
                  <br />
                  {invoiceData.rtn || "N/A"}
                </div>
                <div>
                  <strong>Estado:</strong>
                  <br />
                  <span
                    style={{
                      color:
                        invoiceData.estado === "Anulado"
                          ? "#ef4444"
                          : "#10b981",
                      fontWeight: 600,
                    }}
                  >
                    {invoiceData.estado || "Pagada"}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "14px",
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: "#f8fafc",
                      borderBottom: "2px solid #e2e8f0",
                    }}
                  >
                    <th
                      style={{
                        textAlign: "left",
                        padding: "12px",
                        color: "#475569",
                      }}
                    >
                      Producto
                    </th>
                    <th
                      style={{
                        textAlign: "right",
                        padding: "12px",
                        color: "#475569",
                      }}
                    >
                      Cant.
                    </th>
                    <th
                      style={{
                        textAlign: "right",
                        padding: "12px",
                        color: "#475569",
                      }}
                    >
                      Precio
                    </th>
                    <th
                      style={{
                        textAlign: "right",
                        padding: "12px",
                        color: "#475569",
                      }}
                    >
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceData.items.map((item: any, idx: number) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "12px" }}>
                        <div style={{ fontWeight: 500, color: "#1e293b" }}>
                          {item.nombre_producto}
                        </div>
                        {item.sku && (
                          <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                            SKU: {item.sku}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: "right", padding: "12px" }}>
                        {item.cantidad}
                      </td>
                      <td style={{ textAlign: "right", padding: "12px" }}>
                        L {formatMoney(Number(item.precio_unitario))}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          padding: "12px",
                          fontWeight: 500,
                        }}
                      >
                        L {formatMoney(Number(item.subtotal))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              style={{
                background: "#f8fafc",
                padding: 16,
                borderRadius: 8,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                alignItems: "flex-end",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  width: 200,
                }}
              >
                <span style={{ color: "#64748b" }}>Subtotal:</span>
                <span style={{ fontWeight: 500 }}>
                  L {formatMoney(Number(invoiceData.subtotal))}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  width: 200,
                }}
              >
                <span style={{ color: "#64748b" }}>Impuesto:</span>
                <span style={{ fontWeight: 500 }}>
                  L {formatMoney(Number(invoiceData.impuesto))}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  width: 200,
                  borderTop: "1px solid #cbd5e1",
                  paddingTop: 8,
                  marginTop: 4,
                }}
              >
                <span style={{ fontWeight: 700, color: "#1e293b" }}>
                  Total:
                </span>
                <span
                  style={{
                    fontWeight: 700,
                    color: "#1e293b",
                    fontSize: "16px",
                  }}
                >
                  L {formatMoney(Number(invoiceData.total))}
                </span>
              </div>
            </div>

            <div
              style={{
                marginTop: 24,
                display: "flex",
                justifyContent: "flex-end",
                gap: 12,
              }}
            >
              <button
                onClick={() => setDetailsModalOpen(false)}
                className="btn-opaque"
                style={{ padding: "10px 20px" }}
              >
                Cerrar
              </button>
              {invoiceData.estado !== "Anulado" && (
                <button
                  className="btn-primary"
                  style={{
                    padding: "10px 20px",
                    background: "#ef4444",
                    borderColor: "#ef4444",
                  }}
                  onClick={handleAnular}
                >
                  Anular Factura
                </button>
              )}
            </div>
          </div>
        </ModalWrapper>
      )}

      <Confirmado
        open={successOpen}
        title="Anulación"
        message="Factura anulada correctamente."
        onClose={() => setSuccessOpen(false)}
      />
      <Confirmado
        open={errorOpen}
        title="Error"
        message={errorMessage}
        onClose={() => setErrorOpen(false)}
      />

      {/* Modal de Confirmación de Anulación */}
      <ModalWrapper
        open={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        width={400}
      >
        <div style={{ textAlign: "center", padding: "16px 8px" }}>
          <div style={{ fontSize: "48px", marginBottom: 16 }}>⚠️</div>
          <h3 style={{ margin: "0 0 12px 0", color: "#1e293b" }}>
            ¿Estás seguro?
          </h3>
          <p style={{ color: "#64748b", marginBottom: 24 }}>
            Esta acción marcará la factura como <strong>Anulada</strong> y
            registrará la fecha de anulación. Esta acción no se puede deshacer
            fácilmente.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button
              onClick={() => setConfirmModalOpen(false)}
              className="btn-opaque"
              style={{ padding: "10px 24px" }}
            >
              Cancelar
            </button>
            <button
              onClick={confirmAnulacion}
              className="btn-primary"
              style={{
                padding: "10px 24px",
                background: "#ef4444",
                borderColor: "#ef4444",
              }}
              disabled={loading}
            >
              {loading ? "Anulando..." : "Sí, anular"}
            </button>
          </div>
        </div>
      </ModalWrapper>
      {/* Selector cuando hay múltiples facturas con el mismo número */}
      {showSelectorFactura && (
        <SeleccionFacturaModal
          ventas={resultadosBusqueda}
          titulo="Múltiples facturas con ese número — elige por CAI"
          onSelect={(v) => procesarVentaSeleccionada(v)}
          onClose={() => setShowSelectorFactura(false)}
        />
      )}
    </div>
  );
}
