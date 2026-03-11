import React, { useState } from "react";
import ZoomWrapper from "./ZoomWrapper";
import supabase from "../lib/supabaseClient";

type Props = {
  open: boolean;
  onClose: () => void;
  carritoLength: number;
  subtotal: number;
  saveCotizacion: (opts?: any) => Promise<any>;
  // now also pass direccion del cliente al imprimir
  finalizePrint: (
    cliente: string,
    rtn: string | null,
    cotizacionNumero?: string | null,
    direccion?: string,
  ) => Promise<void>;
};

export default function CotizacionModal({
  open,
  onClose,
  carritoLength,
  subtotal,
  saveCotizacion,
  finalizePrint,
}: Props) {
  const [tipo, setTipo] = useState<"final" | "normal" | "juridico">("final");
  const [rtn, setRtn] = useState("");
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [searching, setSearching] = useState(false);
  const [foundCliente, setFoundCliente] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const onTipoChange = (t: typeof tipo) => {
    setTipo(t);
    setFoundCliente(null);
    if (t === "final") {
      setRtn("99999999999999");
      setNombre("Consumidor Final");
    } else {
      setRtn("");
      setNombre("");
    }
  };

  const buscarJuridico = async () => {
    if (!rtn) return;
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from("clientes")
        .select("*")
        .eq("rtn", rtn)
        .maybeSingle();
      if (!error && data) {
        setFoundCliente(data);
        setNombre(data.nombre || "");
      } else {
        setFoundCliente(null);
      }
    } catch (e) {
      setFoundCliente(null);
    } finally {
      setSearching(false);
    }
  };

  const crearJuridico = async () => {
    if (!rtn || !nombre) return;
    setLoading(true);
    try {
      const payload = { rtn, nombre, tipo_cliente: "juridico" };
      const { data, error } = await supabase
        .from("clientes")
        .insert([payload])
        .select()
        .maybeSingle();
      if (!error && data) {
        setFoundCliente(data);
      }
    } catch (e) {
      console.warn("Error creando cliente juridico", e);
    } finally {
      setLoading(false);
    }
  };

  const onGenerar = async () => {
    if (carritoLength === 0) return;
    setLoading(true);
    // preparar datos cliente segun tipo
    let clienteName = nombre;
    let clienteRtn = rtn || null;
    let clienteDir = direccion.trim() || "";
    if (tipo === "final") {
      clienteName = "Consumidor Final";
      clienteRtn = "99999999999999";
      // No limpiamos clienteDir: el usuario puede ingresar dirección incluso para Consumidor Final
    }

    try {
      const saved = await saveCotizacion({
        cliente: clienteName,
        rtn: clienteRtn,
        direccion: clienteDir,
      });
      // imprimir usando finalizePrint (PuntoDeVentas.finalizeFacturaForCliente)
      try {
        const numero = saved && saved.numero ? saved.numero : null;
        await finalizePrint(clienteName, clienteRtn, numero, clienteDir);
      } catch (e) {
        console.warn("Error during finalizePrint after cotizacion save", e);
      }
      onClose();
    } catch (e) {
      console.warn("Error generando cotizacion", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,6,23,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <ZoomWrapper>
        <div
          style={{
            width: 640,
            maxWidth: "95%",
            background: "white",
            borderRadius: 12,
            padding: 20,
            boxShadow: "0 18px 50px rgba(2,6,23,0.35)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h3 style={{ margin: 0 }}>Generar Cotización</h3>
            <button onClick={onClose} className="btn-opaque">
              Cerrar
            </button>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ flex: 1 }}>
                <input
                  type="radio"
                  checked={tipo === "final"}
                  onChange={() => onTipoChange("final")}
                />{" "}
                Consumidor Final
              </label>
              <label style={{ flex: 1 }}>
                <input
                  type="radio"
                  checked={tipo === "normal"}
                  onChange={() => onTipoChange("normal")}
                />{" "}
                Cliente Normal
              </label>
              <label style={{ flex: 1 }}>
                <input
                  type="radio"
                  checked={tipo === "juridico"}
                  onChange={() => onTipoChange("juridico")}
                />{" "}
                Jurídico
              </label>
            </div>

            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                <div>
                  <label>RTN o Identificación</label>
                  <input
                    value={rtn}
                    onChange={(e) => setRtn(e.target.value)}
                    disabled={tipo === "final"}
                    placeholder={
                      tipo === "final" ? "99999999999999" : "00000000000000"
                    }
                    style={{
                      width: "100%",
                      padding: 8,
                      marginTop: 6,
                      opacity: tipo === "final" ? 0.5 : 1,
                      cursor: tipo === "final" ? "not-allowed" : "text",
                    }}
                  />
                </div>
                <div>
                  <label>Razón social / Nombre</label>
                  <input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    disabled={tipo === "final"}
                    placeholder={
                      tipo === "juridico"
                        ? "Razón social de la empresa"
                        : "Nombre del cliente"
                    }
                    style={{
                      width: "100%",
                      padding: 8,
                      marginTop: 6,
                      opacity: tipo === "final" ? 0.5 : 1,
                      cursor: tipo === "final" ? "not-allowed" : "text",
                    }}
                  />
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <label>Dirección</label>
                <input
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  placeholder="Dirección del cliente"
                  style={{ width: "100%", padding: 8, marginTop: 6 }}
                />
              </div>

              {tipo === "juridico" && (
                <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                  <button
                    onClick={buscarJuridico}
                    className="btn-opaque"
                    disabled={searching}
                  >
                    {searching ? "Buscando..." : "Buscar"}
                  </button>
                  <button
                    onClick={crearJuridico}
                    className="btn-opaque"
                    disabled={loading || !rtn || !nombre}
                  >
                    {loading ? "Creando..." : "Crear Cliente"}
                  </button>
                </div>
              )}

              {foundCliente && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 8,
                    background: "#f8fafc",
                    borderRadius: 8,
                  }}
                >
                  <div>
                    <strong>Encontrado:</strong> {foundCliente.nombre}
                  </div>
                  <div>RTN: {foundCliente.rtn}</div>
                </div>
              )}
            </div>

            <div
              style={{
                marginTop: 16,
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                onClick={onClose}
                className="btn-opaque"
                style={{ background: "transparent" }}
              >
                Cancelar
              </button>
              <button
                onClick={onGenerar}
                className="btn-opaque"
                disabled={loading || carritoLength === 0}
              >
                {loading
                  ? "Generando cotización (1.2s)..."
                  : "Generar Cotización"}
              </button>
            </div>
          </div>
        </div>
      </ZoomWrapper>
    </div>
  );
}
