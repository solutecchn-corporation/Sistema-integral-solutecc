import React, { useEffect, useState } from "react";
import { formatMoney } from '../../lib/formatMoney';
import supabase from "../../lib/supabaseClient";

export default function RepCompras() {
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

      const { data: comprasData, error: comprasError } = await supabase
        .from("compras")
        .select("*")
        .gte("fecha_compra", startISO)
        .lte("fecha_compra", endISO)
        .order("fecha_compra", { ascending: false });

      if (comprasError) throw comprasError;
      const comprasArr = Array.isArray(comprasData) ? comprasData : [];

      // Get unique compra_ids and proveedor_ids
      const compraIds = comprasArr.map((c: any) => c.id).filter(Boolean);
      const proveedorIds = Array.from(
        new Set(comprasArr.map((c: any) => c.proveedor_id).filter(Boolean))
      );

      // Fetch proveedores info
      let proveedoresMap: Record<string, any> = {};
      if (proveedorIds.length > 0) {
        const { data: pdata } = await supabase
          .from("proveedores")
          .select("id, nombre")
          .in("id", proveedorIds as any[]);
        if (Array.isArray(pdata)) {
          pdata.forEach((p: any) => {
            proveedoresMap[String(p.id)] = p;
          });
        }
      }

      // Fetch compras_detalle
      let detallesMap: Record<string, any[]> = {};
      if (compraIds.length > 0) {
        const { data: ddata } = await supabase
          .from("compras_detalle")
          .select("compra_id, producto_id, cantidad")
          .in("compra_id", compraIds as any[]);
        if (Array.isArray(ddata)) {
          ddata.forEach((d: any) => {
            if (!detallesMap[String(d.compra_id)])
              detallesMap[String(d.compra_id)] = [];
            detallesMap[String(d.compra_id)].push(d);
          });
        }
      }

      // Fetch productos for names
      const allProductoIds = Array.from(
        new Set(
          Object.values(detallesMap)
            .flat()
            .map((d: any) => d.producto_id)
            .filter(Boolean)
        )
      );
      let productosMap: Record<string, any> = {};
      if (allProductoIds.length > 0) {
        const { data: proddata } = await supabase
          .from("inventario")
          .select("id, nombre, sku")
          .in("id", allProductoIds as any[]);
        if (Array.isArray(proddata)) {
          proddata.forEach((p: any) => {
            productosMap[String(p.id)] = p;
          });
        }
      }

      // Aggregate rows
      const rowsAgg = comprasArr.map((c: any) => {
        const proveedor = proveedoresMap[String(c.proveedor_id)] || {};
        const detalles = detallesMap[String(c.id)] || [];
        const productosList = detalles
          .map(
            (d: any) =>
              productosMap[String(d.producto_id)]?.nombre ||
              productosMap[String(d.producto_id)]?.sku ||
              ""
          )
          .filter(Boolean);
        const cantidadTotal = detalles.reduce(
          (sum: number, d: any) => sum + Number(d.cantidad || 0),
          0
        );

        return {
          id: c.id,
          fecha: c.fecha_compra,
          factura: c.numero_factura || "",
          proveedor: proveedor.nombre || "",
          productos: productosList,
          cantidad: cantidadTotal,
          subtotal: Number(c.subtotal || 0),
          impuesto: Number(c.impuesto || 0),
          total: Number(c.total || 0),
          estado: c.estado || "",
          usuario: c.usuario || "",
        };
      });

      setRows(rowsAgg);
    } catch (err) {
      console.error("Error fetching report compras", err);
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
  const totalSubtotal = rows.reduce((sum, r) => sum + r.subtotal, 0);
  const totalImpuesto = rows.reduce((sum, r) => sum + r.impuesto, 0);
  const totalGeneral = rows.reduce((sum, r) => sum + r.total, 0);

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
      <h2 style={{ marginTop: 0 }}>Compras (reportes)</h2>

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
                PROVEEDOR
              </th>
              <th
                style={{
                  padding: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#0b1220",
                }}
              >
                PRODUCTOS
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
                SUBTOTAL
              </th>
              <th
                style={{
                  padding: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#0b1220",
                }}
              >
                IMPUESTO
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
              <th
                style={{
                  padding: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#0b1220",
                }}
              >
                ESTADO
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
                  No hay compras en este rango
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #e6eef6" }}>
                  <td style={{ padding: 12, fontSize: 13 }}>
                    {r.fecha ? new Date(r.fecha).toLocaleString() : ""}
                  </td>
                  <td style={{ padding: 12, fontSize: 13 }}>compra</td>
                  <td style={{ padding: 12, fontSize: 13 }}>{r.factura}</td>
                  <td style={{ padding: 12, fontSize: 13 }}>{r.proveedor}</td>
                  <td style={{ padding: 12, fontSize: 13 }}>
                    {(r.productos || []).join(", ")}
                  </td>
                  <td style={{ padding: 12, fontSize: 13 }}>{r.cantidad}</td>
                  <td style={{ padding: 12, fontSize: 13 }}>
                    L {formatMoney(r.subtotal)}
                  </td>
                  <td style={{ padding: 12, fontSize: 13 }}>
                    L {formatMoney(r.impuesto)}
                  </td>
                  <td style={{ padding: 12, fontSize: 13 }}>
                    L {formatMoney(r.total)}
                  </td>
                  <td style={{ padding: 12, fontSize: 13 }}>{r.estado}</td>
                  <td style={{ padding: 12, fontSize: 13 }}>{r.usuario}</td>
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
                <td style={{ padding: 12, fontSize: 13 }}>{totalCantidad}</td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
                <td style={{ padding: 12, fontSize: 13 }}>
                  L {formatMoney(totalSubtotal)}
                </td>
                <td style={{ padding: 12, fontSize: 13 }}>
                  L {formatMoney(totalImpuesto)}
                </td>
                <td style={{ padding: 12, fontSize: 13 }}>
                  L {formatMoney(totalGeneral)}
                </td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
