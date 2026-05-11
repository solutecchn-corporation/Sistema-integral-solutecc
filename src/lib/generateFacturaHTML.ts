import getCompanyData from "./getCompanyData";

export async function generateFacturaHTML(
  opts: any = {},
  tipo: "factura" | "cotizacion" = "factura",
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
    } catch (e) {
      // ignore errors fetching company data
    }
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
  } catch (e) {}

  if (!factura) factura = String(Math.floor(Math.random() * 900000) + 100000);
  const cliente =
    opts.cliente ||
    (tipo === "factura" ? "Consumidor Final" : "Cotización Cliente");
  const identidad =
    opts.identidad ||
    opts.rtnCliente ||
    opts.clientRTN ||
    opts.rtn ||
    params.identidad ||
    "C/F";
  const direccionCliente = opts.direccionCliente || "—";
  const empresaNombre = opts.empresaNombre || "SOLUCIONES TECNICAS CASTRO";

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

  const grossFromParams =
    typeof params.total === "number" ? params.total : null;
  const computedGross =
    subtotal + (impuesto || 0) + (ISV18 || 0) + (isv4 || 0) - DSC;
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

  const fmtMoney = (n: number) =>
    Number(n || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const totalPagadoCalcRaw =
    (Number(Efectivo) || 0) +
    (Number(Transferencia) || 0) +
    (Number(Tarjeta) || 0) -
    (Number(cambio) || 0);
  const totalPagadoCalc = isNaN(totalPagadoCalcRaw) ? 0 : totalPagadoCalcRaw;
  const letras = numeroALetras(totalPagadoCalc);

  const hoy = new Date();
  const diaN = String(hoy.getDate()).padStart(2, "0");
  const mesN = String(hoy.getMonth() + 1).padStart(2, "0");
  const anioN = String(hoy.getFullYear());
  const horaStr = hoy.toLocaleTimeString("es-HN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const rangoStr = identificador
    ? `${identificador}${rangoAutorizadoDe} - ${identificador}${rangoAutorizadoHasta}`
    : `${rangoAutorizadoDe} - ${rangoAutorizadoHasta}`;

  // ─── LÓGICA DE COTIZACIÓN ───
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
        const sku =
          (i.producto && i.producto.sku) ||
          i.sku ||
          i.codigo ||
          i.producto_id ||
          (i.producto && i.producto.id) ||
          "";

        return `<tr>
          <td>${sku}</td>
          <td>${desc}</td>
          <td class="text-right">${fmtMoney(precioUnitario)}</td>
          <td class="text-center">${cant}</td>
          <td class="text-right">${fmtMoney(subtotalLinea)}</td>
        </tr>`;
      })
      .join("\n");

    const logoHtmlCot = logoSrc
      ? `<img src="${logoSrc}" alt="Logo" style="max-width:100px; max-height:60px; object-fit:contain;" />`
      : `<span style="font-size: 20px; font-weight: bold; color: #004b87;">${empresaNombre}</span>`;

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cotización ${factura}</title>
    <style>
        @page { size: letter portrait; margin: 0.35in 0.45in; }
        * { box-sizing: border-box; }
        html, body { height: 100%; margin: 0; }
        body { font-family: Arial, sans-serif; font-size: 11px; padding: 20px; background-color: #fff; color: #000; }
        
        /* Flex container para forzar el footer al fondo */
        .container { 
            max-width: 800px; 
            margin: 0 auto; 
            display: flex;
            flex-direction: column;
            min-height: calc(100vh - 40px); /* Restando el padding del body */
        }
        
        /* Área que se expande para empujar el footer hacia abajo */
        .content-wrapper { flex-grow: 1; }
        
        /* Box container for header and customer info */
        .top-info-box { border: 1px solid #000; padding: 15px; margin-bottom: 20px; border-radius: 4px; }
        
        .header-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; border-bottom: 1px dashed #ccc; padding-bottom: 10px; }
        .logo { display: flex; align-items: center; width: 20%; }
        .company-info { width: 45%; padding-left: 10px; font-size: 10px; line-height: 1.3; }
        .company-name { font-weight: bold; font-size: 14px; margin-bottom: 2px; text-transform: uppercase; text-align: center; }
        .racp-title { font-weight: bold; font-size: 11px; letter-spacing: 1px; text-align: center; margin-bottom: 5px; }
        .contact-info { width: 15%; font-size: 10px; line-height: 1.3; }
        .doc-info { width: 20%; text-align: right; font-size: 10px; }
        .cotizacion-box { border: 2px solid #000; padding: 5px 10px; text-align: center; margin-top: 5px; }
        .cotizacion-box .title { font-size: 14px; font-weight: bold; margin-bottom: 3px; letter-spacing: 1px; }
        .cotizacion-box .number { display: flex; justify-content: space-between; font-weight: bold; font-size: 13px; border-top: 1px solid #000; padding-top: 2px; }
        
        .customer-section { display: flex; justify-content: space-between; margin-bottom: 0; }
        .customer-left table, .customer-right table { border-collapse: collapse; font-size: 11px; }
        .customer-left td, .customer-right td { padding: 2px 5px; vertical-align: top; }
        .label { font-weight: bold; width: 70px; }
        
        .items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
        .items-table th { border-top: 1px solid #000; border-bottom: 1px solid #000; text-align: left; padding: 6px 5px; background-color: #f9f9f9; }
        .items-table td { padding: 5px; border-bottom: 1px dashed #ccc; }
        .text-right { text-align: right !important; }
        .text-center { text-align: center !important; }
        
        /* El footer siempre quedará abajo */
        .bottom-section { 
            border: 1px solid #000; display: flex; justify-content: space-between; border-radius: 4px;
            margin-top: 20px; /* Separación de seguridad */
        }
        .bottom-left { width: 60%; padding: 10px; font-size: 10px; line-height: 1.3; }
        .bottom-right { width: 40%; border-left: 1px solid #000; }
        .totals-table { width: 100%; border-collapse: collapse; height: 100%; font-size: 11px; }
        .totals-table td { padding: 6px 8px; }
        .totals-table tr:last-child { border-top: 1px solid #000; font-weight: bold; font-size: 13px; background-color: #f0f0f0; }

        @media print {
            body { padding: 0; }
            .container { min-height: 98vh; height: 98vh; page-break-inside: avoid; }
        }
    </style>
</head>
<body>
<div class="container">
    <div class="content-wrapper">
        <div class="top-info-box">
            <div class="header-top">
                <div class="logo">${logoHtmlCot}</div>
                <div class="company-info">
                    <div class="company-name">${empresaNombre}</div>
                    <div class="racp-title">R.A.C.P</div>
                    <div>${direccion}</div>
                    <div>TEL: ${telefono}</div>
                    <div>EMAIL: ${EM}</div>
                </div>
                <div class="contact-info"><div><strong>RTN:</strong><br>${rtnEmp}</div></div>
                <div class="doc-info">
                    <div class="cotizacion-box">
                        <div class="title">COTIZACIÓN</div>
                        <div class="number"><span>No.</span><span>${factura}</span></div>
                    </div>
                </div>
            </div>
            <div class="customer-section">
                <div class="customer-left">
                    <table>
                        <tr><td class="label">RTN:</td><td>${identidad || "C/F"}</td></tr>
                        <tr><td class="label">Cliente:</td><td><strong>${cliente}</strong></td></tr>
                        <tr><td class="label">Dirección:</td><td>${direccionCliente || "—"}</td></tr>
                    </table>
                </div>
                <div class="customer-right">
                    <table><tr><td class="label">Fecha:</td><td>${diaN}/${mesN}/${anioN}</td></tr></table>
                </div>
            </div>
        </div>
        
        <table class="items-table">
            <thead>
                <tr>
                    <th style="width: 18%;">Código / SKU</th>
                    <th style="width: 47%;">Descripción</th>
                    <th class="text-right" style="width: 12%;">Precio Unit.</th>
                    <th class="text-center" style="width: 8%;">Cant.</th>
                    <th class="text-right" style="width: 15%;">Total</th>
                </tr>
            </thead>
            <tbody>${cotizacionItems}</tbody>
        </table>
    </div>
    
    <div class="bottom-section">
        <div class="bottom-left">
            <p><strong>ESTO NO ES FACTURA.</strong></p>
            <p>PRECIOS VÁLIDOS UNICAMENTE POR 20 DÍAS.</p>
        </div>
        <div class="bottom-right">
            <table class="totals-table">
                <tr><td>SUB-TOTAL GRAVADO:</td><td>L</td><td class="text-right">${fmtMoney(Gravado)}</td></tr>
                <tr><td>SUB-TOTAL EXENTO:</td><td>L</td><td class="text-right">${fmtMoney(Exento)}</td></tr>
                <tr><td>DESCUENTO:</td><td>L</td><td class="text-right">${fmtMoney(DSC)}</td></tr>
                <tr><td>ISV 15%:</td><td>L</td><td class="text-right">${fmtMoney(impuesto)}</td></tr>
                <tr><td>TOTAL A PAGAR:</td><td>L</td><td class="text-right">${fmtMoney(ft)}</td></tr>
            </table>
        </div>
    </div>
</div>
</body>
</html>`;
  }

  // ─── LÓGICA DE FACTURA ───
  const facturaItems = carrito
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
      const sku =
        (i.producto && i.producto.sku) ||
        i.sku ||
        i.codigo ||
        i.producto_id ||
        (i.producto && i.producto.id) ||
        "";

      return `<tr>
        <td>${sku}</td>
        <td>${desc}</td>
        <td class="text-right">${fmtMoney(precioUnitario)}</td>
        <td class="text-center">${cant}</td>
        <td class="text-right">${fmtMoney(subtotalLinea)}</td>
      </tr>`;
    })
    .join("\n");

  const logoHtmlFactura = logoSrc
    ? `<img src="${logoSrc}" alt="Logo" style="max-width:100px; max-height:60px; object-fit:contain;" />`
    : `<span style="font-size: 20px; font-weight: bold; color: #004b87;">${empresaNombre}</span>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Factura ${factura}</title>
    <style>
        @page { size: letter portrait; margin: 0.35in 0.45in; }
        * { box-sizing: border-box; }
        html, body { height: 100%; margin: 0; }
        body {
            font-family: Arial, sans-serif;
            font-size: 11px;
            padding: 20px;
            background-color: #fff;
            color: #000;
        }

        /* Flex container para forzar el footer al fondo de la hoja */
        .container {
            max-width: 800px;
            margin: 0 auto;
            display: flex;
            flex-direction: column;
            min-height: calc(100vh - 40px); /* 40px del padding del body */
        }

        /* Área que se expande para empujar el footer hacia abajo */
        .content-wrapper { flex-grow: 1; }

        /* Box container for header and customer info */
        .top-info-box {
            border: 1px solid #000;
            padding: 15px;
            margin-bottom: 20px;
            border-radius: 4px;
        }

        /* Header Section */
        .header-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 10px;
            border-bottom: 1px dashed #ccc;
            padding-bottom: 10px;
        }
        .logo { display: flex; align-items: center; width: 20%; }
        .company-info { width: 45%; padding-left: 10px; font-size: 10px; line-height: 1.3; }
        .company-name { font-weight: bold; font-size: 14px; margin-bottom: 2px; text-transform: uppercase; text-align: center; }
        .racp-title { font-weight: bold; font-size: 11px; letter-spacing: 1px; text-align: center; margin-bottom: 5px; }
        .contact-info { width: 15%; font-size: 10px; line-height: 1.3; }
        .doc-info { width: 20%; text-align: right; font-size: 10px; }
        .cotizacion-box {
            border: 2px solid #000;
            padding: 5px 10px;
            text-align: center;
            margin-top: 5px;
        }
        .cotizacion-box .title { font-size: 14px; font-weight: bold; margin-bottom: 3px; letter-spacing: 1px; }
        .cotizacion-box .number {
            display: flex; justify-content: space-between; font-weight: bold; font-size: 13px;
            border-top: 1px solid #000; padding-top: 2px;
        }

        /* Customer Section */
        .customer-section { display: flex; justify-content: space-between; margin-bottom: 0; }
        .customer-left table, .customer-right table { border-collapse: collapse; font-size: 11px; }
        .customer-left td, .customer-right td { padding: 2px 5px; vertical-align: top; }
        .label { font-weight: bold; width: 70px; }

        /* Main Table */
        .items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
        .items-table th {
            border-top: 1px solid #000; border-bottom: 1px solid #000;
            text-align: left; padding: 6px 5px; background-color: #f9f9f9;
        }
        .items-table td { padding: 5px; border-bottom: 1px dashed #ccc; }
        .text-right { text-align: right !important; }
        .text-center { text-align: center !important; }

        /* Bottom Section que se quedará abajo */
        .bottom-section { 
            border: 1px solid #000; display: flex; justify-content: space-between; border-radius: 4px; 
            margin-top: 20px; /* Separador en caso de llenarse la tabla */
        }
        .bottom-left { width: 55%; padding: 10px; font-size: 10px; line-height: 1.3; }
        .bottom-middle { width: 15%; display: flex; align-items: center; justify-content: center; flex-direction: column; padding: 10px; }
        .bottom-right { width: 30%; border-left: 1px solid #000; }
        
        .totals-table { width: 100%; border-collapse: collapse; height: 100%; font-size: 11px; }
        .totals-table td { padding: 4px 8px; }
        .totals-table tr:last-child { border-top: 1px solid #000; font-weight: bold; font-size: 13px; background-color: #f0f0f0; }
        
        .cai-box { margin-top: 10px; font-size: 9px; line-height: 1.4; color: #333; }
        .letras { margin-top: 5px; font-weight: bold; font-size: 11px; }

        @media print {
            body { padding: 0; }
            .container { min-height: 98vh; height: 98vh; page-break-inside: avoid; }
        }
    </style>
</head>
<body>

<div class="container">
    <div class="content-wrapper">
        <div class="top-info-box">
            <div class="header-top">
                <div class="logo">
                    ${logoHtmlFactura}
                </div>
                <div class="company-info">
                    <div class="company-name">${empresaNombre}</div>
                    <div class="racp-title">R.A.C.P</div>
                    <div>${direccion}</div>
                    <div>TEL: ${telefono}</div>
                    <div>EMAIL: ${EM}</div>
                </div>
                <div class="contact-info">
                    <div><strong>RTN:</strong><br>${rtnEmp}</div>
                </div>
                <div class="doc-info">
                    <div>Original: Cliente</div>
                    <div class="cotizacion-box">
                        <div class="title">FACTURA</div>
                        <div class="number">
                            <span>No.</span>
                            <span>${factura}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="customer-section">
                <div class="customer-left">
                    <table>
                        <tr><td class="label">RTN:</td><td>${identidad || "C/F"}</td></tr>
                        <tr><td class="label">Cliente:</td><td><strong>${cliente}</strong></td></tr>
                        <tr><td class="label">Dirección:</td><td>${direccionCliente || "—"}</td></tr>
                    </table>
                </div>
                <div class="customer-right">
                    <table>
                        <tr><td class="label">Fecha:</td><td>${diaN}/${mesN}/${anioN}</td></tr>
                        <tr><td class="label">Hora:</td><td>${horaStr}</td></tr>
                    </table>
                </div>
            </div>
        </div>

        <table class="items-table">
            <thead>
                <tr>
                    <th style="width: 18%;">Código / SKU</th>
                    <th style="width: 47%;">Descripción</th>
                    <th class="text-right" style="width: 12%;">Precio Unit.</th>
                    <th class="text-center" style="width: 8%;">Cant.</th>
                    <th class="text-right" style="width: 15%;">Total</th>
                </tr>
            </thead>
            <tbody>
                ${facturaItems}
            </tbody>
        </table>
    </div>

    <div class="bottom-section">
        <div class="bottom-left">
            <div class="letras">*** ${letras} Lempiras ***</div>
            <div class="cai-box">
                <strong>CAI:</strong> ${CAI || "—"}<br>
                <strong>Rango Autorizado:</strong> ${rangoStr || "—"}<br>
                <strong>Fecha Límite Emisión:</strong> ${fechaLimiteEmision || "—"}
            </div>
            <p style="margin-top: 10px; font-weight: bold;">LA FACTURA ES BENEFICIO DE TODOS, EXÍJALA</p>
            <p style="color: #555; font-size: 9px;">¡Gracias por su preferencia!</p>
        </div>
        
        <div class="bottom-middle">
            <p style="text-align:center; font-size: 9px; font-weight:bold;">MÉTODOS<br>DE PAGO</p>
            <div style="font-size: 8px; text-align: center; margin-top: 5px;">
                Efectivo: L ${fmtMoney(Efectivo)}<br>
                Tarjeta: L ${fmtMoney(Tarjeta)}<br>
                Transf.: L ${fmtMoney(Transferencia)}<br>
                <strong>Cambio: L ${fmtMoney(cambio)}</strong>
            </div>
        </div>

        <div class="bottom-right">
            <table class="totals-table">
                <tr><td>SUB-TOTAL GRAVADO:</td><td>L</td><td class="text-right">${fmtMoney(Gravado)}</td></tr>
                <tr><td>SUB-TOTAL EXENTO:</td><td>L</td><td class="text-right">${fmtMoney(Exento)}</td></tr>
                <tr><td>DESCUENTO:</td><td>L</td><td class="text-right">${fmtMoney(DSC)}</td></tr>
                <tr><td>ISV 15%:</td><td>L</td><td class="text-right">${fmtMoney(impuesto)}</td></tr>
                ${Number(ISV18) > 0 ? `<tr><td>ISV 18%:</td><td>L</td><td class="text-right">${fmtMoney(ISV18)}</td></tr>` : ""}
                <tr><td>TOTAL A PAGAR:</td><td>L</td><td class="text-right">${fmtMoney(ft)}</td></tr>
            </table>
        </div>
    </div>
</div>

</body>
</html>`;
}

export default generateFacturaHTML;

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
