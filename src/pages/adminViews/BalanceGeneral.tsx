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
  saldo: number;
};

export default function BalanceGeneral() {
  const [fechaCorte, setFechaCorte] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [activos, setActivos] = useState<SaldoCuenta[]>([]);
  const [pasivos, setPasivos] = useState<SaldoCuenta[]>([]);
  const [patrimonio, setPatrimonio] = useState<SaldoCuenta[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchBalanceGeneral = async () => {
    setLoading(true);
    try {
      // Obtener todas las cuentas activas
      const { data: cuentasData, error: cuentasError } = await supabase
        .from("cuentas_contables")
        .select("*")
        .eq("activo", true)
        .in("tipo", ["activo", "pasivo", "patrimonio"]);
      if (cuentasError) throw cuentasError;
      const cuentas: Cuenta[] = cuentasData || [];

      // Obtener movimientos hasta la fecha de corte
      const fechaISO = new Date(fechaCorte + "T23:59:59").toISOString();
      const { data: movimientosData, error: movimientosError } = await supabase
        .from("libro_diario")
        .select("*")
        .lte("fecha", fechaISO);
      if (movimientosError) throw movimientosError;
      const movimientos = movimientosData || [];

      // Calcular saldo por cuenta
      const saldosPorCodigo: Record<string, number> = {};
      movimientos.forEach((mov: any) => {
        const codigo = mov.cuenta;
        if (!saldosPorCodigo[codigo]) saldosPorCodigo[codigo] = 0;
        if (mov.tipo_movimiento === "debe") {
          saldosPorCodigo[codigo] += Number(mov.monto);
        } else {
          saldosPorCodigo[codigo] -= Number(mov.monto);
        }
      });

      // Agrupar por tipo
      const activosArr: SaldoCuenta[] = [];
      const pasivosArr: SaldoCuenta[] = [];
      const patrimonioArr: SaldoCuenta[] = [];

      cuentas.forEach((cuenta) => {
        const saldo = saldosPorCodigo[cuenta.codigo] || 0;
        if (saldo === 0) return; // No mostrar cuentas con saldo 0

        const item = { cuenta, saldo };
        if (cuenta.tipo === "activo") activosArr.push(item);
        else if (cuenta.tipo === "pasivo") pasivosArr.push(item);
        else if (cuenta.tipo === "patrimonio") patrimonioArr.push(item);
      });

      setActivos(
        activosArr.sort((a, b) =>
          a.cuenta.codigo.localeCompare(b.cuenta.codigo)
        )
      );
      setPasivos(
        pasivosArr.sort((a, b) =>
          a.cuenta.codigo.localeCompare(b.cuenta.codigo)
        )
      );
      setPatrimonio(
        patrimonioArr.sort((a, b) =>
          a.cuenta.codigo.localeCompare(b.cuenta.codigo)
        )
      );
    } catch (err) {
      console.error("Error fetching balance general", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalanceGeneral(); /* eslint-disable-next-line */
  }, [fechaCorte]);

  const totalActivos = activos.reduce((sum, item) => sum + item.saldo, 0);
  const totalPasivos = pasivos.reduce((sum, item) => sum + item.saldo, 0);
  const totalPatrimonio = patrimonio.reduce((sum, item) => sum + item.saldo, 0);
  const totalPasivosPatrimonio = totalPasivos + totalPatrimonio;

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
        Balance General
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
            Fecha de corte
          </label>
          <input
            className="input"
            type="date"
            value={fechaCorte}
            onChange={(e) => setFechaCorte(e.target.value)}
          />
        </div>
        <div style={{ marginLeft: "auto" }}>
          <button
            className="btn-opaque"
            onClick={fetchBalanceGeneral}
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
        style={{ background: "white", padding: 24, borderRadius: 8 }}
        className="printable"
      >
        <div style={{ textAlign: "center", marginBottom: 30 }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
            BALANCE GENERAL
          </h3>
          <p style={{ margin: "8px 0 0 0", fontSize: 13, color: "#475569" }}>
            Al {new Date(fechaCorte).toLocaleDateString()}
          </p>
        </div>

        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}
        >
          {/* ACTIVOS */}
          <div>
            <h4
              style={{
                margin: "0 0 16px 0",
                fontSize: 16,
                fontWeight: 700,
                color: "#1e40af",
                borderBottom: "2px solid #1e40af",
                paddingBottom: 8,
              }}
            >
              ACTIVOS
            </h4>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
              }}
            >
              <tbody>
                {activos.length === 0 ? (
                  <tr>
                    <td style={{ padding: 8, color: "#94a3b8" }}>
                      No hay cuentas de activo
                    </td>
                  </tr>
                ) : (
                  activos.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: "6px 0", fontSize: 11 }}>
                        {item.cuenta.codigo}
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        {item.cuenta.nombre}
                      </td>
                      <td
                        style={{
                          padding: "6px 0",
                          textAlign: "right",
                          fontWeight: 500,
                        }}
                      >
                        L {formatMoney(item.saldo)}
                      </td>
                    </tr>
                  ))
                )}
                <tr style={{ borderTop: "2px solid #1e40af", fontWeight: 700 }}>
                  <td colSpan={2} style={{ padding: "12px 0 8px 0" }}>
                    TOTAL ACTIVOS
                  </td>
                  <td style={{ padding: "12px 0 8px 0", textAlign: "right" }}>
                    L {formatMoney(totalActivos)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* PASIVOS Y PATRIMONIO */}
          <div>
            <h4
              style={{
                margin: "0 0 16px 0",
                fontSize: 16,
                fontWeight: 700,
                color: "#92400e",
                borderBottom: "2px solid #92400e",
                paddingBottom: 8,
              }}
            >
              PASIVOS
            </h4>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
                marginBottom: 24,
              }}
            >
              <tbody>
                {pasivos.length === 0 ? (
                  <tr>
                    <td style={{ padding: 8, color: "#94a3b8" }}>
                      No hay cuentas de pasivo
                    </td>
                  </tr>
                ) : (
                  pasivos.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: "6px 0", fontSize: 11 }}>
                        {item.cuenta.codigo}
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        {item.cuenta.nombre}
                      </td>
                      <td
                        style={{
                          padding: "6px 0",
                          textAlign: "right",
                          fontWeight: 500,
                        }}
                      >
                        L {formatMoney(item.saldo)}
                      </td>
                    </tr>
                  ))
                )}
                <tr style={{ borderTop: "1px solid #cbd5e1", fontWeight: 600 }}>
                  <td colSpan={2} style={{ padding: "8px 0" }}>
                    Total Pasivos
                  </td>
                  <td style={{ padding: "8px 0", textAlign: "right" }}>
                    L {formatMoney(totalPasivos)}
                  </td>
                </tr>
              </tbody>
            </table>

            <h4
              style={{
                margin: "0 0 16px 0",
                fontSize: 16,
                fontWeight: 700,
                color: "#6b21a8",
                borderBottom: "2px solid #6b21a8",
                paddingBottom: 8,
              }}
            >
              PATRIMONIO
            </h4>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
              }}
            >
              <tbody>
                {patrimonio.length === 0 ? (
                  <tr>
                    <td style={{ padding: 8, color: "#94a3b8" }}>
                      No hay cuentas de patrimonio
                    </td>
                  </tr>
                ) : (
                  patrimonio.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: "6px 0", fontSize: 11 }}>
                        {item.cuenta.codigo}
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        {item.cuenta.nombre}
                      </td>
                      <td
                        style={{
                          padding: "6px 0",
                          textAlign: "right",
                          fontWeight: 500,
                        }}
                      >
                        L {formatMoney(item.saldo)}
                      </td>
                    </tr>
                  ))
                )}
                <tr style={{ borderTop: "1px solid #cbd5e1", fontWeight: 600 }}>
                  <td colSpan={2} style={{ padding: "8px 0" }}>
                    Total Patrimonio
                  </td>
                  <td style={{ padding: "8px 0", textAlign: "right" }}>
                    L {formatMoney(totalPatrimonio)}
                  </td>
                </tr>
                <tr style={{ borderTop: "2px solid #6b21a8", fontWeight: 700 }}>
                  <td colSpan={2} style={{ padding: "12px 0 8px 0" }}>
                    TOTAL PASIVO + PATRIMONIO
                  </td>
                  <td style={{ padding: "12px 0 8px 0", textAlign: "right" }}>
                    L {formatMoney(totalPasivosPatrimonio)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Verificación de ecuación contable */}
        <div
          style={{
            marginTop: 32,
            padding: 16,
            background:
              Math.abs(totalActivos - totalPasivosPatrimonio) < 0.01
                ? "#dcfce7"
                : "#fee2e2",
            borderRadius: 8,
            textAlign: "center",
          }}
        >
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
            {Math.abs(totalActivos - totalPasivosPatrimonio) < 0.01
              ? "✓ Ecuación contable balanceada: Activos = Pasivos + Patrimonio"
              : `⚠ Ecuación contable desbalanceada. Diferencia: L ${Math.abs(
                  totalActivos - totalPasivosPatrimonio
                ).toFixed(2)}`}
          </p>
        </div>
      </div>
    </div>
  );
}
