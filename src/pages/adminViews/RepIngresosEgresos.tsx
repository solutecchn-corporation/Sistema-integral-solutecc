import React, { useEffect, useState } from "react";
import { formatMoney } from '../../lib/formatMoney';
import supabase from "../../lib/supabaseClient";

export default function RepIngresosEgresos() {
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

      const { data: movimientosData, error: movimientosError } = await supabase
        .from("caja_movimientos")
        .select("*")
        .gte("fecha", startISO)
        .lte("fecha", endISO)
        .order("fecha", { ascending: false });

      if (movimientosError) throw movimientosError;
      const movimientosArr = Array.isArray(movimientosData)
        ? movimientosData
        : [];

      // Aggregate rows
      const rowsAgg = movimientosArr.map((m: any) => ({
        id: m.id,
        fecha: m.fecha,
        tipo_movimiento: m.tipo_movimiento,
        concepto: m.concepto,
        referencia: m.referencia || "",
        usuario: m.usuario,
        monto: Number(m.monto || 0),
      }));

      setRows(rowsAgg);
    } catch (err) {
      console.error("Error fetching report ingresos egresos", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  // Calcular totales
  const totalIngresos = rows
    .filter((r) => r.tipo_movimiento === "ingreso")
    .reduce((sum, r) => sum + r.monto, 0);
  const totalEgresos = rows
    .filter((r) => r.tipo_movimiento === "egreso")
    .reduce((sum, r) => sum + r.monto, 0);
  const saldoNeto = totalIngresos - totalEgresos;

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
      <h2 style={{ marginTop: 0 }}>Ingresos / Egresos (reportes)</h2>

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
                TIPO MOVIMIENTO
              </th>
              <th
                style={{
                  padding: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#0b1220",
                }}
              >
                CONCEPTO
              </th>
              <th
                style={{
                  padding: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#0b1220",
                }}
              >
                REFERENCIA
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
                MONTO
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    padding: 24,
                    textAlign: "center",
                    color: "#94a3b8",
                    fontSize: 13,
                  }}
                >
                  No hay movimientos en este rango
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #e6eef6" }}>
                  <td style={{ padding: 12, fontSize: 13 }}>
                    {r.fecha ? new Date(r.fecha).toLocaleString() : ""}
                  </td>
                  <td style={{ padding: 12, fontSize: 13 }}>movimiento caja</td>
                  <td style={{ padding: 12, fontSize: 13 }}>
                    {r.tipo_movimiento}
                  </td>
                  <td style={{ padding: 12, fontSize: 13 }}>{r.concepto}</td>
                  <td style={{ padding: 12, fontSize: 13 }}>{r.referencia}</td>
                  <td style={{ padding: 12, fontSize: 13 }}>{r.usuario}</td>
                  <td style={{ padding: 12, fontSize: 13 }}>
                    L {formatMoney(r.monto)}
                  </td>
                </tr>
              ))
            )}
            {rows.length > 0 && (
              <tr
                style={{ borderTop: "2px solid #0f1724", fontWeight: "bold" }}
              >
                <td style={{ padding: 12, fontSize: 13 }}>TOTALES</td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
              </tr>
            )}
            {rows.length > 0 && (
              <tr style={{ fontWeight: "bold" }}>
                <td style={{ padding: 12, fontSize: 13 }}>Ingresos</td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
                <td style={{ padding: 12, fontSize: 13 }}>
                  L {formatMoney(totalIngresos)}
                </td>
              </tr>
            )}
            {rows.length > 0 && (
              <tr style={{ fontWeight: "bold" }}>
                <td style={{ padding: 12, fontSize: 13 }}>Egresos</td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
                <td style={{ padding: 12, fontSize: 13 }}>
                  L {formatMoney(totalEgresos)}
                </td>
              </tr>
            )}
            {rows.length > 0 && (
              <tr
                style={{ borderTop: "1px solid #0f1724", fontWeight: "bold" }}
              >
                <td style={{ padding: 12, fontSize: 13 }}>Saldo Neto</td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
                <td style={{ padding: 12, fontSize: 13 }}></td>
                <td style={{ padding: 12, fontSize: 13 }}>
                  L {formatMoney(saldoNeto)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
