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

  if (!cotizacionNum)
    cotizacionNum = String(Math.floor(Math.random() * 900000) + 100000);

  const cliente = opts.cliente || "Cotización Cliente";
  const identidad = opts.identidad || opts.rtn || params.identidad || "C/F";
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
  const ft = grossFromParams != null ? grossFromParams : computedGross;

  // Formateo de moneda
  const fmtMoney = (n: number) =>
    Number(n || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  // Fecha y Hora
  const hoy = new Date();
  const diaN = String(hoy.getDate()).padStart(2, "0");
  const mesN = String(hoy.getMonth() + 1).padStart(2, "0");
  const anioN = String(hoy.getFullYear());
  const horaStr = hoy.toLocaleTimeString("es-HN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Generación de filas de la tabla
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
    <title>Cotización ${cotizacionNum}</title>
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
            min-height: calc(100vh - 40px);
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
            margin-top: 20px; 
        }
        .bottom-left { width: 55%; padding: 15px; font-size: 10px; line-height: 1.5; display: flex; flex-direction: column; justify-content: center; }
        .bottom-right { width: 45%; border-left: 1px solid #000; }
        
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
                <div class="logo">
                    ${logoHtmlCot}
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
                        <div class="title">COTIZACIÓN</div>
                        <div class="number">
                            <span>No.</span>
                            <span>${cotizacionNum}</span>
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
                ${cotizacionItems}
            </tbody>
        </table>
    </div>

    <div class="bottom-section">
        <div class="bottom-left">
            <p style="font-size: 14px;"><strong>ESTO NO ES UNA FACTURA.</strong></p>
            <p style="font-size: 12px; margin-top: 5px;">PRECIOS VÁLIDOS ÚNICAMENTE POR 20 DÍAS.</p>
            <p style="color: #555; margin-top: 10px;">¡Gracias por su preferencia! Cotización sujeta a disponibilidad de inventario al momento de la compra.</p>
        </div>

        <div class="bottom-right">
            <table class="totals-table">
                <tr><td>SUB-TOTAL GRAVADO:</td><td>L</td><td class="text-right">${fmtMoney(Gravado)}</td></tr>
                <tr><td>SUB-TOTAL EXENTO:</td><td>L</td><td class="text-right">${fmtMoney(Exento)}</td></tr>
                <tr><td>DESCUENTO:</td><td>L</td><td class="text-right">${fmtMoney(DSC)}</td></tr>
                <tr><td>ISV 15%:</td><td>L</td><td class="text-right">${fmtMoney(impuesto)}</td></tr>
                ${Number(ISV18) > 0 ? `<tr><td>ISV 18%:</td><td>L</td><td class="text-right">${fmtMoney(ISV18)}</td></tr>` : ""}
                <tr><td>TOTAL COTIZACIÓN:</td><td>L</td><td class="text-right">${fmtMoney(ft)}</td></tr>
            </table>
        </div>
    </div>
</div>

</body>
</html>`;
}

export default generateCotizacionHTML;
