import React, { useEffect, useState } from "react";
import { formatMoney } from '../lib/formatMoney';
import supabase from "../lib/supabaseClient";
import MovimientoTypeModal from "../components/MovimientoTypeModal";
import MovimientoFormModal from "../components/MovimientoFormModal";
import useHondurasTime, {
  hondurasNowISO,
  hondurasNowLocalInput,
  hondurasTodayDate,
} from "../lib/useHondurasTime";
import useCajaSession from "../hooks/useCajaSession";
import { printMovimientoReceipt } from "../components/ReciboPrinter";

type Ingreso = {
  id: number;
  concepto: string;
  referencia?: string;
  monto: number;
  fecha: string;
  usuario: string;
  tipo?: "ingreso" | "egreso";
};

export default function IngresoEfectivo({ onBack }: { onBack: () => void }) {
  const { session } = useCajaSession();
  const [ingresos, setIngresos] = useState<Ingreso[]>([]);
  const [loading, setLoading] = useState(true);
  const [chosenCajaTable, setChosenCajaTable] = useState<string | null>(null);

  const [referencia, setReferencia] = useState("");
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState<number | "">("");
  const [fecha, setFecha] = useState(() => hondurasNowLocalInput());
  const [usuario, setUsuario] = useState(() => {
    try {
      const raw = localStorage.getItem("user");
      if (raw) {
        const parsed = JSON.parse(raw);
        const idCandidate =
          parsed &&
          (parsed.id || parsed.user?.id || parsed.sub || parsed.user_id);
        if (idCandidate) return String(idCandidate);
        const username =
          parsed &&
          (parsed.username ||
            parsed.user?.username ||
            parsed.name ||
            parsed.user?.name);
        if (username) return String(username);
      }
    } catch {}
    return "";
  });
  const [tipo, setTipo] = useState<"ingreso" | "egreso">("ingreso");
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [searchRef, setSearchRef] = useState("");

  useEffect(() => {
    // cargar datos desde la tabla `caja_movimientos`
    (async () => {
      const candidates = ["caja_movimientos", "caja_movimiento"];
      const userKeyCandidates = ["usuario", "user"];
      let got = false;
      for (const tbl of candidates) {
        try {
          // quick existence check
          const probe = await supabase
            .from(tbl)
            .select("id")
            .limit(1)
            .maybeSingle();
          if ((probe as any).error) {
            console.debug("Probe error for", tbl, (probe as any).error);
            continue;
          }
          // try to fetch rows filtered by current usuario using possible column names
          let rows: any[] = [];
          let usedKey: string | null = null;
          for (const key of userKeyCandidates) {
            try {
              const q = supabase
                .from(tbl)
                .select(
                  "id, tipo_movimiento, monto, concepto, referencia, usuario, fecha"
                )
                .order("id", { ascending: false }) as any;
              // apply eq filter using chosen key
              const res = await q.eq(key, usuario);
              if ((res as any).error) {
                console.debug(
                  "Filtered select error on",
                  tbl,
                  "key",
                  key,
                  (res as any).error
                );
                continue;
              }
              rows = Array.isArray(res.data) ? res.data : [];
              usedKey = key;
              break;
            } catch (e) {
              console.debug("Exception selecting with key", key, "on", tbl, e);
              continue;
            }
          }
          // If we didn't get rows by filtering, fall back to unfiltered select but we'll then filter client-side
          if (rows.length === 0) {
            const { data, error } = await supabase
              .from(tbl)
              .select(
                "id, tipo_movimiento, monto, concepto, referencia, usuario, fecha"
              )
              .order("id", { ascending: false });
            if (error) {
              console.debug("caja table select error for", tbl, error);
              continue;
            }
            rows = Array.isArray(data) ? data : [];
          }

          const mapped: Ingreso[] = rows.map((r: any) => ({
            id: r.id,
            concepto: r.concepto || r.motivo || r.descripcion || "",
            referencia: r.referencia || null,
            monto: Number(r.monto ?? 0),
            fecha: (r.fecha || new Date()).toString(),
            usuario: r.usuario || r.user || "",
            tipo: (r.tipo_movimiento || r.tipo || "ingreso") as any,
          }));

          // If we had to fall back to unfiltered select, apply client-side filter so the user only sees their own movements
          const finalList = usedKey
            ? mapped
            : mapped.filter(
                (m) =>
                  (m.usuario || "").toLowerCase() ===
                  (usuario || "").toLowerCase()
              );

          // Filter movements by session apertura if available, otherwise keep today's movements
          try {
            if (session && session.fecha_apertura) {
              // normalize fecha_apertura to include timezone if missing
              let since = session.fecha_apertura;
              if (
                since &&
                !since.includes("Z") &&
                !since.includes("+") &&
                !since.match(/-\d\d:\d\d$/)
              ) {
                since = `${since}-06:00`;
              }
              const sinceIso = since ? new Date(since) : null;
              if (sinceIso) {
                const finalDateFiltered = finalList.filter((m) => {
                  try {
                    const d = new Date(m.fecha);
                    return d >= sinceIso;
                  } catch (e) {
                    return false;
                  }
                });
                setIngresos(finalDateFiltered);
              } else {
                setIngresos(finalList);
              }
            } else {
              const today = hondurasTodayDate();
              const finalDateFiltered = finalList.filter((m) => {
                try {
                  const d = new Date(m.fecha);
                  const asDate = d.toLocaleDateString("en-CA", {
                    timeZone: "America/Tegucigalpa",
                  });
                  return asDate === today;
                } catch (e) {
                  return false;
                }
              });
              setIngresos(finalDateFiltered);
            }
          } catch (e) {
            setIngresos(finalList);
          }
          setChosenCajaTable(tbl);
          got = true;
          break;
        } catch (err) {
          console.debug("Error probing table", tbl, err);
        }
      }
      if (!got) {
        console.warn(
          "No se encontró tabla caja_movimientos/caja_movimiento o hubo errores en la consulta"
        );
        setIngresos([]);
      }
      setLoading(false);
    })();
    // re-run when session or usuario change so we can filter by session.fecha_apertura
  }, [session, usuario]);

  function saveToStorage(list: Ingreso[]) {
    // no-op: migration to DB handled server-side
  }

  async function insertMovimiento(payload: {
    concepto: string;
    referencia?: string;
    monto: number;
    tipo: "ingreso" | "egreso";
  }) {
    const {
      concepto: pConcepto,
      referencia: pReferencia,
      monto: pMonto,
      tipo: pTipo,
    } = payload;
    try {
      const isUUID = (v: any) =>
        typeof v === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          v
        );
      const userForPayload = (() => {
        try {
          if (!usuario) return null;
          if (isUUID(usuario)) return usuario;
          if (/^\d+$/.test(usuario)) return Number(usuario);
          return null;
        } catch (e) {
          return null;
        }
      })();
      const payloadBase: any = {
        concepto: pConcepto || null,
        referencia: pReferencia || null,
        monto: Number(pMonto),
        fecha: hondurasNowISO(),
        // Only send `usuario` when it looks like a UUID or numeric id; otherwise omit to avoid type errors
        ...(userForPayload !== null ? { usuario: userForPayload } : {}),
      };
      // Try multiple table names and key variations
      const tableCandidates = chosenCajaTable
        ? [chosenCajaTable, "caja_movimientos", "caja_movimiento"]
        : ["caja_movimientos", "caja_movimiento"];
      let inserted: any = null;
      for (const tbl of tableCandidates) {
        // try with tipo_movimiento
        const tryPayloads = [
          { ...payloadBase, tipo_movimiento: pTipo },
          { ...payloadBase, tipo: pTipo },
          { ...payloadBase }, // without tipo
        ];
        for (const p of tryPayloads) {
          try {
            const res = await supabase
              .from(tbl)
              .insert(p)
              .select("*")
              .maybeSingle();
            if ((res as any).error) {
              console.debug("Insert error on", tbl, p, (res as any).error);
              continue;
            }
            inserted = (res as any).data || (res as any);
            setChosenCajaTable(tbl);
            break;
          } catch (ie) {
            console.debug("Insert exception on", tbl, ie);
            continue;
          }
        }
        if (inserted) break;
      }
      if (!inserted)
        throw new Error(
          "No se pudo insertar en ninguna tabla de caja (intente verificar esquema en la base)"
        );
      const newRow: Ingreso = {
        id: inserted.id,
        concepto:
          inserted.concepto ||
          inserted.motivo ||
          inserted.descripcion ||
          pConcepto ||
          "",
        referencia: inserted.referencia || pReferencia || null,
        monto: Number(inserted.monto || pMonto || 0),
        fecha: inserted.fecha ? String(inserted.fecha) : hondurasNowISO(),
        usuario: inserted.usuario || usuario,
        tipo: inserted.tipo_movimiento || inserted.tipo || pTipo,
      };
      setIngresos((prev) => [newRow, ...prev]);
      return newRow;
    } catch (err) {
      console.warn(
        "Error insertando en caja_movimientos/caja_movimiento:",
        err
      );
      throw err;
    }
  }

  const filteredIngresos =
    searchRef.trim() === ""
      ? ingresos
      : ingresos.filter((i) =>
          (i.referencia || "").toLowerCase().includes(searchRef.toLowerCase())
        );

  return (
    <div
      style={{
        padding: 20,
        width: "100%",
        maxWidth: "100%",
        margin: "24px 12px",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <h2 style={{ margin: 0 }}>Movimientos de caja</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowTypeModal(true)}
            className="btn-primary"
            style={{ padding: "8px 12px" }}
          >
            Registrar movimiento
          </button>
          <button
            onClick={onBack}
            className="btn-opaque"
            style={{ padding: "8px 12px" }}
          >
            Volver
          </button>
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 360px",
          gap: 16,
        }}
      >
        <section
          style={{
            background: "#ffffff",
            padding: 20,
            borderRadius: 10,
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            border: "1px solid #f1f5f9",
          }}
        >
          <h3 style={{ margin: 0, marginBottom: 16, color: "#1e293b" }}>
            Registros de Movimientos
          </h3>

          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <input
              placeholder="Buscar por referencia..."
              value={searchRef}
              onChange={(e) => setSearchRef(e.target.value)}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                outline: "none",
                fontSize: 14,
              }}
            />

            <div
              style={{
                minWidth: 160,
                display: "flex",
                justifyContent: "flex-end",
                fontSize: 13,
                color: "#475569",
              }}
            >
              Los movimientos solo se generaran con efectivo
            </div>
          </div>

          {loading ? (
            <p style={{ color: "#64748b" }}>Cargando...</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 14,
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: "#f8fafc",
                      borderBottom: "1px solid #e2e8f0",
                    }}
                  >
                    {[
                      "Concepto",
                      "Referencia",
                      "Monto",
                      "Fecha y hora",
                      "Usuario",
                      "Tipo",
                    ].map((th) => (
                      <th
                        key={th}
                        style={{
                          textAlign: th === "Monto" ? "right" : "left",
                          padding: "10px 12px",
                          fontWeight: 600,
                          color: "#475569",
                        }}
                      >
                        {th}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {filteredIngresos.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        style={{
                          padding: 20,
                          textAlign: "center",
                          color: "#94a3b8",
                          fontStyle: "italic",
                        }}
                      >
                        No hay registros
                      </td>
                    </tr>
                  ) : (
                    filteredIngresos.map((r) => (
                      <tr
                        key={r.id}
                        style={{ borderBottom: "1px solid #f1f5f9" }}
                      >
                        <td style={{ padding: "10px 12px" }}>{r.concepto}</td>
                        <td style={{ padding: "10px 12px" }}>
                          {r.referencia ?? ""}
                        </td>
                        <td
                          style={{ padding: "10px 12px", textAlign: "right" }}
                        >
                          L{formatMoney(r.monto)}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          {new Date(r.fecha).toLocaleString()}
                        </td>
                        <td style={{ padding: "10px 12px" }}>{r.usuario}</td>
                        <td style={{ padding: "10px 12px" }}>{r.tipo ?? ""}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <MovimientoTypeModal
        open={showTypeModal}
        onClose={() => setShowTypeModal(false)}
        onSelect={(t) => {
          setTipo(t);
          setShowTypeModal(false);
          setShowFormModal(true);
        }}
      />
      <MovimientoFormModal
        open={showFormModal}
        onClose={() => setShowFormModal(false)}
        tipo={tipo}
        onSubmit={async (v) => {
          try {
            const saved = await insertMovimiento({
              concepto: v.concepto,
              referencia: v.referencia,
              monto: Number(v.monto),
              tipo,
            });
            try {
              printMovimientoReceipt({
                id: saved.id,
                concepto: saved.concepto,
                referencia: saved.referencia,
                monto: saved.monto,
                fecha: saved.fecha,
                usuario: saved.usuario,
                tipo: saved.tipo,
              });
            } catch (pe) {
              console.warn("No se pudo imprimir automáticamente", pe);
            }
            setShowFormModal(false);
          } catch (err) {
            alert(
              "Error guardando movimiento: " +
                (err && ((err as any).message || JSON.stringify(err)))
            );
          }
        }}
      />
    </div>
  );
}
