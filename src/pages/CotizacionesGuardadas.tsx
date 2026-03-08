import React, { useEffect, useState } from "react";
import { formatMoney } from '../lib/formatMoney';
import supabase from "../lib/supabaseClient";
import generateCotizacionHTML from "../lib/cotizaconhtmlimp";
import ModalWrapper from "../components/ModalWrapper";
import Confirmado from "../components/Confirmado";

type Cotizacion = {
  id: number;
  cliente_id?: number;
  cliente?: string;
  rtn?: string | null;
  subtotal?: number;
  isv?: number;
  impuesto_18?: number;
  impuesto_turistico?: number;
  impuesto?: number;
  numero_cotizacion?: string;
  fecha_cotizacion?: string;
  usuario?: string;
  estado?: string;
  total?: number;
  creada_en?: string;
  nota?: string | null;
  cliente_nombre?: string | null;
};

type CotizacionDetalle = {
  id?: number;
  cotizacion_id?: number;
  producto_id?: string | number;
  sku?: string | null;
  nombre?: string | null;
  descripcion?: string | null;
  cantidad?: number;
  precio_unitario?: number;
  subtotal?: number;
  isv?: number;
  impuesto_18?: number;
  impuesto_turistico?: number;
  descuento?: number;
  total?: number;
};

