import React, { useEffect, useState } from "react";
import { formatMoney } from '../../lib/formatMoney';
import supabase from "../../lib/supabaseClient";

type Cuenta = {
  id: number;
  codigo: string;
  nombre: string;
  tipo: "activo" | "pasivo" | "patrimonio" | "ingreso" | "gasto";
};

type SaldoCuenta = {
  cuenta: Cuenta;
  monto: number;
};

export default function EstadoResultados() {
  const today = new Date();
  const prior = new Date();
  prior.setDate(today.getDate() - 30);

  const [startDate, setStartDate] = useState<string>(
    prior.toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState<string>(
    today.toISOString().slice(0, 10)
  );
  const [ingresos, setIngresos] = useState<SaldoCuenta[]>([]);
  const [gastos, setGastos] = useState<SaldoCuenta[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchEstadoResultados = async () => {
    setLoading(true);
    try {
      // Obtener cuentas de ingreso y gasto
      const { data: cuentasData, error: cuentasError } = await supabase
        .from("cuentas_contables")
        .select("*")
        .eq("activo", true)
        .in("tipo", ["ingreso", "gasto"]);
      if (cuentasError) throw cuentasError;
      const cuentas: Cuenta[] = cuentasData || [];

      // Obtener movimientos en el rango de fechas
      const startISO = new Date(startDate + "T00:00:00").toISOString();
      const endISO = new Date(endDate + "T23:59:59").toISOString();
      const { data: movimientosData, error: movimientosError } = await supabase
        .from("libro_diario")
        .select("*")
        .gte("fecha", startISO)
        .lte("fecha", endISO);
      if (movimientosError) throw movimientosError;
      const movimientos = movimientosData || [];

      // Calcular monto por cuenta (para ingresos: haber - debe, para gastos: debe - haber)
      const montosPorCodigo: Record<string, { debe: number; haber: number }> =
        {};
      movimientos.forEach((mov: any) => {
        const codigo = mov.cuenta;
        if (!montosPorCodigo[codigo])
          montosPorCodigo[codigo] = { debe: 0, haber: 0 };
        if (mov.tipo_movimiento === "debe") {
          montosPorCodigo[codigo].debe += Number(mov.monto);
        } else {
          montosPorCodigo[codigo].haber += Number(mov.monto);
        }
      });

      // Agrupar por tipo
      const ingresosArr: SaldoCuenta[] = [];
      const gastosArr: SaldoCuenta[] = [];

      cuentas.forEach((cuenta) => {
        const movs = montosPorCodigo[cuenta.codigo];
        if (!movs) return;

        let monto = 0;
        if (cuenta.tipo === "ingreso") {
          // Ingresos: haber - debe
          monto = movs.haber - movs.debe;
          if (monto > 0) ingresosArr.push({ cuenta, monto });
        } else if (cuenta.tipo === "gasto") {
          // Gastos: debe - haber
          monto = movs.debe - movs.haber;
          if (monto > 0) gastosArr.push({ cuenta, monto });
        }
      });

      setIngresos(
        ingresosArr.sort((a, b) =>
          a.cuenta.codigo.localeCompare(b.cuenta.codigo)
        )
      );
      setGastos(
        gastosArr.sort((a, b) => a.cuenta.codigo.localeCompare(b.cuenta.codigo))
      );
    } catch (err) {
      console.error("Error fetching estado de resultados", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEstadoResultados(); /* eslint-disable-next-line */
  }, [startDate, endDate]);

  const totalIngresos = ingresos.reduce((sum, item) => sum + item.monto, 0);
  const totalGastos = gastos.reduce((sum, item) => sum + item.monto, 0);
  const utilidadNeta = totalIngresos - totalGastos;

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
        Estado de Resultados
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
            onClick={fetchEstadoResultados}
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
        style={{
          background: "white",
          padding: 24,
          borderRadius: 8,
          maxWidth: 800,
          margin: "0 auto",
        }}
        className="printable"
      >
        <div style={{ textAlign: "center", marginBottom: 30 }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
            ESTADO DE RESULTADOS
          </h3>
          <p style={{ margin: "8px 0 0 0", fontSize: 13, color: "#475569" }}>
            Del {new Date(startDate).toLocaleDateString()} al{" "}
            {new Date(endDate).toLocaleDateString()}
          </p>
        </div>

        {/* INGRESOS */}
        <div style={{ marginBottom: 32 }}>
          <h4
            style={{
              margin: "0 0 16px 0",
              fontSize: 16,
              fontWeight: 700,
              color: "#15803d",
              borderBottom: "2px solid #15803d",
              paddingBottom: 8,
            }}
          >
            INGRESOS
          </h4>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <tbody>
              {ingresos.length === 0 ? (
                <tr>
                  <td style={{ padding: 8, color: "#94a3b8" }}>
                    No hay ingresos en este período
                  </td>
                </tr>
              ) : (
                ingresos.map((item, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: "6px 0", fontSize: 11 }}>
                      {item.cuenta.codigo}
                    </td>
                    <td style={{ padding: "6px 12px" }}>
                      {item.cuenta.nombre}
                    </td>
                    <td
                      style={{
                        padding: "6px 0",
                        textAlign: "right",
                        fontWeight: 500,
                      }}
                    >
                      L {formatMoney(item.monto)}
                    </td>
                  </tr>
                ))
              )}
              <tr style={{ borderTop: "2px solid #15803d", fontWeight: 700 }}>
                <td colSpan={2} style={{ padding: "12px 0 8px 0" }}>
                  TOTAL INGRESOS
                </td>
                <td style={{ padding: "12px 0 8px 0", textAlign: "right" }}>
                  L {formatMoney(totalIngresos)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* GASTOS */}
        <div style={{ marginBottom: 32 }}>
          <h4
            style={{
              margin: "0 0 16px 0",
              fontSize: 16,
              fontWeight: 700,
              color: "#991b1b",
              borderBottom: "2px solid #991b1b",
              paddingBottom: 8,
            }}
          >
            GASTOS
          </h4>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <tbody>
              {gastos.length === 0 ? (
                <tr>
                  <td style={{ padding: 8, color: "#94a3b8" }}>
                    No hay gastos en este período
                  </td>
                </tr>
              ) : (
                gastos.map((item, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: "6px 0", fontSize: 11 }}>
                      {item.cuenta.codigo}
                    </td>
                    <td style={{ padding: "6px 12px" }}>
                      {item.cuenta.nombre}
                    </td>
                    <td
                      style={{
                        padding: "6px 0",
                        textAlign: "right",
                        fontWeight: 500,
                      }}
                    >
                      L {formatMoney(item.monto)}
                    </td>
                  </tr>
                ))
              )}
              <tr style={{ borderTop: "2px solid #991b1b", fontWeight: 700 }}>
                <td colSpan={2} style={{ padding: "12px 0 8px 0" }}>
                  TOTAL GASTOS
                </td>
                <td style={{ padding: "12px 0 8px 0", textAlign: "right" }}>
                  L {formatMoney(totalGastos)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* UTILIDAD/PÉRDIDA NETA */}
        <div
          style={{
            padding: 20,
            background: utilidadNeta >= 0 ? "#dcfce7" : "#fee2e2",
            borderRadius: 8,
            border: `2px solid ${utilidadNeta >= 0 ? "#15803d" : "#991b1b"}`,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h4
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 700,
                color: utilidadNeta >= 0 ? "#15803d" : "#991b1b",
              }}
            >
              {utilidadNeta >= 0 ? "UTILIDAD NETA" : "PÉRDIDA NETA"}
            </h4>
            <span
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: utilidadNeta >= 0 ? "#15803d" : "#991b1b",
              }}
            >
              L {formatMoney(Math.abs(utilidadNeta))}
            </span>
          </div>
          <p style={{ margin: "8px 0 0 0", fontSize: 12, color: "#475569" }}>
            {utilidadNeta >= 0
              ? "Los ingresos superan a los gastos en este período"
              : "Los gastos superan a los ingresos en este período"}
          </p>
        </div>

        {/* Resumen */}
        <div
          style={{
            marginTop: 24,
            padding: 16,
            background: "#f8fafc",
            borderRadius: 8,
          }}
        >
          <table style={{ width: "100%", fontSize: 13 }}>
            <tbody>
              <tr>
                <td style={{ padding: "4px 0" }}>Total Ingresos:</td>
                <td
                  style={{
                    padding: "4px 0",
                    textAlign: "right",
                    fontWeight: 600,
                  }}
                >
                  L {formatMoney(totalIngresos)}
                </td>
              </tr>
              <tr>
                <td style={{ padding: "4px 0" }}>(-) Total Gastos:</td>
                <td
                  style={{
                    padding: "4px 0",
                    textAlign: "right",
                    fontWeight: 600,
                  }}
                >
                  L {formatMoney(totalGastos)}
                </td>
              </tr>
              <tr style={{ borderTop: "2px solid #cbd5e1", fontWeight: 700 }}>
                <td style={{ padding: "8px 0 4px 0" }}>
                  {utilidadNeta >= 0 ? "Utilidad Neta:" : "Pérdida Neta:"}
                </td>
                <td
                  style={{
                    padding: "8px 0 4px 0",
                    textAlign: "right",
                    color: utilidadNeta >= 0 ? "#15803d" : "#991b1b",
                  }}
                >
                  L {formatMoney(Math.abs(utilidadNeta))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
