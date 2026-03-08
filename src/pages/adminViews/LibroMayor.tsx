import React, { useEffect, useState } from "react";
import { formatMoney } from '../../lib/formatMoney';
import supabase from "../../lib/supabaseClient";

type AsientoContable = {
  id: number;
  fecha: string;
  cuenta: string;
  descripcion?: string;
  tipo_movimiento: "debe" | "haber";
  monto: number;
  referencia?: string;
};

type CuentaResumen = {
  cuenta: string;
  asientos: AsientoContable[];
  totalDebe: number;
  totalHaber: number;
  saldo: number;
};

export default function LibroMayor() {
  const today = new Date();
  const prior = new Date();
  prior.setDate(today.getDate() - 30);

  const [startDate, setStartDate] = useState<string>(
    prior.toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState<string>(
    today.toISOString().slice(0, 10)
  );
  const [cuentasResumen, setCuentasResumen] = useState<CuentaResumen[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCuenta, setSelectedCuenta] = useState<string | null>(null);

  const fetchLibroMayor = async () => {
    setLoading(true);
    try {
      const startISO = new Date(startDate + "T00:00:00").toISOString();
      const endISO = new Date(endDate + "T23:59:59").toISOString();

      const { data, error } = await supabase
        .from("libro_diario")
        .select("*")
        .gte("fecha", startISO)
        .lte("fecha", endISO)
        .order("cuenta", { ascending: true })
        .order("fecha", { ascending: true });
      if (error) throw error;

      const asientos = data || [];

      // Agrupar por cuenta
      const cuentasMap: Record<string, AsientoContable[]> = {};
      asientos.forEach((asiento: any) => {
        const cuenta = asiento.cuenta;
        if (!cuentasMap[cuenta]) cuentasMap[cuenta] = [];
        cuentasMap[cuenta].push(asiento);
      });

      // Calcular totales por cuenta
      const resumen: CuentaResumen[] = Object.keys(cuentasMap).map((cuenta) => {
        const asientosCuenta = cuentasMap[cuenta];
        const totalDebe = asientosCuenta
          .filter((a) => a.tipo_movimiento === "debe")
          .reduce((sum, a) => sum + Number(a.monto), 0);
        const totalHaber = asientosCuenta
          .filter((a) => a.tipo_movimiento === "haber")
          .reduce((sum, a) => sum + Number(a.monto), 0);
        return {
          cuenta,
          asientos: asientosCuenta,
          totalDebe,
          totalHaber,
          saldo: totalDebe - totalHaber,
        };
      });

      setCuentasResumen(resumen);
    } catch (err) {
      console.error("Error fetching libro mayor", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLibroMayor(); /* eslint-disable-next-line */
  }, [startDate, endDate]);

  return (
    <div style={{ padding: 18 }}>
      <style>
        {`
          @media print {
            body * { visibility: hidden; }
            .printable, .printable * { visibility: visible; }
            .printable { position: absolute; left: 0; top: 0; width: 100%; }
            .no-print { display: none !important; }
          }
        `}
      </style>

      <h2 className="no-print" style={{ marginTop: 0 }}>
        Libro Mayor
      </h2>

      <div
        className="no-print"
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 18,
          alignItems: "flex-end",
        }}
      >
        <div>
          <label
            style={{
              display: "block",
              fontSize: 12,
              color: "#475569",
              marginBottom: 4,
            }}
          >
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
          <label
            style={{
              display: "block",
              fontSize: 12,
              color: "#475569",
              marginBottom: 4,
            }}
          >
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
          <button
            className="btn-opaque"
            onClick={fetchLibroMayor}
            disabled={loading}
          >
            {loading ? "Cargando..." : "Actualizar"}
          </button>
          <button
            className="btn-opaque"
            onClick={() => window.print()}
            style={{ marginLeft: 8 }}
          >
            Imprimir
          </button>
        </div>
      </div>

      <div
        style={{ background: "white", padding: 12, borderRadius: 8 }}
        className="printable"
      >
        <div
          style={{ textAlign: "center", marginBottom: 20 }}
          className="print-only"
        >
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            LIBRO MAYOR
          </h3>
          <p style={{ margin: "8px 0 0 0", fontSize: 12, color: "#475569" }}>
            Del {new Date(startDate).toLocaleDateString()} al{" "}
            {new Date(endDate).toLocaleDateString()}
          </p>
        </div>

        {cuentasResumen.length === 0 ? (
          <p style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>
            No hay movimientos en este rango
          </p>
        ) : (
          cuentasResumen.map((resumen, idx) => (
            <div
              key={idx}
              style={{ marginBottom: 32, pageBreakInside: "avoid" }}
            >
              <div
                style={{
                  background: "#eef2f7",
                  padding: 12,
                  marginBottom: 8,
                  borderRadius: 4,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
                  Cuenta: {resumen.cuenta}
                </h4>
                <button
                  className="no-print"
                  onClick={() =>
                    setSelectedCuenta(
                      selectedCuenta === resumen.cuenta ? null : resumen.cuenta
                    )
                  }
                  style={{ padding: "4px 12px", fontSize: 12 }}
                >
                  {selectedCuenta === resumen.cuenta
                    ? "Ocultar"
                    : "Ver detalle"}
                </button>
              </div>

              {(selectedCuenta === resumen.cuenta ||
                window.matchMedia("print").matches) && (
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 12,
                    marginBottom: 12,
                  }}
                >
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th
                        style={{
                          padding: 8,
                          border: "1px solid #cbd5e1",
                          textAlign: "left",
                        }}
                      >
                        Fecha
                      </th>
                      <th
                        style={{
                          padding: 8,
                          border: "1px solid #cbd5e1",
                          textAlign: "left",
                        }}
                      >
                        Descripción
                      </th>
                      <th
                        style={{
                          padding: 8,
                          border: "1px solid #cbd5e1",
                          textAlign: "left",
                        }}
                      >
                        Referencia
                      </th>
                      <th
                        style={{
                          padding: 8,
                          border: "1px solid #cbd5e1",
                          textAlign: "right",
                        }}
                      >
                        Debe
                      </th>
                      <th
                        style={{
                          padding: 8,
                          border: "1px solid #cbd5e1",
                          textAlign: "right",
                        }}
                      >
                        Haber
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.asientos.map((asiento) => (
                      <tr key={asiento.id}>
                        <td style={{ padding: 8, border: "1px solid #cbd5e1" }}>
                          {new Date(asiento.fecha).toLocaleDateString()}
                        </td>
                        <td style={{ padding: 8, border: "1px solid #cbd5e1" }}>
                          {asiento.descripcion || "-"}
                        </td>
                        <td style={{ padding: 8, border: "1px solid #cbd5e1" }}>
                          {asiento.referencia || "-"}
                        </td>
                        <td
                          style={{
                            padding: 8,
                            border: "1px solid #cbd5e1",
                            textAlign: "right",
                          }}
                        >
                          {asiento.tipo_movimiento === "debe"
                            ? `L ${Number(asiento.monto).toFixed(2)}`
                            : "-"}
                        </td>
                        <td
                          style={{
                            padding: 8,
                            border: "1px solid #cbd5e1",
                            textAlign: "right",
                          }}
                        >
                          {asiento.tipo_movimiento === "haber"
                            ? `L ${Number(asiento.monto).toFixed(2)}`
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: "#f8fafc",
                  borderRadius: 4,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <span>Total Debe: L {formatMoney(resumen.totalDebe)}</span>
                <span>Total Haber: L {formatMoney(resumen.totalHaber)}</span>
                <span
                  style={{ color: resumen.saldo >= 0 ? "#15803d" : "#991b1b" }}
                >
                  Saldo: L {formatMoney(Math.abs(resumen.saldo))}{" "}
                  {resumen.saldo >= 0 ? "(Deudor)" : "(Acreedor)"}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
