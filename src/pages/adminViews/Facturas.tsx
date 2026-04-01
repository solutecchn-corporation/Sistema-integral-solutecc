import React, { useEffect, useState } from "react";
import { formatMoney } from "../../lib/formatMoney";
import supabase from "../../lib/supabaseClient";
import { generateFacturaHTML } from "../../lib/generateFacturaHTML";
import PrintOrEmailModal from "../../components/PrintOrEmailModal";
import EmailFacturaModal from "../../components/EmailFacturaModal";

type EstadoFiltro = "todos" | "pagada" | "anulada" | "devolucion";

const ESTADO_COLORS: Record<string, { bg: string; color: string }> = {
  pagada: { bg: "#dcfce7", color: "#166534" },
  pagado: { bg: "#dcfce7", color: "#166534" },
  anulada: { bg: "#fee2e2", color: "#991b1b" },
  anulado: { bg: "#fee2e2", color: "#991b1b" },
  devolucion: { bg: "#fef9c3", color: "#854d0e" },
  devolución: { bg: "#fef9c3", color: "#854d0e" },
};

export default function FacturasView() {
  const today = new Date();
  const prior = new Date();
  prior.setDate(today.getDate() - 30);

  const [startDate, setStartDate] = useState<string>(
    prior.toISOString().slice(0, 10),
  );
  const [endDate, setEndDate] = useState<string>(
    today.toISOString().slice(0, 10),
  );
  const [ventas, setVentas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>("todos");
  const [reprinting, setReprinting] = useState<number | null>(null);
  const [pendingHtml, setPendingHtml] = useState<string | null>(null);
  const [pendingVenta, setPendingVenta] = useState<any | null>(null);
  const [showDelivery, setShowDelivery] = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Usar el string de fecha directo evita desfase de zona horaria
      const { data: ventasData, error: ventasError } = await supabase
        .from("ventas")
        .select("*")
        .gte("fecha_venta", startDate)
        .lte("fecha_venta", endDate + "T23:59:59.999")
        .order("fecha_venta", { ascending: false });

      if (ventasError) throw ventasError;
      setVentas(Array.isArray(ventasData) ? ventasData : []);
    } catch (err) {
      console.error("Error fetching ventas:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  // Normaliza el estado del registro para comparar sin importar género ni acentos
  const normEstado = (raw: string) =>
    raw
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // quita tildes
      .replace(/o$/, "a"); // anulado→anulada, pagado→pagada, devolucion queda igual

  // Filtrado por estado
  const ventasFiltradas = ventas.filter((v: any) => {
    if (estadoFiltro === "todos") return true;
    const est = normEstado(String(v.estado || ""));
    // devolucion: acepta con/sin tilde
    if (estadoFiltro === "devolucion") return est === "devolucion";
    return est === estadoFiltro;
  });

  const ventasPagadas = ventasFiltradas.filter(
    (v: any) => normEstado(String(v.estado || "")) === "pagada",
  );
  const totalSum = ventasPagadas.reduce(
    (s: number, v: any) => s + Number(v.total || 0),
    0,
  );
  const totalCount = ventasPagadas.length;

  const handleReimprimir = async (venta: any) => {
    setReprinting(venta.id);
    try {
      // 1. Traer detalles sin join (seguro siempre)
      const { data: detalles, error: detErr2 } = await supabase
        .from("ventas_detalle")
        .select("*")
        .eq("venta_id", venta.id)
        .order("id", { ascending: true });

      if (detErr2) console.error("Error ventas_detalle:", detErr2);

      // 2. Para los que no tienen descripcion, buscar nombre en inventario
      const sinDesc = (detalles || []).filter(
        (d: any) => !d.descripcion && d.producto_id,
      );
      let inventarioMap: Record<string, string> = {};
      if (sinDesc.length > 0) {
        const ids = sinDesc.map((d: any) => d.producto_id);
        const { data: invRows } = await supabase
          .from("inventario")
          .select("id, nombre")
          .in("id", ids);
        for (const row of invRows || []) {
          inventarioMap[String(row.id)] = row.nombre || "";
        }
      }

      const { data: pagosData } = await supabase
        .from("pagos")
        .select("*")
        .eq("factura", venta.factura);

      const carrito = (detalles || []).map((d: any) => {
        const nombre =
          d.descripcion ||
          inventarioMap[String(d.producto_id)] ||
          d.nombre ||
          "";
        return {
          producto: {
            nombre,
            precio: d.precio_unitario,
            precio_unitario: d.precio_unitario,
            exento: d.exento,
            aplica_impuesto_18: d.aplica_impuesto_18,
            aplica_impuesto_turistico: d.aplica_impuesto_turistico,
          },
          cantidad: d.cantidad,
          precio_unitario: d.precio_unitario,
          precio: d.precio_unitario,
          subtotal: d.subtotal,
          descuento: d.descuento || 0,
          exento: d.exento,
          aplica_impuesto_18: d.aplica_impuesto_18,
          aplica_impuesto_turistico: d.aplica_impuesto_turistico,
        };
      });

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
          direccionCliente: venta.direccion_cliente || "",
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

      setPendingHtml(html);
      setPendingVenta(venta);
      setShowDelivery(true);
    } catch (err) {
      console.error("Error al reimprimir:", err);
      alert("No se pudo reimprimir la factura.");
    } finally {
      setReprinting(null);
    }
  };

  const doPrint = () => {
    if (!pendingHtml) return;
    setShowDelivery(false);
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(pendingHtml);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 600);
    }
  };

  const doEmail = () => {
    setShowDelivery(false);
    setShowEmail(true);
  };

  const FILTROS: { label: string; value: EstadoFiltro }[] = [
    { label: "Todos", value: "todos" },
    { label: "Pagadas", value: "pagada" },
    { label: "Anuladas", value: "anulada" },
    { label: "Devoluciones", value: "devolucion" },
  ];

  return (
    <>
      <PrintOrEmailModal
        open={showDelivery}
        onClose={() => setShowDelivery(false)}
        onPrint={doPrint}
        onEmail={doEmail}
        docType="factura"
      />
      <EmailFacturaModal
        open={showEmail}
        onClose={() => setShowEmail(false)}
        initialEmail={pendingVenta?.email_cliente || ""}
        htmlContent={pendingHtml || ""}
        facturaNumero={pendingVenta?.factura || ""}
      />
    <div style={{ padding: 18 }}>
      <h2 style={{ marginTop: 0 }}>Facturas (ventas)</h2>

      {/* Filtros de fecha y estado */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 18,
          alignItems: "flex-end",
          flexWrap: "wrap",
        }}
      >
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#475569" }}>
            Fecha inicio
          </label>
          <input
            className="input"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#475569" }}>
            Fecha fin
          </label>
          <input
            className="input"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        {/* Filtro de estado */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {FILTROS.map((f) => (
            <button
              key={f.value}
              onClick={() => setEstadoFiltro(f.value)}
              style={{
                padding: "6px 14px",
                borderRadius: 20,
                border: "1.5px solid",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: estadoFiltro === f.value ? 700 : 400,
                borderColor: estadoFiltro === f.value ? "#1e3a6e" : "#cbd5e1",
                background: estadoFiltro === f.value ? "#1e3a6e" : "#f8fafc",
                color: estadoFiltro === f.value ? "#fff" : "#475569",
                transition: "all 0.15s",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: "auto" }}>
          <button className="btn-opaque" onClick={fetchData} disabled={loading}>
            {loading ? "Cargando..." : "Actualizar"}
          </button>
        </div>
      </div>

      {/* Tarjetas resumen (solo pagadas) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div style={{ background: "white", padding: 16, borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            Facturas pagadas{" "}
            {estadoFiltro !== "todos" ? `(${estadoFiltro})` : ""}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{totalCount}</div>
        </div>
        <div style={{ background: "white", padding: 16, borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            Total vendido (pagadas)
          </div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            L {formatMoney(totalSum)}
          </div>
        </div>
        <div style={{ background: "white", padding: 16, borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            Mostrando en tabla
          </div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {ventasFiltradas.length}
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div style={{ background: "white", padding: 12, borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc", textAlign: "left" }}>
              <th style={{ padding: 12 }}>Factura</th>
              <th style={{ padding: 12 }}>Fecha</th>
              <th style={{ padding: 12, textAlign: "right" }}>Total</th>
              <th style={{ padding: 12 }}>Cliente</th>
              <th style={{ padding: 12 }}>Estado</th>
              <th style={{ padding: 12, textAlign: "center" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {ventasFiltradas.map((v: any) => {
              const estKey = String(v.estado || "").toLowerCase();
              const chip = ESTADO_COLORS[estKey];
              return (
                <tr key={v.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: 12, fontWeight: 600 }}>{v.factura}</td>
                  <td style={{ padding: 12 }}>
                    {v.fecha_venta
                      ? new Date(v.fecha_venta).toLocaleString()
                      : "-"}
                  </td>
                  <td style={{ padding: 12, textAlign: "right" }}>
                    L {formatMoney(Number(v.total || 0))}
                  </td>
                  <td style={{ padding: 12 }}>
                    {v.nombre_cliente || v.cliente_id || "-"}
                  </td>
                  <td style={{ padding: 12 }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 10px",
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 600,
                        background: chip?.bg || "#f1f5f9",
                        color: chip?.color || "#475569",
                        textTransform: "capitalize",
                      }}
                    >
                      {v.estado || "-"}
                    </span>
                  </td>
                  <td style={{ padding: 12, textAlign: "center" }}>
                    <button
                      onClick={() => handleReimprimir(v)}
                      disabled={reprinting === v.id}
                      title="Reimprimir factura"
                      style={{
                        padding: "4px 12px",
                        borderRadius: 6,
                        border: "1.5px solid #1e3a6e",
                        background: reprinting === v.id ? "#e2e8f0" : "#fff",
                        color: "#1e3a6e",
                        cursor: reprinting === v.id ? "not-allowed" : "pointer",
                        fontSize: 12,
                        fontWeight: 600,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      {reprinting === v.id ? "..." : "🖨 Reimprimir"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {ventasFiltradas.length === 0 && (
          <div style={{ padding: 32, textAlign: "center", color: "#94a3b8" }}>
            No hay facturas en este rango
          </div>
        )}
      </div>
    </div>
    </>
  );
}
