import React, { useState, useEffect } from "react";
import { formatMoney } from "../lib/formatMoney";
import supabase from "../lib/supabaseClient";

type Producto = {
  id: string;
  sku?: string;
  nombre?: string;
  precio?: number;
  categoria?: string;
};

type ItemCarrito = {
  producto: Producto;
  cantidad: number;
  descuento?: number; // porcentaje 0-100
};

type Props = {
  carrito: ItemCarrito[];
  actualizarCantidad: (id: any, cambio: number) => void;
  eliminarDelCarrito: (id: any) => void;
  vaciarCarrito: () => void;
  aplicarDescuento: (id: any, pct: number) => void;
  subtotal: number;
  perItemTaxes: any[];
  taxRate: number;
  tax18Rate: number;
  taxTouristRate: number;
  total: number;
  openSelector: (mode: "factura" | "cotizacion") => void;
  btnStyle: React.CSSProperties;
};

export default function Cart({
  carrito,
  actualizarCantidad,
  eliminarDelCarrito,
  vaciarCarrito,
  aplicarDescuento,
  subtotal,
  perItemTaxes,
  taxRate,
  tax18Rate,
  taxTouristRate,
  total,
  openSelector,
  btnStyle,
}: Props) {
  const [showDescuentoModal, setShowDescuentoModal] = useState(false);
  const [itemParaDescuento, setItemParaDescuento] =
    useState<ItemCarrito | null>(null);
  // Porcentajes configurados en BD y promociones activas hoy
  const [pctOptions, setPctOptions] = useState<number[]>([0, 10, 15, 20]);
  const [promoActiva, setPromoActiva] = useState<Record<string, number>>({}); // categoria -> porcentaje

  const handleAplicarPct = (id: any, pct: number) => {
    aplicarDescuento(id, pct);
    setItemParaDescuento(null);
  };

  // Cargar porcentajes y promociones activas cuando se abre el modal
  useEffect(() => {
    if (!showDescuentoModal) return;
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([
      supabase
        .from("descuentos_porcentajes")
        .select("porcentaje")
        .eq("activo", true)
        .order("porcentaje"),
      supabase
        .from("promociones_descuento")
        .select("categoria,porcentaje_descuento")
        .eq("activo", true)
        .lte("fecha_inicio", today)
        .gte("fecha_fin", today),
    ])
      .then(([{ data: pcts }, { data: promos }]) => {
        if (pcts && pcts.length > 0) {
          const nums = [0, ...pcts.map((p: any) => Number(p.porcentaje))];
          setPctOptions([...new Set(nums)].sort((a, b) => a - b));
        }
        if (promos && promos.length > 0) {
          const map: Record<string, number> = {};
          promos.forEach((p: any) => {
            map[p.categoria] = p.porcentaje_descuento;
          });
          setPromoActiva(map);
        } else {
          setPromoActiva({});
        }
      })
      .catch(() => {});
  }, [showDescuentoModal]);

  return (
    <>
      <div
        style={{
          background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
          borderRadius: 16,
          padding: 20,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)",
          height: "fit-content",
          position: "sticky",
          top: 16,
          alignSelf: "start",
          border: "1px solid #e2e8f0",
        }}
      >
        {/* Header del Carrito */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
            paddingBottom: 12,
            borderBottom: "2px solid #e2e8f0",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>🛒</span>
            <h3
              style={{
                margin: 0,
                fontSize: "1.2rem",
                fontWeight: 700,
                color: "#1e293b",
              }}
            >
              Carrito
            </h3>
            {carrito.length > 0 && (
              <span
                style={{
                  background:
                    "linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)",
                  color: "white",
                  padding: "2px 10px",
                  borderRadius: 12,
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {carrito.length}
              </span>
            )}
          </div>
          {carrito.length > 0 && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={() => setShowDescuentoModal(true)}
                className="btn-opaque"
                style={{
                  background: "#fefce8",
                  color: "#b45309",
                  fontSize: "0.85rem",
                  padding: "6px 12px",
                  borderRadius: 8,
                  fontWeight: 600,
                  border: "1px solid #fde68a",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#f59e0b";
                  e.currentTarget.style.color = "white";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#fefce8";
                  e.currentTarget.style.color = "#b45309";
                }}
              >
                🏷️ Descuento
              </button>
              <button
                onClick={vaciarCarrito}
                className="btn-opaque"
                style={{
                  background: "#fef2f2",
                  color: "#dc2626",
                  fontSize: "0.85rem",
                  padding: "6px 12px",
                  borderRadius: 8,
                  fontWeight: 600,
                  border: "1px solid #fecaca",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#dc2626";
                  e.currentTarget.style.color = "white";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#fef2f2";
                  e.currentTarget.style.color = "#dc2626";
                }}
              >
                🗑️ Vaciar
              </button>
            </div>
          )}
        </div>

        {carrito.length > 0 && (
          <div
            style={{
              background: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
              border: "2px solid #0ea5e9",
              borderRadius: 12,
              padding: "10px 12px",
              marginBottom: 10,
            }}
          >
            {/* Total Principal */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "1.4rem",
                fontWeight: 800,
                marginBottom: 6,
                color: "#0c4a6e",
                paddingBottom: 6,
                borderBottom: "2px dashed #0ea5e9",
              }}
            >
              <span>TOTAL:</span>
              <span>L{formatMoney(total)}</span>
            </div>

            {/* Subtotal */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontWeight: 600,
                fontSize: 11,
                color: "#475569",
                marginBottom: 3,
              }}
            >
              <span>Subtotal:</span>
              <span>L{formatMoney(subtotal)}</span>
            </div>

            {/* Impuestos */}
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 2,
                }}
              >
                <span>ISV ({taxRate * 100}%):</span>
                <strong style={{ color: "#475569" }}>
                  L
                  {formatMoney(
                    Number(
                      perItemTaxes.reduce((s, it) => s + (it.isv || 0), 0),
                    ),
                  )}
                </strong>
              </div>
            </div>

            {/* Desglose por ítem */}
            <details style={{ marginTop: 6 }}>
              <summary
                style={{
                  cursor: "pointer",
                  fontSize: 12,
                  color: "#0284c7",
                  fontWeight: 600,
                  padding: "6px 0",
                  userSelect: "none",
                }}
              >
                📊 Ver desglose detallado
              </summary>
              <div style={{ marginTop: 8, fontSize: 11 }}>
                {perItemTaxes.map((it) => (
                  <div
                    key={String(it.id)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "6px 8px",
                      borderBottom: "1px dashed #bae6fd",
                      background: "white",
                      borderRadius: 4,
                      marginBottom: 4,
                    }}
                  >
                    <div style={{ color: "#0f172a", fontWeight: 600 }}>
                      {it.nombre}
                    </div>
                    <div style={{ color: "#64748b", fontSize: 10 }}>
                      ISV: L{formatMoney(it.isv)} • 18%: L
                      {formatMoney(it.imp18)} • Tur: L{formatMoney(it.tur)}
                    </div>
                  </div>
                ))}
              </div>
            </details>

            {/* Botones de acción */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                marginTop: 10,
              }}
            >
              <button
                onClick={() => openSelector("cotizacion")}
                className="btn-opaque"
                style={{
                  background:
                    "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                  color: "white",
                  padding: "9px 12px",
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 13,
                  border: "none",
                  boxShadow: "0 4px 8px rgba(245, 158, 11, 0.3)",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow =
                    "0 6px 12px rgba(245, 158, 11, 0.4)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow =
                    "0 4px 8px rgba(245, 158, 11, 0.3)";
                }}
              >
                📋 Cotización
              </button>
              <button
                onClick={() => openSelector("factura")}
                className="btn-opaque"
                style={{
                  background:
                    "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                  color: "white",
                  padding: "9px 12px",
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 13,
                  border: "none",
                  boxShadow: "0 4px 8px rgba(16, 185, 129, 0.3)",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow =
                    "0 6px 12px rgba(16, 185, 129, 0.4)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow =
                    "0 4px 8px rgba(16, 185, 129, 0.3)";
                }}
              >
                💰 Facturar
              </button>
            </div>
          </div>
        )}

        {/* Lista de productos */}
        {carrito.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "60px 20px",
              color: "#94a3b8",
              background: "#f8fafc",
              borderRadius: 12,
              border: "2px dashed #e2e8f0",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>🛒</div>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
              Carrito vacío
            </div>
            <div style={{ fontSize: 13 }}>Agrega productos para comenzar</div>
          </div>
        ) : (
          <div
            style={{
              maxHeight: "50vh",
              minHeight: 80,
              overflowY: "auto",
              paddingRight: 4,
              scrollbarWidth: "thin",
              scrollbarColor: "#0ea5e9 #f1f5f9",
              borderTop: "1px solid #e2e8f0",
              paddingTop: 8,
            }}
          >
            {carrito.map((item, idx) => {
              const pct = Number(item.descuento || 0);
              const precioBase = Number(item.producto.precio || 0);
              const precioEf = precioBase * (1 - pct / 100);
              return (
                <div
                  key={item.producto.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 10px",
                    marginBottom: 5,
                    background: idx % 2 === 0 ? "white" : "#f8fafc",
                    borderRadius: 10,
                    border: "1px solid #e2e8f0",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#f0f9ff";
                    e.currentTarget.style.borderColor = "#0ea5e9";
                    e.currentTarget.style.transform = "scale(1.02)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background =
                      idx % 2 === 0 ? "white" : "#f8fafc";
                    e.currentTarget.style.borderColor = "#e2e8f0";
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: "0.8rem",
                        color: "#1e293b",
                        marginBottom: 2,
                      }}
                    >
                      {item.producto.nombre}
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "#64748b",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        flexWrap: "wrap",
                      }}
                    >
                      <code
                        style={{
                          background: "#f1f5f9",
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {item.producto.sku}
                      </code>
                      {pct > 0 ? (
                        <>
                          <span
                            style={{
                              textDecoration: "line-through",
                              color: "#94a3b8",
                            }}
                          >
                            L{formatMoney(precioBase)} c/u
                          </span>
                          <span style={{ color: "#059669", fontWeight: 700 }}>
                            L{formatMoney(precioEf)} c/u
                          </span>
                          <span
                            style={{
                              background: "#fef3c7",
                              color: "#b45309",
                              padding: "1px 6px",
                              borderRadius: 8,
                              fontSize: 10,
                              fontWeight: 700,
                            }}
                          >
                            -{pct}%
                          </span>
                        </>
                      ) : (
                        <span style={{ marginLeft: 0 }}>
                          L{formatMoney(precioBase)} c/u
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <button
                      onClick={() => actualizarCantidad(item.producto.id, -1)}
                      style={{
                        ...btnStyle,
                        background: "#f1f5f9",
                        color: "#475569",
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        fontWeight: 700,
                        fontSize: 16,
                        border: "1px solid #e2e8f0",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#0ea5e9";
                        e.currentTarget.style.color = "white";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "#f1f5f9";
                        e.currentTarget.style.color = "#475569";
                      }}
                    >
                      −
                    </button>
                    <span
                      style={{
                        minWidth: 32,
                        textAlign: "center",
                        fontWeight: 700,
                        fontSize: 15,
                        color: "#1e293b",
                      }}
                    >
                      {item.cantidad}
                    </span>
                    <button
                      onClick={() => actualizarCantidad(item.producto.id, 1)}
                      style={{
                        ...btnStyle,
                        background: "#f1f5f9",
                        color: "#475569",
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        fontWeight: 700,
                        fontSize: 16,
                        border: "1px solid #e2e8f0",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#0ea5e9";
                        e.currentTarget.style.color = "white";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "#f1f5f9";
                        e.currentTarget.style.color = "#475569";
                      }}
                    >
                      +
                    </button>
                    <button
                      onClick={() => eliminarDelCarrito(item.producto.id)}
                      style={{
                        ...btnStyle,
                        background: "#fef2f2",
                        color: "#dc2626",
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        fontWeight: 700,
                        fontSize: 18,
                        border: "1px solid #fecaca",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#dc2626";
                        e.currentTarget.style.color = "white";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "#fef2f2";
                        e.currentTarget.style.color = "#dc2626";
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modal de Descuento: lista de productos ── */}
      {showDescuentoModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9100,
          }}
          onClick={() => {
            setShowDescuentoModal(false);
            setItemParaDescuento(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              borderRadius: 16,
              padding: 28,
              width: 440,
              maxWidth: "95vw",
              maxHeight: "80vh",
              overflowY: "auto",
              boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: "1.1rem",
                  color: "#1e293b",
                  fontWeight: 700,
                }}
              >
                🏷️ Aplicar Descuento
              </h3>
              <button
                onClick={() => {
                  setShowDescuentoModal(false);
                  setItemParaDescuento(null);
                }}
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
            <p
              style={{
                color: "#64748b",
                fontSize: 13,
                marginTop: 0,
                marginBottom: 16,
              }}
            >
              Selecciona un producto para aplicarle descuento:
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {carrito.map((item) => {
                const pct = Number(item.descuento || 0);
                const precioBase = Number(item.producto.precio || 0);
                const precioEf = precioBase * (1 - pct / 100);
                const totalItem = precioEf * item.cantidad;
                const isSelected =
                  itemParaDescuento?.producto.id === item.producto.id;
                return (
                  <div key={item.producto.id}>
                    <div
                      style={{
                        padding: "12px 14px",
                        borderRadius: 10,
                        border: `2px solid ${isSelected ? "#f59e0b" : "#e2e8f0"}`,
                        background: isSelected ? "#fffbeb" : "white",
                        transition: "all 0.2s",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: 10,
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: 14,
                              color: "#1e293b",
                              marginBottom: 4,
                            }}
                          >
                            {item.producto.nombre}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "#64748b",
                              display: "flex",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <span>Cantidad: {item.cantidad}</span>
                            <span>•</span>
                            {pct > 0 ? (
                              <>
                                <span
                                  style={{
                                    textDecoration: "line-through",
                                    color: "#94a3b8",
                                  }}
                                >
                                  L{formatMoney(precioBase * item.cantidad)}
                                </span>
                                <span
                                  style={{ color: "#059669", fontWeight: 700 }}
                                >
                                  L{formatMoney(totalItem)}
                                </span>
                                <span
                                  style={{
                                    background: "#fef3c7",
                                    color: "#b45309",
                                    padding: "1px 7px",
                                    borderRadius: 8,
                                    fontWeight: 700,
                                  }}
                                >
                                  -{pct}%
                                </span>
                              </>
                            ) : (
                              <span>Total: L{formatMoney(totalItem)}</span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() =>
                            setItemParaDescuento(isSelected ? null : item)
                          }
                          style={{
                            padding: "7px 14px",
                            borderRadius: 8,
                            border: "none",
                            background: isSelected
                              ? "#f59e0b"
                              : "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                            color: "white",
                            fontWeight: 700,
                            fontSize: 12,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                            boxShadow: "0 2px 6px rgba(245,158,11,0.3)",
                          }}
                        >
                          {isSelected ? "▲ Cerrar" : "Aplicar Descuento"}
                        </button>
                      </div>

                      {/* Sub-panel de selección de porcentaje */}
                      {isSelected && (
                        <div
                          style={{
                            marginTop: 12,
                            padding: "12px 14px",
                            borderRadius: 8,
                            background: "#fffbeb",
                            border: "1px dashed #fde68a",
                          }}
                        >
                          {/* Promo activa para esta categoría */}
                          {item.producto.categoria &&
                            promoActiva[item.producto.categoria] != null && (
                              <div
                                style={{
                                  marginBottom: 10,
                                  padding: "7px 12px",
                                  borderRadius: 8,
                                  background: "#ecfdf5",
                                  border: "1px solid #6ee7b7",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                }}
                              >
                                <span style={{ fontSize: 18 }}>✨</span>
                                <div>
                                  <span
                                    style={{
                                      fontWeight: 700,
                                      fontSize: 12,
                                      color: "#065f46",
                                    }}
                                  >
                                    Promoción activa para "
                                    {item.producto.categoria}":
                                  </span>
                                  <span
                                    style={{
                                      fontWeight: 900,
                                      fontSize: 14,
                                      color: "#047857",
                                      marginLeft: 6,
                                    }}
                                  >
                                    {promoActiva[item.producto.categoria]}% OFF
                                  </span>
                                  <button
                                    onClick={() =>
                                      handleAplicarPct(
                                        item.producto.id,
                                        promoActiva[item.producto.categoria!]!,
                                      )
                                    }
                                    style={{
                                      marginLeft: 10,
                                      padding: "3px 12px",
                                      borderRadius: 6,
                                      border: "none",
                                      background: "#10b981",
                                      color: "white",
                                      fontWeight: 700,
                                      fontSize: 11,
                                      cursor: "pointer",
                                    }}
                                  >
                                    Aplicar
                                  </button>
                                </div>
                              </div>
                            )}
                          <div
                            style={{
                              fontSize: 12,
                              color: "#92400e",
                              fontWeight: 600,
                              marginBottom: 10,
                            }}
                          >
                            Selecciona el porcentaje de descuento:
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            {pctOptions.map((p) => (
                              <button
                                key={p}
                                onClick={() =>
                                  handleAplicarPct(item.producto.id, p)
                                }
                                style={{
                                  padding: "8px 18px",
                                  borderRadius: 8,
                                  border: `2px solid ${pct === p ? "#f59e0b" : "#fde68a"}`,
                                  background: pct === p ? "#f59e0b" : "white",
                                  color: pct === p ? "white" : "#b45309",
                                  fontWeight: 700,
                                  fontSize: 14,
                                  cursor: "pointer",
                                  transition: "all 0.15s",
                                }}
                              >
                                {p === 0 ? "Sin descuento" : `-${p}%`}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 20, textAlign: "right" }}>
              <button
                onClick={() => {
                  setShowDescuentoModal(false);
                  setItemParaDescuento(null);
                }}
                style={{
                  padding: "10px 24px",
                  borderRadius: 8,
                  border: "none",
                  background: "#0ea5e9",
                  color: "white",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                ✓ Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
