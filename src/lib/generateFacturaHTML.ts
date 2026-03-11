import getCompanyData from "./getCompanyData";

export async function generateFacturaHTML(
  opts: any = {},
  tipo: "factura" | "cotizacion" = "factura",
  params: any = {},
): Promise<string> {
  let comercio = opts.comercio || "";
  // `rtnEmp` is the company's RTN; do not use opts.rtn (client RTN) for this
  let rtnEmp = opts.companyRTN || opts.rtnEmpresa || opts.RTN || "";
  let direccion = opts.direccion || "";
  let telefono = opts.telefono || "";
  let EM = opts.email || opts.EM || "";
  let logoSrc = opts.logo || opts.logoUrl || opts.logo_src || null;

  // Si faltan datos importantes, intentar obtenerlos desde Supabase
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
    } catch (e) {
      // ignore errors fetching company data
    }
  }

  // Intentar incrustar (inline) el logo como data URL para evitar problemas en impresión
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
    } catch (e) {
      // ignore fetch/convert errors and keep original logoSrc
    }
  }
  let factura = opts.factura || "";
  let CAI = opts.CAI || opts.cai || "";
  let fechaLimiteEmision =
    opts.fechaLimiteEmision ||
    opts.fecha_limite_emision ||
    opts.fecha_vencimiento ||
    "";
  let rangoAutorizadoDe = opts.rangoAutorizadoDe || opts.rango_desde || "";
  let rangoAutorizadoHasta =
    opts.rangoAutorizadoHasta || opts.rango_hasta || "";
  let identificador = opts.identificador || opts.identificadorCAI || "";

  // Si no se pasó factura en opts, la intentamos derivar desde CAI info
  try {
    let caiInfo: any = opts.caiInfo || null;
    if (!caiInfo && typeof window !== "undefined") {
      const raw = window.localStorage.getItem("caiInfo");
      if (raw) {
        try {
          caiInfo = JSON.parse(raw);
        } catch (e) {
          caiInfo = null;
        }
      }
    }
    if (caiInfo) {
      // populate CAI and ranges from caiInfo when available
      CAI = CAI || caiInfo.cai || caiInfo.CAI || "";
      fechaLimiteEmision =
        fechaLimiteEmision ||
        caiInfo.fecha_vencimiento ||
        caiInfo.fecha_limite_emision ||
        "";
      rangoAutorizadoDe =
        rangoAutorizadoDe || caiInfo.rango_de || caiInfo.rangoDesde || "";
      rangoAutorizadoHasta =
        rangoAutorizadoHasta || caiInfo.rango_hasta || caiInfo.rangoHasta || "";
      identificador = identificador || caiInfo.identificador || "";

      // compute factura number from identificador + secuencia_actual or rango_de when factura not provided
      if (!factura) {
        try {
          const identificador = caiInfo.identificador
            ? String(caiInfo.identificador)
            : "";
          const seqRaw =
            caiInfo.secuencia_actual != null
              ? String(caiInfo.secuencia_actual)
              : caiInfo.rango_de != null
                ? String(caiInfo.rango_de)
                : "";
          // strip non-digits for numeric part
          const numericPart = String(seqRaw).replace(/[^0-9]/g, "") || "";
          let padWidth = 0;
          if (caiInfo.rango_hasta || caiInfo.rango_de)
            padWidth = Math.max(
              String(caiInfo.rango_hasta || caiInfo.rango_de).length,
              numericPart.length,
            );
          const padded = numericPart
            ? String(numericPart).padStart(
                padWidth || numericPart.length || 1,
                "0",
              )
            : "";
          factura =
            (identificador || "") +
            (padded || String(Math.floor(Math.random() * 900000) + 100000));
        } catch (e) {
          factura = String(Math.floor(Math.random() * 900000) + 100000);
        }
      }
    }
  } catch (e) {
    // ignore cai parsing errors
  }

  // ensure factura has a value
  if (!factura) factura = String(Math.floor(Math.random() * 900000) + 100000);
  const cliente =
    opts.cliente ||
    (tipo === "factura" ? "Consumidor Final" : "Cotización Cliente");
  // identidad = RTN del cliente (accept legacy `opts.rtn` as client RTN)
  const identidad =
    opts.identidad ||
    opts.rtnCliente ||
    opts.clientRTN ||
    opts.rtn ||
    params.identidad ||
    "C/F";
  const Ahora = new Date().toLocaleString();

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
  // Calcular descuento total sumando el descuento de cada ítem del carrito
  const DSC = (() => {
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
  const exonerado = typeof params.exonerado === "number" ? params.exonerado : 0;
  const Gravado =
    typeof params.gravado === "number" ? params.gravado : subtotal;
  const Exento = typeof params.exento === "number" ? params.exento : 0;
  const impuesto = typeof params.isvTotal === "number" ? params.isvTotal : 0;
  const ISV18 = typeof params.imp18Total === "number" ? params.imp18Total : 0;
  const isv4 =
    typeof params.impTouristTotal === "number" ? params.impTouristTotal : 0;
  // Determine gross total (totalFactura). Prefer explicit `params.total` if provided,
  // otherwise compute as subtotal (net) + taxes passed in params.
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

  // Formateo de moneda: separador miles ',' y decimales '.'
  const fmtMoney = (n: number) =>
    Number(n || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

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
        const subtotalLinea = precioUnitario * cant;
        const sku = (i.producto && i.producto.sku) || i.sku || "";
        return `<tr><td>${sku} ${desc}</td><td style="text-align:center">${cant}</td><td style="text-align:right">L ${fmtMoney(precioUnitario)}</td><td style="text-align:right">L ${fmtMoney(subtotalLinea)}</td></tr>`;
      })
      .join("\n");
  };

  const tabla = buildProductosTabla();

  // Calcular Total Pagado mostrado: efectivo + transferencia + tarjeta - cambio
  const totalPagadoCalcRaw =
    (Number(Efectivo) || 0) +
    (Number(Transferencia) || 0) +
    (Number(Tarjeta) || 0) -
    (Number(cambio) || 0);
  const totalPagadoCalc = isNaN(totalPagadoCalcRaw) ? 0 : totalPagadoCalcRaw;
  const letras = numeroALetras(totalPagadoCalc);

  // Extraer DIA, MES, AÑO de la fecha actual
  const hoy = new Date();
  const diaN = String(hoy.getDate()).padStart(2, "0");
  const mesN = String(hoy.getMonth() + 1).padStart(2, "0");
  const anioN = String(hoy.getFullYear());

  // Hora formateada
  const horaStr = hoy.toLocaleTimeString("es-HN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Dirección del cliente (si se pasa)
  const direccionCliente = opts.direccionCliente || "";

  // Nombre de empresa fijo
  const empresaNombre = "SOLUCIONES TECNICAS CASTRO";

  // Rango con identificador
  const rangoStr = identificador
    ? `${identificador}${rangoAutorizadoDe} - ${identificador}${rangoAutorizadoHasta}`
    : `${rangoAutorizadoDe} - ${rangoAutorizadoHasta}`;

  // ── Bloque que se repite dos veces (las dos copias) ──
  const buildCopia = (labelCopia: string) => `
<div class="copia">

  <!-- ① Nombre empresa arriba del logo -->
  <div class="empresa-nombre">${empresaNombre}</div>

  <!-- ② Encabezado: LOGO | INFO EMPRESA | FECHA | RTN/FACTURA/CAI -->
  <table class="header-table" cellspacing="0" cellpadding="0">
    <tr>
      <td class="td-logo">
        ${logoSrc ? `<img src="${logoSrc}" alt="Logo" class="logo-img" />` : '<div class="logo-placeholder">LOGO</div>'}
      </td>
      <td class="td-info">
        <div class="info-racp">R.A.C.P</div>
        <div class="info-line"><b>R.T.N:</b> ${rtnEmp || "&nbsp;"}</div>
        <div class="info-line"><b>Dirección:</b> ${direccion}</div>
        <div class="info-line"><b>Teléfono:</b> ${telefono}</div>
        <div class="info-line"><b>Email:</b> ${EM}</div>
      </td>
      <td class="td-fecha">
        <div class="fecha-libre">${diaN}/${mesN}/${anioN}</div>
      </td>
      <td class="td-cai-box">
        <table class="cai-table" cellspacing="0" cellpadding="0">
          <tr>
            <td colspan="2" class="cai-value factura-badge">FACTURA</td>
          </tr>
        </table>
        <div class="num-factura-box">
          <div class="num-cai-line">CAI: ${CAI || "&mdash;"}</div>
          <div class="num-no-line">No. ${factura}</div>
        </div>
      </td>
    </tr>
  </table>

  <!-- ③ Datos del cliente -->
  <table class="cliente-table" cellspacing="0" cellpadding="0">
    <tr>
      <td colspan="2" class="cliente-nombre-cell">
        <b>Cliente:</b>&nbsp;${cliente}
      </td>
    </tr>
    <tr>
      <td colspan="2" class="cliente-rtn-cell">
        <b>RTN :</b>&nbsp;${identidad}
      </td>
    </tr>
    <tr>
      <td colspan="2" class="cliente-dir-cell">
        <b>Dirección:</b>&nbsp;${direccionCliente || "—"}
      </td>
    </tr>
  </table>

  <!-- ④ Tabla de productos -->
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

  <!-- ⑤ Totales -->
  <table class="totales-table" cellspacing="0" cellpadding="0">
    <tr>
      <td class="tot-lab">Descuento:</td><td class="tot-val">L ${DSC.toFixed(2)}</td>
      <td class="tot-lab">Sub Total Gravado:</td><td class="tot-val">L ${Number(Gravado).toFixed(2)}</td>
    </tr>
    <tr>
      <td class="tot-lab">Sub Total Exento:</td><td class="tot-val">L ${Number(Exento).toFixed(2)}</td>
      <td class="tot-lab">Sub Total Exonerado:</td><td class="tot-val">L ${Number(exonerado).toFixed(2)}</td>
    </tr>
    <tr>
      <td class="tot-lab">ISV 15%:</td><td class="tot-val">L ${Number(impuesto).toFixed(2)}</td>
      <td class="tot-lab"></td><td class="tot-val"></td>
    </tr>
    <tr>
      <td class="tot-total" colspan="4"><b>TOTAL FACTURA: L ${ft.toFixed(2)}</b></td>
    </tr>
  </table>

  <!-- ⑥ Métodos de pago -->
  <table class="pagos-table" cellspacing="0" cellpadding="0">
    <tr>
      <td class="pag-cell"><b>Efectivo:</b> L ${Number(Efectivo).toFixed(2)}</td>
      <td class="pag-cell"><b>Tarjeta:</b> L ${Number(Tarjeta).toFixed(2)}</td>
      <td class="pag-cell"><b>Transferencia:</b> L ${Number(Transferencia).toFixed(2)}</td>
      <td class="pag-cell"><b>Cambio:</b> L ${Number(cambio).toFixed(2)}</td>
    </tr>
  </table>

  <!-- ⑦ Total en letras -->
  <table class="letras-table" cellspacing="0" cellpadding="0">
    <tr><td class="letras-cell">*** ${letras} Lempiras ***</td></tr>
  </table>

  <!-- ⑧ Info fiscal CAI al pie -->
  <table class="cai-footer-table" cellspacing="0" cellpadding="0">
    <tr>
      <td class="cai-ft-cell"><b>CAI:</b> ${CAI || "—"}</td>
    </tr>
    <tr>
      <td class="cai-ft-cell"><b>Rango autorizado:</b> ${rangoStr || "—"}</td>
    </tr>
    <tr>
      <td class="cai-ft-cell"><b>Fecha límite de emisión:</b> ${fechaLimiteEmision || "—"}</td>
    </tr>
  </table>

  <!-- ⑨ Firmas, copia y mensaje -->
  <table class="firmas-table" cellspacing="0" cellpadding="0">
    <tr>
      <td class="firma-cell">Firma Cliente: ______________________</td>
      <td class="firma-cell">Fi Empresarma Emisor: ______________________</td>
      <td class="copia-label-cell">${labelCopia}</td>
    </tr>
  </table>

  <table class="gracias-table" cellspacing="0" cellpadding="0">
    <tr><td class="gracias-cell">¡Gracias por su compra! &nbsp;—&nbsp; LA FACTURA ES BENEFICIO DE TODOS, EXÍJALA</td></tr>
  </table>

</div>`;

  // ── Cotización: formato especial (sin datos fiscales, sin pagos) ─────────────
  if (tipo === "cotizacion") {
    const cotizacionItems = carrito
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
        if (!exento && combined > 0)
          precioUnitario = precioBrutoUnit / (1 + combined);
        const subtotalLinea = precioUnitario * cant;
        const sku = (i.producto && i.producto.sku) || i.sku || "";
        return `<tr>
          <td style="height:52px;vertical-align:middle;font-size:16px;font-weight:700;border:1px solid #9b9b9b;padding:14px 12px;">${sku ? sku + " – " : ""}${desc}</td>
          <td style="height:52px;vertical-align:middle;font-size:16px;font-weight:700;border:1px solid #9b9b9b;padding:14px 12px;text-align:right;">${cant}</td>
          <td style="height:52px;vertical-align:middle;font-size:16px;font-weight:700;border:1px solid #9b9b9b;padding:14px 12px;text-align:right;">L ${fmtMoney(precioUnitario)}</td>
          <td style="height:52px;vertical-align:middle;font-size:16px;font-weight:700;border:1px solid #9b9b9b;padding:14px 12px;text-align:right;">L ${fmtMoney(subtotalLinea)}</td>
        </tr>`;
      })
      .join("\n");

    const logoHtmlCot = logoSrc
      ? `<img src="${logoSrc}" alt="Logo" style="max-width:100%;max-height:110px;object-fit:contain;display:block;margin:auto;" />`
      : `<div style="height:114px;background:#000;display:flex;align-items:center;justify-content:center;color:#46b6ff;font-size:28px;font-weight:700;letter-spacing:1px;text-align:center;">
           <div>${comercio}<br/><small style="font-size:12px;color:#cfcfcf;letter-spacing:0;">${direccion}</small></div>
         </div>`;

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Cotización ${factura}</title>
  <style>
    @page { size: letter portrait; margin: 0.35in 0.45in; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --border: #9b9b9b; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 16px; color: #111; background: #fff; }
    .sheet { width: 100%; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    td, th { border: 1px solid var(--border); padding: 14px 12px; vertical-align: top; font-size: 16px; }
    .top td { height: 148px; }
    .quote-title { text-align: center; font-size: 22px; font-weight: 800; margin-top: 8px; line-height: 1.25; }
    .fecha { font-size: 17px; font-weight: 700; margin-top: 10px; }
    .items th { text-align: center; font-size: 16px; font-weight: 800; vertical-align: middle; height: 46px; }
    .grand-total { text-align: right; font-size: 18px; font-weight: 900; padding: 16px 14px; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
<div class="sheet">

 <table class="top">
    <colgroup>
      <col style="width:23%"/>
      <col style="width:39%"/>
      <col style="width:38%"/>
    </colgroup>
    <tr>
      <td style="vertical-align:middle;">${logoHtmlCot}</td>
      <td style="vertical-align:top;">
        <div style="font-size:24px;font-weight:bold;margin-bottom:10px;">${empresaNombre}</div>
        <div style="font-size:18px;font-weight:bold;line-height:1.8;">Dirección: ${direccion}</div>
        <div style="font-size:18px;font-weight:bold;line-height:1.8;">Teléfono: ${telefono}</div>
        <div style="font-size:18px;font-weight:bold;line-height:1.8;">Email: ${EM}</div>
        <div style="font-size:18px;font-weight:bold;line-height:1.8;">RTN: ${rtnEmp}</div>
      </td>
      <td style="position:relative;vertical-align:top;">
        <div class="quote-title" style="font-size:26px;font-weight:bold;">
          COTIZACIÓN<br/>No. ${factura}
        </div>
        <div class="fecha" style="font-size:18px;font-weight:bold;">
          Fecha: ${diaN}/${mesN}/${anioN}
        </div>
      </td>
    </tr>
</table>

  <table style="margin-top:8px;">
    <tr><td style="height:48px;vertical-align:middle;font-size:17px;font-weight:700;"><b>Cliente:</b> ${cliente}</td></tr>
    <tr><td style="height:48px;vertical-align:middle;font-size:17px;font-weight:700;"><b>RTN Cliente:</b> ${identidad}</td></tr>
    <tr><td style="height:48px;vertical-align:middle;font-size:17px;font-weight:700;"><b>Dirección:</b> ${direccionCliente || "—"}</td></tr>
  </table>

  <table class="items" style="margin-top:8px;">
    <colgroup>
      <col style="width:62%"/>
      <col style="width:12%"/>
      <col style="width:12%"/>
      <col style="width:14%"/>
    </colgroup>
    <tr>
      <th>Descripción</th>
      <th>Cant.</th>
      <th>Precio Unit.</th>
      <th>Total</th>
    </tr>
    ${cotizacionItems}
  </table>

  <table style="margin-top:8px;">
    <colgroup>
      <col style="width:30%"/>
      <col style="width:20%"/>
      <col style="width:30%"/>
      <col style="width:20%"/>
    </colgroup>
    <tr>
      <td style="height:48px;vertical-align:middle;font-size:16px;font-weight:700;"><b>Descuento:</b></td>
      <td style="height:48px;vertical-align:middle;font-size:16px;font-weight:700;text-align:right;">L ${fmtMoney(DSC)}</td>
      <td style="height:48px;vertical-align:middle;font-size:16px;font-weight:700;"><b>Sub Total Gravado:</b></td>
      <td style="height:48px;vertical-align:middle;font-size:16px;font-weight:700;text-align:right;">L ${fmtMoney(Gravado)}</td>
    </tr>
    <tr>
      <td style="height:48px;vertical-align:middle;font-size:16px;font-weight:700;"><b>Sub Total Exento:</b></td>
      <td style="height:48px;vertical-align:middle;font-size:16px;font-weight:700;text-align:right;">L ${fmtMoney(Exento)}</td>
      <td style="height:48px;vertical-align:middle;font-size:16px;font-weight:700;"><b>Sub Total Exonerado:</b></td>
      <td style="height:48px;vertical-align:middle;font-size:16px;font-weight:700;text-align:right;">L ${fmtMoney(exonerado)}</td>
    </tr>
    <tr>
      <td style="height:48px;vertical-align:middle;font-size:16px;font-weight:700;"><b>ISV 15%:</b></td>
      <td style="height:48px;vertical-align:middle;font-size:16px;font-weight:700;text-align:right;">L ${fmtMoney(impuesto)}</td>
      <td style="height:48px;vertical-align:middle;font-size:16px;font-weight:700;"><b>ISV 18%:</b></td>
      <td style="height:48px;vertical-align:middle;font-size:16px;font-weight:700;text-align:right;">L ${fmtMoney(ISV18)}</td>
    </tr>
    <tr>
      <td colspan="4" class="grand-total">TOTAL COTIZACIÓN: L ${fmtMoney(ft)}</td>
    </tr>
  </table>

  <table style="margin-top:8px;">
    <tr>
      <td style="text-align:center;padding:14px 20px 12px;">
        <div style="font-size:18px;font-weight:900;">Precios válidos por 20 días</div>
        <div style="font-size:18px;font-weight:900;margin-top:4px;">ESTO NO ES UNA FACTURA</div>
        <div style="margin-top:6px;font-size:15px;font-weight:700;color:#4a4a4a;">¡Gracias por su preferencia! — Cotización sujeta a cambios sin previo aviso</div>
      </td>
    </tr>
  </table>

</div>
</body>
</html>`;
  }
  // ─────────────────────────────────────────────────────────────────────────────

  const logoHtmlFactura = logoSrc
    ? `<img src="${logoSrc}" alt="Logo" style="max-width:100%;max-height:80px;object-fit:contain;display:block;margin:auto;" />`
    : `<div style="height:60px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#999;border:1px dashed #aaa;">LOGO</div>`;

  const buildFacturaCopia = (labelCopia: string) => `
<div class="copia">

  <table class="header-table">
    <colgroup>
      <col style="width:25%"/>
      <col style="width:45%"/>
      <col style="width:30%"/>
    </colgroup>
    <tr>
      <td class="text-center">
        ${logoHtmlFactura}
      </td>
      <td style="vertical-align:top; padding-top: 5px;">
        <div class="title">${empresaNombre}</div>
        <div class="sub-title">R.A.C.P</div>
        <div style="font-size:8px;line-height:1.3;">
          <span class="bold">R.T.N:</span> ${rtnEmp}<br>
          <span class="bold">Dirección:</span> ${direccion}<br>
          <span class="bold">Teléfono:</span> ${telefono}<br>
          <span class="bold">Email:</span> ${EM}
        </div>
      </td>
      <td class="text-center" style="vertical-align:middle;">
        <div class="bold" style="font-size:11px;">Factura No. ${factura}</div>
        <div style="font-size:10px;margin-top:8px;" class="bold">Fecha: ${diaN}/${mesN}/${anioN}</div>
      </td>
    </tr>
  </table>

  <table>
    <tr class="info-row"><td><span class="bold" style="font-size: 12px;">Cliente: ${cliente}</span></td></tr>
    <tr class="info-row"><td><span class="bold" style="font-size: 12px;">RTN : ${identidad}</span></td></tr>
    <tr class="info-row"><td><span class="bold" style="font-size: 12px;">Dirección: ${direccionCliente || "—"}</span></td></tr>
  </table>

  <table>
    <colgroup>
      <col style="width:55%"/>
      <col style="width:15%"/>
      <col style="width:15%"/>
      <col style="width:15%"/>
    </colgroup>
    <tr>
      <th class="product-th">Descripción</th>
      <th class="product-th">Cantidad</th>
      <th class="product-th">Precio Unit.</th>
      <th class="product-th">Total</th>
    </tr>
    ${tabla}
  </table>

  <table>
    <colgroup>
      <col style="width:30%"/>
      <col style="width:20%"/>
      <col style="width:30%"/>
      <col style="width:20%"/>
    </colgroup>
    <tr>
      <td class="bold">Descuento:</td>
      <td class="bold">L ${fmtMoney(DSC)}</td>
      <td class="bold">Sub Total Gravado:</td>
      <td class="bold">L ${fmtMoney(Gravado)}</td>
    </tr>
    <tr>
      <td class="bold">Sub Total Exento:</td>
      <td class="bold">L ${fmtMoney(Exento)}</td>
      <td class="bold">Sub Total Exonerado:</td>
      <td class="bold">L ${fmtMoney(exonerado)}</td>
    </tr>
    <tr>
      <td class="bold">ISV 15%:</td>
      <td class="bold">L ${fmtMoney(impuesto)}</td>
      <td class="bold">ISV 18%:</td>
      <td class="bold">L ${fmtMoney(ISV18)}</td>
    </tr>
    <tr>
      <td colspan="4" class="grand-total">TOTAL FACTURA: L ${fmtMoney(ft)}</td>
    </tr>
  </table>

  <table>
    <colgroup>
      <col style="width:25%"/>
      <col style="width:25%"/>
      <col style="width:25%"/>
      <col style="width:25%"/>
    </colgroup>
    <tr>
      <td class="text-center bold">Efectivo: L ${fmtMoney(Efectivo)}</td>
      <td class="text-center bold">Tarjeta: L ${fmtMoney(Tarjeta)}</td>
      <td class="text-center bold">Transferencia: L ${fmtMoney(Transferencia)}</td>
      <td class="text-center bold">Cambio: L ${fmtMoney(cambio)}</td>
    </tr>
  </table>

  <table>
    <tr>
      <td class="text-center bold letras-total">*** ${letras} Lempiras ***</td>
    </tr>
  </table>

  <table>
    <tr class="info-row"><td><span class="bold" style="font-size:12px;">CAI: ${CAI}</span></td></tr>
    <tr class="info-row"><td><span class="bold" style="font-size:12px;">Rango autorizado: ${rangoStr}</span></td></tr>
    <tr class="info-row"><td><span class="bold" style="font-size:12px;">Fecha límite de emisión: ${fechaLimiteEmision}</span></td></tr>
  </table>

  <table style="border: none;">
    <tr>
      <td style="border: none; text-align: center; padding-top: 4px;">
        <div class="bold" style="font-size: 12px;">¡Gracias por su compra!</div>
        <div class="bold" style="font-size: 13px; margin-top: 2px;">LA FACTURA ES BENEFICIO DE TODOS, EXÍJALA</div>
        <div style="font-size:7px;color:#666;margin-top:3px;">${labelCopia}</div>
      </td>
    </tr>
  </table>

</div>`;

  const htmlOutput = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Factura ${factura}</title>
  <style>
    /* Tamaño carta vertical, márgenes ajustados */
    @page { size: 8.5in 11in; margin: 0.3in; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #000; background: #fff; }

    .page-wrap { width: 100%; }
    .copia { width: 100%; page-break-inside: avoid; padding: 4px 0; }
    .separador {
      border: none;
      border-top: 1.5px dashed #888;
      margin: 8px 0;
      position: relative;
    }
    .separador::after {
      content: '✂';
      position: absolute;
      left: 50%;
      top: -8px;
      font-size: 12px;
      background: #fff;
      padding: 0 4px;
      color: #888;
    }

    /* Estilos generales de tabla */
    table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 3px; }
    td, th { border: 1px solid #ccc; padding: 3px 4px; vertical-align: middle; font-size: 9px; }

    /* Utilidades de texto */
    .bold { font-weight: bold; }
    .text-center { text-align: center; }
    .text-right { text-align: right; }

    /* Encabezado */
    .header-table td { height: auto; min-height: 50px; }
    .title { text-align: center; font-size: 14px; font-weight: bold; margin-bottom: 2px; }
    .sub-title { text-align: center; font-size: 9px; font-weight: bold; margin-bottom: 2px; }

    /* Celdas de información compactas */
    .info-row td { height: 18px; font-size: 11px; }
    .product-th { height: 18px; font-size: 9px; font-weight: bold; text-align: center; }

    .grand-total { text-align: right; font-size: 11px; font-weight: bold; padding: 5px 6px; }
    .letras-total { font-size: 14px; padding: 6px; }

    @media print {
      body { margin: 0; }
      .separador { border-top: 1.5px dashed #888 !important; }
    }
  </style>
</head>
<body>
<div class="page-wrap">
  ${buildFacturaCopia("ORIGINAL: Cliente")}
  <hr class="separador"/>
  ${buildFacturaCopia("COPIA: Emisor")}
</div>
</body>
</html>`;

  return htmlOutput;
}

export default generateFacturaHTML;

function numeroALetras(num: number) {
  // Convert number to words in Spanish (simplified, handles integers)
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
// Utility to generate factura/cotización HTML from provided cart and totals
