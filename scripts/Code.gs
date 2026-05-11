/**
 * ====================================================================
 * Code.gs – Google Apps Script para envío de facturas/cotizaciones
 * PDF CON TABLAS RÍGIDAS (NO SE DEFORMAN) Y CORREO NOTIFICADOR LIMPIO
 * ====================================================================
 */

// ─── Credenciales desde Script Properties ──────────────────────────────────────
function getSupabaseUrl() {
  return (
    PropertiesService.getScriptProperties().getProperty("SUPABASE_URL") || ""
  );
}
function getSupabaseKey() {
  return (
    PropertiesService.getScriptProperties().getProperty("SUPABASE_KEY") || ""
  );
}
function getEmpresaNombreDefault() {
  return (
    PropertiesService.getScriptProperties().getProperty("EMPRESA_NOMBRE") ||
    "SOLUCIONES TECNICAS CASTRO"
  );
}

// ─── Helper: consulta REST de Supabase ─────────────────────────────────────────
function supabaseGet(table, queryString) {
  var url = getSupabaseUrl() + "/rest/v1/" + table + "?" + queryString;
  var key = getSupabaseKey();
  try {
    var resp = UrlFetchApp.fetch(url, {
      method: "GET",
      headers: {
        apikey: key,
        Authorization: "Bearer " + key,
        Accept: "application/json",
      },
      muteHttpExceptions: true,
    });
    if (resp.getResponseCode() !== 200) return [];
    return JSON.parse(resp.getContentText()) || [];
  } catch (e) {
    return [];
  }
}

function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({ status: "ok" }),
  ).setMimeType(ContentService.MimeType.JSON);
}

