import React, { useEffect, useState } from "react";
import { formatMoney } from "../../lib/formatMoney";
import supabase from "../../lib/supabaseClient";

export default function RepVentas() {
  const today = new Date();
  const prior = new Date();
  prior.setDate(today.getDate() - 30);

  const [startDate, setStartDate] = useState<string>(
    prior.toISOString().slice(0, 10),
  );
  const [endDate, setEndDate] = useState<string>(
    today.toISOString().slice(0, 10),
  );
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const startISO = new Date(startDate + "T00:00:00").toISOString();
      const endISO = new Date(endDate + "T23:59:59").toISOString();

      const { data: ventasData, error: ventasError } = await supabase
        .from("ventas")
        .select("*")
        .gte("fecha_venta", startISO)
        .lte("fecha_venta", endISO)
        .order("fecha_venta", { ascending: false });

      if (ventasError) throw ventasError;
      const ventasArr = Array.isArray(ventasData) ? ventasData : [];

      // Only pagadas
      const ventasPagadas = ventasArr.filter(
        (v: any) => String(v.estado || "").toLowerCase() === "pagada",
      );

      const ventaIds = ventasPagadas.map((v: any) => v.id).filter(Boolean);

      let detalles: any[] = [];
      if (ventaIds.length > 0) {
        const { data: ddata, error: derr } = await supabase
          .from("ventas_detalle")
          .select("*")
          .in("venta_id", ventaIds as any[]);
        if (derr) throw derr;
        detalles = Array.isArray(ddata) ? ddata : [];
      }

      // Enrich product info from inventario
      const productoIds = Array.from(
        new Set(detalles.map((d: any) => d.producto_id).filter(Boolean)),
      );
      let productosMap: Record<string, any> = {};
      if (productoIds.length > 0) {
        try {
          const { data: pdata } = await supabase
            .from("inventario")
            .select("id,nombre,sku,exento,aplica_impuesto_18")
            .in("id", productoIds as any[]);
          if (Array.isArray(pdata)) {
            pdata.forEach((p: any) => {
              productosMap[String(p.id)] = p;
            });
          }
        } catch (e) {
          console.warn("Error cargando inventario para reportes de ventas", e);
        }
      }

      // Aggregate per venta
      const rowsAgg = ventasPagadas.map((v: any) => {
        const dets = detalles.filter(
          (d: any) => String(d.venta_id) === String(v.id),
        );

        const productosList = dets
          .map(
            (d: any) =>
              d.producto_nombre ||
              productosMap[String(d.producto_id)]?.nombre ||
              d.nombre ||
              "",
          )
          .filter(Boolean);
        const cantidadTotal = dets.reduce(
          (s: number, d: any) => s + Number(d.cantidad || 0),
          0,
        );

        // sums
        let subExonerado = 0;
        let subExento = 0;
        let subGravado = 0;
        let subTuristico = 0;
        let isv15 = 0;
        let isv18 = 0;
        let isv4 = 0;

        // Prefer persisted values from `ventas` row when available (fields may be named with snake_case or camelCase)
        const hasPersistedSub =
          v.sub_exonerado != null ||
          v.subExonerado != null ||
          v.sub_exento != null ||
          v.subExento != null ||
          v.sub_gravado != null ||
          v.subGravado != null;
        const hasPersistedIsv =
          v.isv_15 != null ||
          v.isv15 != null ||
          v.isv_18 != null ||
          v.isv18 != null ||
          v.isv_4 != null ||
          v.isv4 != null;
        if (hasPersistedSub || hasPersistedIsv) {
          subExonerado = Number(v.sub_exonerado ?? v.subExonerado ?? 0);
          subExento = Number(v.sub_exento ?? v.subExento ?? 0);
          subGravado = Number(v.sub_gravado ?? v.subGravado ?? 0);
          // ISV persisted
          isv15 = Number(v.isv_15 ?? v.isv15 ?? 0);
          isv18 = Number(v.isv_18 ?? v.isv18 ?? 0);
          isv4 = Number(v.isv_4 ?? v.isv4 ?? 0);
          // if the DB stored subTuristico use it, otherwise attempt to compute below (subTuristico may be absent)
          subTuristico = Number(v.sub_turistico ?? v.subTuristico ?? 0);
        } else {
          // compute from details below
        }

        const tryParseProducto = (val: any) => {
          if (!val) return null;
          if (typeof val === "object") return val;
          try {
            return JSON.parse(String(val));
          } catch (e) {
            return null;
          }
        };

        const toBool = (v: any) => {
          if (v === null || v === undefined) return false;
          if (typeof v === "boolean") return v;
          if (typeof v === "number") return v !== 0;
          const s = String(v).toLowerCase().trim();
          return (
            s === "true" || s === "1" || s === "t" || s === "y" || s === "yes"
          );
        };

        for (const d of dets) {
          // if we already used persisted subtotals/isv, skip per-line recompute
          if (hasPersistedSub || hasPersistedIsv) {
            // still collect products and cantidad but skip tax calculations
            continue;
          }
          const cantidad = Number(d.cantidad || 0);
          const precio = Number(d.precio_unitario ?? d.precio ?? 0);
          const lineGross =
            d.subtotal != null ? Number(d.subtotal) : Number(cantidad * precio);

          const prod = productosMap[String(d.producto_id)] || {};
          const prodFromDetalle = tryParseProducto(d.producto);
          const exento =
            d.exento != null
              ? toBool(d.exento)
              : toBool(prodFromDetalle?.exento ?? prod.exento);
          const exonerado = d.exonerado != null ? toBool(d.exonerado) : false;
          const aplica18 =
            d.aplica_impuesto_18 != null
              ? toBool(d.aplica_impuesto_18)
              : toBool(
                  prodFromDetalle?.aplica_impuesto_18 ??
                    prod.aplica_impuesto_18,
                );

          if (exonerado) {
            subExonerado += lineGross;
          } else if (exento) {
            subExento += lineGross;
          } else {
            subGravado += lineGross;
            // determine if tourist tax applies for this line
            const turAplica =
              d.aplica_impuesto_turistico != null
                ? toBool(d.aplica_impuesto_turistico)
                : toBool(
                    prodFromDetalle?.aplica_impuesto_turistico ??
                      prod.aplica_impuesto_turistico,
                  );
            if (turAplica) subTuristico += lineGross;
            // compute tax portion assuming price includes tax
            const mainRate = aplica18 ? 0.18 : 0.15;
            const turRate = turAplica ? 0.04 : 0;
            const combined = (mainRate || 0) + (turRate || 0);
            if (combined > 0) {
              const taxPortion = lineGross - lineGross / (1 + combined);
              // split proportionally between main tax and tourist tax
              const mainPortion = taxPortion * ((mainRate || 0) / combined);
              const turPortion = taxPortion * ((turRate || 0) / combined);
              if (aplica18) isv18 += mainPortion;
              else isv15 += mainPortion;
              isv4 += turPortion;
            }
          }
        }

        return {
          id: v.id,
          fecha: v.fecha_venta || v.fecha || null,
          factura: v.factura || v.numero_factura || v.numero || v.id,
          cliente: v.nombre_cliente || v.cliente || v.cliente_nombre || "",
          identidad: v.rtn || v.identidad || null,
          productos: productosList,
          cantidad: cantidadTotal,
          subExonerado: subExonerado,
          subExento: subExento,
          subGravado: subGravado,
          subTuristico: subTuristico,
          isv15: isv15,
          isv18: isv18,
          isv4: isv4,
          total: Number(v.total || 0),
          forma_pago: v.tipo_pago || v.forma_pago || "",
        };
      });

      setRows(rowsAgg);
    } catch (err) {
      console.error("Error fetching report ventas", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  // Calcular totales
  const totalCantidad = rows.reduce(
    (sum, r) => sum + Number(r.cantidad || 0),
    0,
  );
  const totalSubExonerado = rows.reduce(
    (sum, r) => sum + Number(r.subExonerado || 0),
    0,
  );
  const totalSubExento = rows.reduce(
    (sum, r) => sum + Number(r.subExento || 0),
    0,
  );
  const totalSubGravado = rows.reduce(
    (sum, r) => sum + Number(r.subGravado || 0),
    0,
  );
  const totalSubTuristico = rows.reduce(
    (sum, r) => sum + Number(r.subTuristico || 0),
    0,
  );
  const totalIsv15 = rows.reduce((sum, r) => sum + Number(r.isv15 || 0), 0);
  const totalIsv18 = rows.reduce((sum, r) => sum + Number(r.isv18 || 0), 0);
  const totalIsv4 = rows.reduce((sum, r) => sum + Number(r.isv4 || 0), 0);
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
      <h2 style={{ marginTop: 0 }}>Ventas (reportes)</h2>

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
                SUB EXONERADO
              </th>
              <th
                style={{
                  padding: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#0b1220",
                }}
              >
                SUB EXENTO
              </th>
              <th
                style={{
                  padding: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#0b1220",
                }}
              >
                SUB GRAVADO
              </th>
              <th
                style={{
                  padding: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#0b1220",
                }}
              >
                ISV (15%)
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
                  No hay ventas pagadas en este rango
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #e6eef6" }}>
                  <td style={{ padding: 12, fontSize: 13 }}>
                    {r.fecha ? new Date(r.fecha).toLocaleString() : ""}
                  </td>
                  <td style={{ padding: 12, fontSize: 13 }}>factura emitida</td>
                  <td style={{ padding: 12, fontSize: 13 }}>{r.factura}</td>
                  <td style={{ padding: 12, fontSize: 13 }}>{r.cliente}</td>
                  <td style={{ padding: 12, fontSize: 13 }}>
                    {r.identidad || ""}
                  </td>
                  <td style={{ padding: 12, fontSize: 13 }}>{r.cantidad}</td>
                  <td style={{ padding: 12, fontSize: 13 }}>
                    L {formatMoney(Number(r.subExonerado || 0))}
                  </td>
                  <td style={{ padding: 12, fontSize: 13 }}>
                    L {formatMoney(Number(r.subExento || 0))}
                  </td>
                  <td style={{ padding: 12, fontSize: 13 }}>
                    L {formatMoney(Number(r.subGravado || 0))}
                  </td>
                  <td style={{ padding: 12, fontSize: 13 }}>
                    L {formatMoney(Number(r.isv15 || 0))}
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
                <td style={{ padding: 12, fontSize: 13 }}>
                  L {formatMoney(totalSubExonerado)}
                </td>
                <td style={{ padding: 12, fontSize: 13 }}>
                  L {formatMoney(totalSubExento)}
                </td>
                <td style={{ padding: 12, fontSize: 13 }}>
                  L {formatMoney(totalSubGravado)}
                </td>
                <td style={{ padding: 12, fontSize: 13 }}>
                  L {formatMoney(totalIsv15)}
                </td>
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
