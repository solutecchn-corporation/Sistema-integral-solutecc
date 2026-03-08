import React, { useEffect, useState } from "react";
import { formatMoney } from "../../lib/formatMoney";
import supabase from "../../lib/supabaseClient";

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
  const [totalSum, setTotalSum] = useState<number>(0);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [articulosVendidos, setArticulosVendidos] = useState<number>(0);

  const fetchData = async () => {
    setLoading(true);
    try {
      const startISO = new Date(startDate + "T00:00:00").toISOString();
      const endISO = new Date(endDate + "T23:59:59").toISOString();

      // Traer ventas en rango usando la columna `fecha_venta`
      const { data: ventasData, error: ventasError } = await supabase
        .from("ventas")
        .select("*")
        .gte("fecha_venta", startISO)
        .lte("fecha_venta", endISO)
        .order("fecha_venta", { ascending: false });

      if (ventasError) throw ventasError;

      const ventasArr = Array.isArray(ventasData) ? ventasData : [];

      // Filtrar solo pagadas (case-insensitive)
      const ventasPagadas = ventasArr.filter(
        (v: any) => String(v.estado || "").toLowerCase() === "pagada",
      );

      setVentas(ventasPagadas);

      const sum = ventasPagadas.reduce(
        (s: number, v: any) => s + Number(v.total || 0),
        0,
      );
      setTotalSum(sum);
      setTotalCount(ventasPagadas.length);

      // Calcular articulos vendidos consultando ventas_detalle para estas ventas
      const ventaIds = ventasPagadas.map((v: any) => v.id).filter(Boolean);
      if (ventaIds.length > 0) {
        const { data: detalles, error: detallesError } = await supabase
          .from("ventas_detalle")
          .select("cantidad, venta_id")
          .in("venta_id", ventaIds as any[]);

        if (!detallesError && Array.isArray(detalles)) {
          const totalArt = detalles.reduce(
            (s: number, d: any) => s + Number(d.cantidad || 0),
            0,
          );
          setArticulosVendidos(totalArt);
        } else {
          setArticulosVendidos(0);
        }
      } else {
        setArticulosVendidos(0);
      }
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

  return (
    <div style={{ padding: 18 }}>
      <h2 style={{ marginTop: 0 }}>Facturas (ventas)</h2>

      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 18,
          alignItems: "center",
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
        <div style={{ marginLeft: "auto" }}>
          <button className="btn-opaque" onClick={fetchData} disabled={loading}>
            {loading ? "Cargando..." : "Actualizar"}
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div style={{ background: "white", padding: 16, borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>Total facturas</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{totalCount}</div>
        </div>
        <div style={{ background: "white", padding: 16, borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>Total venta</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            L {formatMoney(totalSum)}
          </div>
        </div>
        <div style={{ background: "white", padding: 16, borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            Promedio por factura
          </div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            L {formatMoney(totalCount ? totalSum / totalCount : 0)}
          </div>
        </div>
        <div style={{ background: "white", padding: 16, borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            Artículos vendidos
          </div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {articulosVendidos}
          </div>
        </div>
      </div>

      <div style={{ background: "white", padding: 12, borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc", textAlign: "left" }}>
              <th style={{ padding: 12 }}>Factura</th>
              <th style={{ padding: 12 }}>Fecha</th>
              <th style={{ padding: 12, textAlign: "right" }}>Total</th>
              <th style={{ padding: 12 }}>Cliente</th>
              <th style={{ padding: 12 }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {ventas.map((v: any) => (
              <tr key={v.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: 12 }}>{v.factura}</td>
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
                <td style={{ padding: 12 }}>{v.estado}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {ventas.length === 0 && (
          <div style={{ padding: 32, textAlign: "center", color: "#94a3b8" }}>
            No hay facturas en este rango
          </div>
        )}
      </div>
    </div>
  );
}
