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

    // ── 1. Construir documento: el HTML debe generarlo Google Apps Script
    // usando solo `transactionId`, `facturaNumero` y `type`.
    // NOTA: por seguridad y consistencia NO se aceptará `payload.htmlBody`.
    var builtDoc = buildHtmlFromDB(transactionId, facturaNum, docType);
    if (!builtDoc || !builtDoc.html) {
      return jsonResponse({
        success: false,
        error:
          "No se encontró documento en DB. Enviar únicamente transactionId, facturaNumero y type.",
      });
    }
    var sourceHtml = String(builtDoc.html);

    if (!sourceHtml) {
      return jsonResponse({
        success: false,
        error: "No se pudo construir documento desde DB.",
      });
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
// ─── Image utilities ──────────────────────────────────────────────────────────
function getLogoBase64() {
  try {
    var response = UrlFetchApp.fetch("https://i.imgur.com/IxaflWj.jpeg", {
      muteHttpExceptions: true,
    });
    if (response.getResponseCode() === 200) {
      var blob = response.getBlob();
      var base64 = Utilities.base64Encode(blob.getBytes());
      return "data:image/jpeg;base64," + base64;
    }
  } catch (e) {
    Logger.log("Error fetching logo: " + e);
  }
  return "";
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

  var numFactura = esc(venta.factura || venta.numero || "");
  var cliente = esc(
    venta.cliente || venta.nombre_cliente || "Consumidor Final",
  );
  var identidad = esc(venta.rtn_cliente || venta.rtn || "C/F");
  var direccionCliente = esc(venta.direccion_cliente || "—");

  var hoy = venta.fecha
    ? new Date(venta.fecha)
    : new Date(venta.created_at || Date.now());
  var diaN = String(hoy.getDate()).padStart(2, "0");
  var mesN = String(hoy.getMonth() + 1).padStart(2, "0");
  var anioN = String(hoy.getFullYear());
  var horaStr = esc(
    venta.hora ||
      hoy.toLocaleTimeString("es-HN", { hour: "2-digit", minute: "2-digit" }),
  );

  var Gravado = parseFloat(venta.gravado || venta.sub_total_gravado || 0) || 0;
  var Exento = parseFloat(venta.exento || venta.sub_total_exento || 0) || 0;
  var DSC = parseFloat(venta.descuento || 0) || 0;
  var impuesto = parseFloat(venta.isv || venta.impuesto || 0) || 0;
  var ISV18 = parseFloat(venta.isv_18 || venta.impuesto_18 || 0) || 0;
  var ft = parseFloat(venta.total || venta.total_factura || 0) || 0;

  var pagosObj = pagos || [];
  var Efectivo = 0,
    Tarjeta = 0,
    Transferencia = 0,
    cambio = 0;
  for (var p = 0; p < pagosObj.length; p++) {
    var met = String(
      pagosObj[p].metodo || pagosObj[p].tipo_pago || "",
    ).toLowerCase();
    var monto = parseFloat(pagosObj[p].monto || pagosObj[p].valor || 0);
    if (met.indexOf("efectivo") >= 0) Efectivo += monto;
    else if (met.indexOf("tarjeta") >= 0) Tarjeta += monto;
    else if (met.indexOf("transfer") >= 0) Transferencia += monto;
    if (pagosObj[p].cambio) cambio = parseFloat(pagosObj[p].cambio);
  }

  var letras = numeroALetras(ft || 0) || "CERO";

  var facturaItems = "";
  for (var i = 0; i < detalles.length; i++) {
    var it = detalles[i] || {};
    var desc = esc(
      it.descripcion ||
        it.nombre ||
        (it.producto && (it.producto.nombre || it.producto.descripcion)) ||
        "",
    );
    var cant = Number(it.cantidad || it.qty || 0) || 0;
    var precioBrutoUnit =
      Number(
        it.precio_unitario ||
          it.precio ||
          (it.producto && (it.producto.precio || 0)),
      ) || 0;
    var exento = Boolean(it.exento || (it.producto && it.producto.exento));
    var aplica18 = Boolean(
      it.aplica_impuesto_18 || (it.producto && it.producto.aplica_impuesto_18),
    );
    var mainRate = aplica18
      ? venta.tax18Rate || venta.tax18 || 0
      : venta.taxRate || venta.tax || 0;
    var precioUnitario = precioBrutoUnit;
    if (!exento && mainRate)
      precioUnitario = precioBrutoUnit / (1 + Number(mainRate || 0));
    var subtotalLinea = precioUnitario * cant;
    var sku = esc(
      (it.producto && it.producto.sku) ||
        it.sku ||
        it.codigo ||
        it.producto_id ||
        (it.producto && it.producto.id) ||
        "",
    );
    facturaItems += `<tr>
      <td>${sku}</td>
      <td>${desc}</td>
      <td class="text-right">${fmtMoney(precioUnitario)}</td>
      <td class="text-center">${cant}</td>
      <td class="text-right">${fmtMoney(subtotalLinea)}</td>
    </tr>`;
  }

  var logoBase64 = getLogoBase64();
  var logoHtmlFactura = logoBase64
    ? `<img src="${logoBase64}" alt="Logo" style="max-width:100px; max-height:60px; object-fit:contain;" />`
    : `<span style="font-size: 20px; font-weight: bold; color: #004b87;">${empresaNombre}</span>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Factura ${numFactura}</title>
    <style>
        @page { size: letter portrait; margin: 0.35in 0.45in; }
        * { box-sizing: border-box; }
        html, body { height: 100%; margin: 0; }
        body { font-family: Arial, sans-serif; font-size: 11px; padding: 20px; background-color: #fff; color: #000; }
        .container { max-width: 800px; margin: 0 auto; display: flex; flex-direction: column; min-height: calc(100vh - 40px); }
        .content-wrapper { flex-grow: 1; }
        .top-info-box { border: 1px solid #000; padding: 15px; margin-bottom: 20px; border-radius: 4px; }
        .header-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; border-bottom: 1px dashed #ccc; padding-bottom: 10px; }
        .logo { display: flex; align-items: center; width: 20%; }
        .company-info { width: 45%; padding-left: 10px; font-size: 10px; line-height: 1.3; }
        .company-name { font-weight: bold; font-size: 14px; margin-bottom: 2px; text-transform: uppercase; text-align: center; }
        .contact-info { width: 15%; font-size: 10px; line-height: 1.3; }
        .doc-info { width: 20%; text-align: right; font-size: 10px; }
        .cotizacion-box { border: 2px solid #000; padding: 5px 10px; text-align: center; margin-top: 5px; }
        .items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
        .items-table th { border-top: 1px solid #000; border-bottom: 1px solid #000; text-align: left; padding: 6px 5px; background-color: #f9f9f9; }
        .items-table td { padding: 5px; border-bottom: 1px dashed #ccc; }
        .text-right { text-align: right !important; }
        .text-center { text-align: center !important; }
        .bottom-section { border: 1px solid #000; display: flex; justify-content: space-between; border-radius: 4px; margin-top: 20px; }
        .bottom-left { width: 55%; padding: 10px; font-size: 10px; line-height: 1.3; }
        .bottom-middle { width: 15%; display: flex; align-items: center; justify-content: center; flex-direction: column; padding: 10px; }
        .bottom-right { width: 30%; border-left: 1px solid #000; }
        .totals-table { width: 100%; border-collapse: collapse; height: 100%; font-size: 11px; }
        .totals-table td { padding: 4px 8px; }
        .totals-table tr:last-child { border-top: 1px solid #000; font-weight: bold; font-size: 13px; background-color: #f0f0f0; }
        @media print { body { padding: 0; } .container { min-height: 98vh; height: 98vh; page-break-inside: avoid; } }
    </style>
</head>
<body>

<div class="container">
    <div class="content-wrapper">
        <div class="top-info-box">
            <div class="header-top">
                <div class="logo">${logoHtmlFactura}</div>
                <div class="company-info">
                    <div class="company-name">${empresaNombre}</div>
                    <div class="racp-title">R.A.C.P</div>
                    <div>${direccion}</div>
                    <div>TEL: ${telefono}</div>
                    <div>EMAIL: ${emailEmp}</div>
                </div>
                <div class="contact-info"><div><strong>RTN:</strong><br>${rtnEmp}</div></div>
                <div class="doc-info">
                    <div>Original: Cliente</div>
                    <div class="cotizacion-box">
                        <div class="title">FACTURA</div>
                        <div class="number"><span>No.</span><span>${numFactura}</span></div>
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
            <tbody>${facturaItems}</tbody>
        </table>
    </div>

    <div class="bottom-section">
        <div class="bottom-left">
            <div class="letras">*** ${letras} Lempiras ***</div>
            <div class="cai-box">
                <strong>CAI:</strong> ${esc(venta.cai || venta.CAI || "—")}<br>
                <strong>Rango Autorizado:</strong> ${esc((venta.rango_de || "-") + " - " + (venta.rango_hasta || "-"))}<br>
                <strong>Fecha Límite Emisión:</strong> ${esc(venta.fecha_limite_emision || venta.fecha_vencimiento_cai || "—")}
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

function buildCotizacionHTML(cot, detalles, empresa) {
  var empresaNombre = esc(
    empresa.nombre || empresa.comercio || getEmpresaNombreDefault(),
  );
  var rtnEmp = esc(empresa.rtn || "");
  var direccion = esc(empresa.direccion || empresa.direccion_fiscal || "");
  var telefono = esc(empresa.telefono || empresa.telefono_fijo || "");
  var emailEmp = esc(empresa.email || empresa.correo || "");

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

  var logoBase64 = getLogoBase64();
  var logoHtml = logoBase64
    ? `<img src="${logoBase64}" height="65" style="max-width:110px;height:auto;">`
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

// ─── Convertir HTML a PDF de forma nativa en Apps Script ───────────────────
function htmlToPdfBlob(html, filename) {
  try {
    if (!html) return null;
    var htmlOutput = HtmlService.createHtmlOutput(html).setWidth(1024);
    var pdfBlob = htmlOutput.getAs(MimeType.PDF);
    pdfBlob.setName(filename);
    return pdfBlob;
  } catch (e) {
    Logger.log("htmlToPdfBlob error: " + e);
    return null;
  }
}
