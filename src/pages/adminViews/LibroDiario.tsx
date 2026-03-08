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
  usuario?: string;
};

type Cuenta = {
  id: number;
  codigo: string;
  nombre: string;
  tipo: string;
  activo: boolean;
};

export default function LibroDiario() {
  const today = new Date();
  const prior = new Date();
  prior.setDate(today.getDate() - 30);

  const [startDate, setStartDate] = useState<string>(
    prior.toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState<string>(
    today.toISOString().slice(0, 10)
  );
  const [asientos, setAsientos] = useState<AsientoContable[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [asientoDoble, setAsientoDoble] = useState(false);
  const [formData, setFormData] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    cuenta: "",
    descripcion: "",
    tipo_movimiento: "debe" as "debe" | "haber",
    monto: "",
    referencia: "",
  });
  const [formDataDoble, setFormDataDoble] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    cuentaDebe: "",
    cuentaHaber: "",
    monto: "",
    descripcion: "",
    referencia: "",
  });

  const fetchCuentas = async () => {
    try {
      const { data, error } = await supabase
        .from("cuentas_contables")
        .select("*")
        .eq("activo", true)
        .order("codigo", { ascending: true });
      if (error) throw error;
      setCuentas(data || []);
    } catch (err) {
      console.error("Error fetching cuentas", err);
    }
  };

  const fetchAsientos = async () => {
    setLoading(true);
    try {
      const startISO = new Date(startDate + "T00:00:00").toISOString();
      const endISO = new Date(endDate + "T23:59:59").toISOString();

      const { data, error } = await supabase
        .from("libro_diario")
        .select("*")
        .gte("fecha", startISO)
        .lte("fecha", endISO)
        .order("fecha", { ascending: false })
        .order("id", { ascending: false });
      if (error) throw error;
      setAsientos(data || []);
    } catch (err) {
      console.error("Error fetching libro diario", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCuentas();
  }, []);

  useEffect(() => {
    fetchAsientos(); /* eslint-disable-next-line */
  }, [startDate, endDate]);

  const handleDelete = async (id: number) => {
    if (!confirm("¿Está seguro de eliminar este asiento?")) return;
    try {
      const { error } = await supabase
        .from("libro_diario")
        .delete()
        .eq("id", id);
      if (error) throw error;
      fetchAsientos();
    } catch (err) {
      console.error("Error deleting asiento", err);
      alert("Error al eliminar el asiento");
    }
  };

  const handleEdit = (asiento: AsientoContable) => {
    setEditingId(asiento.id);
    setAsientoDoble(false);
    setFormData({
      fecha: new Date(asiento.fecha).toISOString().slice(0, 10),
      cuenta: asiento.cuenta,
      descripcion: asiento.descripcion || "",
      tipo_movimiento: asiento.tipo_movimiento,
      monto: asiento.monto.toString(),
      referencia: asiento.referencia || "",
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");

      if (asientoDoble) {
        // Validar asiento doble
        if (!formDataDoble.cuentaDebe || !formDataDoble.cuentaHaber) {
          alert("Debe seleccionar ambas cuentas para un asiento doble");
          return;
        }
        if (!formDataDoble.monto || parseFloat(formDataDoble.monto) <= 0) {
          alert("El monto debe ser mayor a cero");
          return;
        }

        const monto = parseFloat(formDataDoble.monto);
        const fecha = new Date(formDataDoble.fecha + "T12:00:00").toISOString();

        // Insertar dos asientos: uno debe y uno haber
        const asientos = [
          {
            fecha,
            cuenta: formDataDoble.cuentaDebe,
            descripcion: formDataDoble.descripcion || null,
            tipo_movimiento: "debe",
            monto,
            referencia: formDataDoble.referencia || null,
            usuario: user.username || null,
          },
          {
            fecha,
            cuenta: formDataDoble.cuentaHaber,
            descripcion: formDataDoble.descripcion || null,
            tipo_movimiento: "haber",
            monto,
            referencia: formDataDoble.referencia || null,
            usuario: user.username || null,
          },
        ];

        const { error } = await supabase.from("libro_diario").insert(asientos);
        if (error) throw error;

        setFormDataDoble({
          fecha: new Date().toISOString().slice(0, 10),
          cuentaDebe: "",
          cuentaHaber: "",
          monto: "",
          descripcion: "",
          referencia: "",
        });
      } else {
        // Asiento individual
        if (!formData.cuenta) {
          alert("Debe seleccionar una cuenta");
          return;
        }
        if (!formData.monto || parseFloat(formData.monto) <= 0) {
          alert("El monto debe ser mayor a cero");
          return;
        }

        const payload = {
          fecha: new Date(formData.fecha + "T12:00:00").toISOString(),
          cuenta: formData.cuenta,
          descripcion: formData.descripcion || null,
          tipo_movimiento: formData.tipo_movimiento,
          monto: parseFloat(formData.monto),
          referencia: formData.referencia || null,
          usuario: user.username || null,
        };

        if (editingId) {
          // Actualizar asiento existente
          const { error } = await supabase
            .from("libro_diario")
            .update(payload)
            .eq("id", editingId);
          if (error) throw error;
        } else {
          // Insertar nuevo asiento
          const { error } = await supabase
            .from("libro_diario")
            .insert([payload]);
          if (error) throw error;
        }

        setFormData({
          fecha: new Date().toISOString().slice(0, 10),
          cuenta: "",
          descripcion: "",
          tipo_movimiento: "debe",
          monto: "",
          referencia: "",
        });
      }

      setEditingId(null);
      setShowModal(false);
      fetchAsientos();
    } catch (err) {
      console.error("Error saving asiento", err);
      alert("Error al guardar el asiento contable");
    }
  };

  const getCuentaDisplay = (codigo: string) => {
    const cuenta = cuentas.find((c) => c.codigo === codigo);
    return cuenta ? `${cuenta.codigo} - ${cuenta.nombre}` : codigo;
  };

  const totalDebe = asientos
    .filter((a) => a.tipo_movimiento === "debe")
    .reduce((sum, a) => sum + Number(a.monto), 0);
  const totalHaber = asientos
    .filter((a) => a.tipo_movimiento === "haber")
    .reduce((sum, a) => sum + Number(a.monto), 0);
  const diferencia = totalDebe - totalHaber;

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

      <div
        className="no-print"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <h2 style={{ margin: 0 }}>Libro Diario</h2>
        <button className="btn-opaque" onClick={() => setShowModal(true)}>
          + Nuevo Asiento
        </button>
      </div>

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
            onClick={fetchAsientos}
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
            LIBRO DIARIO
          </h3>
          <p style={{ margin: "8px 0 0 0", fontSize: 12, color: "#475569" }}>
            Del {new Date(startDate).toLocaleDateString()} al{" "}
            {new Date(endDate).toLocaleDateString()}
          </p>
        </div>

        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
        >
          <thead>
            <tr style={{ background: "#eef2f7", textAlign: "left" }}>
              <th
                style={{
                  padding: 12,
                  fontWeight: 700,
                  border: "1px solid #cbd5e1",
                }}
              >
                Fecha
              </th>
              <th
                style={{
                  padding: 12,
                  fontWeight: 700,
                  border: "1px solid #cbd5e1",
                }}
              >
                Cuenta
              </th>
              <th
                style={{
                  padding: 12,
                  fontWeight: 700,
                  border: "1px solid #cbd5e1",
                }}
              >
                Descripción
              </th>
              <th
                style={{
                  padding: 12,
                  fontWeight: 700,
                  border: "1px solid #cbd5e1",
                }}
              >
                Referencia
              </th>
              <th
                style={{
                  padding: 12,
                  fontWeight: 700,
                  border: "1px solid #cbd5e1",
                  textAlign: "right",
                }}
              >
                Debe
              </th>
              <th
                style={{
                  padding: 12,
                  fontWeight: 700,
                  border: "1px solid #cbd5e1",
                  textAlign: "right",
                }}
              >
                Haber
              </th>
              <th
                className="no-print"
                style={{
                  padding: 12,
                  fontWeight: 700,
                  border: "1px solid #cbd5e1",
                  textAlign: "center",
                }}
              >
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {asientos.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    padding: 24,
                    textAlign: "center",
                    color: "#94a3b8",
                    border: "1px solid #cbd5e1",
                  }}
                >
                  No hay asientos en este rango
                </td>
              </tr>
            ) : (
              asientos.map((asiento) => (
                <tr
                  key={asiento.id}
                  style={{ borderBottom: "1px solid #e2e8f0" }}
                >
                  <td style={{ padding: 12, border: "1px solid #cbd5e1" }}>
                    {new Date(asiento.fecha).toLocaleDateString()}
                  </td>
                  <td style={{ padding: 12, border: "1px solid #cbd5e1" }}>
                    {asiento.cuenta}
                  </td>
                  <td
                    style={{
                      padding: 12,
                      border: "1px solid #cbd5e1",
                      fontSize: 12,
                    }}
                  >
                    {asiento.descripcion || "-"}
                  </td>
                  <td
                    style={{
                      padding: 12,
                      border: "1px solid #cbd5e1",
                      fontSize: 12,
                    }}
                  >
                    {asiento.referencia || "-"}
                  </td>
                  <td
                    style={{
                      padding: 12,
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
                      padding: 12,
                      border: "1px solid #cbd5e1",
                      textAlign: "right",
                    }}
                  >
                    {asiento.tipo_movimiento === "haber"
                      ? `L ${Number(asiento.monto).toFixed(2)}`
                      : "-"}
                  </td>
                  <td
                    className="no-print"
                    style={{
                      padding: 12,
                      border: "1px solid #cbd5e1",
                      textAlign: "center",
                    }}
                  >
                    <button
                      onClick={() => handleEdit(asiento)}
                      style={{
                        padding: "4px 8px",
                        fontSize: 12,
                        background: "#3b82f6",
                        color: "white",
                        border: "none",
                        borderRadius: 4,
                        cursor: "pointer",
                        marginRight: 4,
                      }}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(asiento.id)}
                      style={{
                        padding: "4px 8px",
                        fontSize: 12,
                        background: "#ef4444",
                        color: "white",
                        border: "none",
                        borderRadius: 4,
                        cursor: "pointer",
                      }}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))
            )}
            {asientos.length > 0 && (
              <tr style={{ fontWeight: "bold", background: "#f8fafc" }}>
                <td
                  colSpan={4}
                  style={{ padding: 12, border: "1px solid #cbd5e1" }}
                >
                  TOTALES
                </td>
                <td
                  style={{
                    padding: 12,
                    border: "1px solid #cbd5e1",
                    textAlign: "right",
                  }}
                >
                  L {formatMoney(totalDebe)}
                </td>
                <td
                  style={{
                    padding: 12,
                    border: "1px solid #cbd5e1",
                    textAlign: "right",
                  }}
                >
                  L {formatMoney(totalHaber)}
                </td>
              </tr>
            )}
            {asientos.length > 0 && (
              <tr
                style={{
                  fontWeight: "bold",
                  background: diferencia === 0 ? "#dcfce7" : "#fee2e2",
                }}
              >
                <td
                  colSpan={4}
                  style={{ padding: 12, border: "1px solid #cbd5e1" }}
                >
                  DIFERENCIA (Debe - Haber)
                </td>
                <td
                  colSpan={2}
                  style={{
                    padding: 12,
                    border: "1px solid #cbd5e1",
                    textAlign: "right",
                  }}
                >
                  L {formatMoney(Math.abs(diferencia))}{" "}
                  {diferencia === 0
                    ? "(Cuadrado)"
                    : diferencia > 0
                    ? "(Debe mayor)"
                    : "(Haber mayor)"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            overflow: "auto",
            padding: 20,
          }}
        >
          <div
            style={{
              background: "white",
              padding: 24,
              borderRadius: 8,
              width: 600,
              maxHeight: "90vh",
              overflow: "auto",
            }}
          >
            <h3 style={{ marginTop: 0 }}>
              {editingId ? "Editar Asiento Contable" : "Nuevo Asiento Contable"}
            </h3>

            {/* Selector de tipo de asiento */}
            {!editingId && (
              <div
                style={{
                  marginBottom: 20,
                  padding: 12,
                  background: "#f8fafc",
                  borderRadius: 8,
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <input
                    type="radio"
                    checked={!asientoDoble}
                    onChange={() => setAsientoDoble(false)}
                    style={{ marginRight: 8 }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    Asiento Individual
                  </span>
                </label>
                <label style={{ display: "flex", alignItems: "center" }}>
                  <input
                    type="radio"
                    checked={asientoDoble}
                    onChange={() => setAsientoDoble(true)}
                    style={{ marginRight: 8 }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    Asiento Doble (Partida Doble)
                  </span>
                </label>
              </div>
            )}

            {!asientoDoble ? (
              /* FORMULARIO ASIENTO INDIVIDUAL */
              <>
                <div style={{ marginBottom: 16 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: "#475569",
                      marginBottom: 4,
                    }}
                  >
                    Fecha *
                  </label>
                  <input
                    className="input"
                    type="date"
                    value={formData.fecha}
                    onChange={(e) =>
                      setFormData({ ...formData, fecha: e.target.value })
                    }
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: "#475569",
                      marginBottom: 4,
                    }}
                  >
                    Cuenta *
                  </label>
                  <select
                    className="input"
                    value={formData.cuenta}
                    onChange={(e) =>
                      setFormData({ ...formData, cuenta: e.target.value })
                    }
                  >
                    <option value="">Seleccionar cuenta</option>
                    {cuentas.map((cuenta) => (
                      <option key={cuenta.id} value={cuenta.codigo}>
                        {cuenta.codigo} - {cuenta.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: "#475569",
                      marginBottom: 4,
                    }}
                  >
                    Tipo de movimiento *
                  </label>
                  <select
                    className="input"
                    value={formData.tipo_movimiento}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        tipo_movimiento: e.target.value as "debe" | "haber",
                      })
                    }
                  >
                    <option value="debe">Debe</option>
                    <option value="haber">Haber</option>
                  </select>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: "#475569",
                      marginBottom: 4,
                    }}
                  >
                    Monto *
                  </label>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    value={formData.monto}
                    onChange={(e) =>
                      setFormData({ ...formData, monto: e.target.value })
                    }
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: "#475569",
                      marginBottom: 4,
                    }}
                  >
                    Descripción
                  </label>
                  <textarea
                    className="input"
                    rows={3}
                    value={formData.descripcion}
                    onChange={(e) =>
                      setFormData({ ...formData, descripcion: e.target.value })
                    }
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: "#475569",
                      marginBottom: 4,
                    }}
                  >
                    Referencia
                  </label>
                  <input
                    className="input"
                    value={formData.referencia}
                    onChange={(e) =>
                      setFormData({ ...formData, referencia: e.target.value })
                    }
                    placeholder="Factura, compra, nota, etc."
                  />
                </div>
              </>
            ) : (
              /* FORMULARIO ASIENTO DOBLE */
              <>
                <div style={{ marginBottom: 16 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: "#475569",
                      marginBottom: 4,
                    }}
                  >
                    Fecha *
                  </label>
                  <input
                    className="input"
                    type="date"
                    value={formDataDoble.fecha}
                    onChange={(e) =>
                      setFormDataDoble({
                        ...formDataDoble,
                        fecha: e.target.value,
                      })
                    }
                  />
                </div>

                <div
                  style={{
                    marginBottom: 16,
                    padding: 12,
                    background: "#dbeafe",
                    borderRadius: 8,
                  }}
                >
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: "#1e40af",
                      marginBottom: 8,
                      fontWeight: 600,
                    }}
                  >
                    Cuenta DEBE *
                  </label>
                  <select
                    className="input"
                    value={formDataDoble.cuentaDebe}
                    onChange={(e) =>
                      setFormDataDoble({
                        ...formDataDoble,
                        cuentaDebe: e.target.value,
                      })
                    }
                  >
                    <option value="">Seleccionar cuenta debe</option>
                    {cuentas.map((cuenta) => (
                      <option key={cuenta.id} value={cuenta.codigo}>
                        {cuenta.codigo} - {cuenta.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div
                  style={{
                    marginBottom: 16,
                    padding: 12,
                    background: "#fef3c7",
                    borderRadius: 8,
                  }}
                >
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: "#92400e",
                      marginBottom: 8,
                      fontWeight: 600,
                    }}
                  >
                    Cuenta HABER *
                  </label>
                  <select
                    className="input"
                    value={formDataDoble.cuentaHaber}
                    onChange={(e) =>
                      setFormDataDoble({
                        ...formDataDoble,
                        cuentaHaber: e.target.value,
                      })
                    }
                  >
                    <option value="">Seleccionar cuenta haber</option>
                    {cuentas.map((cuenta) => (
                      <option key={cuenta.id} value={cuenta.codigo}>
                        {cuenta.codigo} - {cuenta.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: "#475569",
                      marginBottom: 4,
                    }}
                  >
                    Monto * (mismo para ambas cuentas)
                  </label>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    value={formDataDoble.monto}
                    onChange={(e) =>
                      setFormDataDoble({
                        ...formDataDoble,
                        monto: e.target.value,
                      })
                    }
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: "#475569",
                      marginBottom: 4,
                    }}
                  >
                    Descripción
                  </label>
                  <textarea
                    className="input"
                    rows={3}
                    value={formDataDoble.descripcion}
                    onChange={(e) =>
                      setFormDataDoble({
                        ...formDataDoble,
                        descripcion: e.target.value,
                      })
                    }
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: "#475569",
                      marginBottom: 4,
                    }}
                  >
                    Referencia
                  </label>
                  <input
                    className="input"
                    value={formDataDoble.referencia}
                    onChange={(e) =>
                      setFormDataDoble({
                        ...formDataDoble,
                        referencia: e.target.value,
                      })
                    }
                    placeholder="Factura, compra, nota, etc."
                  />
                </div>

                <div
                  style={{
                    padding: 12,
                    background: "#dcfce7",
                    borderRadius: 8,
                    marginBottom: 16,
                  }}
                >
                  <p style={{ margin: 0, fontSize: 12, color: "#15803d" }}>
                    <strong>Partida Doble:</strong> Se registrarán
                    automáticamente dos asientos con el mismo monto, uno en Debe
                    y otro en Haber, manteniendo el balance contable.
                  </p>
                </div>
              </>
            )}

            <div
              style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
            >
              <button
                className="btn-opaque"
                onClick={() => {
                  setShowModal(false);
                  setEditingId(null);
                }}
              >
                Cancelar
              </button>
              <button className="btn-opaque" onClick={handleSave}>
                {editingId ? "Actualizar" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