// ─── POST: enviar correo ───────────────────────────────────────────────────────
function doPost(e) {
  try {
    var raw = e.postData && e.postData.contents ? e.postData.contents : "{}";
    var payload;
    try {
      payload = JSON.parse(raw);
    } catch (parseErr) {
      return jsonResponse({ success: false, error: "JSON invalido" });
    }

    var to = payload.to || "";
    var facturaNum = payload.facturaNumero || payload.facturaNum || "";
    var transactionId =
      payload.transactionId ||
      payload.transaction_id ||
      payload.ventaId ||
      payload.id ||
      "";
    var docType = payload.type || "factura";

    if (!to || to.indexOf("@") === -1)
      return jsonResponse({ success: false, error: "Correo invalido" });

    // ── 1. Construir documento: preferir HTML del frontend (mismo formato impreso)
    // y usar DB como respaldo.
    var builtDoc = buildHtmlFromDB(transactionId, facturaNum, docType);
    var sourceHtml = payload.htmlBody ? String(payload.htmlBody) : "";

    if (!sourceHtml) {
      if (builtDoc && builtDoc.html) {
        sourceHtml = builtDoc.html;
      } else {
        return jsonResponse({
          success: false,
          error: "No se pudo construir documento desde DB.",
        });
      }
    }

    // Normaliza HTML para que Drive no desordene el PDF (logo grande/flex/sticky)
    var pdfHtml = normalizeHtmlForDrivePdf(sourceHtml);

    if (!builtDoc) {
      builtDoc = {
        html: pdfHtml,
        label:
          facturaNum ||
          transactionId ||
          (docType === "cotizacion" ? "Cotizacion" : "Factura"),
        cliente: payload.cliente || payload.nombre_cliente || "Cliente",
      };
    } else {
      builtDoc.html = pdfHtml;
      if (!builtDoc.cliente)
        builtDoc.cliente =
          payload.cliente || payload.nombre_cliente || "Cliente";
    }

    // ── 2. Generar archivo PDF via Google Drive
    var pdfLabel =
      builtDoc.label ||
      facturaNum ||
      (docType === "cotizacion" ? "Cotizacion" : "Factura");
    var pdfName =
      (docType === "cotizacion" ? "Cotizacion_" : "Factura_") +
      pdfLabel +
      ".pdf";
    var pdfBlob = null;
    try {
      pdfBlob = htmlToPdfBlob(builtDoc.html, pdfName);
    } catch (pdfErr) {
      Logger.log("PDF error: " + pdfErr);
    }

    // ── 3. Crear el cuerpo del correo (Notificación limpia, SIN la factura incrustada)
    var nombreClienteEmail = builtDoc.cliente || "Cliente";
    var tipoDocEmail = docType === "cotizacion" ? "Cotización" : "Factura";

    var htmlNotificacionEmail = `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #004b87; color: #fff; padding: 15px; text-align: center;">
          <h2 style="margin: 0; font-size: 20px;">Documento Emitido</h2>
        </div>
        <div style="padding: 20px; background-color: #f9f9f9;">
          <p>Estimado/a <strong>${nombreClienteEmail}</strong>,</p>
          <p>Adjunto a este correo encontrará su <strong>${tipoDocEmail}</strong> con el número <b>${pdfLabel}</b>, emitida por <b>${getEmpresaNombreDefault()}</b>.</p>
          <p>Por favor, descargue el archivo PDF adjunto para visualizar los detalles de su transacción.</p>
          <br>
          <p style="margin-bottom: 0;">Gracias por su preferencia.</p>
        </div>
      </div>
    `;

    var plainText =
      "Estimado cliente, adjunto encontrara su " +
      tipoDocEmail +
      ". Por favor abra el archivo PDF adjunto.";
    var subject =
      tipoDocEmail + " No. " + pdfLabel + " – " + getEmpresaNombreDefault();

    var emailOpts = {
      htmlBody: htmlNotificacionEmail,
      name: getEmpresaNombreDefault(),
    };
    if (pdfBlob) emailOpts.attachments = [pdfBlob];

    // ── 4. Enviar correo
    GmailApp.sendEmail(to, subject, plainText, emailOpts);

    return jsonResponse({ success: true, to: to, hasPdf: !!pdfBlob });
  } catch (err) {
    return jsonResponse({ success: false, error: String(err) });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

// ─── Construir HTML desde la DB ───────────────────────────────────────────────
function buildHtmlFromDB(transactionId, facturaNumero, docType) {
  var empresas = supabaseGet("empresa", "select=*&limit=1");
  var empresa = empresas && empresas.length > 0 ? empresas[0] : {};

  if (docType === "cotizacion") {
    var cots = [];
    if (transactionId)
      cots = supabaseGet(
        "cotizaciones",
        "id=eq." + encodeURIComponent(transactionId) + "&select=*&limit=1",
      );
    if ((!cots || cots.length === 0) && facturaNumero)
      cots = supabaseGet(
        "cotizaciones",
        "numero=eq." + encodeURIComponent(facturaNumero) + "&select=*&limit=1",
      );
    if ((!cots || cots.length === 0) && facturaNumero)
      cots = supabaseGet(
        "cotizaciones",
        "factura=eq." + encodeURIComponent(facturaNumero) + "&select=*&limit=1",
      );

    if (cots && cots.length > 0) {
      var cot = cots[0];
      var cotDet = supabaseGet(
        "cotizaciones_detalle",
        "cotizacion_id=eq." +
          encodeURIComponent(cot.id) +
          "&select=*&order=id.asc",
      );
      cotDet = enrichDetallesWithSku(cotDet || []);
      var cotLabel =
        cot.numero_cotizacion ||
        cot.numero ||
        cot.factura ||
        cot.id ||
        "Cotizacion";
      return {
        html: buildCotizacionHTML(cot, cotDet || [], empresa),
        label: String(cotLabel),
        cliente: cot.cliente || "Cliente",
      };
    }
    return null;
  }

  var ventas = [];
  if (transactionId)
    ventas = supabaseGet(
      "ventas",
      "id=eq." + encodeURIComponent(transactionId) + "&select=*&limit=1",
    );
  if ((!ventas || ventas.length === 0) && facturaNumero)
    ventas = supabaseGet(
      "ventas",
      "factura=eq." + encodeURIComponent(facturaNumero) + "&select=*&limit=1",
    );

  if (ventas && ventas.length > 0) {
    var venta = ventas[0];
    var detalles = supabaseGet(
      "ventas_detalle",
      "venta_id=eq." + encodeURIComponent(venta.id) + "&select=*&order=id.asc",
    );
    detalles = enrichDetallesWithSku(detalles || []);
    var pagos = supabaseGet(
      "pagos",
      "venta_id=eq." + encodeURIComponent(venta.id) + "&select=*",
    );
    if (!pagos || pagos.length === 0)
      pagos = supabaseGet(
        "pagos",
        "factura=eq." +
          encodeURIComponent(venta.factura || facturaNumero || "") +
          "&select=*",
      );

    var facturaLabel = venta.factura || venta.numero || venta.id || "Factura";
    return {
      html: buildFacturaHTML(venta, detalles || [], empresa, pagos || []),
      label: String(facturaLabel),
      cliente: venta.cliente || "Cliente",
    };
  }
  return null;
}

function enrichDetallesWithSku(detalles) {
  if (!detalles || detalles.length === 0) return detalles || [];

  var ids = [];
  for (var i = 0; i < detalles.length; i++) {
    var pid =
      detalles[i] && detalles[i].producto_id != null
        ? String(detalles[i].producto_id)
        : "";
    if (pid) ids.push(pid);
  }
  if (ids.length === 0) return detalles;

  var uniq = [];
  var seen = {};
  for (var j = 0; j < ids.length; j++) {
    var key = ids[j];
    if (!seen[key]) {
      seen[key] = true;
      uniq.push(key);
    }
  }

  var idList = uniq
    .map(function (id) {
      return '"' + String(id).replace(/"/g, "") + '"';
    })
    .join(",");

  var invRows = supabaseGet(
    "inventario",
    "id=in.(" + idList + ")&select=id,sku,codigo",
  );

  var skuMap = {};
  for (var r = 0; r < (invRows || []).length; r++) {
    var row = invRows[r] || {};
    skuMap[String(row.id)] = row.sku || row.codigo || "";
  }

  for (var d = 0; d < detalles.length; d++) {
    var det = detalles[d] || {};
    if (!det.sku && !det.codigo && det.producto_id != null) {
      var skuFromInv = skuMap[String(det.producto_id)] || "";
      if (skuFromInv) det.sku = skuFromInv;
    }
  }

  return detalles;
}

// ─── Helpers de formato ───────────────────────────────────────────────────────
function formatFecha(isoStr) {
  if (!isoStr) return "-";
  try {
    var d = new Date(isoStr);
    return (
      String(d.getDate()).padStart(2, "0") +
      "/" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "/" +
      d.getFullYear()
    );
  } catch (e) {
    return String(isoStr).substring(0, 10);
  }
}

function fmtMoney(n) {
  var num = parseFloat(n) || 0;
  return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeHtmlForDrivePdf(html) {
  if (!html) return html;
  var out = String(html);

  // 1) Forzar tamaño de imágenes/logos (evita logos gigantes en PDF)
  out = out.replace(/<img\b([^>]*)>/gi, function (_m, attrs) {
    var safeAttrs = String(attrs || "")
      .replace(/\swidth\s*=\s*"[^"]*"/gi, "")
      .replace(/\sheight\s*=\s*"[^"]*"/gi, "")
      .replace(/\sstyle\s*=\s*"[^"]*"/gi, "");
    return (
      "<img" +
      safeAttrs +
      ' width="110" style="max-width:110px;max-height:72px;height:auto;object-fit:contain;display:block;" />'
    );
  });

  // 2) Quitar CSS que Google Docs/Drive interpreta mal
  out = out.replace(/display\s*:\s*flex\s*;?/gi, "display:block;");
  out = out.replace(/flex-direction\s*:[^;]+;?/gi, "");
  out = out.replace(/justify-content\s*:[^;]+;?/gi, "");
  out = out.replace(/align-items\s*:[^;]+;?/gi, "");
  out = out.replace(/flex-grow\s*:[^;]+;?/gi, "");
  out = out.replace(/position\s*:\s*(sticky|fixed)\s*;?/gi, "position:static;");
  out = out.replace(/min-height\s*:\s*calc\([^)]+\)\s*;?/gi, "");
  out = out.replace(/min-height\s*:\s*\d+vh\s*;?/gi, "");
  out = out.replace(/height\s*:\s*\d+vh\s*;?/gi, "");

  return out;
}

// ─── Función Numérica a Letras ────────────────────────────
function numeroALetras(num) {
  if (!isFinite(num)) return "";
  var unidades = [
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
  var decenas = [
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
  var centenas = [
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

  function numeroMenorDeMil(n) {
    if (n === 0) return "";
    if (n < 21) return unidades[n];
    if (n < 100) {
      var d = Math.floor(n / 10);
      var r = n % 10;
      return decenas[d] + (r ? " y " + unidades[r] : "");
    }
    if (n < 1000) {
      var c = Math.floor(n / 100);
      var rest = n % 100;
      var cent = c === 1 && rest === 0 ? "cien" : centenas[c] || "";
      return cent + (rest ? " " + numeroMenorDeMil(rest) : "");
    }
    return "";
  }

  var entero = Math.floor(Math.abs(num));
  if (entero === 0) return "cero";
  var partes = [];
  var remainder = entero;
  var unidadesMiles = ["", "mil", "millón", "mil millones"];
  var idx = 0;
  while (remainder > 0) {
    var chunk = remainder % 1000;
    if (chunk) {
      var chunkStr = numeroMenorDeMil(chunk);
      if (idx === 2 && chunk === 1) chunkStr = "un";
      partes.unshift(
        chunkStr + (unidadesMiles[idx] ? " " + unidadesMiles[idx] : ""),
      );
    }
    remainder = Math.floor(remainder / 1000);
    idx++;
  }
  return partes.join(" ").trim().toUpperCase();
}

// ====================================================================================
// GENERADORES DE HTML PARA EL PDF (TABLAS RÍGIDAS CON BORDES EXPLICITOS "border=1")
// Estas tablas evitan que Google Docs desordene los elementos.
// ====================================================================================

function buildFacturaHTML(venta, detalles, empresa, pagos) {
  var empresaNombre = esc(
    empresa.nombre || empresa.comercio || getEmpresaNombreDefault(),
  );
  var rtnEmp = esc(empresa.rtn || "");
  var direccion = esc(empresa.direccion || empresa.direccion_fiscal || "");
  var telefono = esc(empresa.telefono || empresa.telefono_fijo || "");
  var emailEmp = esc(empresa.email || empresa.correo || "");
  var logoSrc = empresa.logoUrl || empresa.logo || "";

  var numFactura = esc(venta.factura || venta.numero || "");
  var cliente = esc(
    venta.cliente || venta.nombre_cliente || "Consumidor Final",
  );
  var rtnCli = esc(venta.rtn_cliente || venta.rtn || "C/F");
  var dirCli = esc(venta.direccion_cliente || "-");

  var fechaDocObj = venta.fecha
    ? new Date(venta.fecha)
    : new Date(venta.created_at || Date.now());
  var fechaDoc = formatFecha(venta.fecha || venta.created_at);
  var horaDoc = esc(
    venta.hora ||
      fechaDocObj.toLocaleTimeString("es-HN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
  );

  var cai = esc(venta.cai || "-");
  var rangoDesde = esc(venta.rango_de || "-");
  var rangoHasta = esc(venta.rango_hasta || "-");
  var fechaLimit = esc(
    venta.fecha_limite_emision || venta.fecha_vencimiento_cai || "-",
  );

  var subGravado = parseFloat(venta.gravado || venta.sub_total_gravado || 0);
  var subExento = parseFloat(venta.exento || venta.sub_total_exento || 0);
  var descuento = parseFloat(venta.descuento || 0);
  var isv15 = parseFloat(venta.isv || venta.impuesto || 0);
  var isv18 = parseFloat(venta.isv_18 || venta.impuesto_18 || 0);
  var total = parseFloat(venta.total || venta.total_factura || 0);

  var efectivo = 0,
    tarjeta = 0,
    transferencia = 0,
    cambio = 0;
  for (var p = 0; p < pagos.length; p++) {
    var met = String(pagos[p].metodo || pagos[p].tipo_pago || "").toLowerCase();
    var monto = parseFloat(pagos[p].monto || pagos[p].valor || 0);
    if (met.indexOf("efectivo") >= 0) efectivo += monto;
    else if (met.indexOf("tarjeta") >= 0) tarjeta += monto;
    else if (met.indexOf("transfer") >= 0) transferencia += monto;
    if (pagos[p].cambio) cambio = parseFloat(pagos[p].cambio);
  }

  var letrasTotal = numeroALetras(total) || "CERO";

  var rowsHtml = "";
  for (var d = 0; d < detalles.length; d++) {
    var det = detalles[d];
    var sku = esc(det.sku || det.codigo || det.producto_id || det.id || "");
    var desc = esc(det.descripcion || det.nombre || det.producto_nombre || "");
    var cant = parseFloat(det.cantidad || det.qty || 0);
    var punit = parseFloat(det.precio_unitario || det.precio || 0);
    var lineTot = cant * punit;
    rowsHtml += `<tr>
      <td align="center">${sku}</td>
      <td>${desc}</td>
      <td align="right">${fmtMoney(punit)}</td>
      <td align="center">${cant}</td>
      <td align="right">${fmtMoney(lineTot)}</td>
    </tr>`;
  }

  var logoHtml = logoSrc
    ? `<img src="${logoSrc}" height="65">`
    : `<span style="font-size:16px;font-weight:bold;color:#004b87;">${empresaNombre}</span>`;

  var isv18Row =
    isv18 > 0
      ? `<tr><td align="right">ISV 18%:</td><td align="right">L ${fmtMoney(isv18)}</td></tr>`
      : "";

  return `
    <html>
      <body style="font-family: Arial, sans-serif; font-size: 11px; color: #000;">
        
        <table width="100%" border="0" cellpadding="2" cellspacing="0">
          <tr>
            <td width="20%" valign="middle" align="center">${logoHtml}</td>
            <td width="55%" valign="top" align="center">
              <span style="font-size: 14px; font-weight: bold; text-transform: uppercase;">${empresaNombre}</span><br>
              <b>R.A.C.P</b><br>
              ${direccion}<br>TEL: ${telefono}<br>EMAIL: ${emailEmp}<br><b>RTN:</b> ${rtnEmp}
            </td>
            <td width="25%" valign="top" align="right">
               <div style="font-size: 9px; margin-bottom: 2px;">Original: Cliente</div>
               <table width="100%" border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse;">
                 <tr><td align="center" bgcolor="#eeeeee"><b>FACTURA</b></td></tr>
                 <tr><td align="center"><b>No. ${numFactura}</b></td></tr>
               </table>
            </td>
          </tr>
        </table>
        
        <br>
        
        <table width="100%" border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse;">
          <tr>
            <td width="65%" valign="top">
              <b>RTN Cliente:</b> ${rtnCli}<br>
              <b>Cliente:</b> ${cliente}<br>
              <b>Dirección:</b> ${dirCli}
            </td>
            <td width="35%" valign="top">
              <b>Fecha:</b> ${fechaDoc}<br>
              <b>Hora:</b> ${horaDoc}
            </td>
          </tr>
        </table>

        <br>

        <table width="100%" border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse;">
          <thead>
            <tr bgcolor="#eeeeee">
              <th width="15%" align="center">Código</th>
              <th width="45%" align="left">Descripción</th>
              <th width="15%" align="right">Precio Unit.</th>
              <th width="10%" align="center">Cant.</th>
              <th width="15%" align="right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <br>

        <table width="100%" border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse;">
          <tr>
            <td width="65%" valign="top">
              <b>*** ${letrasTotal} LEMPIRAS ***</b><br><br>
              <b>CAI:</b> ${cai}<br>
              <b>Rango Autorizado:</b> ${rangoDesde} - ${rangoHasta}<br>
              <b>Fecha Límite Emisión:</b> ${fechaLimit}<br><br>
              <b>LA FACTURA ES BENEFICIO DE TODOS, EXÍJALA</b>
            </td>
            <td width="35%" valign="top" style="padding: 0;">
              <table width="100%" border="0" cellpadding="4" cellspacing="0">
                <tr><td align="right">Sub-Total Gravado:</td><td align="right">L ${fmtMoney(subGravado)}</td></tr>
                <tr><td align="right">Sub-Total Exento:</td><td align="right">L ${fmtMoney(subExento)}</td></tr>
                <tr><td align="right">Descuento:</td><td align="right">L ${fmtMoney(descuento)}</td></tr>
                <tr><td align="right">ISV 15%:</td><td align="right">L ${fmtMoney(isv15)}</td></tr>
                ${isv18Row}
                <tr><td align="right" bgcolor="#eeeeee" style="border-top: 1px solid #000;"><b>TOTAL A PAGAR:</b></td><td align="right" bgcolor="#eeeeee" style="border-top: 1px solid #000;"><b>L ${fmtMoney(total)}</b></td></tr>
              </table>
            </td>
          </tr>
        </table>
        
        <br>

        <table width="100%" border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse;">
          <tr>
            <td align="center">
               <b>MÉTODOS DE PAGO:</b>&nbsp;&nbsp; Efectivo: L ${fmtMoney(efectivo)} &nbsp;|&nbsp; Tarjeta: L ${fmtMoney(tarjeta)} &nbsp;|&nbsp; Transf.: L ${fmtMoney(transferencia)} &nbsp;|&nbsp; <b>Cambio: L ${fmtMoney(cambio)}</b>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

function buildCotizacionHTML(cot, detalles, empresa) {
  var empresaNombre = esc(
    empresa.nombre || empresa.comercio || getEmpresaNombreDefault(),
  );
  var rtnEmp = esc(empresa.rtn || "");
  var direccion = esc(empresa.direccion || empresa.direccion_fiscal || "");
  var telefono = esc(empresa.telefono || empresa.telefono_fijo || "");
  var emailEmp = esc(empresa.email || empresa.correo || "");
  var logoSrc = empresa.logoUrl || empresa.logo || "";

  var numCot = esc(cot.numero || cot.factura || cot.id || "");
  var cliente = esc(cot.cliente || cot.nombre_cliente || "Cliente");
  var rtnCli = esc(cot.rtn_cliente || cot.rtn || "C/F");
  var dirCli = esc(cot.direccion_cliente || "-");

  var fechaDocObj = cot.fecha
    ? new Date(cot.fecha)
    : new Date(cot.created_at || Date.now());
  var fechaDoc = formatFecha(cot.fecha || cot.created_at);
  var horaDoc = esc(
    cot.hora ||
      fechaDocObj.toLocaleTimeString("es-HN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
  );

  var subGravado = parseFloat(cot.gravado || cot.sub_total_gravado || 0);
  var subExento = parseFloat(cot.exento || cot.sub_total_exento || 0);
  var descuento = parseFloat(cot.descuento || 0);
  var isv15 = parseFloat(cot.isv || cot.impuesto || 0);
  var isv18 = parseFloat(cot.isv_18 || cot.impuesto_18 || 0);
  var total = parseFloat(cot.total || cot.total_cotizacion || 0);

  var rowsHtml = "";
  for (var d = 0; d < detalles.length; d++) {
    var det = detalles[d];
    var sku = esc(det.sku || det.codigo || det.producto_id || det.id || "");
    var desc = esc(det.descripcion || det.nombre || det.producto_nombre || "");
    var cant = parseFloat(det.cantidad || det.qty || 0);
    var punit = parseFloat(det.precio_unitario || det.precio || 0);
    var lineTot = cant * punit;
    rowsHtml += `<tr>
      <td align="center">${sku}</td>
      <td>${desc}</td>
      <td align="right">${fmtMoney(punit)}</td>
      <td align="center">${cant}</td>
      <td align="right">${fmtMoney(lineTot)}</td>
    </tr>`;
  }

  var logoHtml = logoSrc
    ? `<img src="${logoSrc}" height="65">`
    : `<span style="font-size:16px;font-weight:bold;color:#004b87;">${empresaNombre}</span>`;

  var isv18Row =
    isv18 > 0
      ? `<tr><td align="right">ISV 18%:</td><td align="right">L ${fmtMoney(isv18)}</td></tr>`
      : "";

  return `
    <html>
      <body style="font-family: Arial, sans-serif; font-size: 11px; color: #000;">
        
        <table width="100%" border="0" cellpadding="2" cellspacing="0">
          <tr>
            <td width="20%" valign="middle" align="center">${logoHtml}</td>
            <td width="55%" valign="top" align="center">
              <span style="font-size: 14px; font-weight: bold; text-transform: uppercase;">${empresaNombre}</span><br>
              <b>R.A.C.P</b><br>
              ${direccion}<br>TEL: ${telefono}<br>EMAIL: ${emailEmp}<br><b>RTN:</b> ${rtnEmp}
            </td>
            <td width="25%" valign="top" align="right">
               <div style="font-size: 9px; margin-bottom: 2px;">Original: Cliente</div>
               <table width="100%" border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse;">
                 <tr><td align="center" bgcolor="#eeeeee"><b>COTIZACIÓN</b></td></tr>
                 <tr><td align="center"><b>No. ${numCot}</b></td></tr>
               </table>
            </td>
          </tr>
        </table>
        
        <br>
        
        <table width="100%" border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse;">
          <tr>
            <td width="65%" valign="top">
              <b>RTN Cliente:</b> ${rtnCli}<br>
              <b>Cliente:</b> ${cliente}<br>
              <b>Dirección:</b> ${dirCli}
            </td>
            <td width="35%" valign="top">
              <b>Fecha:</b> ${fechaDoc}<br>
              <b>Hora:</b> ${horaDoc}
            </td>
          </tr>
        </table>

        <br>

        <table width="100%" border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse;">
          <thead>
            <tr bgcolor="#eeeeee">
              <th width="15%" align="center">Código</th>
              <th width="45%" align="left">Descripción</th>
              <th width="15%" align="right">Precio Unit.</th>
              <th width="10%" align="center">Cant.</th>
              <th width="15%" align="right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <br>

        <table width="100%" border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse;">
          <tr>
            <td width="65%" valign="middle" align="center">
              <b>ESTO NO ES UNA FACTURA.</b><br>
              PRECIOS VÁLIDOS ÚNICAMENTE POR 20 DÍAS.<br><br>
              ¡Gracias por su preferencia!
            </td>
            <td width="35%" valign="top" style="padding: 0;">
              <table width="100%" border="0" cellpadding="4" cellspacing="0">
                <tr><td align="right">Sub-Total Gravado:</td><td align="right">L ${fmtMoney(subGravado)}</td></tr>
                <tr><td align="right">Sub-Total Exento:</td><td align="right">L ${fmtMoney(subExento)}</td></tr>
                <tr><td align="right">Descuento:</td><td align="right">L ${fmtMoney(descuento)}</td></tr>
                <tr><td align="right">ISV 15%:</td><td align="right">L ${fmtMoney(isv15)}</td></tr>
                ${isv18Row}
                <tr><td align="right" bgcolor="#eeeeee" style="border-top: 1px solid #000;"><b>TOTAL COTIZACIÓN:</b></td><td align="right" bgcolor="#eeeeee" style="border-top: 1px solid #000;"><b>L ${fmtMoney(total)}</b></td></tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

// ─── Convertir HTML a PDF via Drive API ──────────────────────────────────────
function htmlToPdfBlob(html, filename) {
  var tmpId = null;
  try {
    var resource = {
      title: "tmp_" + new Date().getTime(),
      mimeType: "application/vnd.google-apps.document",
    };
    var blob = Utilities.newBlob(html, MimeType.HTML);
    var file = Drive.Files.insert(resource, blob, { convert: true });
    tmpId = file.id;

    var exportUrl =
      "https://www.googleapis.com/drive/v2/files/" +
      tmpId +
      "/export?mimeType=application/pdf";
    var resp = UrlFetchApp.fetch(exportUrl, {
      headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true,
    });

    if (resp.getResponseCode() !== 200) return null;
    var pdfBlob = resp.getBlob();
    pdfBlob.setName(filename);
    return pdfBlob;
  } catch (e) {
    Logger.log("htmlToPdfBlob error: " + e);
    return null;
  } finally {
    if (tmpId) {
      try {
        DriveApp.getFileById(tmpId).setTrashed(true);
      } catch (e2) {}
    }
  }
}
