import getCompanyData from "./getCompanyData";

export async function generateCotizacionHTML(
  opts: any = {},
  tipo: "factura" | "cotizacion" = "cotizacion",
  params: any = {},
): Promise<string> {
  let comercio = opts.comercio || "";
  let rtnEmp = opts.companyRTN || opts.rtnEmpresa || opts.RTN || "";
  let direccion = opts.direccion || "";
  let telefono = opts.telefono || "";
  let EM = opts.email || opts.EM || "";
  let logoSrc = opts.logo || opts.logoUrl || opts.logo_src || null;

  if (!comercio || !rtnEmp || !direccion || !telefono || !EM || !logoSrc) {
    try {
      const company = await getCompanyData();
      if (company) {
        comercio = comercio || company.nombre || company.comercio || comercio;
        rtnEmp = rtnEmp || company.rtn || rtnEmp;
        direccion =
          direccion ||
          company.direccion ||
          company.direccion_fiscal ||
          direccion;
        telefono =
          telefono || company.telefono || company.telefono_fijo || telefono;
        EM = EM || company.email || company.correo || EM;
        logoSrc = logoSrc || company.logoUrl || company.logo || logoSrc;
      }
    } catch (e) {}
  }

  if (logoSrc && typeof window !== "undefined" && opts.inlineLogo !== false) {
    try {
      if (!String(logoSrc).startsWith("data:")) {
        const resp = await fetch(String(logoSrc), { mode: "cors" });
        if (resp.ok) {
          const blob = await resp.blob();
          const dataUrl = await new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              resolve(typeof reader.result === "string" ? reader.result : null);
            };
            reader.onerror = () => {
              resolve(null);
            };
            reader.readAsDataURL(blob);
          });
          if (dataUrl) logoSrc = dataUrl;
        }
      }
    } catch (e) {}
  }

  // Use cotizacion number when provided; fall back to factura logic if not
  let cotizacionNum =
    opts.cotizacion ||
    opts.numero_cotizacion ||
    opts.numeroCotizacion ||
    opts.numero ||
    opts["Número"] ||
    "";

  const cliente = opts.cliente || "Cotización Cliente";
  const identidad = opts.identidad || opts.rtn || params.identidad || "C/F";

  const carrito = Array.isArray(params.carrito) ? params.carrito : [];
  const subtotal =
    typeof params.subtotal === "number"
      ? params.subtotal
      : carrito.reduce(
          (s: number, it: any) =>
            s +
            Number((it.producto && it.producto.precio) || it.precio || 0) *
              (it.cantidad || 1),
          0,
        );
  const DSC = typeof params.descuento === "number" ? params.descuento : 0;
  const exonerado = typeof params.exonerado === "number" ? params.exonerado : 0;
  const Gravado =
    typeof params.gravado === "number" ? params.gravado : subtotal;
  const Exento = typeof params.exento === "number" ? params.exento : 0;
  const impuesto = typeof params.isvTotal === "number" ? params.isvTotal : 0;
  const ISV18 = typeof params.imp18Total === "number" ? params.imp18Total : 0;
  const isv4 =
    typeof params.impTouristTotal === "number" ? params.impTouristTotal : 0;
  const grossFromParams =
    typeof params.total === "number" ? params.total : null;
  const computedGross = subtotal + (impuesto || 0) + (ISV18 || 0) + (isv4 || 0);
  const transaccion = grossFromParams != null ? grossFromParams : computedGross;
  const ft = transaccion;

  const pagos = params.pagos || {};
  const Efectivo =
    typeof pagos.efectivo === "number"
      ? pagos.efectivo
      : typeof params.Efectivo === "number"
        ? params.Efectivo
        : 0;
  const Tarjeta =
    typeof pagos.tarjeta === "number"
      ? pagos.tarjeta
      : typeof params.Tarjeta === "number"
        ? params.Tarjeta
        : 0;
  const Transferencia =
    typeof pagos.transferencia === "number"
      ? pagos.transferencia
      : typeof params.Transferencia === "number"
        ? params.Transferencia
        : 0;
  const totalPaid =
    typeof pagos.totalPaid === "number"
      ? pagos.totalPaid
      : Efectivo + Tarjeta + Transferencia;
  let cambio: number;
  if (typeof pagos.cambio === "number") {
    cambio = pagos.cambio;
  } else if (typeof params.cambio === "number") {
    cambio = params.cambio;
  } else {
    const computed = Number(totalPaid) - Number(ft || 0);
    cambio = isNaN(computed) ? 0 : computed > 0 ? computed : 0;
  }

  const buildProductosTabla = () => {
    return carrito
      .map((i: any) => {
        const desc = String(
          (i.producto && (i.producto.nombre || i.producto.descripcion)) ||
            i.descripcion ||
            i.nombre ||
            "",
        );
        const cant = Number(i.cantidad || 0);
        const precioBrutoUnit = Number(
          (i.producto && (i.producto.precio ?? i.producto.precio_unitario)) ??
            i.precio_unitario ??
            i.precio ??
            0,
        );
        const exento =
          Boolean(i.producto && i.producto.exento) || Boolean(i.exento);
        const aplica18 =
          Boolean(i.producto && i.producto.aplica_impuesto_18) ||
          Boolean(i.aplica_impuesto_18);
        const aplicaTur =
          Boolean(i.producto && i.producto.aplica_impuesto_turistico) ||
          Boolean(i.aplica_impuesto_turistico);
        const mainRate = aplica18
          ? (params.tax18Rate ?? params.tax18 ?? 0)
          : (params.taxRate ?? params.tax ?? 0);
        const turRate = aplicaTur
          ? (params.taxTouristRate ?? params.taxTourist ?? 0)
          : 0;
        const combined = (Number(mainRate) || 0) + (Number(turRate) || 0);
        let precioUnitario = precioBrutoUnit;
        if (!exento && combined > 0) {
          precioUnitario = precioBrutoUnit / (1 + combined);
        }
        const precioStr = Number(precioUnitario || 0).toFixed(2);
        const subtotalLinea = precioUnitario * cant;
        const subtotalStr = Number(subtotalLinea || 0).toFixed(2);
        const sku = (i.producto && i.producto.sku) || i.sku || "";
        return `<tr><td>${sku} ${desc}</td><td style="text-align:center">${cant}</td><td style="text-align:right">L ${precioStr}</td><td style="text-align:right">L ${subtotalStr}</td></tr>`;
      })
      .join("\n");
  };

  const tabla = buildProductosTabla();
  const totalPagadoCalcRaw =
    (Number(Efectivo) || 0) +
    (Number(Transferencia) || 0) +
    (Number(Tarjeta) || 0) -
    (Number(cambio) || 0);
  const totalPagadoCalc = isNaN(totalPagadoCalcRaw) ? 0 : totalPagadoCalcRaw;
  const letras = numeroALetras(totalPagadoCalc);

  // Descuento total desde ítems del carrito
  const DSC_calc = (() => {
    if (typeof params.descuento === "number" && params.descuento > 0)
      return params.descuento;
    return carrito.reduce((acc: number, it: any) => {
      const precio = Number(
        (it.producto && it.producto.precio) ||
          it.precio_unitario ||
          it.precio ||
          0,
      );
      const cant = Number(it.cantidad || 1);
      const pct = Number(it.descuento || 0);
      return acc + precio * (pct / 100) * cant;
    }, 0);
  })();

  // Fecha
  const hoy = new Date();
  const diaN = String(hoy.getDate()).padStart(2, "0");
  const mesN = String(hoy.getMonth() + 1).padStart(2, "0");
  const anioN = String(hoy.getFullYear());
  const horaStr = hoy.toLocaleTimeString("es-HN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const direccionCliente = opts.direccionCliente || "";
  const empresaNombre = "SOLUCIONES TECNICAS CASTRO";

  // ── Filas de productos con nuevo formato (fuente grande) ────────────────────
  // Formateo de moneda: miles ',' decimales '.'
  const fmtMoney = (n: number) =>
    Number(n || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const buildProductosTablaGrande = () => {
    return carrito
      .map((i: any) => {
        const desc = String(
          (i.producto && (i.producto.nombre || i.producto.descripcion)) ||
            i.descripcion ||
            i.nombre ||
            "",
        );
        const cant = Number(i.cantidad || 0);
        const precioBrutoUnit = Number(
          (i.producto && (i.producto.precio ?? i.producto.precio_unitario)) ??
            i.precio_unitario ??
            i.precio ??
            0,
        );
        const exentoItem =
          Boolean(i.producto && i.producto.exento) || Boolean(i.exento);
        const aplica18 =
          Boolean(i.producto && i.producto.aplica_impuesto_18) ||
          Boolean(i.aplica_impuesto_18);
        const aplicaTur =
          Boolean(i.producto && i.producto.aplica_impuesto_turistico) ||
          Boolean(i.aplica_impuesto_turistico);
        const mainRate = aplica18
          ? (params.tax18Rate ?? params.tax18 ?? 0)
          : (params.taxRate ?? params.tax ?? 0);
        const turRate = aplicaTur
          ? (params.taxTouristRate ?? params.taxTourist ?? 0)
          : 0;
        const combined = (Number(mainRate) || 0) + (Number(turRate) || 0);
        let precioUnitario = precioBrutoUnit;
        if (!exentoItem && combined > 0)
          precioUnitario = precioBrutoUnit / (1 + combined);
        const subtotalLinea = precioUnitario * cant;
        const sku = (i.producto && i.producto.sku) || i.sku || "";
        const skuStr = sku ? `${sku} – ` : "";
        return `<tr>
          <td style="height:32px;vertical-align:middle;font-size:10px;font-weight:700;border:1px solid #9b9b9b;padding:6px 8px;">${skuStr}${desc}</td>
          <td style="height:32px;vertical-align:middle;font-size:10px;font-weight:700;border:1px solid #9b9b9b;padding:6px 8px;text-align:right;">${cant}</td>
          <td style="height:32px;vertical-align:middle;font-size:10px;font-weight:700;border:1px solid #9b9b9b;padding:6px 8px;text-align:right;">L ${fmtMoney(precioUnitario)}</td>
          <td style="height:32px;vertical-align:middle;font-size:10px;font-weight:700;border:1px solid #9b9b9b;padding:6px 8px;text-align:right;">L ${fmtMoney(subtotalLinea)}</td>
        </tr>`;
      })
      .join("\n");
  };

  const tablaGrande = buildProductosTablaGrande();

  const logoHtmlCot = logoSrc
    ? `<img src="${logoSrc}" alt="Logo" style="max-width:100%;max-height:110px;object-fit:contain;display:block;margin:auto;"/>`
    : `<div style="min-height:80px;background:#000;display:flex;align-items:center;justify-content:center;color:#46b6ff;font-size:16px;font-weight:700;letter-spacing:1px;text-align:center;">
         <div>${empresaNombre}<br/><small style="font-size:8px;color:#cfcfcf;letter-spacing:0;">${direccion}</small></div>
       </div>`;

  const htmlOutput = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Cotización ${cotizacionNum || ""}</title>
  <style>
    /* Tamaño carta vertical, con márgenes pequeños */
    @page { size: 8.5in 11in; margin: 0.3in; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --border: #9b9b9b; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #111; background: #fff; }
    
    /* Contenedor principal restringido a la mitad de la página (aprox 5 pulgadas para dejar margen) */
    .sheet { width: 100%; max-height: 5.2in; overflow: hidden; }
    
    h1 { text-align: center; margin: 2px 0 4px; font-size: 16px; font-weight: 800; letter-spacing: 0.3px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 3px; }
    
    /* Reducimos el padding para ahorrar espacio vertical */
    td, th { border: 1px solid var(--border); padding: 3px 4px; vertical-align: top; font-size: 9px; }
    
    /* Altura automática o reducida para el encabezado */
    .top td { height: auto; min-height: 50px; }
    
    .grand-total { text-align: right; font-size: 11px; font-weight: 900; padding: 5px 6px; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
<div class="sheet">

 

  <table class="header">
  <colgroup>
    <col style="width:22%">
    <col style="width:56%">
    <col style="width:22%">
  </colgroup>

  <tr>
    <!-- LOGO -->
    <td style="vertical-align:middle; text-align:center;">
      ${logoHtmlCot}
    </td>

    <!-- DATOS EMPRESA -->
    <td style="font-weight:900; font-size:12px; line-height:1.6;">
      <div style="font-size:18px; font-weight:900; text-align:center; margin-bottom:4px;">
        ${empresaNombre}
      </div>

      <div><b>Dirección:</b> ${direccion}</div>
      <div><b>Teléfono:</b> ${telefono}</div>
      <div><b>Email:</b> ${EM}</div>
      <div><b>RTN:</b> ${rtnEmp}</div>
    </td>

    <!-- COTIZACION -->
    <td style="vertical-align:top; position:relative; text-align:center; font-weight:900;">

      <div style="font-size:15px; font-weight:900; margin-top:2px; line-height:1.2;">
        COTIZACIÓN<br>
        No. ${cotizacionNum || "—"}
      </div>

      <div style="position:absolute; bottom:4px; left:8px; font-size:12px; font-weight:900;">
        Fecha: ${diaN}/${mesN}/${anioN}
      </div>

    </td>
  </tr>
</table>
  <table>
    <tr><td style="height:16px;vertical-align:middle;font-size:10px;font-weight:700;"><b>Cliente:</b> ${cliente}</td></tr>
    <tr><td style="height:16px;vertical-align:middle;font-size:10px;font-weight:700;"><b>RTN Cliente:</b> ${identidad}</td></tr>
    <tr><td style="height:16px;vertical-align:middle;font-size:10px;font-weight:700;"><b>Dirección:</b> ${direccionCliente || "—"}</td></tr>
  </table>

  <table>
    <colgroup>
      <col style="width:62%"/>
      <col style="width:12%"/>
      <col style="width:12%"/>
      <col style="width:14%"/>
    </colgroup>
    <tr>
      <th style="text-align:center;font-size:10px;font-weight:800;vertical-align:middle;height:18px;">Descripción</th>
      <th style="text-align:center;font-size:10px;font-weight:800;vertical-align:middle;height:18px;">Cant.</th>
      <th style="text-align:center;font-size:10px;font-weight:800;vertical-align:middle;height:18px;">Precio Unit.</th>
      <th style="text-align:center;font-size:10px;font-weight:800;vertical-align:middle;height:18px;">Total</th>
    </tr>
    ${tablaGrande}
  </table>

  <table>
    <colgroup>
      <col style="width:30%"/>
      <col style="width:20%"/>
      <col style="width:30%"/>
      <col style="width:20%"/>
    </colgroup>
    <tr>
      <td style="height:16px;vertical-align:middle;font-size:10px;font-weight:700;"><b>Descuento:</b></td>
      <td style="height:16px;vertical-align:middle;font-size:10px;font-weight:700;text-align:right;">L ${fmtMoney(DSC_calc)}</td>
      <td style="height:16px;vertical-align:middle;font-size:10px;font-weight:700;"><b>Sub Total Gravado:</b></td>
      <td style="height:16px;vertical-align:middle;font-size:10px;font-weight:700;text-align:right;">L ${fmtMoney(Gravado)}</td>
    </tr>
    <tr>
      <td style="height:16px;vertical-align:middle;font-size:10px;font-weight:700;"><b>Sub Total Exento:</b></td>
      <td style="height:16px;vertical-align:middle;font-size:10px;font-weight:700;text-align:right;">L ${fmtMoney(Exento)}</td>
      <td style="height:16px;vertical-align:middle;font-size:10px;font-weight:700;"><b>Sub Total Exonerado:</b></td>
      <td style="height:16px;vertical-align:middle;font-size:10px;font-weight:700;text-align:right;">L ${fmtMoney(exonerado)}</td>
    </tr>
    <tr>
      <td style="height:16px;vertical-align:middle;font-size:10px;font-weight:700;"><b>ISV 15%:</b></td>
      <td style="height:16px;vertical-align:middle;font-size:10px;font-weight:700;text-align:right;">L ${fmtMoney(impuesto)}</td>
      <td style="height:16px;vertical-align:middle;font-size:10px;font-weight:700;"><b>ISV 18%:</b></td>
      <td style="height:16px;vertical-align:middle;font-size:10px;font-weight:700;text-align:right;">L ${fmtMoney(ISV18)}</td>
    </tr>
    <tr>
      <td colspan="4" class="grand-total">TOTAL COTIZACIÓN: L ${fmtMoney(ft)}</td>
    </tr>
  </table>

  <table style="margin-top:2px;">
    <tr>
      <td style="text-align:center;padding:4px 6px;">
        <div style="font-size:10px;font-weight:900;">Precios válidos por 20 días</div>
        <div style="font-size:10px;font-weight:900;margin-top:2px;">ESTO NO ES UNA FACTURA</div>
        <div style="margin-top:2px;font-size:8px;font-weight:700;color:#4a4a4a;">¡Gracias por su preferencia! — Cotización sujeta a cambios sin previo aviso</div>
      </td>
    </tr>
  </table>

</div>
</body>
</html>`;

  return htmlOutput;
}

export default generateCotizacionHTML;

function numeroALetras(num: number) {
  if (!isFinite(num)) return "";
  const unidades = [
    "",
    "uno",
    "dos",
    "tres",
    "cuatro",
    "cinco",
    "seis",
    "siete",
    "ocho",
    "nueve",
    "diez",
    "once",
    "doce",
    "trece",
    "catorce",
    "quince",
    "dieciseis",
    "diecisiete",
    "dieciocho",
    "diecinueve",
    "veinte",
  ];
  const decenas = [
    "",
    "",
    "veinte",
    "treinta",
    "cuarenta",
    "cincuenta",
    "sesenta",
    "setenta",
    "ochenta",
    "noventa",
  ];
  const centenas = [
    "",
    "cien",
    "doscientos",
    "trescientos",
    "cuatrocientos",
    "quinientos",
    "seiscientos",
    "setecientos",
    "ochocientos",
    "novecientos",
  ];
  function numeroMenorDeMil(n: number): string {
    let s = "";
    if (n === 0) return "";
    if (n < 21) return unidades[n];
    if (n < 100) {
      const d = Math.floor(n / 10);
      const r = n % 10;
      return decenas[d] + (r ? " y " + unidades[r] : "");
    }
    if (n < 1000) {
      const c = Math.floor(n / 100);
      const rest = n % 100;
      const cent = c === 1 && rest === 0 ? "cien" : centenas[c] || "";
      return cent + (rest ? " " + numeroMenorDeMil(rest) : "");
    }
    return "";
  }
  const entero = Math.floor(Math.abs(num));
  if (entero === 0) return "cero";
  const partes: string[] = [];
  let remainder = entero;
  const unidadesMiles = ["", "mil", "millón", "mil millones"];
  let idx = 0;
  while (remainder > 0) {
    const chunk = remainder % 1000;
    if (chunk) {
      let chunkStr = numeroMenorDeMil(chunk);
      if (idx === 2 && chunk === 1) chunkStr = "un";
      partes.unshift(
        chunkStr + (unidadesMiles[idx] ? " " + unidadesMiles[idx] : ""),
      );
    }
    remainder = Math.floor(remainder / 1000);
    idx++;
  }
  return partes.join(" ").trim();
}
