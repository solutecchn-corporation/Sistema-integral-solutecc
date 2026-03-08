import React, { useEffect, useState } from "react";
import { formatMoney } from '../../lib/formatMoney';
import supabase from "../../lib/supabaseClient";

export default function RepDevoluciones() {
  const today = new Date();
  const prior = new Date();
  prior.setDate(today.getDate() - 30);

  const [startDate, setStartDate] = useState<string>(
    prior.toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState<string>(
    today.toISOString().slice(0, 10)
  );
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const startISO = new Date(startDate + "T00:00:00").toISOString();
      const endISO = new Date(endDate + "T23:59:59").toISOString();

      const { data: devolucionesData, error: devolucionesError } =
        await supabase
          .from("devoluciones_ventas")
          .select("*")
          .gte("fecha_devolucion", startISO)
          .lte("fecha_devolucion", endISO)
          .order("fecha_devolucion", { ascending: false });

      if (devolucionesError) throw devolucionesError;
      const devolucionesArr = Array.isArray(devolucionesData)
        ? devolucionesData
        : [];

      // Get unique venta_ids and producto_ids
      const ventaIds = Array.from(
        new Set(devolucionesArr.map((d: any) => d.venta_id).filter(Boolean))
      );
      const productoIds = Array.from(
        new Set(devolucionesArr.map((d: any) => d.producto_id).filter(Boolean))
      );

      // Fetch ventas info
      let ventasMap: Record<string, any> = {};
      if (ventaIds.length > 0) {
        const { data: vdata } = await supabase
          .from("ventas")
          .select("id, factura, nombre_cliente, rtn")
          .in("id", ventaIds as any[]);
        if (Array.isArray(vdata)) {
          vdata.forEach((v: any) => {
            ventasMap[String(v.id)] = v;
          });
        }
      }

      // Fetch productos info
      let productosMap: Record<string, any> = {};
      if (productoIds.length > 0) {
        const { data: pdata } = await supabase
          .from("inventario")
          .select("id, nombre, sku")
          .in("id", productoIds as any[]);
        if (Array.isArray(pdata)) {
          pdata.forEach((p: any) => {
            productosMap[String(p.id)] = p;
          });
        }
      }

      // Fetch ventas_detalle for totals
      let detallesMap: Record<string, any> = {};
      if (ventaIds.length > 0) {
        const { data: ddata } = await supabase
          .from("ventas_detalle")
          .select("venta_id, producto_id, precio_unitario")
          .in("venta_id", ventaIds as any[]);
        if (Array.isArray(ddata)) {
          ddata.forEach((d: any) => {
            const key = `${d.venta_id}-${d.producto_id}`;
            detallesMap[key] = d;
          });
        }
      }

      // Aggregate rows
      const rowsAgg = devolucionesArr.map((d: any) => {
        const venta = ventasMap[String(d.venta_id)] || {};
        const producto = productosMap[String(d.producto_id)] || {};
        const detalleKey = `${d.venta_id}-${d.producto_id}`;
        const detalle = detallesMap[detalleKey] || {};
        const precioUnitario = Number(detalle.precio_unitario || 0);
        const cantidad = Number(d.cantidad || 0);
        const total = precioUnitario * cantidad;

        return {
          id: d.id,
          fecha: d.fecha_devolucion,
          factura: venta.factura || "",
          cliente: venta.nombre_cliente || "",
          identidad: venta.rtn || "",
          producto: producto.nombre || producto.sku || "",
          cantidad: cantidad,
          motivo: d.motivo || "",
          usuario: d.usuario || "",
          tipo_devolucion: d.tipo_devolucion || "",
          total: total,
        };
      });

      setRows(rowsAgg);
    } catch (err) {
      console.error("Error fetching report devoluciones", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  // Calcular totales
  const totalCantidad = rows.reduce(
    (sum, r) => sum + Number(r.cantidad || 0),
    0
  );
  const totalGeneral = rows.reduce((sum, r) => sum + Number(r.total || 0), 0);

  useEffect(() => {
    fetchData(); /* eslint-disable-next-line */
  }, [startDate, endDate]);

  return (
    <div style={{ padding: 18 }}>
      <style>
        {`
          @media print {
            body * { visibility: hidden; }
            .printable, .printable * { visibility: visible; }
            .printable { position: absolute; left: 0; top: 0; width: 100%; }
          }
        `}
      </style>
      <h2 style={{ marginTop: 0 }}>Devoluciones (reportes)</h2>

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
          <button
            className="btn-opaque"
            onClick={() => window.print()}
            style={{ marginLeft: 8 }}
          >
            Imprimir Reporte
          </button>
        </div>
      </div>

      <div
        style={{ background: "white", padding: 12, borderRadius: 8 }}
        className="printable"
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontFamily: "Arial, Helvetica, sans-serif",
            fontSize: 13,
            color: "#0f1724",
          }}
        >
          <thead>
            <tr style={{ background: "#eef2f7", textAlign: "left" }}>
              <th
                style={{
                  padding: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#0b1220",
                }}
              >
                FECHA
              </th>
              <th
                style={{
                  padding: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#0b1220",
                }}
              >
                TIPO DOC
              </th>
              <th
                style={{
                  padding: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#0b1220",
                }}
              >
                FACTURA
              </th>
              <th
                style={{
                  padding: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#0b1220",
                }}
              >
                CLIENTE
              </th>
              <th
                style={{
                  padding: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#0b1220",
                }}
              >
                IDENTIDAD
              </th>
              <th
                style={{
                  padding: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#0b1220",
                }}
              >
                PRODUCTO
              </th>
              <th
                style={{
                  padding: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#0b1220",
                }}
              >
                CANTIDAD
              </th>
              <th
                style={{
                  padding: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#0b1220",
                }}
              >
                MOTIVO
              </th>
              <th
                style={{
                  padding: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#0b1220",
                }}
              >
                USUARIO
              </th>
              <th
                style={{
                  padding: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#0b1220",
                }}
              >
                TIPO DEVOLUCIÓN
              </th>
              <th
                style={{
                  padding: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#0b1220",
                }}
              >
                TOTAL
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={11}
                  style={{
                    padding: 24,
                    textAlign: "center",
                    color: "#94a3b8",
                    fontSize: 13,
                  }}
                >
                  No hay devoluciones en este rango
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #e6eef6" }}>
                  <td style={{ padding: 12, fontSize: 13 }}>
                    {r.fecha ? new Date(r.fecha).toLocaleString() : ""}
                  </td>
                  <td style={{ padding: 12, fontSize: 13 }}>devolución</td>
                  <td style={{ padding: 12, fontSize: 13 }}>{r.factura}</td>
                  <td style={{ padding: 12, fontSize: 13 }}>{r.cliente}</td>
                  <td style={{ padding: 12, fontSize: 13 }}>
                    {r.identidad || ""}
                  </td>
                  <td style={{ padding: 12, fontSize: 13 }}>{r.producto}</td>
                  <td style={{ padding: 12, fontSize: 13 }}>{r.cantidad}</td>
                  <td style={{ padding: 12, fontSize: 13 }}>{r.motivo}</td>
                  <td style={{ padding: 12, fontSize: 13 }}>{r.usuario}</td>
                  <td style={{ padding: 12, fontSize: 13 }}>
                    {r.tipo_devolucion}
                  </td>
                  <td style={{ padding: 12, fontSize: 13 }}>
                    L {formatMoney(Number(r.total || 0))}
                  </td>
                </tr>
              ))
            )}
            {rows.length > 0 && (
              <tr
                style={{ borderTop: "2px solid #0f1724", fontWeight: "bold" }}
              >
                <td style={{ padding: 12, fontSize: 13 }}>TOTAL</td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
                <td style={{ padding: 12, fontSize: 13 }}>{totalCantidad}</td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
                <td style={{ padding: 12, fontSize: 13 }}>
                  L {formatMoney(totalGeneral)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
