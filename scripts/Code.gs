/**
 * ====================================================================
 * Code.gs – Google Apps Script para envío de facturas/cotizaciones
 * SOLUCIÓN: INTERCEPTOR DE IMAGEN DEL FRONTEND
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
    var code = resp.getResponseCode();
    if (code !== 200) return [];
    return JSON.parse(resp.getContentText()) || [];
  } catch (e) {
    Logger.log("supabaseGet exception: " + e);
    return [];
  }
}

function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({
      status: "ok",
      message: getEmpresaNombreDefault() + " – Email Service activo",
    }),
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
      return jsonResponse({
        success: false,
        error: "JSON inválido: " + parseErr,
      });
    }

    var to = payload.to || "";
    var subject = payload.subject || "Documento – " + getEmpresaNombreDefault();
    var facturaNumero = payload.facturaNumero || payload.facturaNum || "";
    var docType = payload.type || "factura";

    if (!to || to.indexOf("@") === -1) {
      return jsonResponse({
        success: false,
        error: "Correo destinatario inválido: " + to,
      });
    }

    // ── 1. Recibimos el HTML que manda tu aplicación (el que sí tiene los datos)
    var htmlBody = payload.htmlBody || "";

    // 🔥 EL TRUCO DEFINITIVO: INTERCEPTAMOS LA IMAGEN 🔥
    // Si tu frontend mandó HTML, buscamos cualquier etiqueta <img y le forzamos un ancho pequeño
    if (htmlBody) {
      // Inyectamos un estilo global de seguridad
      var cssSeguridad =
        "<style>img { max-width: 120px !important; max-height: 100px !important; width: 120px !important; }</style>";
      htmlBody = cssSeguridad + htmlBody;

      // Modificamos directamente la etiqueta de la imagen para que Drive no la pueda ignorar
      htmlBody = htmlBody.replace(/<img/gi, '<img width="120" height="auto" ');

      // ── ELIMINAR SEGUNDA COPIA: asegurar que el correo/PDF solo muestre UNA factura ──
      // El separador (línea de corte) y el segundo bloque .copia se eliminan si existen
      htmlBody = stripDuplicateCopia(htmlBody);
    }

    // ── 2. Solo si el frontend no mandó HTML, reconstruimos (Fallback)
    if (!htmlBody && facturaNumero) {
      try {
        htmlBody = buildHtmlFromDB(facturaNumero, docType);
      } catch (dbErr) {
        Logger.log("Error buildHtmlFromDB: " + dbErr);
      }
    }

    if (!htmlBody) {
      htmlBody = "<p>Adjunto encontrará su documento.</p>";
    }

    var plainText =
      "Documento adjunto. Por favor abra el archivo PDF adjunto para ver el documento.";

    // ── 3. HTML limpio para el cuerpo del correo (sin base64 para evitar limite de Gmail)
    var htmlBodyEmail = stripBase64Images(htmlBody);

    // ── 4. Generar PDF con el HTML completo (con imágenes base64)
    var emailOpts = {
      htmlBody: htmlBodyEmail,
      name: getEmpresaNombreDefault(),
    };
    var pdfLabel =
      facturaNumero || (docType === "cotizacion" ? "Cotizacion" : "Factura");
    var pdfName =
      (docType === "cotizacion" ? "Cotizacion_" : "Factura_") +
      pdfLabel +
      ".pdf";

    try {
      var pdfBlob = htmlToPdfBlob(htmlBody, pdfName);
      if (pdfBlob) emailOpts.attachments = [pdfBlob];
    } catch (pdfErr) {
      Logger.log("PDF adjunto error: " + pdfErr);
    }

    // ── 5. Enviar correo con fallback si el htmlBody sigue siendo muy grande
    try {
      GmailApp.sendEmail(to, subject, plainText, emailOpts);
    } catch (mailErr) {
      Logger.log("Gmail error (HTML muy grande): " + mailErr);
      var fallbackOpts = { name: getEmpresaNombreDefault() };
      if (emailOpts.attachments)
        fallbackOpts.attachments = emailOpts.attachments;
      GmailApp.sendEmail(to, subject, plainText, fallbackOpts);
    }

    return jsonResponse({
      success: true,
      to: to,
      subject: subject,
      hasPdf: !!(emailOpts.attachments && emailOpts.attachments.length),
    });
  } catch (err) {
    Logger.log("Error en doPost: " + err);
    return jsonResponse({ success: false, error: String(err) });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

// ─── Eliminar imágenes base64 para reducir tamaño del correo ───────────────────
function stripBase64Images(html) {
  if (!html) return html;
  return html.replace(
    /src=["']data:[^"']{1,2000000}["']/gi,
    'src="" alt="Logo"',
  );
}

// ─── Eliminar separador y segunda copia de la factura (garantiza solo 1 copia) ─
function stripDuplicateCopia(html) {
  if (!html) return html;
  // Eliminar el separador de tijera (<hr class="separador">) y todo lo que venga después
  // hasta el cierre del div.page-wrap, dejando solo la primera copia
  var sepIdx = html.search(/<hr[^>]*class=["'][^"']*separador[^"']*["'][^>]*>/i);
  if (sepIdx === -1) {
    // También intentar sin class (por si viene en diferente orden)
    sepIdx = html.search(/<hr[^>]*separador[^>]*>/i);
  }
  if (sepIdx !== -1) {
    // Buscar el cierre del contenedor principal después del separador
    var closeWrap = html.indexOf("</div>", sepIdx);
    if (closeWrap !== -1) {
      // Reemplazar desde el separador hasta (sin incluir) el cierre del contenedor
      html = html.substring(0, sepIdx) + html.substring(closeWrap);
    }
  }
  return html;
}

// ─── Lógica de negocio (Fallback original intocable) ──────────────────────────
function buildHtmlFromDB(facturaNumero, docType) {
  var empresas = supabaseGet("empresa", "select=*&limit=1");
  var empresa = empresas && empresas.length > 0 ? empresas[0] : {};

  if (docType === "cotizacion") {
    var cots = supabaseGet(
      "cotizaciones",
      "numero=eq." + encodeURIComponent(facturaNumero) + "&select=*&limit=1",
    );
    if (!cots || cots.length === 0)
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
      return buildCotizacionHTML(cot, cotDet || [], empresa);
    }
    return "";
  }

  var ventas = supabaseGet(
    "ventas",
    "factura=eq." + encodeURIComponent(facturaNumero) + "&select=*&limit=1",
  );
  if (!ventas || ventas.length === 0) return "";
  var venta = ventas[0];
  var detalles = supabaseGet(
    "ventas_detalle",
    "venta_id=eq." + encodeURIComponent(venta.id) + "&select=*&order=id.asc",
  );
  var pagos = supabaseGet(
    "pagos",
    "factura=eq." + encodeURIComponent(facturaNumero) + "&select=*",
  );
  return buildFacturaHTML(venta, detalles || [], empresa, pagos || []);
}

// ─── Helpers (intocables) ──────────────────────────────────────────────────────
function formatFecha(isoStr) {
  if (!isoStr) return "—";
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

function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Funciones originales HTML como respaldo...
function buildFacturaHTML(venta, detalles, empresa, pagos) {
  return "<html><body><h1>FACTURA</h1></body></html>"; // Fallback mínimo, se usa el de tu app
}
function buildCotizacionHTML(venta, detalles, empresa) {
  return "<html><body><h1>COTIZACIÓN</h1></body></html>"; // Fallback mínimo, se usa el de tu app
}

// ─── Convertir HTML a PDF ──────────────────────────────────────────────────────
function htmlToPdfBlob(html, filename) {
  var tmpId = null;
  try {
    var resource = {
      title: "temp_" + new Date().getTime(),
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
