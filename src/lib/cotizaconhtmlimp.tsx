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

  const htmlOutput = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Cotización ${cotizacionNum || ""}</title>
  <style>
    @page { size: letter portrait; margin: 0.3in 0.4in; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 9px; color: #000; background: #fff; }

    .empresa-nombre {
      font-size: 16px;
      font-weight: 900;
      text-align: center;
      letter-spacing: 1px;
      text-transform: uppercase;
      border-bottom: 2px solid #000;
      padding-bottom: 4px;
      margin-bottom: 5px;
    }

    .header-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #000;
      margin-bottom: 4px;
    }
    .header-table td { vertical-align: top; border: 1px solid #000; }

    .td-logo { width: 80px; padding: 4px; text-align: center; vertical-align: middle; }
    .logo-img { width: 70px; height: auto; object-fit: contain; display: block; margin: auto; }
    .logo-placeholder { width: 70px; height: 50px; border: 1px dashed #aaa; display: table-cell; text-align: center; vertical-align: middle; font-size: 8px; color: #999; }

    .td-info { padding: 4px 6px; width: 30%; }
    .info-line { font-size: 8.5px; font-weight: 700; line-height: 1.8; }

    .td-fecha { width: 18%; padding: 3px; vertical-align: top; }
    .fecha-table { width: 100%; border-collapse: collapse; }
    .fecha-table th { background: #fff; color: #000; text-align: center; font-size: 7.5px; font-weight: 700; padding: 2px 1px; border: 1px solid #000; }
    .fecha-table td { text-align: center; font-size: 9px; font-weight: 700; padding: 2px 1px; border: 1px solid #000; }
    .hora-line { font-size: 7px; margin-top: 2px; text-align: center; color: #444; }

    .td-cai-box { padding: 0; width: 28%; }
    .cai-table { width: 100%; border-collapse: collapse; }
    .cai-table td { border: 1px solid #000; padding: 3px 4px; font-size: 8px; }
    .cai-label { width: 42%; font-weight: 700; background: #f1f5f9; }
    .rtn-value { font-weight: 600; }
    .cotiz-badge { font-weight: 900; font-size: 10px; text-align: center; letter-spacing: 1px; }
    .num-cotiz-box { background: #fff; color: #000; text-align: center; font-size: 12px; font-weight: 900; padding: 3px; letter-spacing: 1px; border-top: 1px solid #000; }

    .cliente-table { width: 100%; border-collapse: collapse; border: 1px solid #000; margin-bottom: 4px; }
    .cliente-table td { border: 1px solid #000; padding: 3px 6px; font-size: 9px; }

    .tabla-productos { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
    .tabla-productos thead tr { background: #fff; color: #000; }
    .tabla-productos th { padding: 4px 5px; font-size: 8.5px; font-weight: 700; text-align: left; border: 1px solid #000; }
    .tabla-productos td { padding: 3px 5px; font-size: 9px; border: 1px solid #ccc; vertical-align: middle; }
    .tabla-productos tbody tr:nth-child(even) td { background: #f8fafc; }
    .col-num { width: 11%; text-align: right !important; }

    .totales-table { width: 100%; border-collapse: collapse; margin-bottom: 3px; }
    .totales-table td { padding: 2px 5px; font-size: 8px; border: 1px solid #ddd; }
    .tot-lab { font-weight: 600; background: #f8fafc; width: 22%; }
    .tot-val { text-align: right; width: 14%; }
    .tot-total { font-size: 10px; font-weight: 900; text-align: right; padding: 3px 5px; }

    .letras-table { width: 100%; border-collapse: collapse; margin-bottom: 3px; }
    .letras-cell { text-align: center; font-size: 8px; font-style: italic; border: 1px solid #ccc; padding: 2px; }

    .footer-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    .footer-table td { padding: 4px 6px; font-size: 8.5px; vertical-align: top; }
    .firma-cell { border-top: 1px solid #000; width: 45%; }
    .validez-cell { text-align: center; font-size: 9px; font-weight: 700; border: 2px solid #000; padding: 5px; background: #f8fafc; }
    .gracias-cell { text-align: center; font-size: 8px; color: #444; padding-top: 6px; }
  </style>
</head>
<body>

  <!-- Nombre empresa -->
  <div class="empresa-nombre">${empresaNombre}</div>

  <!-- Encabezado: LOGO | INFO EMPRESA | FECHA | RTN/COTIZACIÓN -->
  <table class="header-table" cellspacing="0" cellpadding="0">
    <tr>
      <td class="td-logo">
        ${logoSrc ? `<img src="${logoSrc}" alt="Logo" class="logo-img" />` : '<div class="logo-placeholder">LOGO</div>'}
      </td>
      <td class="td-info">
        <div class="info-line"><b>Dirección:</b> ${direccion}</div>
        <div class="info-line"><b>Teléfono:</b> ${telefono}</div>
        <div class="info-line"><b>Email:</b> ${EM}</div>
      </td>
      <td class="td-fecha">
        <table class="fecha-table" cellspacing="0" cellpadding="0">
          <thead><tr><th>DÍA</th><th>MES</th><th>AÑO</th></tr></thead>
          <tbody><tr><td>${diaN}</td><td>${mesN}</td><td>${anioN}</td></tr></tbody>
        </table>
        <div class="hora-line">Hora: ${horaStr}</div>
      </td>
      <td class="td-cai-box">
        <table class="cai-table" cellspacing="0" cellpadding="0">
          <tr>
            <td class="cai-label">RTN Empresa:</td>
            <td class="rtn-value">${rtnEmp || "&nbsp;"}</td>
          </tr>
          <tr>
            <td class="cai-label">Tipo:</td>
            <td class="cotiz-badge">COTIZACIÓN</td>
          </tr>
          <tr>
            <td class="cai-label">No.:</td>
            <td style="font-weight:700">${cotizacionNum || "&nbsp;"}</td>
          </tr>
        </table>
        <div class="num-cotiz-box">No. ${cotizacionNum || "—"}</div>
      </td>
    </tr>
  </table>

  <!-- Datos del cliente -->
  <table class="cliente-table" cellspacing="0" cellpadding="0">
    <tr>
      <td colspan="2"><b>Cliente:</b>&nbsp;${cliente}</td>
    </tr>
    <tr>
      <td colspan="2"><b>RTN Cliente:</b>&nbsp;${identidad}</td>
    </tr>
    <tr>
      <td colspan="2"><b>Dirección:</b>&nbsp;${direccionCliente || "—"}</td>
    </tr>
  </table>

  <!-- Tabla de productos -->
  <table class="tabla-productos" cellspacing="0" cellpadding="0">
    <thead>
      <tr>
        <th>Descripción</th>
        <th class="col-num">Cant.</th>
        <th class="col-num">Precio Unit.</th>
        <th class="col-num">Total</th>
      </tr>
    </thead>
    <tbody>
      ${tabla}
    </tbody>
  </table>

  <!-- Totales -->
  <table class="totales-table" cellspacing="0" cellpadding="0">
    <tr>
      <td class="tot-lab">Descuento:</td><td class="tot-val">L ${DSC_calc.toFixed(2)}</td>
      <td class="tot-lab">Sub Total Gravado:</td><td class="tot-val">L ${Number(Gravado).toFixed(2)}</td>
    </tr>
    <tr>
      <td class="tot-lab">Sub Total Exento:</td><td class="tot-val">L ${Number(Exento).toFixed(2)}</td>
      <td class="tot-lab">Sub Total Exonerado:</td><td class="tot-val">L ${Number(exonerado).toFixed(2)}</td>
    </tr>
    <tr>
      <td class="tot-lab">ISV 15%:</td><td class="tot-val">L ${Number(impuesto).toFixed(2)}</td>
      <td class="tot-lab">ISV 18%:</td><td class="tot-val">L ${Number(ISV18).toFixed(2)}</td>
    </tr>
    <tr>
      <td class="tot-total" colspan="4"><b>TOTAL COTIZACIÓN: L ${ft.toFixed(2)}</b></td>
    </tr>
  </table>

  <!-- Total en letras -->
  <table class="letras-table" cellspacing="0" cellpadding="0">
    <tr><td class="letras-cell">*** ${letras} Lempiras ***</td></tr>
  </table>

  <!-- Pie: firma, validez y mensaje -->
  <table class="footer-table" cellspacing="0" cellpadding="0">
    <tr>
      <td style="width:38%; padding-top:18px; border-top:1px solid #000; font-size:8px;">Firma Cliente: ______________________</td>
      <td style="width:4%;"></td>
      <td style="width:24%; text-align:center; border:2px solid #000; padding:6px; font-size:9px; font-weight:700; background:#f8fafc;">
      Precio válido<br/>por <b>20 días</b>
      </td>
      <td style="width:4%;"></td>
      <td style="width:30%; padding-top:18px; border-top:1px solid #000; font-size:8px;">Firma Emisor: ______________________</td>
    </tr>
    <tr>
      <td colspan="5" style="text-align:center; font-size:8px; color:#555; padding-top:6px;">
        ¡Gracias por su preferencia! — Cotización sujeta a cambios sin previo aviso
      </td>
    </tr>
  </table>

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