export default function CotizacionesGuardadas({
  onBack,
}: {
  onBack: () => void;
}) {
  const [rows, setRows] = useState<Cotizacion[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detalles, setDetalles] = useState<CotizacionDetalle[]>([]);
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<Cotizacion | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const fetchRows = async () => {
    setLoading(true);
    try {
      // seleccionar columnas relevantes
      const { data, error } = await supabase
        .from("cotizaciones")
        .select("*")
        .order("fecha_cotizacion", { ascending: false });
      if (error) throw error;
      const baseRows = Array.isArray(data) ? (data as Cotizacion[]) : [];

      // resolver nombres de cliente para mostrar en la tabla
      const clienteIds = Array.from(
        new Set(baseRows.map((r) => (r as any).cliente_id).filter(Boolean))
      );
      let clienteMap: Record<string, string> = {};
      if (clienteIds.length > 0) {
        try {
          const { data: clientsData } = await supabase
            .from("clientes")
            .select("id,nombre")
            .in("id", clienteIds);
          if (Array.isArray(clientsData)) {
            for (const c of clientsData)
              clienteMap[String((c as any).id)] = (c as any).nombre || "";
          }
        } catch (e) {
          console.warn("Error cargando nombres de clientes:", e);
        }
      }

      const enriched = baseRows.map((r) => ({
        ...r,
        cliente_nombre: clienteMap[String((r as any).cliente_id)] || null,
      }));
      setRows(enriched);
    } catch (e) {
      console.warn("Error cargando cotizaciones:", e);
      setRows([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRows();
  }, []);

  const [viewHeader, setViewHeader] = useState<Cotizacion | null>(null);
  const [viewClientName, setViewClientName] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");

  const openView = async (id: number) => {
    setSelectedId(id);
    try {
      // fetch header and detalles
      const { data: hd, error: hErr } = await supabase
        .from("cotizaciones")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (hErr) console.warn("Error cargando cabecera de cotizacion", hErr);
      setViewHeader((hd as any) || null);

      if (hd && (hd as any).cliente_id) {
        try {
          const { data: cdata } = await supabase
            .from("clientes")
            .select("id,nombre")
            .eq("id", (hd as any).cliente_id)
            .maybeSingle();
          setViewClientName((cdata as any)?.nombre || null);
        } catch (e) {
          setViewClientName(null);
        }
      } else {
        setViewClientName(null);
      }

      const { data, error } = await supabase
        .from("cotizaciones_detalle")
        .select("*")
        .eq("cotizacion_id", id);
      if (error) throw error;
      setDetalles(Array.isArray(data) ? (data as CotizacionDetalle[]) : []);
      setViewOpen(true);
    } catch (e) {
      console.warn("Error cargando detalles de cotizacion", e);
      setDetalles([]);
    }
  };

  const openEdit = async (row: Cotizacion) => {
    try {
      const { data, error } = await supabase
        .from("cotizaciones_detalle")
        .select("*")
        .eq("cotizacion_id", row.id);
      const detallesData = Array.isArray(data)
        ? (data as CotizacionDetalle[])
        : [];
      // store header + detalles in localStorage so PuntoDeVentas can load them
      const payload = { header: row, detalles: detallesData };
      try {
        localStorage.setItem("cotizacion_to_load", JSON.stringify(payload));
      } catch (e) {
        console.warn("No se pudo escribir localStorage", e);
      }
      try {
        // also dispatch a window event so PuntoDeVentas can react immediately
        window.dispatchEvent(
          new CustomEvent("cotizacion:load", { detail: payload })
        );
      } catch (e) {
        // ignore
      }
      // return to PuntoDeVentas (onBack) to allow editing/adding products
      onBack();
    } catch (e) {
      console.warn("Error cargando detalles para editar", e);
    }
  };

  const requestDeleteRow = async (id: number) => {
    setDeleteId(id);
    setConfirmDeleteOpen(true);
  };

  const performDeleteRow = async () => {
    if (deleteId == null) return;
    try {
      const { error: d1 } = await supabase
        .from("cotizaciones_detalle")
        .delete()
        .eq("cotizacion_id", deleteId);
      if (d1) console.warn("Error eliminando detalles:", d1);
      const { error: d2 } = await supabase
        .from("cotizaciones")
        .delete()
        .eq("id", deleteId);
      if (d2) throw d2;
      await fetchRows();
      setConfirmDeleteOpen(false);
      setSuccessOpen(true);
    } catch (e: any) {
      console.warn("Error eliminando cotizacion:", e);
      setErrorMessage(e?.message || String(e));
      setErrorOpen(true);
    }
  };

  const reprintRow = async (id: number) => {
    try {
      // fetch header
      const { data: hd, error: hErr } = await supabase
        .from("cotizaciones")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (hErr || !hd) {
        console.warn("Error fetching cotizacion header for reprint", hErr);
        return;
      }
      // fetch detalles
      const { data: detRows, error: detErr } = await supabase
        .from("cotizaciones_detalle")
        .select("*")
        .eq("cotizacion_id", id);
      if (detErr) {
        console.warn("Error fetching cotizacion detalles for reprint", detErr);
        return;
      }

      const carrito = Array.isArray(detRows)
        ? detRows.map((d: any) => ({
            producto: { sku: d.sku || "" },
            descripcion: d.descripcion || d.nombre || "",
            cantidad: Number(d.cantidad || 1),
            precio_unitario: Number(d.precio_unitario || d.precio || 0),
            subtotal: Number(d.subtotal || 0),
            total: Number(d.total || 0),
          }))
        : [];

      const opts: any = {
        cliente: (hd as any).cliente || null,
        rtn: (hd as any).rtn || null,
        cotizacion:
          (hd as any).numero_cotizacion || (hd as any)["Número"] || null,
      };

      const params: any = {
        carrito,
        subtotal: Number((hd as any).subtotal || 0),
        isvTotal: Number((hd as any).isv || (hd as any).impuesto || 0),
        imp18Total: Number((hd as any).impuesto_18 || 0),
        impTouristTotal: Number((hd as any).impuesto_turistico || 0),
        total: Number((hd as any).total || 0),
      };

      const html = await generateCotizacionHTML(opts, "cotizacion", params);

      // Abrir en nueva ventana/pestaña para que funcione correctamente en móviles/tablets
      try {
        // Detectar si es móvil/tablet
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (isMobile) {
          // En móviles: usar blob URL para abrir en nueva pestaña
          const blob = new Blob([html], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          const newWindow = window.open(url, '_blank');
          
          if (newWindow) {
            // Limpiar el blob URL después de un tiempo
            setTimeout(() => URL.revokeObjectURL(url), 10000);
            
            // Intentar imprimir automáticamente después de cargar
            newWindow.addEventListener('load', () => {
              setTimeout(() => {
                try {
                  newWindow.print();
                } catch (e) {
                  console.debug("Auto-print no disponible en este navegador móvil");
                }
              }, 500);
            });
          } else {
            // Fallback si el popup fue bloqueado
            alert("Por favor, permite ventanas emergentes para imprimir la cotización");
          }
        } else {
          // En desktop: abrir ventana normal
          const printWindow = window.open("", "_blank", "width=800,height=600");
          if (printWindow) {
            printWindow.document.open();
            printWindow.document.write(html);
            printWindow.document.close();
            
            // Esperar a que carguen las imágenes antes de imprimir
            const imgs = printWindow.document.images;
            if (imgs && imgs.length > 0) {
              let loaded = 0;
              const checkLoaded = () => {
                loaded++;
                if (loaded === imgs.length) {
                  setTimeout(() => {
                    try {
                      printWindow.focus();
                      printWindow.print();
                    } catch (e) {
                      console.warn("Error al imprimir:", e);
                    }
                  }, 300);
                }
              };
              
              for (let i = 0; i < imgs.length; i++) {
                const img = imgs[i] as HTMLImageElement;
                if (img.complete) {
                  checkLoaded();
                } else {
                  img.addEventListener("load", checkLoaded);
                  img.addEventListener("error", checkLoaded);
                }
              }
            } else {
              // Sin imágenes, imprimir directamente
              setTimeout(() => {
                try {
                  printWindow.focus();
                  printWindow.print();
                } catch (e) {
                  console.warn("Error al imprimir:", e);
                }
              }, 300);
            }
          } else {
            alert("Por favor, permite ventanas emergentes para imprimir la cotización");
          }
        }
      } catch (e) {
        console.error("Error abriendo ventana de impresión:", e);
        alert("Error al abrir la ventana de impresión. Por favor, verifica los permisos de ventanas emergentes.");
      }
    } catch (e) {
      console.warn("Error reprinting cotizacion", e);
    }
  };

  const saveEdit = async () => {
    if (!editRow) return;
    try {
      // update cotizaciones
      const payload: any = {
        cliente: editRow.cliente || null,
        rtn: editRow.rtn || null,
        nota: editRow.nota || null,
        subtotal: Number(editRow.subtotal || 0),
        isv: Number(editRow.isv || 0),
        impuesto_18: Number(editRow.impuesto_18 || 0),
        impuesto_turistico: Number(editRow.impuesto_turistico || 0),
        total: Number(editRow.total || 0),
      };
      const { error: upErr } = await supabase
        .from("cotizaciones")
        .update(payload)
        .eq("id", editRow.id);
      if (upErr) console.warn("Error actualizando cotizacion:", upErr);

      // replace detalles: delete existing, insert current detalles state
      if (editRow.id) {
        const { error: delErr } = await supabase
          .from("cotizaciones_detalle")
          .delete()
          .eq("cotizacion_id", editRow.id);
        if (delErr) console.warn("Error borrando detalles antiguos:", delErr);
        const detallesToInsert = detalles.map((d) => ({
          ...d,
          cotizacion_id: editRow.id,
        }));
        const { error: insErr } = await supabase
          .from("cotizaciones_detalle")
          .insert(detallesToInsert);
        if (insErr)
          console.warn("Error insertando detalles actualizados:", insErr);
      }
      setEditOpen(false);
      fetchRows();
    } catch (e) {
      console.warn("Error guardando cotizacion editada:", e);
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
          Cotizaciones Guardadas
        </h2>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={fetchRows}
            className="btn-opaque"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <svg
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              ></path>
            </svg>
            Refrescar
          </button>
          <button
            onClick={onBack}
            className="btn-opaque"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            ← Volver
          </button>
        </div>
      </header>

      <section
        style={{
          background: "white",
          padding: 32,
          borderRadius: 16,
          boxShadow:
            "0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)",
          marginBottom: 24,
        }}
      >
        {/* Search Bar */}
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div style={{ position: "relative", display: "flex", gap: 12 }}>
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
                placeholder="Buscar por número, cliente o usuario..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input"
                style={{
                  paddingLeft: 42,
                  height: 48,
                  fontSize: "15px",
                  borderRadius: 12,
                }}
              />
            </div>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="btn-opaque"
                style={{ height: 48, borderRadius: 12 }}
              >
                Limpiar
              </button>
            )}
          </div>
        </div>
      </section>

      <section
        style={{
          background: "white",
          borderRadius: 12,
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
          overflow: "hidden",
        }}
      >
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
            Cargando...
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
            No hay cotizaciones guardadas.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  textAlign: "left",
                  background: "#f8fafc",
                  borderBottom: "1px solid #e2e8f0",
                }}
              >
                <th
                  style={{
                    padding: "16px 24px",
                    fontWeight: 600,
                    color: "#475569",
                  }}
                >
                  Número
                </th>
                <th
                  style={{
                    padding: "16px 24px",
                    fontWeight: 600,
                    color: "#475569",
                  }}
                >
                  Fecha
                </th>
                <th
                  style={{
                    padding: "16px 24px",
                    fontWeight: 600,
                    color: "#475569",
                  }}
                >
                  Usuario
                </th>
                <th
                  style={{
                    padding: "16px 24px",
                    fontWeight: 600,
                    color: "#475569",
                  }}
                >
                  Cliente
                </th>
                <th
                  style={{
                    padding: "16px 24px",
                    fontWeight: 600,
                    color: "#475569",
                  }}
                >
                  Total
                </th>
                <th
                  style={{
                    padding: "16px 24px",
                    fontWeight: 600,
                    color: "#475569",
                  }}
                >
                  Estado
                </th>
                <th
                  style={{
                    padding: "16px 24px",
                    fontWeight: 600,
                    color: "#475569",
                    textAlign: "right",
                  }}
                >
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((r) => {
                  if (!searchTerm) return true;
                  const s = searchTerm.toLowerCase();
                  const num = (
                    r.numero_cotizacion ||
                    (r as any)["Número"] ||
                    ""
                  ).toLowerCase();
                  const client = (
                    (r as any).cliente_nombre || ""
                  )?.toLowerCase();
                  const usuario = (r.usuario || "").toLowerCase();
                  return (
                    num.includes(s) || client.includes(s) || usuario.includes(s)
                  );
                })
                .map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "16px 24px",
                        fontWeight: 500,
                        color: "#1e293b",
                      }}
                    >
                      {r.numero_cotizacion || (r as any)["Número"] || ""}
                    </td>
                    <td style={{ padding: "16px 24px", color: "#64748b" }}>
                      {r.fecha_cotizacion
                        ? new Date(r.fecha_cotizacion).toLocaleString()
                        : ""}
                    </td>
                    <td style={{ padding: "16px 24px", color: "#64748b" }}>
                      {r.usuario || ""}
                    </td>
                    <td style={{ padding: "16px 24px", color: "#64748b" }}>
                      {(r as any).cliente_nombre ||
                        ((r as any).cliente_id
                          ? String((r as any).cliente_id)
                          : "Consumidor Final")}
                    </td>
                    <td
                      style={{
                        padding: "16px 24px",
                        fontWeight: 600,
                        color: "#1e293b",
                      }}
                    >
                      L {formatMoney(Number(r.total || 0))}
                    </td>
                    <td style={{ padding: "16px 24px" }}>
                      <span
                        style={{
                          padding: "4px 10px",
                          borderRadius: 9999,
                          fontSize: "12px",
                          fontWeight: 600,
                          background:
                            String(r.estado || "").toLowerCase() === "aceptada"
                              ? "#dcfce7"
                              : "#f1f5f9",
                          color:
                            String(r.estado || "").toLowerCase() === "aceptada"
                              ? "#166534"
                              : "#475569",
                        }}
                      >
                        {r.estado || "Pendiente"}
                      </span>
                    </td>
                    <td style={{ padding: "16px 24px", textAlign: "right" }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          gap: 8,
                        }}
                      >
                        <button
                          onClick={() => openView(r.id)}
                          className="btn-opaque"
                          style={{ padding: "6px 12px", fontSize: "12px" }}
                        >
                          Ver
                        </button>
                        <button
                          onClick={() => reprintRow(r.id)}
                          className="btn-opaque"
                          style={{ padding: "6px 12px", fontSize: "12px" }}
                        >
                          Imprimir
                        </button>
                        {String(r.estado || "").toLowerCase() === "aceptada" ? (
                          <button
                            className="btn-opaque"
                            style={{
                              padding: "6px 12px",
                              fontSize: "12px",
                              opacity: 0.5,
                              cursor: "not-allowed",
                            }}
                            disabled
                          >
                            Editar
                          </button>
                        ) : (
                          <button
                            onClick={() => openEdit(r)}
                            className="btn-opaque"
                            style={{ padding: "6px 12px", fontSize: "12px" }}
                          >
                            Editar
                          </button>
                        )}
                        <button
                          onClick={() => requestDeleteRow(r.id)}
                          className="btn-opaque"
                          style={{
                            padding: "6px 12px",
                            fontSize: "12px",
                            background: "#fee2e2",
                            color: "#ef4444",
                          }}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Modal Ver */}
      {viewOpen && (
        <ModalWrapper
          open={viewOpen}
          onClose={() => {
            setViewOpen(false);
            setDetalles([]);
            setSelectedId(null);
          }}
          width={880}
        >
          <div style={{ padding: "0 8px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 24,
              }}
            >
              <h3 style={{ margin: 0, fontSize: "20px", color: "#1e293b" }}>
                Detalle de Cotización #{selectedId}
              </h3>
              <button
                onClick={() => {
                  setViewOpen(false);
                  setDetalles([]);
                  setSelectedId(null);
                }}
                className="btn-opaque"
              >
                Cerrar
              </button>
            </div>

            {viewHeader && (
              <div
                style={{
                  background: "#f8fafc",
                  padding: 20,
                  borderRadius: 12,
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: 16,
                    marginBottom: 16,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#64748b",
                        marginBottom: 4,
                      }}
                    >
                      NÚMERO
                    </div>
                    <div style={{ fontWeight: 600, color: "#1e293b" }}>
                      {viewHeader.numero_cotizacion ||
                        (viewHeader as any)["Número"] ||
                        ""}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#64748b",
                        marginBottom: 4,
                      }}
                    >
                      FECHA
                    </div>
                    <div style={{ fontWeight: 600, color: "#1e293b" }}>
                      {viewHeader.fecha_cotizacion
                        ? new Date(viewHeader.fecha_cotizacion).toLocaleString()
                        : ""}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#64748b",
                        marginBottom: 4,
                      }}
                    >
                      CLIENTE
                    </div>
                    <div style={{ fontWeight: 600, color: "#1e293b" }}>
                      {viewClientName ??
                        (viewHeader.cliente_id
                          ? String((viewHeader as any).cliente_id)
                          : "Consumidor Final")}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#64748b",
                        marginBottom: 4,
                      }}
                    >
                      USUARIO
                    </div>
                    <div style={{ fontWeight: 600, color: "#1e293b" }}>
                      {viewHeader.usuario}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                overflow: "hidden",
                marginBottom: 24,
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr
                    style={{
                      textAlign: "left",
                      background: "#f8fafc",
                      borderBottom: "1px solid #e2e8f0",
                    }}
                  >
                    <th
                      style={{
                        padding: "12px 16px",
                        fontSize: "12px",
                        color: "#64748b",
                        fontWeight: 600,
                      }}
                    >
                      DESCRIPCIÓN
                    </th>
                    <th
                      style={{
                        padding: "12px 16px",
                        fontSize: "12px",
                        color: "#64748b",
                        fontWeight: 600,
                        textAlign: "right",
                      }}
                    >
                      CANTIDAD
                    </th>
                    <th
                      style={{
                        padding: "12px 16px",
                        fontSize: "12px",
                        color: "#64748b",
                        fontWeight: 600,
                        textAlign: "right",
                      }}
                    >
                      PRECIO U.
                    </th>
                    <th
                      style={{
                        padding: "12px 16px",
                        fontSize: "12px",
                        color: "#64748b",
                        fontWeight: 600,
                        textAlign: "right",
                      }}
                    >
                      SUBTOTAL
                    </th>
                    <th
                      style={{
                        padding: "12px 16px",
                        fontSize: "12px",
                        color: "#64748b",
                        fontWeight: 600,
                        textAlign: "right",
                      }}
                    >
                      TOTAL
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {detalles.map((d, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "12px 16px", color: "#1e293b" }}>
                        {d.descripcion}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          textAlign: "right",
                          color: "#64748b",
                        }}
                      >
                        {d.cantidad}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          textAlign: "right",
                          color: "#64748b",
                        }}
                      >
                        L {formatMoney(Number(d.precio_unitario || 0))}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          textAlign: "right",
                          color: "#64748b",
                        }}
                      >
                        L{" "}
                        {formatMoney(Number(
                          d.subtotal ||
                            (d.precio_unitario || 0) * (d.cantidad || 0)
                        ))}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          textAlign: "right",
                          fontWeight: 600,
                          color: "#1e293b",
                        }}
                      >
                        L{" "}
                        {formatMoney(Number(
                          d.total || (d.subtotal || 0) - (d.descuento || 0)
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {viewHeader && (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div
                  style={{
                    width: 280,
                    background: "#f8fafc",
                    padding: 16,
                    borderRadius: 8,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ color: "#64748b" }}>Subtotal:</span>
                    <span style={{ fontWeight: 500 }}>
                      L {formatMoney(Number(viewHeader.subtotal || 0))}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ color: "#64748b" }}>Impuesto:</span>
                    <span style={{ fontWeight: 500 }}>
                      L {formatMoney(Number(viewHeader.impuesto || 0))}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      paddingTop: 8,
                      borderTop: "1px solid #e2e8f0",
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
                      L {formatMoney(Number(viewHeader.total || 0))}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ModalWrapper>
      )}

      <Confirmado
        open={confirmDeleteOpen}
        title="Confirmar eliminación"
        message="¿Eliminar esta cotización? Esta acción no se puede deshacer."
        onClose={() => setConfirmDeleteOpen(false)}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={async () => {
          await performDeleteRow();
        }}
      />

      <Confirmado
        open={successOpen}
        title="Eliminado"
        message="Cotización eliminada correctamente"
        onClose={() => setSuccessOpen(false)}
      />

      <Confirmado
        open={errorOpen}
        title="Error"
        message={errorMessage}
        onClose={() => setErrorOpen(false)}
      />

      {/* Modal Editar */}
      {editOpen && editRow && (
        <ModalWrapper
          open={editOpen}
          onClose={() => {
            setEditOpen(false);
            setDetalles([]);
            setEditRow(null);
          }}
          width={880}
        >
          <div style={{ padding: "0 8px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 24,
              }}
            >
              <h3 style={{ margin: 0, fontSize: "20px", color: "#1e293b" }}>
                Editar Cotización #{editRow.id}
              </h3>
              <button
                onClick={() => {
                  setEditOpen(false);
                  setDetalles([]);
                  setEditRow(null);
                }}
                className="btn-opaque"
              >
                Cerrar
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                marginBottom: 24,
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: 6,
                    fontWeight: 500,
                    color: "#475569",
                  }}
                >
                  Cliente
                </label>
                <input
                  value={editRow.cliente || ""}
                  onChange={(e) =>
                    setEditRow({ ...editRow, cliente: e.target.value })
                  }
                  className="input"
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: 6,
                    fontWeight: 500,
                    color: "#475569",
                  }}
                >
                  RTN
                </label>
                <input
                  value={editRow.rtn || ""}
                  onChange={(e) =>
                    setEditRow({ ...editRow, rtn: e.target.value })
                  }
                  className="input"
                />
              </div>
            </div>

            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                overflow: "hidden",
                marginBottom: 24,
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr
                    style={{
                      textAlign: "left",
                      background: "#f8fafc",
                      borderBottom: "1px solid #e2e8f0",
                    }}
                  >
                    <th
                      style={{
                        padding: "12px 16px",
                        fontSize: "12px",
                        color: "#64748b",
                        fontWeight: 600,
                      }}
                    >
                      SKU
                    </th>
                    <th
                      style={{
                        padding: "12px 16px",
                        fontSize: "12px",
                        color: "#64748b",
                        fontWeight: 600,
                      }}
                    >
                      NOMBRE
                    </th>
                    <th
                      style={{
                        padding: "12px 16px",
                        fontSize: "12px",
                        color: "#64748b",
                        fontWeight: 600,
                      }}
                    >
                      CANTIDAD
                    </th>
                    <th
                      style={{
                        padding: "12px 16px",
                        fontSize: "12px",
                        color: "#64748b",
                        fontWeight: 600,
                      }}
                    >
                      PRECIO
                    </th>
                    <th
                      style={{
                        padding: "12px 16px",
                        fontSize: "12px",
                        color: "#64748b",
                        fontWeight: 600,
                      }}
                    >
                      SUBTOTAL
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {detalles.map((d, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "12px 16px" }}>{d.sku}</td>
                      <td style={{ padding: "12px 16px" }}>{d.nombre}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <input
                          type="number"
                          value={d.cantidad || 0}
                          onChange={(e) => {
                            const v = Number(e.target.value || 0);
                            const copy = [...detalles];
                            copy[idx] = { ...copy[idx], cantidad: v };
                            setDetalles(copy);
                          }}
                          className="input"
                          style={{ width: 80, padding: "4px 8px" }}
                        />
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <input
                          type="number"
                          value={d.precio_unitario || 0}
                          onChange={(e) => {
                            const v = Number(e.target.value || 0);
                            const copy = [...detalles];
                            copy[idx] = { ...copy[idx], precio_unitario: v };
                            setDetalles(copy);
                          }}
                          className="input"
                          style={{ width: 100, padding: "4px 8px" }}
                        />
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        L{" "}
                        {formatMoney(Number(
                          (d.precio_unitario || 0) * (d.cantidad || 0)
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}
            >
              <button
                onClick={() => {
                  setEditOpen(false);
                  setDetalles([]);
                  setEditRow(null);
                }}
                className="btn-opaque"
              >
                Cancelar
              </button>
              <button onClick={saveEdit} className="btn-primary">
                Guardar cambios
              </button>
            </div>
          </div>
        </ModalWrapper>
      )}
    </div>
  );
}
