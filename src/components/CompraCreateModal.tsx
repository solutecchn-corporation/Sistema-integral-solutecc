import React, { useEffect, useState } from "react";
import { formatMoney } from '../lib/formatMoney';
import supabase from "../lib/supabaseClient";
import { hondurasNowISO } from "../lib/useHondurasTime";

type Producto = { id: string; nombre: string; exento?: any };
type Proveedor = { id: number | string; nombre: string };
type LineItem = {
  producto_id: string;
  nombre: string;
  cantidad: number;
  costo_unitario: number;
  exento?: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
};

export default function CompraCreateModal({ open, onClose, onCreated }: Props) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [impuestoValor, setImpuestoValor] = useState<number>(0);

  const [proveedorId, setProveedorId] = useState<number | string | null>(null);
  const [numeroDocumento, setNumeroDocumento] = useState("");
  const [tipoDocumento, setTipoDocumento] = useState("factura");
  const [items, setItems] = useState<LineItem[]>([]);
  const [selectedProducto, setSelectedProducto] = useState<string | null>(null);
  const [selectedProductoName, setSelectedProductoName] = useState<string>("");
  const [cantidad, setCantidad] = useState<number>(1);
  const [costoUnitario, setCostoUnitario] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return; // load products and providers
    (async () => {
      try {
        const p = await supabase
          .from("inventario")
          .select("id, nombre, exento")
          .order("nombre", { ascending: true });
        setProductos(Array.isArray(p.data) ? (p.data as Producto[]) : []);
      } catch (e) {
        // ignore
      }
      try {
        const r = await supabase
          .from("proveedores")
          .select("id, nombre")
          .order("nombre", { ascending: true });
        setProveedores(Array.isArray(r.data) ? (r.data as Proveedor[]) : []);
      } catch (e) {
        // ignore
      }
      // load impuesto (única fila esperada)
      try {
        const imp = await supabase
          .from("impuesto")
          .select("impuesto_venta")
          .limit(1)
          .order("id", { ascending: true });
        const row =
          Array.isArray(imp.data) && imp.data.length > 0 ? imp.data[0] : null;
        const impuestoVal = row ? Number(row.impuesto_venta) : 0;
        setImpuestoValor(impuestoVal);
      } catch (e) {
        // ignore
      }
    })();
  }, [open]);

  if (!open) return null;

  function resetForm() {
    setProveedorId(null);
    setNumeroDocumento("");
    setTipoDocumento("factura");
    setItems([]);
    setSelectedProducto(null);
    setSelectedProductoName("");
    setCantidad(1);
    setCostoUnitario(null);
    setError(null);
  }

  function addItem() {
    if (!selectedProducto) {
      setError("Selecciona un producto");
      return;
    }
    if (!costoUnitario || costoUnitario <= 0) {
      setError("Costo unitario inválido");
      return;
    }
    if (!cantidad || cantidad <= 0) {
      setError("Cantidad inválida");
      return;
    }
    const prod = productos.find((p) => p.id === selectedProducto)!;
    // normalizar exento a boolean
    const isExento = (v: any) => {
      if (v == null) return false;
      if (typeof v === "boolean") return v === true;
      if (typeof v === "number") return v === 1;
      const s = String(v).toLowerCase().trim();
      return (
        s === "1" ||
        s === "true" ||
        s === "t" ||
        s === "si" ||
        s === "s" ||
        s === "yes"
      );
    };
    setItems((prev) => [
      ...prev,
      {
        producto_id: selectedProducto!,
        nombre: prod?.nombre || "",
        cantidad,
        costo_unitario: costoUnitario,
        exento: isExento(prod?.exento),
      },
    ]);
    setSelectedProducto(null);
    setSelectedProductoName("");
    setCantidad(1);
    setCostoUnitario(null);
    setError(null);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function computeTotals() {
    // Interpretamos `costo_unitario` como precio que puede incluir impuesto.
    // Para items exentos, impuesto = 0 y subtotal = total_price
    // Para no exentos: impuesto_line = total_price * tasa, subtotal_line = total_price - impuesto_line
    const impuestoVal = impuestoValor;
    const tasa = impuestoVal > 1 ? impuestoVal / 100 : impuestoVal;

    let subtotal = 0;
    let impuesto = 0;
    let total = 0;

    for (const it of items) {
      const totalPrice = it.cantidad * it.costo_unitario;
      let impuestoLine = 0;
      let subtotalLine = totalPrice;
      if (!it.exento) {
        impuestoLine = totalPrice * tasa;
        subtotalLine = totalPrice - impuestoLine;
      }
      subtotal += subtotalLine;
      impuesto += impuestoLine;
      total += totalPrice;
    }

    return { subtotal, impuesto, total };
  }

  async function confirmPurchase() {
    setError(null);
    if (!proveedorId) {
      setError("Selecciona un proveedor");
      return;
    }
    if (items.length === 0) {
      setError("Agrega al menos un producto");
      return;
    }
    setSaving(true);
    try {
      const { subtotal, impuesto, total } = computeTotals();
      // Insert compra
      const compraPayload: any = {
        proveedor_id: proveedorId,
        numero_documento: numeroDocumento || null,
        tipo_documento: tipoDocumento || null,
        subtotal: subtotal,
        impuesto: impuesto,
        total: total,
        usuario: null,
      };
      const insertRes = await supabase
        .from("compras")
        .insert(compraPayload)
        .select("id")
        .single();
      if (insertRes.error) throw insertRes.error;
      const compraId = insertRes.data.id;

      // prepare detalles
      const detalles = items.map((it) => ({
        compra_id: compraId,
        producto_id: it.producto_id,
        cantidad: it.cantidad,
        costo_unitario: it.costo_unitario,
      }));
      const detRes = await supabase.from("compras_detalle").insert(detalles);
      if (detRes.error) {
        // rollback compra
        await supabase.from("compras").delete().eq("id", compraId);
        throw detRes.error;
      }

      // Registrar cada item en registro_de_inventario como ENTRADA
      try {
        // referencia y usuario
        const referenciaText = numeroDocumento
          ? `Compra - ${numeroDocumento}`
          : `Compra ${compraId}`;
        let usuarioText = "sistema";
        try {
          const raw = localStorage.getItem("user");
          if (raw) {
            const u = JSON.parse(raw);
            usuarioText = u.username
              ? `${u.username}${u.role ? ` (${u.role})` : ""}`
              : String(u);
          }
        } catch (e) {
          // ignore
        }

        const now = hondurasNowISO();
        const registroRows = items.map((it) => ({
          producto_id: it.producto_id,
          cantidad: it.cantidad,
          tipo_de_movimiento: "ENTRADA",
          referencia: referenciaText,
          usuario: usuarioText,
          fecha_salida: now,
        }));
        const regRes = await supabase
          .from("registro_de_inventario")
          .insert(registroRows);
        if (regRes.error) {
          console.warn(
            "Error registrando en registro_de_inventario",
            regRes.error
          );
          // not critical: we don't rollback compra, but inform user
          setError(
            "Compra guardada, pero falló el registro en inventario: " +
              regRes.error.message
          );
        }
      } catch (e) {
        console.warn("Registro inventario fallo", e);
      }

      // success
      resetForm();
      onClose();
      if (onCreated) onCreated();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  const totals = computeTotals();

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          width: 1100,
          maxWidth: "98%",
          background: "#fff",
          borderRadius: 16,
          boxShadow:
            "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
          maxHeight: "95vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "24px 28px",
            borderBottom: "1px solid #e2e8f0",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 700,
              color: "white",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ fontSize: 28 }}>🛒</span> Nueva compra
          </h3>
          <p
            style={{
              margin: "6px 0 0 0",
              fontSize: 14,
              color: "rgba(255,255,255,0.9)",
            }}
          >
            Registra una nueva compra a proveedor
          </p>
        </div>

        {/* Body */}
        <div style={{ padding: "24px 28px", overflow: "auto", flex: 1 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "380px 1fr",
              gap: 24,
            }}
          >
            {/* Información del proveedor */}
            <div
              style={{
                background: "#f8fafc",
                padding: 20,
                borderRadius: 12,
                border: "1px solid #e2e8f0",
              }}
            >
              <h4
                style={{
                  margin: "0 0 16px 0",
                  fontSize: 16,
                  fontWeight: 600,
                  color: "#1e293b",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                📋 Información del documento
              </h4>

              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#475569",
                    marginBottom: 6,
                  }}
                >
                  Proveedor *
                </label>
                <select
                  className="input"
                  value={proveedorId ?? ""}
                  onChange={(e) => setProveedorId(e.target.value || null)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: 14,
                    border: "1px solid #cbd5e1",
                    borderRadius: 8,
                    background: "white",
                  }}
                >
                  <option value="">-- Seleccionar proveedor --</option>
                  {proveedores.map((p) => (
                    <option key={String(p.id)} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#475569",
                    marginBottom: 6,
                  }}
                >
                  Número de documento
                </label>
                <input
                  className="input"
                  value={numeroDocumento}
                  onChange={(e) => setNumeroDocumento(e.target.value)}
                  placeholder="Ej: FAC-00123"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: 14,
                    border: "1px solid #cbd5e1",
                    borderRadius: 8,
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#475569",
                    marginBottom: 6,
                  }}
                >
                  Tipo de documento
                </label>
                <input
                  className="input"
                  value={tipoDocumento}
                  onChange={(e) => setTipoDocumento(e.target.value)}
                  placeholder="Ej: Factura, Recibo"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: 14,
                    border: "1px solid #cbd5e1",
                    borderRadius: 8,
                  }}
                />
              </div>

              {/* Resumen de totales */}
              <div
                style={{
                  marginTop: 24,
                  padding: 16,
                  background: "white",
                  borderRadius: 10,
                  border: "2px solid #e2e8f0",
                }}
              >
                <h5
                  style={{
                    margin: "0 0 12px 0",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#64748b",
                  }}
                >
                  💰 Resumen
                </h5>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 8,
                    fontSize: 14,
                  }}
                >
                  <span style={{ color: "#64748b" }}>Subtotal:</span>
                  <strong style={{ color: "#1e293b" }}>
                    L {formatMoney(totals.subtotal)}
                  </strong>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 8,
                    fontSize: 14,
                  }}
                >
                  <span style={{ color: "#64748b" }}>Impuesto:</span>
                  <strong style={{ color: "#1e293b" }}>
                    L {formatMoney(totals.impuesto)}
                  </strong>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    paddingTop: 12,
                    marginTop: 12,
                    borderTop: "2px solid #e2e8f0",
                    fontSize: 16,
                  }}
                >
                  <span style={{ fontWeight: 600, color: "#1e293b" }}>
                    Total:
                  </span>
                  <strong style={{ fontSize: 20, color: "#667eea" }}>
                    L {formatMoney(totals.total)}
                  </strong>
                </div>
              </div>
            </div>

            {/* Productos */}
            <div>
              <div
                style={{
                  background: "#f8fafc",
                  padding: 16,
                  borderRadius: 12,
                  marginBottom: 16,
                  border: "1px solid #e2e8f0",
                }}
              >
                <label
                  style={{
                    display: "block",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#1e293b",
                    marginBottom: 12,
                  }}
                >
                  ➕ Agregar productos
                </label>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: "1 1 300px", minWidth: 250 }}>
                    <input
                      list="productos-list"
                      className="input"
                      value={selectedProductoName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedProductoName(val);
                        const match = productos.find((p) => p.nombre === val);
                        setSelectedProducto(match ? match.id : null);
                      }}
                      placeholder="🔍 Buscar producto..."
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        fontSize: 14,
                        border: "1px solid #cbd5e1",
                        borderRadius: 8,
                        background: "white",
                      }}
                    />
                    <datalist id="productos-list">
                      {productos.map((p) => (
                        <option key={p.id} value={p.nombre} />
                      ))}
                    </datalist>
                  </div>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={cantidad}
                    onChange={(e) => setCantidad(Number(e.target.value))}
                    placeholder="Cant."
                    style={{
                      width: 90,
                      padding: "10px 12px",
                      fontSize: 14,
                      border: "1px solid #cbd5e1",
                      borderRadius: 8,
                    }}
                  />
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    value={costoUnitario ?? ""}
                    onChange={(e) => setCostoUnitario(Number(e.target.value))}
                    placeholder="Precio unit."
                    style={{
                      width: 120,
                      padding: "10px 12px",
                      fontSize: 14,
                      border: "1px solid #cbd5e1",
                      borderRadius: 8,
                    }}
                  />
                  <button
                    className="btn-primary"
                    onClick={addItem}
                    style={{
                      padding: "10px 20px",
                      fontSize: 14,
                      fontWeight: 600,
                      borderRadius: 8,
                      background:
                        "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                      border: "none",
                      color: "white",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    ✓ Agregar
                  </button>
                </div>
              </div>

              {/* Tabla de items */}
              <div
                style={{
                  background: "white",
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    maxHeight: 400,
                    overflow: "auto",
                  }}
                >
                  {items.length === 0 ? (
                    <div
                      style={{
                        padding: 48,
                        textAlign: "center",
                        color: "#94a3b8",
                        fontSize: 14,
                      }}
                    >
                      <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
                      <p style={{ margin: 0 }}>No hay productos agregados</p>
                      <p style={{ margin: "4px 0 0 0", fontSize: 13 }}>
                        Usa el formulario arriba para agregar productos
                      </p>
                    </div>
                  ) : (
                    <table
                      style={{ width: "100%", borderCollapse: "collapse" }}
                    >
                      <thead
                        style={{
                          position: "sticky",
                          top: 0,
                          background: "#f8fafc",
                          zIndex: 1,
                        }}
                      >
                        <tr>
                          <th
                            style={{
                              padding: "12px 16px",
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#64748b",
                              textAlign: "left",
                              borderBottom: "2px solid #e2e8f0",
                            }}
                          >
                            Producto
                          </th>
                          <th
                            style={{
                              padding: "12px 16px",
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#64748b",
                              textAlign: "center",
                              borderBottom: "2px solid #e2e8f0",
                              width: 100,
                            }}
                          >
                            Cantidad
                          </th>
                          <th
                            style={{
                              padding: "12px 16px",
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#64748b",
                              textAlign: "right",
                              borderBottom: "2px solid #e2e8f0",
                              width: 120,
                            }}
                          >
                            Costo unit.
                          </th>
                          <th
                            style={{
                              padding: "12px 16px",
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#64748b",
                              textAlign: "right",
                              borderBottom: "2px solid #e2e8f0",
                              width: 100,
                            }}
                          >
                            Impuesto
                          </th>
                          <th
                            style={{
                              padding: "12px 16px",
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#64748b",
                              textAlign: "right",
                              borderBottom: "2px solid #e2e8f0",
                              width: 120,
                            }}
                          >
                            Subtotal
                          </th>
                          <th
                            style={{
                              padding: "12px 16px",
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#64748b",
                              textAlign: "center",
                              borderBottom: "2px solid #e2e8f0",
                              width: 80,
                            }}
                          >
                            Acción
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((it, idx) => {
                          const totalPrice = it.cantidad * it.costo_unitario;
                          const tasa =
                            impuestoValor > 1
                              ? impuestoValor / 100
                              : impuestoValor;
                          const impuestoLine = it.exento
                            ? 0
                            : totalPrice * tasa;
                          const subtotalLine = it.exento
                            ? totalPrice
                            : totalPrice - impuestoLine;
                          return (
                            <tr
                              key={`${it.producto_id}-${idx}`}
                              style={{ borderBottom: "1px solid #f1f5f9" }}
                            >
                              <td
                                style={{
                                  padding: "12px 16px",
                                  fontSize: 14,
                                  color: "#1e293b",
                                  fontWeight: 500,
                                }}
                              >
                                {it.nombre}
                                {it.exento && (
                                  <span
                                    style={{
                                      marginLeft: 8,
                                      fontSize: 11,
                                      padding: "2px 6px",
                                      background: "#fef3c7",
                                      color: "#92400e",
                                      borderRadius: 4,
                                      fontWeight: 600,
                                    }}
                                  >
                                    EXENTO
                                  </span>
                                )}
                              </td>
                              <td
                                style={{
                                  padding: "12px 16px",
                                  fontSize: 14,
                                  color: "#475569",
                                  textAlign: "center",
                                }}
                              >
                                {it.cantidad}
                              </td>
                              <td
                                style={{
                                  padding: "12px 16px",
                                  fontSize: 14,
                                  color: "#1e293b",
                                  textAlign: "right",
                                  fontWeight: 500,
                                }}
                              >
                                L {formatMoney(it.costo_unitario)}
                              </td>
                              <td
                                style={{
                                  padding: "12px 16px",
                                  fontSize: 14,
                                  color: "#64748b",
                                  textAlign: "right",
                                }}
                              >
                                L {formatMoney(impuestoLine)}
                              </td>
                              <td
                                style={{
                                  padding: "12px 16px",
                                  fontSize: 14,
                                  color: "#1e293b",
                                  textAlign: "right",
                                  fontWeight: 600,
                                }}
                              >
                                L {formatMoney(subtotalLine)}
                              </td>
                              <td
                                style={{
                                  padding: "12px 16px",
                                  textAlign: "center",
                                }}
                              >
                                <button
                                  onClick={() => removeItem(idx)}
                                  style={{
                                    padding: "6px 12px",
                                    fontSize: 12,
                                    fontWeight: 600,
                                    background: "#fee2e2",
                                    color: "#dc2626",
                                    border: "1px solid #fecaca",
                                    borderRadius: 6,
                                    cursor: "pointer",
                                  }}
                                >
                                  🗑️
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Mensaje de error */}
          {error && (
            <div
              style={{
                marginTop: 20,
                padding: "14px 18px",
                background: "#fee2e2",
                color: "#dc2626",
                borderRadius: 10,
                border: "1px solid #fecaca",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "20px 28px",
            borderTop: "1px solid #e2e8f0",
            background: "#f8fafc",
            display: "flex",
            justifyContent: "flex-end",
            gap: 12,
          }}
        >
          <button
            onClick={() => {
              resetForm();
              onClose();
            }}
            disabled={saving}
            style={{
              padding: "10px 24px",
              fontSize: 15,
              fontWeight: 600,
              background: "white",
              color: "#64748b",
              border: "2px solid #cbd5e1",
              borderRadius: 10,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={confirmPurchase}
            disabled={saving || items.length === 0}
            style={{
              padding: "10px 32px",
              fontSize: 15,
              fontWeight: 700,
              background:
                saving || items.length === 0
                  ? "#cbd5e1"
                  : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              color: "white",
              border: "none",
              borderRadius: 10,
              cursor: saving || items.length === 0 ? "not-allowed" : "pointer",
              boxShadow:
                saving || items.length === 0
                  ? "none"
                  : "0 4px 6px -1px rgba(102,126,234,0.3)",
            }}
          >
            {saving ? "⏳ Guardando..." : "✓ Confirmar compra"}
          </button>
        </div>
      </div>
    </div>
  );
}
