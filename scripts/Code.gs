/**
 * ====================================================================
 * Code.gs – Google Apps Script para envío de facturas/cotizaciones
 * PDF CON TABLAS RÍGIDAS (NO SE DEFORMAN) Y CORREO NOTIFICADOR LIMPIO
 * ====================================================================
 */

// ─── Credenciales desde Script Properties ──────────────────────────────────────
function getSupabaseUrl() {
  return PropertiesService.getScriptProperties().getProperty("SUPABASE_URL") || "";
}
function getSupabaseKey() {
  return PropertiesService.getScriptProperties().getProperty("SUPABASE_KEY") || "";
}
function getEmpresaNombreDefault() {
  return PropertiesService.getScriptProperties().getProperty("EMPRESA_NOMBRE") || "SOLUCIONES TECNICAS CASTRO";
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

    var builtDoc = buildHtmlFromDB(transactionId, facturaNum, docType);
    if (!builtDoc || !builtDoc.html) {
      return jsonResponse({
        success: false,
        error: "No se encontró documento en DB. Enviar únicamente transactionId, facturaNumero y type.",
      });
    }
    
    var pdfHtml = String(builtDoc.html);

    builtDoc.html = pdfHtml;
    if (!builtDoc.cliente) builtDoc.cliente = payload.cliente || payload.nombre_cliente || "Cliente";

    var pdfLabel = builtDoc.label || facturaNum || (docType === "cotizacion" ? "Cotizacion" : "Factura");
    var pdfName = (docType === "cotizacion" ? "Cotizacion_" : "Factura_") + pdfLabel + ".pdf";
    var pdfBlob = null;
    try {
      pdfBlob = htmlToPdfBlob(builtDoc.html, pdfName);
    } catch (pdfErr) {
      Logger.log("PDF error: " + pdfErr);
    }

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

    var plainText = "Estimado cliente, adjunto encontrara su " + tipoDocEmail + ". Por favor abra el archivo PDF adjunto.";
    var subject = tipoDocEmail + " No. " + pdfLabel + " – " + getEmpresaNombreDefault();

    var emailOpts = {
      htmlBody: htmlNotificacionEmail,
      name: getEmpresaNombreDefault(),
    };
    if (pdfBlob) emailOpts.attachments = [pdfBlob];

    GmailApp.sendEmail(to, subject, plainText, emailOpts);
    return jsonResponse({ success: true, to: to, hasPdf: !!pdfBlob });
  } catch (err) {
    return jsonResponse({ success: false, error: String(err) });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ─── Construir HTML desde la DB ───────────────────────────────────────────────
function buildHtmlFromDB(transactionId, facturaNumero, docType) {
  var empresas = supabaseGet("empresa", "select=*&limit=1");
  var empresa = empresas && empresas.length > 0 ? empresas[0] : {};

  if (docType === "cotizacion") {
    var cots = [];
    var selectQuery = "&select=*,clientes(*)&limit=1";

    if (transactionId)
      cots = supabaseGet("cotizaciones", "id=eq." + encodeURIComponent(transactionId) + selectQuery);
    if ((!cots || cots.length === 0) && facturaNumero)
      cots = supabaseGet("cotizaciones", "numero_cotizacion=eq." + encodeURIComponent(facturaNumero) + selectQuery);

    if (cots && cots.length > 0) {
      var cot = cots[0];
      var cotDet = supabaseGet("cotizaciones_detalle", "cotizacion_id=eq." + encodeURIComponent(cot.id) + "&select=*&order=id.asc");
      cotDet = enrichDetallesWithSku(cotDet || []);
      
      var cotLabel = cot.numero_cotizacion || cot.id || "Cotizacion";
      var clienteInfo = cot.clientes || {}; 
      
      return {
        html: buildCotizacionHTML(cot, cotDet || [], empresa),
        label: String(cotLabel),
        cliente: clienteInfo.nombre || "Cliente",
      };
    }
    return null;
  }

  var ventas = [];
  if (transactionId)
    ventas = supabaseGet("ventas", "id=eq." + encodeURIComponent(transactionId) + "&select=*&limit=1");
  if ((!ventas || ventas.length === 0) && facturaNumero)
    ventas = supabaseGet("ventas", "factura=eq." + encodeURIComponent(facturaNumero) + "&select=*&limit=1");

  if (ventas && ventas.length > 0) {
    var venta = ventas[0];
    var detalles = supabaseGet("ventas_detalle", "venta_id=eq." + encodeURIComponent(venta.id) + "&select=*&order=id.asc");
    detalles = enrichDetallesWithSku(detalles || []);
    var pagos = supabaseGet("pagos", "venta_id=eq." + encodeURIComponent(venta.id) + "&select=*");
    if (!pagos || pagos.length === 0)
      pagos = supabaseGet("pagos", "factura=eq." + encodeURIComponent(venta.factura || facturaNumero || "") + "&select=*");

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
    var pid = detalles[i] && detalles[i].producto_id != null ? String(detalles[i].producto_id) : "";
    if (pid) ids.push(pid);
  }
  if (ids.length === 0) return detalles;

  var uniq = [];
  var seen = {};
  for (var j = 0; j < ids.length; j++) {
    var key = ids[j];
    if (!seen[key]) { seen[key] = true; uniq.push(key); }
  }

  var idList = uniq.map(function (id) { return String(id).replace(/"/g, ""); }).join(",");
  
  // 💡 CORRECCIÓN PRINCIPAL: Se pide sku y codigo_barras (en vez de "codigo" que daba error)
  var invRows = supabaseGet("inventario", "id=in.(" + idList + ")&select=id,sku,codigo_barras");

  var skuMap = {};
  for (var r = 0; r < (invRows || []).length; r++) {
    var row = invRows[r] || {};
    skuMap[String(row.id)] = row.sku || row.codigo_barras || "";
  }

  for (var d = 0; d < detalles.length; d++) {
    var det = detalles[d] || {};
    if (!det.sku && det.producto_id != null) {
      var skuFromInv = skuMap[String(det.producto_id)] || "";
      if (skuFromInv) det.sku = skuFromInv;
    }
  }
  return detalles;
}

function getLogoBase64() {
  try {
    var response = UrlFetchApp.fetch("https://i.imgur.com/26cgOZE.jpeg", { muteHttpExceptions: true });
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

function formatFecha(isoStr) {
  if (!isoStr) return "-";
  try {
    var d = new Date(isoStr);
    return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
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
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function numeroALetras(num) {
  if (!isFinite(num)) return "";
  var unidades = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciseis", "diecisiete", "dieciocho", "diecinueve", "veinte"];
  var decenas = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
  var centenas = ["", "cien", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

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
      partes.unshift(chunkStr + (unidadesMiles[idx] ? " " + unidadesMiles[idx] : ""));
    }
    remainder = Math.floor(remainder / 1000);
    idx++;
  }
  return partes.join(" ").trim().toUpperCase();
}

// ====================================================================================
// GENERADORES DE HTML PARA EL PDF
// ====================================================================================

function buildFacturaHTML(venta, detalles, empresa, pagos) {
  var empresaNombre = esc(empresa.nombre || empresa.comercio || getEmpresaNombreDefault());
  var rtnEmp = esc(empresa.rtn || "");
  var direccion = esc(empresa.direccion || empresa.direccion_fiscal || "");
  var telefono = esc(empresa.telefono || empresa.telefono_fijo || "");
  var emailEmp = esc(empresa.email || empresa.correo || "");

  var numFactura = esc(venta.factura || venta.numero || "");
  var cliente = esc(venta.cliente || venta.nombre_cliente || "Consumidor Final");
  var rtnCli = esc(venta.rtn_cliente || venta.rtn || "C/F");
  var dirCli = esc(venta.direccion_cliente || "—");

  var fechaDocObj = venta.fecha ? new Date(venta.fecha) : new Date(venta.created_at || Date.now());
  var fechaDoc = formatFecha(venta.fecha || venta.created_at);
  var horaDoc = esc(venta.hora || fechaDocObj.toLocaleTimeString("es-HN", { hour: "2-digit", minute: "2-digit" }));

  var cai = esc(venta.cai || "—");
  var rangoDesde = esc(venta.rango_de || "—");
  var rangoHasta = esc(venta.rango_hasta || "—");
  var fechaLimit = esc(venta.fecha_limite_emision || venta.fecha_vencimiento_cai || "—");

  var subGravado = parseFloat(venta.gravado || venta.sub_total_gravado || 0);
  var subExento = parseFloat(venta.exento || venta.sub_total_exento || 0);
  var descuento = parseFloat(venta.descuento || 0);
  var isv15 = parseFloat(venta.isv || venta.impuesto || 0);
  var isv18 = parseFloat(venta.isv_18 || venta.impuesto_18 || 0);
  var total = parseFloat(venta.total || venta.total_factura || 0);

  var efectivo = 0, tarjeta = 0, transferencia = 0, cambio = 0;
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
  var descuentoTotalCalculado = 0;
  for (var d = 0; d < detalles.length; d++) {
    var det = detalles[d];
    
    // Extraemos el SKU ya mapeado correctamente (jamás pondrá el ID)
    var skuVal = det.sku || det.codigo_barras || "";
    var sku = esc(skuVal); 
    
    var desc = esc(det.descripcion || det.nombre || det.producto_nombre || "");
    var cant = parseFloat(det.cantidad || det.qty || 0);
    var punit = parseFloat(det.precio_unitario || det.precio || 0);
    var pctDesc = parseFloat(det.descuento || 0); // porcentaje de descuento
    var descMonto = punit * (pctDesc / 100) * cant; // monto del descuento por línea
    var lineTot = (punit - punit * (pctDesc / 100)) * cant; // total después de descuento
    descuentoTotalCalculado += descMonto;
    
    rowsHtml += `<tr>
      <td>${sku}</td>
      <td>${desc}</td>
      <td class="text-right">${fmtMoney(punit)}</td>
      <td class="text-center">${cant}</td>
      <td class="text-right">${fmtMoney(descMonto)}</td>
      <td class="text-right">${fmtMoney(lineTot)}</td>
    </tr>`;
  }
  // Usar el descuento total calculado desde detalles
  var descuentoTotal = descuentoTotalCalculado > 0 ? descuentoTotalCalculado : descuento;

  var logoBase64 = getLogoBase64();
  var logoHtml = logoBase64
    ? `<img src="${logoBase64}" style="max-width:180px; max-height:120px; height:auto; object-fit:contain; display:block;" />`
    : `<span style="font-size:20px; font-weight:bold; color:#004b87;">${empresaNombre}</span>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Factura ${numFactura}</title>
    <style>
        @page { size: letter portrait; margin: 0.35in 0.45in; }
        * { box-sizing: border-box; }
        html, body { height: 100%; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 11px; background-color: #fff; color: #000; }
        
        .top-info-box { border: 1px solid #000; padding: 15px; margin-bottom: 20px; border-radius: 4px; }
        .company-name { font-weight: bold; font-size: 14px; margin-bottom: 2px; text-transform: uppercase; text-align: center; }
        .racp-title { font-weight: bold; font-size: 11px; letter-spacing: 1px; text-align: center; margin-bottom: 5px; }
        .cotizacion-box { border: 2px solid #000; padding: 5px 10px; text-align: center; margin-top: 5px; }
        .cotizacion-box .title { font-size: 14px; font-weight: bold; margin-bottom: 3px; letter-spacing: 1px; }
        
        .label { font-weight: bold; width: 70px; }
        .items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
        .items-table th { border-top: 1px solid #000; border-bottom: 1px solid #000; text-align: left; padding: 6px 5px; background-color: #f9f9f9; }
        .items-table td { padding: 5px; border-bottom: 1px dashed #ccc; }
        .text-right { text-align: right !important; }
        .text-center { text-align: center !important; }
        
        .totals-table { width: 100%; border-collapse: collapse; height: 100%; font-size: 11px; }
        .totals-table td { padding: 4px 8px; }
        .totals-table tr:last-child { border-top: 1px solid #000; font-weight: bold; font-size: 13px; background-color: #f0f0f0; }
        .cai-box { margin-top: 10px; font-size: 9px; line-height: 1.4; color: #333; }
        .letras { margin-top: 5px; font-weight: bold; font-size: 11px; }
    </style>
</head>
<body>
<table style="width: 100%; height: 98vh; border-collapse: collapse; margin: 0; padding: 0;">
  <tr>
    <td valign="top" style="height: 100%;">
      <div class="top-info-box">
          <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 10px; border-bottom: 1px dashed #ccc; padding-bottom: 10px;">
              <tr>
                  <td width="20%" valign="top">${logoHtml}</td>
                  <td width="45%" valign="top" style="padding-left: 10px; font-size: 10px; line-height: 1.3;">
                      <div class="company-name">${empresaNombre}</div>
                      <div class="racp-title">R.A.C.P</div>
                      <div>${direccion}</div>
                      <div>TEL: ${telefono}</div>
                      <div>EMAIL: ${emailEmp}</div>
                  </td>
                  <td width="15%" valign="top" style="font-size: 10px; line-height: 1.3;">
                      <strong>RTN:</strong><br>${rtnEmp}
                  </td>
                  <td width="20%" valign="top" align="right">
                      <div style="font-size: 10px; margin-bottom: 2px;">Original: Cliente</div>
                      <div class="cotizacion-box">
                          <div class="title">FACTURA</div>
                          <table width="100%" cellpadding="0" cellspacing="0" style="font-weight: bold; font-size: 13px; border-top: 1px solid #000; padding-top: 2px;">
                              <tr><td align="left">No.</td><td align="right">${numFactura}</td></tr>
                          </table>
                      </div>
                  </td>
              </tr>
          </table>
          <table width="100%" border="0" cellpadding="0" cellspacing="0">
              <tr>
                  <td width="65%" valign="top">
                      <table style="font-size: 11px;" cellpadding="2" cellspacing="0">
                          <tr><td class="label">RTN:</td><td>${rtnCli}</td></tr>
                          <tr><td class="label">Cliente:</td><td><strong>${cliente}</strong></td></tr>
                          <tr><td class="label">Dirección:</td><td>${dirCli}</td></tr>
                      </table>
                  </td>
                  <td width="35%" valign="top" align="right">
                      <table style="font-size: 11px;" cellpadding="2" cellspacing="0">
                          <tr><td class="label" align="left">Fecha:</td><td align="right">${fechaDoc}</td></tr>
                          <tr><td class="label" align="left">Hora:</td><td align="right">${horaDoc}</td></tr>
                      </table>
                  </td>
              </tr>
          </table>
      </div>

      <table class="items-table">
          <thead>
              <tr>
                  <th style="width: 16%;">Código / SKU</th>
                  <th style="width: 44%;">Descripción</th>
                  <th class="text-right" style="width: 12%;">Precio Unit.</th>
                  <th class="text-center" style="width: 8%;">Cant.</th>
                  <th class="text-right" style="width: 10%;">Descuento</th>
                  <th class="text-right" style="width: 10%;">Total</th>
              </tr>
          </thead>
          <tbody>
              ${rowsHtml}
          </tbody>
      </table>
    </td>
  </tr>
  <tr>
    <td valign="bottom" style="height: 1%;">
      <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border: 1px solid #000; border-radius: 4px; margin-top: 20px;">
          <tr>
              <td width="55%" valign="top" style="padding: 10px; font-size: 10px; line-height: 1.3;">
                  <div class="letras">*** ${letrasTotal} Lempiras ***</div>
                  <div class="cai-box">
                      <strong>CAI:</strong> ${cai}<br>
                      <strong>Rango Autorizado:</strong> ${rangoDesde} a ${rangoHasta}<br>
                      <strong>Fecha Límite Emisión:</strong> ${fechaLimit}
                  </div>
                  <p style="margin-top: 10px; font-weight: bold;">LA FACTURA ES BENEFICIO DE TODOS, EXÍJALA</p>
                  <p style="color: #555; font-size: 9px; margin-bottom: 0;">¡Gracias por su preferencia!</p>
              </td>
              
              <td width="15%" valign="middle" align="center" style="padding: 10px;">
                  <p style="text-align:center; font-size: 9px; font-weight:bold; margin-top:0;">MÉTODOS<br>DE PAGO</p>
                  <div style="font-size: 8px; text-align: center; margin-top: 5px;">
                      Efectivo: L ${fmtMoney(efectivo)}<br>
                      Tarjeta: L ${fmtMoney(tarjeta)}<br>
                      Transf.: L ${fmtMoney(transferencia)}<br>
                      <br><strong>Cambio: L ${fmtMoney(cambio)}</strong>
                  </div>
              </td>

              <td width="30%" valign="top" style="border-left: 1px solid #000;">
                  <table class="totals-table">
                      <tr><td>SUB-TOTAL GRAVADO:</td><td>L</td><td class="text-right">${fmtMoney(subGravado)}</td></tr>
                      <tr><td>SUB-TOTAL EXENTO:</td><td>L</td><td class="text-right">${fmtMoney(subExento)}</td></tr>
                      <tr><td>DESCUENTO:</td><td>L</td><td class="text-right">${fmtMoney(descuentoTotal)}</td></tr>
                      <tr><td>ISV 15%:</td><td>L</td><td class="text-right">${fmtMoney(isv15)}</td></tr>
                      ${isv18 > 0 ? `<tr><td>ISV 18%:</td><td>L</td><td class="text-right">${fmtMoney(isv18)}</td></tr>` : ''}
                      <tr><td>TOTAL A PAGAR:</td><td>L</td><td class="text-right">${fmtMoney(total)}</td></tr>
                  </table>
              </td>
          </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function buildCotizacionHTML(cot, detalles, empresa) {
  var empresaNombre = esc(empresa.nombre || empresa.comercio || getEmpresaNombreDefault());
  var rtnEmp = esc(empresa.rtn || "");
  var direccion = esc(empresa.direccion || empresa.direccion_fiscal || "");
  var telefono = esc(empresa.telefono || empresa.telefono_fijo || "");
  var emailEmp = esc(empresa.email || empresa.correo || "");
  
  var clienteData = cot.clientes || {};
  var numCot = esc(cot.numero_cotizacion || cot.id || "");
  var cliente = esc(clienteData.nombre || "Cliente");
  var rtnCli = esc(clienteData.rtn || "C/F");
  var dirCli = esc(cot.direccion_cliente || "—");

  var fechaDocObj = cot.fecha_cotizacion ? new Date(cot.fecha_cotizacion) : new Date();
  var fechaDoc = formatFecha(cot.fecha_cotizacion);

  var subGravado = parseFloat(cot.subtotal || 0);
  var subExento = parseFloat(cot.exento || 0); 
  var descuento = parseFloat(cot.descuento || 0);
  var isv15 = parseFloat(cot.impuesto || 0);
  var isv18 = parseFloat(cot.isv_18 || 0);
  var total = parseFloat(cot.total || 0);

  var rowsHtml = "";
  var descuentoTotalCalculado = 0;
  for (var d = 0; d < detalles.length; d++) {
    var det = detalles[d];
    
    // Extraemos el SKU ya mapeado
    var skuVal = det.sku || det.codigo_barras || "";
    var sku = esc(skuVal);

    var desc = esc(det.descripcion || det.nombre || det.producto_nombre || "");
    var cant = parseFloat(det.cantidad || det.qty || 0);
    var punit = parseFloat(det.precio_unitario || det.precio || 0);
    var pctDesc = parseFloat(det.descuento || 0); // porcentaje de descuento
    var descMonto = punit * (pctDesc / 100) * cant; // monto del descuento
    var lineTot = (punit - punit * (pctDesc / 100)) * cant; // total después de descuento
    descuentoTotalCalculado += descMonto;
    
    rowsHtml += `<tr>
      <td>${sku}</td>
      <td>${desc}</td>
      <td class="text-right">${fmtMoney(punit)}</td>
      <td class="text-center">${cant}</td>
      <td class="text-right">${fmtMoney(descMonto)}</td>
      <td class="text-right">${fmtMoney(lineTot)}</td>
    </tr>`;
  }
  // Usar el descuento total calculado en lugar del que viene de cotizaciones
  var descuentoTotal = descuentoTotalCalculado > 0 ? descuentoTotalCalculado : descuento;

  var logoBase64 = getLogoBase64();
  var logoHtml = logoBase64
    ? `<img src="${logoBase64}" style="max-width:180px; max-height:120px; height:auto; object-fit:contain; display:block;" />`
    : `<span style="font-size:20px; font-weight:bold; color:#004b87;">${empresaNombre}</span>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Cotización ${numCot}</title>
    <style>
        @page { size: letter portrait; margin: 0.35in 0.45in; }
        * { box-sizing: border-box; }
        html, body { height: 100%; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 11px; background-color: #fff; color: #000; }
        
        .top-info-box { border: 1px solid #000; padding: 15px; margin-bottom: 20px; border-radius: 4px; }
        .company-name { font-weight: bold; font-size: 14px; margin-bottom: 2px; text-transform: uppercase; text-align: center; }
        .racp-title { font-weight: bold; font-size: 11px; letter-spacing: 1px; text-align: center; margin-bottom: 5px; }
        .cotizacion-box { border: 2px solid #000; padding: 5px 10px; text-align: center; margin-top: 5px; }
        .cotizacion-box .title { font-size: 14px; font-weight: bold; margin-bottom: 3px; letter-spacing: 1px; }
        
        .label { font-weight: bold; width: 70px; }
        .items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
        .items-table th { border-top: 1px solid #000; border-bottom: 1px solid #000; text-align: left; padding: 6px 5px; background-color: #f9f9f9; }
        .items-table td { padding: 5px; border-bottom: 1px dashed #ccc; }
        .text-right { text-align: right !important; }
        .text-center { text-align: center !important; }
        
        .totals-table { width: 100%; border-collapse: collapse; height: 100%; font-size: 11px; }
        .totals-table td { padding: 4px 8px; }
        .totals-table tr:last-child { border-top: 1px solid #000; font-weight: bold; font-size: 13px; background-color: #f0f0f0; }
    </style>
</head>
<body>
<table style="width: 100%; height: 98vh; border-collapse: collapse; margin: 0; padding: 0;">
  <tr>
    <td valign="top" style="height: 100%;">
      <div class="top-info-box">
          <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 10px; border-bottom: 1px dashed #ccc; padding-bottom: 10px;">
              <tr>
                  <td width="20%" valign="top">${logoHtml}</td>
                  <td width="45%" valign="top" style="padding-left: 10px; font-size: 10px; line-height: 1.3;">
                      <div class="company-name">${empresaNombre}</div>
                      <div class="racp-title">R.A.C.P</div>
                      <div>${direccion}</div>
                      <div>TEL: ${telefono}</div>
                      <div>EMAIL: ${emailEmp}</div>
                  </td>
                  <td width="15%" valign="top" style="font-size: 10px; line-height: 1.3;">
                      <strong>RTN:</strong><br>${rtnEmp}
                  </td>
                  <td width="20%" valign="top" align="right">
                      <div class="cotizacion-box">
                          <div class="title">COTIZACIÓN</div>
                          <table width="100%" cellpadding="0" cellspacing="0" style="font-weight: bold; font-size: 13px; border-top: 1px solid #000; padding-top: 2px;">
                              <tr><td align="left">No.</td><td align="right">${numCot}</td></tr>
                          </table>
                      </div>
                  </td>
              </tr>
          </table>
          <table width="100%" border="0" cellpadding="0" cellspacing="0">
              <tr>
                  <td width="65%" valign="top">
                      <table style="font-size: 11px;" cellpadding="2" cellspacing="0">
                          <tr><td class="label">RTN:</td><td>${rtnCli}</td></tr>
                          <tr><td class="label">Cliente:</td><td><strong>${cliente}</strong></td></tr>
                          <tr><td class="label">Dirección:</td><td>${dirCli}</td></tr>
                      </table>
                  </td>
                  <td width="35%" valign="top" align="right">
                      <table style="font-size: 11px;" cellpadding="2" cellspacing="0">
                          <tr><td class="label" align="left">Fecha:</td><td align="right">${fechaDoc}</td></tr>
                      </table>
                  </td>
              </tr>
          </table>
      </div>

      <table class="items-table">
          <thead>
              <tr>
                  <th style="width: 16%;">Código / SKU</th>
                  <th style="width: 44%;">Descripción</th>
                  <th class="text-right" style="width: 12%;">Precio Unit.</th>
                  <th class="text-center" style="width: 8%;">Cant.</th>
                  <th class="text-right" style="width: 10%;">Descuento</th>
                  <th class="text-right" style="width: 10%;">Total</th>
              </tr>
          </thead>
          <tbody>
              ${rowsHtml}
          </tbody>
      </table>
    </td>
  </tr>
  <tr>
    <td valign="bottom" style="height: 1%;">
      <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border: 1px solid #000; border-radius: 4px; margin-top: 20px;">
          <tr>
              <td width="60%" valign="top" style="padding: 10px; font-size: 10px; line-height: 1.3;">
                  <p style="margin-top: 0;"><strong>ESTO NO ES FACTURA.</strong></p>
                  <p>PRECIOS VÁLIDOS UNICAMENTE POR 20 DÍAS.</p>
              </td>
              <td width="40%" valign="top" style="border-left: 1px solid #000;">
                  <table class="totals-table">
                      <tr><td>SUB-TOTAL GRAVADO:</td><td>L</td><td class="text-right">${fmtMoney(subGravado)}</td></tr>
                      <tr><td>SUB-TOTAL EXENTO:</td><td>L</td><td class="text-right">${fmtMoney(subExento)}</td></tr>
                      <tr><td>DESCUENTO:</td><td>L</td><td class="text-right">${fmtMoney(descuentoTotal)}</td></tr>
                      <tr><td>ISV 15%:</td><td>L</td><td class="text-right">${fmtMoney(isv15)}</td></tr>
                      ${isv18 > 0 ? `<tr><td>ISV 18%:</td><td>L</td><td class="text-right">${fmtMoney(isv18)}</td></tr>` : ''}
                      <tr><td>TOTAL A PAGAR:</td><td>L</td><td class="text-right">${fmtMoney(total)}</td></tr>
                  </table>
              </td>
          </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
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