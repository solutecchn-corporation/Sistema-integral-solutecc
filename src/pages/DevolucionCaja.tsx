import React, { useState, useEffect } from "react";
import { formatMoney } from "../lib/formatMoney";
import NotasCreditoModal from "../components/NotasCreditoModal";
import ModalWrapper from "../components/ModalWrapper";
import Confirmado from "../components/Confirmado";
import supabase from "../lib/supabaseClient";
import useHondurasTime, { hondurasTodayDate } from "../lib/useHondurasTime";
import generateNcHTML, { generateNotaAbonoHTML } from "../lib/nchtmlimp";
import SeleccionFacturaModal from "../components/SeleccionFacturaModal";

type Devolucion = {
  id: number;
  venta_id: string;
  producto_id: string;
  cantidad: number;
  motivo?: string;
  fecha_devolucion?: string;
  usuario: string;
  tipo_devolucion?: string;
};

export default function DevolucionCaja({ onBack }: { onBack: () => void }) {
  const [showNotas, setShowNotas] = useState(false);
  const [ncInfo, setNcInfo] = useState<any | null>(() => {
    try {
      const raw = localStorage.getItem("ncInfo");
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  });

  const [devoluciones, setDevoluciones] = useState<Devolucion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    venta_id: "",
    producto_id: "",
    cantidad: 1,
    motivo: "",
    tipo_devolucion: "credito",
  });
  // search invoice flow
  const [facturaBuscar, setFacturaBuscar] = useState<string>("");
  const [ventaProductos, setVentaProductos] = useState<any[]>([]);
  const [ventaEncontrada, setVentaEncontrada] = useState<any | null>(null);
  const [selectedItems, setSelectedItems] = useState<Array<any>>([]);
  const [showDevTypeModal, setShowDevTypeModal] = useState(false);
  const [devType, setDevType] = useState<"efectivo" | "nota_abono">("efectivo");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string>("");
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [motivoText, setMotivoText] = useState<string>("");
  // Selector para facturas con el mismo número (diferente CAI)
  const [resultadosBusquedaDev, setResultadosBusquedaDev] = useState<any[]>([]);
  const [showSelectorFacturaDev, setShowSelectorFacturaDev] = useState(false);

  const { hondurasNowISO } = useHondurasTime();

  useEffect(() => {
    loadDevoluciones();
  }, []);

  async function loadDevoluciones() {
    setLoading(true);
    try {
      // By default, show only current user's devoluciones to avoid exposing all records
      const rawUser = localStorage.getItem("user");
      const parsed = rawUser ? JSON.parse(rawUser) : null;
      const userName =
        parsed &&
        (parsed.username ||
          parsed.user?.username ||
          parsed.name ||
          parsed.user?.name)
          ? parsed.username ||
            parsed.user?.username ||
            parsed.name ||
            parsed.user?.name
          : null;
      let { data, error } = await supabase
        .from("devoluciones_ventas")
        .select("*")
        .order("id", { ascending: false });
      if (error) {
        console.debug("Error loading devoluciones_ventas:", error);
        setDevoluciones([]);
        return;
      }
      let rows: any[] = Array.isArray(data) ? data : [];
      if (userName)
        rows = rows.filter(
          (r) => (r.usuario || "").toLowerCase() === userName.toLowerCase(),
        );
      setDevoluciones(rows.map((r) => ({ ...r }) as Devolucion));
    } catch (e) {
      console.debug("loadDevoluciones exception", e);
      setDevoluciones([]);
    } finally {
      setLoading(false);
    }
  }

  function isUUID(v: string) {
    return (
      typeof v === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
    );
  }

  async function submitDevolucion() {
    // validate required fields
    if (!isUUID(form.venta_id)) {
      setErrorMessage("venta_id debe ser un UUID válido");
      setErrorOpen(true);
      return;
    }
    if (!isUUID(form.producto_id)) {
      setErrorMessage("producto_id debe ser un UUID válido");
      setErrorOpen(true);
      return;
    }
    if (!form.cantidad || Number(form.cantidad) <= 0) {
      setErrorMessage("cantidad debe ser mayor que 0");
      setErrorOpen(true);
      return;
    }
    // build payload
    const rawUser = localStorage.getItem("user");
    let usuarioText = "usuario";
    try {
      const parsed = rawUser ? JSON.parse(rawUser) : null;
      usuarioText =
        parsed &&
        (parsed.username ||
          parsed.user?.username ||
          parsed.name ||
          parsed.user?.name)
          ? parsed.username ||
            parsed.user?.username ||
            parsed.name ||
            parsed.user?.name
          : usuarioText;
    } catch {}
    const payload: any = {
      venta_id: form.venta_id,
      producto_id: form.producto_id,
      cantidad: Number(form.cantidad),
      motivo: form.motivo || null,
      usuario: usuarioText,
      tipo_devolucion: form.tipo_devolucion || "credito",
      // fecha_devolucion: hondurasNowISO() // omit to use DB default
    };
    try {
      const { data, error } = await supabase
        .from("devoluciones_ventas")
        .insert(payload)
        .select("*")
        .maybeSingle();
      if (error) {
        console.debug("Insert devoluciones_ventas error", error);
        setErrorMessage(
          "Error al guardar devolución: " +
            (error.message || JSON.stringify(error)),
        );
        setErrorOpen(true);
        return;
      }
      const inserted = data as any;
      setDevoluciones((prev) => [inserted, ...prev]);
      setShowForm(false);
      setForm({
        venta_id: "",
        producto_id: "",
        cantidad: 1,
        motivo: "",
        tipo_devolucion: "credito",
      });
    } catch (e) {
      console.debug("submitDevolucion exception", e);
      setErrorMessage("Error inesperado al guardar devolución");
      setErrorOpen(true);
    }
  }

  // Procesa la venta ya seleccionada (único o elegida en el selector por CAI)
  async function procesarVentaParaDevolucion(ventaRow: any) {
    setShowSelectorFacturaDev(false);
    try {
      // Bloquear devoluciones para facturas del día actual o posteriores
      try {
        const ventaFechaRaw = (ventaRow as any).fecha_venta || null;
        if (ventaFechaRaw) {
          const todayStr = hondurasTodayDate();
          const ventaFechaStr = String(ventaFechaRaw);
          if (ventaFechaStr.startsWith(todayStr)) {
            setErrorMessage(
              "No se permite crear devoluciones para facturas del día actual.",
            );
            setErrorOpen(true);
            return;
          }
          const ventaDate = new Date(ventaFechaStr);
          const hoyInicio = new Date(useHondurasTime().hondurasNowISO());
          hoyInicio.setHours(0, 0, 0, 0);
          if (
            !isNaN(ventaDate.getTime()) &&
            ventaDate.getTime() >= hoyInicio.getTime()
          ) {
            setErrorMessage(
              "No se permite crear devoluciones para facturas del día actual. Debe realizar una anulacion.",
            );
            setErrorOpen(true);
            return;
          }
        }
      } catch (e) {
        console.debug("Error validando fecha de venta para devoluciones", e);
      }

      // Verificar que no exista ya una devolución
      try {
        const { data: existing, error: existErr } = await supabase
          .from("devoluciones_ventas")
          .select("id")
          .eq("venta_id", (ventaRow as any).id)
          .limit(1);
        if (existErr) {
          setErrorMessage(
            "Error verificando devoluciones existentes: " +
              (existErr.message || JSON.stringify(existErr)),
          );
          setErrorOpen(true);
          return;
        }
        if (Array.isArray(existing) && existing.length > 0) {
          setErrorMessage(
            "Esta factura ya cuenta con una devolución registrada. No se puede crear otra devolución.",
          );
          setErrorOpen(true);
          return;
        }
      } catch (e) {
        console.debug("Exception checking devoluciones:", e);
        setErrorMessage("Error verificando devoluciones existentes");
        setErrorOpen(true);
        return;
      }

      // Enriquecer venta con datos del cliente
      let ventaEnriquecida: any = { ...(ventaRow as any) };
      try {
        if ((ventaRow as any).nombre_cliente)
          ventaEnriquecida.cliente_nombre = (ventaRow as any).nombre_cliente;
        if ((ventaRow as any).rtn)
          ventaEnriquecida.cliente_rtn = (ventaRow as any).rtn;
        const clienteId = (ventaRow as any).cliente_id;
        if (clienteId && isUUID(String(clienteId))) {
          const { data: cli, error: cliErr } = await supabase
            .from("clientes")
            .select("id,nombre,rtn")
            .eq("id", clienteId)
            .maybeSingle();
          if (!cliErr && cli) {
            ventaEnriquecida.cliente_nombre =
              ventaEnriquecida.cliente_nombre || cli.nombre || null;
            ventaEnriquecida.cliente_rtn =
              ventaEnriquecida.cliente_rtn || cli.rtn || null;
          }
        }
      } catch (e) {
        console.debug("Error cargando datos de cliente para mostrar en UI", e);
      }

      setVentaEncontrada(ventaEnriquecida);

      // Obtener detalles de la venta
      const { data: detalles, error: detErr } = await supabase
        .from("ventas_detalle")
        .select("id,venta_id,producto_id,cantidad,precio_unitario,subtotal")
        .eq("venta_id", ventaRow.id);
      if (detErr) {
        setErrorMessage("Error obteniendo detalles de la factura");
        setErrorOpen(true);
        return;
      }
      const detallesArr = Array.isArray(detalles) ? detalles : [];
      const productoIds = Array.from(
        new Set(detallesArr.map((d: any) => d.producto_id)),
      ).filter(Boolean);
      let productosMap: Record<
        string,
        { id: string; nombre?: string; sku?: string; tipo?: string }
      > = {};
      if (productoIds.length > 0) {
        try {
          const { data: prods } = await supabase
            .from("inventario")
            .select("id,nombre,sku,tipo")
            .in("id", productoIds);
          if (Array.isArray(prods))
            prods.forEach((p: any) => {
              productosMap[String(p.id)] = {
                id: p.id,
                nombre: p.nombre,
                sku: p.sku,
                tipo: p.tipo,
              };
            });
        } catch (e) {
          console.debug(
            "Error cargando datos de productos desde inventario",
            e,
          );
        }
      }
      const enriched = detallesArr.map((d: any) => ({
        ...d,
        nombre: productosMap[String(d.producto_id)]?.nombre || null,
        sku: productosMap[String(d.producto_id)]?.sku || null,
        tipo: productosMap[String(d.producto_id)]?.tipo || "producto",
      }));
      setVentaProductos(enriched);
      setSelectedItems([]);
    } catch (e) {
      console.debug("procesarVentaParaDevolucion exception", e);
      setErrorMessage("Error inesperado procesando factura");
      setErrorOpen(true);
    }
  }

  async function buscarFactura() {
    if (!facturaBuscar || String(facturaBuscar).trim() === "") {
      setErrorMessage("Ingresa número de factura a buscar");
      setErrorOpen(true);
      return;
    }
    try {
      const facturaVal = String(facturaBuscar).trim();
      // Buscar TODAS las ventas con ese número de factura
      const { data: ventas, error: ventaErr } = await supabase
        .from("ventas")
        .select("*")
        .eq("factura", facturaVal)
        .order("fecha_venta", { ascending: false });
      if (ventaErr) {
        setErrorMessage(
          "Error buscando la factura: " +
            (ventaErr.message || JSON.stringify(ventaErr)),
        );
        setErrorOpen(true);
        return;
      }
      if (!ventas || ventas.length === 0) {
        setErrorMessage("Factura no encontrada");
        setErrorOpen(true);
        return;
      }

      // Si hay más de 1 resultado con diferente CAI → mostrar selector
      if (ventas.length > 1) {
        setResultadosBusquedaDev(ventas);
        setShowSelectorFacturaDev(true);
        return;
      }

      // Solo 1 resultado → continuar directamente
      await procesarVentaParaDevolucion(ventas[0]);
    } catch (e) {
      console.debug("buscarFactura exception", e);
      setErrorMessage("Error inesperado buscando factura");
      setErrorOpen(true);
    }
  }

  function toggleSelectDetalle(det: any) {
    const exists = selectedItems.find((s) => s.detalle_id === det.id);
    if (exists) {
      setSelectedItems((prev) => prev.filter((p) => p.detalle_id !== det.id));
    } else {
      setSelectedItems((prev) => [
        ...prev,
        {
          detalle_id: det.id,
          producto_id: det.producto_id,
          nombre: det.nombre || null,
          sku: det.sku || null,
          tipo: det.tipo || "producto",
          cantidad_available: Number(det.cantidad || 0),
          cantidad: Number(det.cantidad || 0),
          precio_unitario: Number(det.precio_unitario || 0),
        },
      ]);
    }
  }

  function updateSelectedQuantity(detalle_id: number, qty: number) {
    setSelectedItems((prev) =>
      prev.map((s) => {
        if (s.detalle_id !== detalle_id) return s;
        const available = Number(s.cantidad_available || 0);
        let newQty = Number(qty || 0);
        if (Number.isNaN(newQty)) newQty = 0;
        // clamp between 0 and available (cantidad facturada)
        if (newQty < 0) newQty = 0;
        if (newQty > available) newQty = available;
        return { ...s, cantidad: newQty };
      }),
    );
  }

  async function createDevolucionFromSelection(
    type: "efectivo" | "nota_abono" = "efectivo",
  ) {
    if (!ventaEncontrada || !ventaEncontrada.id) {
      setErrorMessage("Primero busca una factura válida");
      setErrorOpen(true);
      return;
    }
    if (!selectedItems || selectedItems.length === 0) {
      setErrorMessage("Selecciona al menos un producto");
      setErrorOpen(true);
      return;
    }
    // ensure we have usuario_id (accept numeric ids or strings like other flows)
    const rawUser = localStorage.getItem("user");
    const parsed = rawUser ? JSON.parse(rawUser) : null;
    const userIdCandidate =
      parsed && (parsed.id || parsed.user?.id || parsed.sub || parsed.user_id)
        ? parsed.id || parsed.user?.id || parsed.sub || parsed.user_id
        : null;
    if (!userIdCandidate) {
      setErrorMessage(
        "Necesitas iniciar sesión con un usuario válido (usuario_id en localStorage).",
      );
      setErrorOpen(true);
      return;
    }
    // normalize numeric id strings to Number, otherwise keep as-is
    const userIdForInsert: any =
      typeof userIdCandidate === "string" && /^\d+$/.test(userIdCandidate)
        ? Number(userIdCandidate)
        : userIdCandidate;
    const usuarioText =
      parsed &&
      (parsed.username ||
        parsed.user?.username ||
        parsed.name ||
        parsed.user?.name)
        ? parsed.username ||
          parsed.user?.username ||
          parsed.name ||
          parsed.user?.name
        : String(userIdCandidate);

    // obtener datos completos de la venta y cliente para poblar el header
    let ventaFull: any = ventaEncontrada;
    try {
      const { data: vfull, error: vfullErr } = await supabase
        .from("ventas")
        .select("id,factura,numero_factura,cliente_id,subtotal,impuesto,total")
        .eq("id", ventaEncontrada.id)
        .maybeSingle();
      if (vfullErr) {
        try {
          console.debug(
            "Error fetching ventaFull:",
            JSON.stringify(vfullErr, null, 2),
          );
        } catch (ee) {
          console.debug("Error fetching ventaFull", vfullErr);
        }
      }
      if (!vfullErr && vfull) ventaFull = vfull;
    } catch (e) {
      console.debug("Exception obteniendo venta completa", e);
    }

    // obtener RTN del cliente si está disponible; si la venta ya almacena el RTN en cliente_id (no es UUID), úsalo
    let clienteRtn: string | null = null;
    try {
      if (ventaFull && ventaFull.cliente_id) {
        // si ventaFull.cliente_id parece ser un RTN (no UUID), úsalo directamente
        if (!isUUID(String(ventaFull.cliente_id))) {
          clienteRtn = String(ventaFull.cliente_id);
        } else {
          const { data: cli, error: cliErr } = await supabase
            .from("clientes")
            .select("rtn")
            .eq("id", ventaFull.cliente_id)
            .maybeSingle();
          if (cliErr) {
            try {
              console.debug(
                "Error fetching cliente rtn:",
                JSON.stringify(cliErr, null, 2),
              );
            } catch (ee) {
              console.debug("Error fetching cliente rtn", cliErr);
            }
          }
          if (!cliErr && cli) clienteRtn = cli.rtn || null;
        }
      }
    } catch (e) {
      console.debug("Error cargando cliente", e);
    }

    // calcular totales de los ítems seleccionados
    const selectedSubtotal = selectedItems.reduce(
      (s, it) =>
        s +
        Number(it.cantidad || 0) * Number(it.precio_unitario || it.precio || 0),
      0,
    );
    let impuestoSelected = 0;
    try {
      const ventaSubtotal =
        ventaFull && ventaFull.subtotal ? Number(ventaFull.subtotal) : 0;
      const ventaImpuesto =
        ventaFull && ventaFull.impuesto ? Number(ventaFull.impuesto) : 0;
      impuestoSelected =
        ventaSubtotal > 0
          ? ventaImpuesto * (selectedSubtotal / ventaSubtotal)
          : 0;
    } catch (e) {
      impuestoSelected = 0;
    }
    const totalSelected = selectedSubtotal + impuestoSelected;

    // crear header con los valores calculados (se completarán cai/numero_documento luego)
    const headerPayload: any = {
      venta_id: ventaEncontrada.id,
      cliente_id: clienteRtn,
      usuario_id: userIdForInsert,
      usuario: usuarioText,
      cai: null,
      serie: null,
      numero_documento: null,
      tipo_documento: "NC",
      tipo_devolucion: "credito",
      motivo: motivoText || null,
      total: Number(totalSelected).toFixed(2),
      impuesto: Number(impuestoSelected).toFixed(2),
      moneda: "HNL",
      estado: "pendiente",
      referencia:
        ventaFull && (ventaFull.factura || ventaFull.numero_factura)
          ? ventaFull.factura || ventaFull.numero_factura
          : null,
      referencia_externa: null,
    };
    try {
      const { data: headerData, error: headerErr } = await supabase
        .from("devoluciones_ventas")
        .insert([headerPayload])
        .select("*")
        .maybeSingle();
      if (headerErr || !headerData) {
        console.debug("Error creando header de devolución", headerErr);
        setErrorMessage(
          "Error creando devolución: " +
            (headerErr?.message || JSON.stringify(headerErr)),
        );
        setErrorOpen(true);
        return;
      }
      const devId = headerData.id;
      // preparar items
      const items = selectedItems.map((s) => ({
        devolucion_id: devId,
        producto_id: s.producto_id,
        cantidad: Number(s.cantidad),
        precio_unitario: Number(s.precio_unitario || 0),
        descuento: 0,
        subtotal: Number(
          (Number(s.cantidad) * Number(s.precio_unitario || 0)).toFixed(4),
        ),
        impuesto: 0,
        motivo: motivoText || null,
      }));
      const { data: itemsIns, error: itemsErr } = await supabase
        .from("devoluciones_ventas_items")
        .insert(items)
        .select("*");
      if (itemsErr) {
        console.debug("Error insertando items de devolución", itemsErr);
        setErrorMessage(
          "Error guardando items de devolución: " +
            (itemsErr?.message || JSON.stringify(itemsErr)),
        );
        setErrorOpen(true);
        return;
      }

      // incrementar y persistir secuencia de ncredito (ncinfo) para obtener numero_documento y cai
      let numeroDocumento: string | null = null;
      let currentNc: any = ncInfo;
      try {
        try {
          const rawNc = localStorage.getItem("ncInfo");
          if (!currentNc && rawNc) currentNc = JSON.parse(rawNc);
        } catch (e) {}
        if (currentNc && currentNc.id) {
          const seqRaw =
            currentNc.secuencia_actual != null
              ? String(currentNc.secuencia_actual)
              : "";
          const digits = seqRaw.replace(/\D/g, "") || "0";
          const nextNum = String(Number(digits || "0") + 1);
          const padWidth =
            currentNc.rango_hasta && String(currentNc.rango_hasta).length
              ? String(currentNc.rango_hasta).length
              : Math.max(String(digits).length, nextNum.length);
          const padded = nextNum.padStart(padWidth, "0");
          try {
            const { data: upd, error: updErr } = await supabase
              .from("ncredito")
              .update({ secuencia_actual: padded })
              .eq("id", currentNc.id)
              .select("*")
              .maybeSingle();
            if (!updErr && upd) {
              // use the row returned by the DB to ensure we have cai and other fields
              currentNc = upd;
              try {
                localStorage.setItem("ncInfo", JSON.stringify(currentNc));
              } catch (e) {}
              setNcInfo(currentNc);
            } else {
              console.debug("Error actualizando secuencia en ncredito", updErr);
            }
          } catch (e) {
            console.debug("Exception updating ncredito sequence", e);
          }
          const identificador = currentNc.identificador || "";
          numeroDocumento =
            (identificador ? String(identificador) : "") +
            String(currentNc.secuencia_actual || padded);

          // actualizar header con cai y numero_documento (loggear respuesta completa)
          try {
            console.debug("Actualizando devolucion header", {
              devId,
              cai: currentNc.cai,
              numero_documento: numeroDocumento,
              currentNc,
            });
            const { data: updHeaderData, error: updHeaderErr } = await supabase
              .from("devoluciones_ventas")
              .update({
                cai: currentNc.cai || null,
                numero_documento: numeroDocumento,
              })
              .eq("id", devId)
              .select("*")
              .maybeSingle();
            if (updHeaderErr) {
              try {
                console.debug(
                  "Error actualizando header devolucion con nc info",
                  JSON.stringify(updHeaderErr, null, 2),
                );
              } catch (ee) {
                console.debug(
                  "Error actualizando header devolucion con nc info",
                  updHeaderErr,
                );
              }
            } else {
              console.debug(
                "Header devolucion actualizado (update returned):",
                updHeaderData,
              );
            }
            // read back the row to confirm persisted values
            try {
              const { data: verifyRow, error: verifyErr } = await supabase
                .from("devoluciones_ventas")
                .select("*")
                .eq("id", devId)
                .maybeSingle();
              if (verifyErr)
                console.debug(
                  "Error leyendo devoluciones_ventas post-update",
                  verifyErr,
                );
              else console.debug("Devolucion row after update:", verifyRow);
            } catch (ee) {
              console.debug("Exception reading devolucion after update", ee);
            }
          } catch (e) {
            console.debug(
              "Exception updating devolucion header with nc info",
              e,
            );
          }
        }
      } catch (e) {
        console.debug("Error incrementando secuencia ncredito", e);
      }

      // preparar carrito y params para impresión
      const carrito = selectedItems.map((s) => ({
        producto: { nombre: s.nombre || "", sku: s.sku || "" },
        cantidad: Number(s.cantidad),
        precio_unitario: Number(s.precio_unitario || 0),
      }));
      const params: any = {
        carrito,
        subtotal: carrito.reduce(
          (a: number, it: any) =>
            a + Number(it.precio_unitario || 0) * Number(it.cantidad || 0),
          0,
        ),
      };

      // registrar ENTRADA en registro_de_inventario y actualizar stock
      try {
        const referenciaText = `devolucion venta: ${
          ventaEncontrada?.factura || ""
        } nc: ${numeroDocumento || ""}`;
        const usuarioTextLocal =
          parsed &&
          (parsed.username ||
            parsed.user?.username ||
            parsed.name ||
            parsed.user?.name)
            ? parsed.username ||
              parsed.user?.username ||
              parsed.name ||
              parsed.user?.name
            : String(userIdCandidate);
        const now = hondurasNowISO();
        // Use same date column used elsewhere ('fecha_salida') because schema uses that column
        // Filtrar solo productos físicos (no servicios) para registro de inventario
        const registroRows = selectedItems
          .filter((s: any) => (s.tipo || "producto") !== "servicio")
          .map((s: any) => ({
            producto_id: s.producto_id,
            cantidad: Number(s.cantidad || 0),
            tipo_de_movimiento: "ENTRADA",
            referencia: referenciaText,
            usuario: usuarioTextLocal,
            fecha_salida: now,
          }));
        if (registroRows.length > 0) {
          const { data: regIns, error: regErr } = await supabase
            .from("registro_de_inventario")
            .insert(registroRows)
            .select("id");
          if (regErr) {
            try {
              console.warn(
                "Error registrando entrada en registro_de_inventario:",
                JSON.stringify(regErr, null, 2),
                { payload: registroRows },
              );
            } catch (ee) {
              console.warn(
                "Error registrando entrada en registro_de_inventario (no serializable):",
                regErr,
              );
            }
          } else
            console.debug(
              "Registro_de_inventario inserciones (entrada):",
              regIns,
            );
        }

        // actualizar stock aumentando cantidades (solo productos físicos, no servicios)
        for (const s of selectedItems) {
          // Saltar servicios
          if ((s.tipo || "producto") === "servicio") continue;
          try {
            const pid = String(s.producto_id);
            const need = Number(s.cantidad || 0);
            if (need <= 0) continue;
            const { data: prodRow, error: prodErr } = await supabase
              .from("inventario")
              .select("stock")
              .eq("id", pid)
              .maybeSingle();
            if (prodErr) {
              try {
                console.warn(
                  "Error leyendo stock de inventario para producto",
                  pid,
                  JSON.stringify(prodErr, null, 2),
                );
              } catch (ee) {
                console.warn(
                  "Error leyendo stock de inventario para producto",
                  pid,
                  prodErr,
                );
              }
              continue;
            }
            // If the inventario table doesn't have a 'stock' column, skip updating stock and log
            if (!prodRow || typeof prodRow.stock === "undefined") {
              console.debug(
                "inventario.stock column not present for product",
                pid,
                "- skipping stock update",
              );
              continue;
            }
            const currentStock = Number(prodRow.stock || 0);
            const newStock = currentStock + need;
            const { error: updErr2 } = await supabase
              .from("inventario")
              .update({ stock: newStock })
              .eq("id", pid);
            if (updErr2)
              console.warn(
                "Error actualizando stock para producto",
                pid,
                updErr2,
              );
            else
              console.debug(
                "Stock actualizado para producto",
                pid,
                "de",
                currentStock,
                "a",
                newStock,
              );
          } catch (ee) {
            console.warn("Excepción actualizando stock para producto", ee);
          }
        }
      } catch (e) {
        console.debug("Error registrando entradas en inventario", e);
      }

      // actualizar la columna `observaciones` en la factura (ventas) indicando que posee devoluciones
      try {
        if (ventaEncontrada && ventaEncontrada.id && numeroDocumento) {
          const { data: ventaRow, error: ventaRowErr } = await supabase
            .from("ventas")
            .select("observaciones")
            .eq("id", ventaEncontrada.id)
            .maybeSingle();
          if (ventaRowErr) {
            try {
              console.debug(
                "Error leyendo ventas.observaciones",
                JSON.stringify(ventaRowErr, null, 2),
              );
            } catch (ee) {
              console.debug("Error leyendo ventas.observaciones", ventaRowErr);
            }
          } else {
            const prevObs =
              ventaRow && ventaRow.observaciones
                ? String(ventaRow.observaciones)
                : "";
            const newFlag = `**Posee devoluciones** nc (${numeroDocumento})`;
            let newObs = newFlag;
            if (prevObs && prevObs.trim() !== "") {
              // si ya existe una nota similar, anexar el número; si no, concatenar
              if (prevObs.includes("Posee devoluciones")) {
                newObs = prevObs + " ; nc (" + numeroDocumento + ")";
              } else {
                newObs = prevObs + " | " + newFlag;
              }
            }
            const { error: updVentasErr } = await supabase
              .from("ventas")
              .update({ observaciones: newObs })
              .eq("id", ventaEncontrada.id);
            if (updVentasErr) {
              try {
                console.warn(
                  "Error actualizando ventas.observaciones:",
                  JSON.stringify(updVentasErr, null, 2),
                );
              } catch (ee) {
                console.warn(
                  "Error actualizando ventas.observaciones:",
                  updVentasErr,
                );
              }
            } else
              console.debug(
                "ventas.observaciones actualizada para venta",
                ventaEncontrada.id,
              );
          }
        }
      } catch (e) {
        console.debug("Exception actualizando ventas.observaciones", e);
      }

      // opts: pass updated ncInfo if available
      let opts: any = {};
      try {
        const rawNc = localStorage.getItem("ncInfo");
        if (rawNc) opts.ncInfo = JSON.parse(rawNc);
      } catch (e) {}

      // Persistir exclusivamente el `cai` que provee el `ncInfo` del usuario logueado (estado o localStorage)
      try {
        let caiCandidate: any = null;
        try {
          if (ncInfo && ncInfo.cai) caiCandidate = ncInfo.cai;
          else {
            const raw = localStorage.getItem("ncInfo");
            if (raw) {
              try {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.cai) caiCandidate = parsed.cai;
              } catch (ee) {
                /* ignore */
              }
            }
          }
        } catch (ee) {
          caiCandidate = null;
        }

        if (caiCandidate || numeroDocumento) {
          const updPayload: any = {};
          if (caiCandidate) updPayload.cai = caiCandidate;
          if (numeroDocumento)
            updPayload.numero_documento = String(numeroDocumento);
          const { data: savedCaiRow, error: saveCaiErr } = await supabase
            .from("devoluciones_ventas")
            .update(updPayload)
            .eq("id", devId)
            .select("*")
            .maybeSingle();
          if (saveCaiErr) {
            try {
              console.debug(
                "Error guardando cai/numero en devoluciones_ventas antes de imprimir:",
                JSON.stringify(saveCaiErr, null, 2),
              );
            } catch (ee) {
              console.debug(
                "Error guardando cai/numero en devoluciones_ventas antes de imprimir",
                saveCaiErr,
              );
            }
          } else {
            console.debug(
              "Guardado cai/numero en devoluciones_ventas (desde ncInfo):",
              savedCaiRow,
            );
          }
        }
      } catch (e) {
        console.debug(
          "Exception guardando cai desde ncInfo antes de imprimir",
          e,
        );
      }

      const ncHtml = await generateNcHTML(opts, params);
      await printHtmlInHiddenIframe(ncHtml);
      if (type === "nota_abono") {
        const naHtml = await generateNotaAbonoHTML(opts, params);
        await printHtmlInHiddenIframe(naHtml);
      }

      // actualizar estado local
      await loadDevoluciones();
      setSelectedItems([]);
      setVentaProductos([]);
      setVentaEncontrada(null);
      setFacturaBuscar("");
      setShowDevTypeModal(false);
      setSuccessMsg("Registro exitosos en verfe");
      setShowSuccessModal(true);
      setMotivoText("");
    } catch (e) {
      try {
        console.debug(
          "createDevolucionFromSelection exception",
          JSON.stringify(e, null, 2),
        );
      } catch (ee) {
        console.debug("createDevolucionFromSelection exception", e);
      }
      setErrorMessage("Error inesperado al crear devolución (ver consola)");
      setErrorOpen(true);
    }
  }

  function printHtmlInHiddenIframe(html: string) {
    return new Promise<void>((resolve) => {
      try {
        const iframe = document.createElement("iframe");
        iframe.style.position = "fixed";
        iframe.style.right = "0";
        iframe.style.bottom = "0";
        iframe.style.width = "0";
        iframe.style.height = "0";
        iframe.style.border = "0";
        document.body.appendChild(iframe);
        const doc = iframe.contentWindow?.document;
        if (!doc) {
          resolve();
          return;
        }
        doc.open();
        doc.write(html);
        doc.close();
        const win = iframe.contentWindow as Window;
        // give browser time to render
        setTimeout(() => {
          try {
            win.focus();
            win.print();
          } catch (e) {
            console.debug("print error", e);
          }
          setTimeout(() => {
            document.body.removeChild(iframe);
            resolve();
          }, 500);
        }, 500);
      } catch (e) {
        console.debug("printHtmlInHiddenIframe exception", e);
        resolve();
      }
    });
  }

  async function refreshNcInfo() {
    try {
      const rawUser = localStorage.getItem("user");
      const parsed = rawUser ? JSON.parse(rawUser) : null;
      const userName =
        parsed &&
        (parsed.username ||
          parsed.user?.username ||
          parsed.name ||
          parsed.user?.name)
          ? parsed.username ||
            parsed.user?.username ||
            parsed.name ||
            parsed.user?.name
          : null;
      let fetched: any = null;
      if (userName) {
        const { data, error } = await supabase
          .from("ncredito")
          .select(
            "id,cai,identificador,rango_de,rango_hasta,fecha_vencimiento,secuencia_actual,caja,cajero,usuario_id",
          )
          .eq("cajero", userName)
          .order("id", { ascending: false })
          .limit(1);
        if (!error && Array.isArray(data) && data.length > 0) fetched = data[0];
      }
      if (fetched) {
        try {
          localStorage.setItem("ncInfo", JSON.stringify(fetched));
        } catch (e) {}
        setNcInfo(fetched);
      }
    } catch (e) {
      console.debug("refreshNcInfo error", e);
    }
  }

  return (
    <div
      style={{
        padding: 28,
        maxWidth: 1200,
        margin: "32px auto",
        fontSize: "13px",
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
        <h2 style={{ margin: 0, fontSize: "18px" }}>Devolución de Caja</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowNotas(true)}
            className="btn-primary"
            style={{ padding: "8px 12px" }}
          >
            Info de CAI de notas
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

      <section
        style={{
          background: "white",
          padding: 24,
          borderRadius: 8,
          boxShadow: "0 1px 6px rgba(2,6,23,0.06)",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            className="input"
            placeholder="Número de factura"
            value={facturaBuscar}
            onChange={(e) => setFacturaBuscar(e.target.value)}
            style={{
              flex: "1 1 72%",
              minWidth: 340,
              fontSize: "14px",
              padding: "10px 12px",
            }}
          />
          <button
            className="btn-primary"
            onClick={buscarFactura}
            style={{
              padding: "6px 8px",
              fontSize: "13px",
              width: 96,
              maxWidth: 96,
              whiteSpace: "nowrap",
            }}
          >
            Buscar
          </button>
        </div>
      </section>

      {/* Modal de confirmación de éxito */}
      <ModalWrapper
        open={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        width={420}
      >
        <div>
          <h3 style={{ marginTop: 0 }}>Registro exitoso</h3>
          <p>{successMsg}</p>
          <div
            style={{
              marginTop: 12,
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <button
              className="btn-primary"
              onClick={() => setShowSuccessModal(false)}
            >
              Cerrar
            </button>
          </div>
        </div>
      </ModalWrapper>

      {/* Modal: seleccionar tipo de devolución (efectivo o nota de abono) */}
      <ModalWrapper
        open={showDevTypeModal}
        onClose={() => setShowDevTypeModal(false)}
        width={420}
      >
        <div>
          <h3 style={{ marginTop: 0 }}>Tipo de devolución</h3>
          <p>Elige cómo se procesará la devolución:</p>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginTop: 8,
            }}
          >
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="radio"
                name="devtype"
                checked={devType === "efectivo"}
                onChange={() => setDevType("efectivo")}
              />
              <span>En efectivo (solo nota de crédito)</span>
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="radio"
                name="devtype"
                checked={devType === "nota_abono"}
                onChange={() => setDevType("nota_abono")}
              />
              <span>Nota de abono (nota de crédito + nota de abono)</span>
            </label>
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={{ display: "block", marginBottom: 6 }}>
              Motivo de la devolución (requerido)
            </label>
            <textarea
              className="input"
              value={motivoText}
              onChange={(e) => setMotivoText(e.target.value)}
              placeholder="Describe el motivo de la devolución"
              style={{ minHeight: 80 }}
            />
          </div>
          <div
            style={{
              marginTop: 12,
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            <button
              className="btn-opaque"
              onClick={() => setShowDevTypeModal(false)}
            >
              Cancelar
            </button>
            <button
              className="btn-primary"
              disabled={motivoText.trim() === ""}
              onClick={() => createDevolucionFromSelection(devType)}
            >
              Confirmar y crear
            </button>
          </div>
        </div>
      </ModalWrapper>

      {/* Buscar factura y seleccionar productos de la venta (dos columnas) */}
      <section
        style={{
          background: "white",
          padding: 24,
          borderRadius: 8,
          boxShadow: "0 1px 6px rgba(2,6,23,0.06)",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 20,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "1 1 60%", minWidth: 320 }}>
            <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: "15px" }}>
              Buscar factura
            </h3>
            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 12,
                alignItems: "center",
              }}
            >
              {/* Input/button moved to top — aquí solo mostramos la factura encontrada */}
              <div style={{ color: "#475569" }}>
                {ventaEncontrada ? (
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 6 }}
                  >
                    <div>
                      Venta encontrada:{" "}
                      <strong>{ventaEncontrada.factura}</strong>
                    </div>
                    <div style={{ color: "#475569", fontSize: 13 }}>
                      {ventaEncontrada.fecha_venta ? (
                        <div>
                          <strong>Fecha:</strong>{" "}
                          {new Date(ventaEncontrada.fecha_venta).toLocaleString(
                            undefined,
                            { timeZone: "America/Tegucigalpa" },
                          )}
                        </div>
                      ) : null}
                      {ventaEncontrada.cliente_nombre ? (
                        <div>
                          <strong>Cliente:</strong>{" "}
                          {ventaEncontrada.cliente_nombre}
                        </div>
                      ) : null}
                      {ventaEncontrada.cliente_rtn ? (
                        <div>
                          <strong>RTN:</strong> {ventaEncontrada.cliente_rtn}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <span style={{ color: "#94a3b8" }}>
                    Usa el buscador superior para buscar una factura
                  </span>
                )}
              </div>
            </div>

            {ventaProductos.length > 0 ? (
              <div>
                <div style={{ marginBottom: 8, color: "#475569" }}>
                  Productos facturados:
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr
                        style={{
                          background: "#f8fafc",
                          borderBottom: "1px solid #e2e8f0",
                        }}
                      >
                        {[
                          "Producto",
                          "Cantidad facturada",
                          "Precio",
                          "Subtotal",
                          "Acción",
                        ].map((th) => (
                          <th
                            key={th}
                            style={{
                              padding: "12px 14px",
                              textAlign:
                                th === "Cantidad facturada" ? "right" : "left",
                              fontWeight: 600,
                            }}
                          >
                            {th}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ventaProductos.map((p: any) => (
                        <tr
                          key={p.id}
                          style={{ borderBottom: "1px solid #f1f5f9" }}
                        >
                          <td style={{ padding: "12px 14px" }}>
                            <div style={{ fontWeight: 600 }}>
                              {p.nombre || String(p.producto_id)}
                            </div>
                            <div style={{ fontSize: 12, color: "#64748b" }}>
                              {p.sku ? `SKU: ${p.sku}` : ""}
                            </div>
                          </td>
                          <td
                            style={{ padding: "12px 14px", textAlign: "right" }}
                          >
                            {Number(p.cantidad).toFixed(2)}
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            L{formatMoney(Number(p.precio_unitario || 0))}
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            L{formatMoney(Number(p.subtotal || 0))}
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <button
                              className="btn-primary"
                              onClick={() => toggleSelectDetalle(p)}
                              style={{
                                padding: "4px 8px",
                                fontSize: "12px",
                                lineHeight: "1",
                              }}
                            >
                              {selectedItems.find((s) => s.detalle_id === p.id)
                                ? "Deseleccionar"
                                : "Seleccionar"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div style={{ color: "#94a3b8" }}>
                Ingresa un número de factura y pulsa «Buscar factura» para ver
                los productos facturados.
              </div>
            )}
          </div>

          <div
            style={{
              flex: "0 0 36%",
              minWidth: 320,
              borderLeft: "1px solid #eef2ff",
              paddingLeft: 12,
            }}
          >
            <h4 style={{ marginTop: 0, fontSize: "13px" }}>
              Ítems seleccionados
            </h4>
            {selectedItems.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr
                      style={{
                        background: "#f8fafc",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      <th
                        style={{
                          textAlign: "left",
                          padding: "10px 12px",
                          fontWeight: 600,
                        }}
                      >
                        Producto
                      </th>
                      <th
                        style={{
                          textAlign: "right",
                          padding: "10px 12px",
                          fontWeight: 600,
                          width: 120,
                        }}
                      >
                        Cantidad
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "10px 12px",
                          fontWeight: 600,
                          width: 120,
                        }}
                      >
                        Precio
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "10px 12px",
                          fontWeight: 600,
                          width: 120,
                        }}
                      >
                        Acción
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedItems.map((s) => (
                      <tr
                        key={s.detalle_id}
                        style={{ borderBottom: "1px solid #f1f5f9" }}
                      >
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ fontWeight: 600 }}>
                            {s.nombre || s.producto_id}
                          </div>
                          <div style={{ fontSize: 12, color: "#64748b" }}>
                            {s.sku ? `SKU: ${s.sku}` : ""}
                          </div>
                        </td>
                        <td
                          style={{ padding: "10px 12px", textAlign: "right" }}
                        >
                          <input
                            className="input"
                            type="number"
                            value={s.cantidad}
                            min={0}
                            max={s.cantidad_available}
                            onChange={(e) =>
                              updateSelectedQuantity(
                                s.detalle_id,
                                Number(e.target.value),
                              )
                            }
                            style={{
                              width: 90,
                              padding: "6px 8px",
                              fontSize: "13px",
                            }}
                          />
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          {"L" + Number(s.precio_unitario).toFixed(2)}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <button
                            className="btn-opaque"
                            onClick={() =>
                              setSelectedItems((prev) =>
                                prev.filter(
                                  (x) => x.detalle_id !== s.detalle_id,
                                ),
                              )
                            }
                            style={{ padding: "6px 8px", fontSize: "13px" }}
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div
                  style={{
                    marginTop: 12,
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 8,
                  }}
                >
                  <button
                    className="btn-opaque"
                    onClick={() => {
                      setSelectedItems([]);
                    }}
                  >
                    Limpiar
                  </button>
                  <button
                    className="btn-primary"
                    onClick={() => {
                      setShowDevTypeModal(true);
                    }}
                  >
                    Crear devolución desde selección
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ color: "#94a3b8" }}>
                No hay ítems seleccionados.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Se removió la tabla de devoluciones según solicitud del usuario */}

      {/* Form modal for new devolucion */}
      <ModalWrapper
        open={showForm}
        onClose={() => setShowForm(false)}
        width={620}
      >
        <div>
          <h3 style={{ marginTop: 0 }}>Nueva devolución</h3>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
          >
            <div>
              <label>Venta ID (UUID)</label>
              <input
                className="input"
                value={form.venta_id}
                onChange={(e) =>
                  setForm((s) => ({ ...s, venta_id: e.target.value }))
                }
                placeholder="uuid de la venta"
              />
            </div>
            <div>
              <label>Producto ID (UUID)</label>
              <input
                className="input"
                value={form.producto_id}
                onChange={(e) =>
                  setForm((s) => ({ ...s, producto_id: e.target.value }))
                }
                placeholder="uuid del producto"
              />
            </div>
            <div>
              <label>Cantidad</label>
              <input
                className="input"
                type="number"
                value={form.cantidad}
                onChange={(e) =>
                  setForm((s) => ({ ...s, cantidad: Number(e.target.value) }))
                }
              />
            </div>
            <div>
              <label>Tipo</label>
              <select
                className="input"
                value={form.tipo_devolucion}
                onChange={(e) =>
                  setForm((s) => ({ ...s, tipo_devolucion: e.target.value }))
                }
              >
                <option value="credito">Crédito</option>
                <option value="devolucion">Devolución</option>
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label>Motivo (opcional)</label>
              <textarea
                className="input"
                value={form.motivo}
                onChange={(e) =>
                  setForm((s) => ({ ...s, motivo: e.target.value }))
                }
              />
            </div>
          </div>
          <div
            style={{
              marginTop: 12,
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            <button
              className="btn-opaque"
              onClick={() => setShowForm(false)}
              style={{ padding: "8px 12px" }}
            >
              Cancelar
            </button>
            <button
              className="btn-primary"
              onClick={submitDevolucion}
              style={{ padding: "8px 12px" }}
            >
              Guardar
            </button>
          </div>
        </div>
      </ModalWrapper>

      <NotasCreditoModal
        open={showNotas}
        onClose={() => setShowNotas(false)}
        ncInfo={ncInfo}
        onRefresh={refreshNcInfo}
      />
      <Confirmado
        open={showSuccessModal}
        title="Éxito"
        message={successMsg || "Operación completada"}
        onClose={() => setShowSuccessModal(false)}
      />
      <Confirmado
        open={errorOpen}
        title="Error"
        message={errorMessage}
        onClose={() => setErrorOpen(false)}
      />

      {/* Selector cuando hay múltiples facturas con el mismo número */}
      {showSelectorFacturaDev && (
        <SeleccionFacturaModal
          ventas={resultadosBusquedaDev}
          titulo="Múltiples facturas con ese número — elige por CAI"
          onSelect={(v) => procesarVentaParaDevolucion(v)}
          onClose={() => setShowSelectorFacturaDev(false)}
        />
      )}
    </div>
  );
}
