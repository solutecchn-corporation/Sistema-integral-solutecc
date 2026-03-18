/**
 * ====================================================================
 *  Code.gs – Google Apps Script para envío de facturas/cotizaciones
 *            con consulta directa a Supabase
 * ====================================================================
 *
 * INSTRUCCIONES DE DESPLIEGUE:
 *  1. Abre https://script.google.com y crea un nuevo proyecto.
 *  2. Pega este código en Code.gs.
 *  3. Ve a "Configuración del proyecto" → "Propiedades de script" y agrega:
 *       SUPABASE_URL   = https://XXXX.supabase.co
 *       SUPABASE_KEY   = (tu anon/public key de Supabase)
 *       EMPRESA_NOMBRE = SOLUCIONES TECNICAS CASTRO   (opcional, se lee de DB)
 *  4. Implementar → Nueva implementación → Aplicación web.
 *     "Ejecutar como": Tu cuenta | "Acceso": Cualquier persona.
 *  5. Copia la URL y ponla en .env: VITE_GAS_EMAIL_URL=https://...
 *
 * FLUJO:
 *  - El frontend envía solo { to, subject, facturaNumero, type }.
 *  - GAS consulta Supabase (ventas, ventas_detalle, empresa, pagos).
 *  - GAS construye el HTML de la factura y envía el correo.
 *  - Si no viene facturaNumero, se acepta htmlBody como fallback.
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
    if (code !== 200) {
      Logger.log("supabaseGet error " + code + ": " + resp.getContentText());
      return [];
    }
    return JSON.parse(resp.getContentText()) || [];
  } catch (e) {
    Logger.log("supabaseGet exception: " + e);
    return [];
  }
}

// ─── GET: health-check ─────────────────────────────────────────────────────────
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
    var htmlBody = "";

    if (!to || to.indexOf("@") === -1) {
      return jsonResponse({
        success: false,
        error: "Correo destinatario inválido: " + to,
      });
    }

    // ── Intentar construir HTML desde la base de datos ──────────────────────────
    if (facturaNumero) {
      try {
        htmlBody = buildHtmlFromDB(facturaNumero, docType);
      } catch (dbErr) {
        Logger.log("Error buildHtmlFromDB: " + dbErr);
        htmlBody = "";
      }
    }

    // ── Fallback: usar htmlBody enviado por el frontend ─────────────────────────
    if (!htmlBody) {
      htmlBody = payload.htmlBody || "<p>Adjunto encontrará su documento.</p>";
    }

    var plainText =
      "Documento de " +
      getEmpresaNombreDefault() +
      ".\n" +
      "Por favor, utilice un cliente de correo que soporte HTML para ver este documento.";

    GmailApp.sendEmail(to, subject, plainText, {
      htmlBody: htmlBody,
      name: getEmpresaNombreDefault(),
    });

    return jsonResponse({
      success: true,
      to: to,
      subject: subject,
      source: facturaNumero ? "db" : "html",
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

// ─── Construir HTML consultando Supabase ────────────────────────────────────────
function buildHtmlFromDB(facturaNumero, docType) {
  // 3. Datos de empresa (siempre necesarios)
  var empresas = supabaseGet("empresa", "select=*&limit=1");
  var empresa = empresas && empresas.length > 0 ? empresas[0] : {};

  // ── Cotización ──────────────────────────────────────────────────────────────
  if (docType === "cotizacion") {
    // Intentar tabla cotizaciones primero, luego ventas con tipo=cotizacion
    var cots = supabaseGet(
      "cotizaciones",
      "numero=eq." + encodeURIComponent(facturaNumero) + "&select=*&limit=1",
    );
    if (!cots || cots.length === 0) {
      cots = supabaseGet(
        "cotizaciones",
        "factura=eq." + encodeURIComponent(facturaNumero) + "&select=*&limit=1",
      );
    }
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
    // Fallback: buscar en ventas
    var ventasCot = supabaseGet(
      "ventas",
      "factura=eq." + encodeURIComponent(facturaNumero) + "&select=*&limit=1",
    );
    if (ventasCot && ventasCot.length > 0) {
      var vCot = ventasCot[0];
      var dCot = supabaseGet(
        "ventas_detalle",
        "venta_id=eq." + encodeURIComponent(vCot.id) + "&select=*&order=id.asc",
      );
      return buildCotizacionHTML(vCot, dCot || [], empresa);
    }
    Logger.log("buildHtmlFromDB: cotización no encontrada: " + facturaNumero);
    return "";
  }

  // ── Factura ─────────────────────────────────────────────────────────────────
  var ventas = supabaseGet(
    "ventas",
    "factura=eq." + encodeURIComponent(facturaNumero) + "&select=*&limit=1",
  );
  if (!ventas || ventas.length === 0) {
    Logger.log(
      "buildHtmlFromDB: no se encontró venta con factura=" + facturaNumero,
    );
    return "";
  }
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

// ─── Número a letras (español) ─────────────────────────────────────────────────
function numeroALetras(num) {
  var unidades = [
    "",
    "UNO",
    "DOS",
    "TRES",
    "CUATRO",
    "CINCO",
    "SEIS",
    "SIETE",
    "OCHO",
    "NUEVE",
    "DIEZ",
    "ONCE",
    "DOCE",
    "TRECE",
    "CATORCE",
    "QUINCE",
    "DIECISÉIS",
    "DIECISIETE",
    "DIECIOCHO",
    "DIECINUEVE",
  ];
  var decenas = [
    "",
    "DIEZ",
    "VEINTE",
    "TREINTA",
    "CUARENTA",
    "CINCUENTA",
    "SESENTA",
    "SETENTA",
    "OCHENTA",
    "NOVENTA",
  ];
  var centenas = [
    "",
    "CIENTO",
    "DOSCIENTOS",
    "TRESCIENTOS",
    "CUATROCIENTOS",
    "QUINIENTOS",
    "SEISCIENTOS",
    "SETECIENTOS",
    "OCHOCIENTOS",
    "NOVECIENTOS",
  ];

  num = Math.round(num * 100) / 100;
  var entero = Math.floor(num);
  var decimal = Math.round((num - entero) * 100);

  function convertirMenorMil(n) {
    if (n === 0) return "";
    if (n === 100) return "CIEN";
    if (n < 20) return unidades[n];
    if (n < 100) {
      var d = Math.floor(n / 10);
      var u = n % 10;
      return decenas[d] + (u > 0 ? " Y " + unidades[u] : "");
    }
    var c = Math.floor(n / 100);
    var resto = n % 100;
    return centenas[c] + (resto > 0 ? " " + convertirMenorMil(resto) : "");
  }

  function convertir(n) {
    if (n === 0) return "CERO";
    var resultado = "";
    var millones = Math.floor(n / 1000000);
    n %= 1000000;
    var miles = Math.floor(n / 1000);
    n %= 1000;
    if (millones > 0)
      resultado +=
        millones === 1
          ? "UN MILLÓN "
          : convertirMenorMil(millones) + " MILLONES ";
    if (miles > 0)
      resultado += miles === 1 ? "MIL " : convertirMenorMil(miles) + " MIL ";
    if (n > 0) resultado += convertirMenorMil(n);
    return resultado.trim();
  }

  var letras = convertir(entero);
  var cents =
    decimal > 0
      ? " CON " + (decimal < 10 ? "0" + decimal : decimal) + "/100"
      : " CON 00/100";
  return letras + cents;
}

// ─── Formatear fecha DD/MM/AAAA ────────────────────────────────────────────────
function formatFecha(isoStr) {
  if (!isoStr) return "—";
  try {
    var d = new Date(isoStr);
    var dd = String(d.getDate()).padStart(2, "0");
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var yyyy = d.getFullYear();
    return dd + "/" + mm + "/" + yyyy;
  } catch (e) {
    return String(isoStr).substring(0, 10);
  }
}

// ─── Construir HTML de factura (2 copias: original + emisor) ──────────────────
function buildFacturaHTML(venta, detalles, empresa, pagos) {
  var empNombre = empresa.nombre || getEmpresaNombreDefault();
  var empRtn = empresa.rtn || "";
  var empDir = empresa.direccion || "";
  var empTel = empresa.telefono || "";
  var empEmail = empresa.email || "";
  var empLogo = empresa.logo || empresa.logoUrl || "";

  var cliente = venta.nombre_cliente || "Consumidor Final";
  var rtnCliente = venta.rtn || "";
  var dirCliente = venta.direccion_cliente || "";
  var factura = venta.factura || "";
  var cai = venta.cai || "";
  var rangoDesde = venta.rango_desde || "";
  var rangoHasta = venta.rango_hasta || "";
  var fechaLim = venta.fecha_limite_emision || "";
  var identificador = venta.identificador || "";
  var rangoStr = identificador
    ? identificador + rangoDesde + " – " + identificador + rangoHasta
    : rangoDesde && rangoHasta
      ? rangoDesde + " – " + rangoHasta
      : rangoDesde || rangoHasta || "—";

  var fechaVenta = formatFecha(venta.fecha_venta);
  var partes = fechaVenta.split("/");
  var diaN = partes[0] || "";
  var mesN = partes[1] || "";
  var anioN = partes[2] || "";

  var total = parseFloat(venta.total || 0);
  var isv15 = parseFloat(venta.isv_15 || 0);
  var isv18 = parseFloat(venta.isv_18 || 0);
  var subGravado = parseFloat(venta.sub_gravado || 0);
  var subExento = parseFloat(venta.sub_exento || 0);
  var subExonerado = parseFloat(venta.sub_exonerado || 0);
  var descuento = 0;
  for (var i = 0; i < detalles.length; i++) {
    descuento += parseFloat(detalles[i].descuento || 0);
  }
  var cambio = parseFloat(venta.cambio || 0);

  // Pagos
  var efectivo = 0,
    tarjeta = 0,
    transferencia = 0;
  for (var j = 0; j < pagos.length; j++) {
    var tipo = String(pagos[j].tipo || "").toLowerCase();
    var monto = parseFloat(pagos[j].monto || 0);
    if (tipo === "efectivo") efectivo += monto;
    else if (tipo === "tarjeta") tarjeta += monto;
    else if (tipo === "transferencia") transferencia += monto;
  }
  if (
    efectivo === 0 &&
    tarjeta === 0 &&
    transferencia === 0 &&
    venta.tipo_pago
  ) {
    var tp = String(venta.tipo_pago).toLowerCase();
    if (tp.indexOf("tarjeta") >= 0) tarjeta = total;
    else if (tp.indexOf("transferencia") >= 0) transferencia = total;
    else efectivo = total;
  }

  var letras = "*** " + numeroALetras(total) + " Lempiras ***";

  // Filas de productos
  var filasProductos = "";
  for (var k = 0; k < detalles.length; k++) {
    var d = detalles[k];
    var desc = d.descripcion || d.nombre || "";
    var cant = parseFloat(d.cantidad || 0);
    var pu = parseFloat(d.precio_unitario || 0);
    var tot = parseFloat(d.total || cant * pu);
    filasProductos +=
      "<tr>" +
      "<td>" +
      esc(desc) +
      "</td>" +
      "<td style='text-align:center'>" +
      cant +
      "</td>" +
      "<td style='text-align:right'>L " +
      pu.toFixed(2) +
      "</td>" +
      "<td style='text-align:right'>L " +
      tot.toFixed(2) +
      "</td>" +
      "</tr>";
  }
  if (!filasProductos) {
    filasProductos =
      "<tr><td colspan='4' style='text-align:center;color:#888;'>Sin detalles</td></tr>";
  }

  // Logo
  var logoHtml = empLogo
    ? "<img src='" +
      esc(empLogo) +
      "' alt='Logo' style='max-width:100%;max-height:80px;object-fit:contain;display:block;margin:auto;'/>"
    : "<div style='height:60px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#999;border:1px dashed #aaa;'>LOGO</div>";

  function buildCopia(labelCopia) {
    return (
      "<div style='width:100%;page-break-inside:avoid;padding:4px 0;'>" +
      // Encabezado 3 columnas
      "<table style='width:100%;border-collapse:collapse;margin-top:3px;'>" +
      "<colgroup><col style='width:25%'/><col style='width:45%'/><col style='width:30%'/></colgroup>" +
      "<tr>" +
      "<td style='border:1px solid #ccc;padding:3px 4px;vertical-align:middle;text-align:center;'>" +
      logoHtml +
      "</td>" +
      "<td style='border:1px solid #ccc;padding:3px 6px;vertical-align:top;'>" +
      "<div style='text-align:center;font-size:14px;font-weight:bold;margin-bottom:2px;'>" +
      esc(empNombre) +
      "</div>" +
      "<div style='text-align:center;font-size:9px;font-weight:bold;margin-bottom:2px;'>R.A.C.P</div>" +
      "<div style='font-size:8px;line-height:1.3;'><b>R.T.N:</b> " +
      esc(empRtn) +
      "</div>" +
      "<div style='font-size:8px;line-height:1.3;'><b>Dirección:</b> " +
      esc(empDir) +
      "</div>" +
      "<div style='font-size:8px;line-height:1.3;'><b>Teléfono:</b> " +
      esc(empTel) +
      "</div>" +
      "<div style='font-size:8px;line-height:1.3;'><b>Email:</b> " +
      esc(empEmail) +
      "</div>" +
      "</td>" +
      "<td style='border:1px solid #ccc;padding:3px 6px;vertical-align:middle;text-align:center;'>" +
      "<div style='font-size:11px;font-weight:bold;'>Factura No. " +
      esc(factura) +
      "</div>" +
      "<div style='font-size:10px;margin-top:8px;font-weight:bold;'>Fecha: " +
      diaN +
      "/" +
      mesN +
      "/" +
      anioN +
      "</div>" +
      "<div style='font-size:7px;word-break:break-all;margin-top:6px;'>CAI: " +
      esc(cai || "—") +
      "</div>" +
      "</td>" +
      "</tr></table>" +
      // Cliente
      "<table style='width:100%;border-collapse:collapse;margin-top:3px;'>" +
      "<tr><td style='border:1px solid #ccc;padding:3px 4px;font-size:11px;'><b>Cliente:</b> " +
      esc(cliente) +
      "</td></tr>" +
      "<tr><td style='border:1px solid #ccc;padding:3px 4px;font-size:11px;'><b>RTN:</b> " +
      esc(rtnCliente || "—") +
      "</td></tr>" +
      "<tr><td style='border:1px solid #ccc;padding:3px 4px;font-size:11px;'><b>Dirección:</b> " +
      esc(dirCliente || "—") +
      "</td></tr>" +
      "</table>" +
      // Productos
      "<table style='width:100%;border-collapse:collapse;margin-top:3px;'>" +
      "<colgroup><col style='width:55%'/><col style='width:15%'/><col style='width:15%'/><col style='width:15%'/></colgroup>" +
      "<tr style='background:#f0f4f8;'>" +
      "<th style='border:1px solid #ccc;padding:3px 4px;font-size:9px;font-weight:bold;text-align:center;'>Descripción</th>" +
      "<th style='border:1px solid #ccc;padding:3px 4px;font-size:9px;font-weight:bold;text-align:center;'>Cant.</th>" +
      "<th style='border:1px solid #ccc;padding:3px 4px;font-size:9px;font-weight:bold;text-align:center;'>Precio Unit.</th>" +
      "<th style='border:1px solid #ccc;padding:3px 4px;font-size:9px;font-weight:bold;text-align:center;'>Total</th>" +
      "</tr>" +
      filasProductos +
      "</table>" +
      // Totales
      "<table style='width:100%;border-collapse:collapse;margin-top:3px;font-size:9px;'>" +
      "<colgroup><col style='width:30%'/><col style='width:20%'/><col style='width:30%'/><col style='width:20%'/></colgroup>" +
      "<tr>" +
      "<td style='border:1px solid #ccc;padding:2px 4px;font-weight:bold;'>Descuento:</td>" +
      "<td style='border:1px solid #ccc;padding:2px 4px;'>L " +
      descuento.toFixed(2) +
      "</td>" +
      "<td style='border:1px solid #ccc;padding:2px 4px;font-weight:bold;'>Sub Total Gravado:</td>" +
      "<td style='border:1px solid #ccc;padding:2px 4px;'>L " +
      subGravado.toFixed(2) +
      "</td>" +
      "</tr><tr>" +
      "<td style='border:1px solid #ccc;padding:2px 4px;font-weight:bold;'>Sub Total Exento:</td>" +
      "<td style='border:1px solid #ccc;padding:2px 4px;'>L " +
      subExento.toFixed(2) +
      "</td>" +
      "<td style='border:1px solid #ccc;padding:2px 4px;font-weight:bold;'>Sub Total Exonerado:</td>" +
      "<td style='border:1px solid #ccc;padding:2px 4px;'>L " +
      subExonerado.toFixed(2) +
      "</td>" +
      "</tr><tr>" +
      "<td style='border:1px solid #ccc;padding:2px 4px;font-weight:bold;'>ISV 15%:</td>" +
      "<td style='border:1px solid #ccc;padding:2px 4px;'>L " +
      isv15.toFixed(2) +
      "</td>" +
      "<td style='border:1px solid #ccc;padding:2px 4px;font-weight:bold;'>ISV 18%:</td>" +
      "<td style='border:1px solid #ccc;padding:2px 4px;'>L " +
      isv18.toFixed(2) +
      "</td>" +
      "</tr><tr>" +
      "<td colspan='4' style='border:1px solid #ccc;padding:5px 6px;text-align:right;font-size:11px;font-weight:bold;'>TOTAL FACTURA: L " +
      total.toFixed(2) +
      "</td>" +
      "</tr></table>" +
      // Pagos
      "<table style='width:100%;border-collapse:collapse;margin-top:3px;font-size:9px;'>" +
      "<tr>" +
      "<td style='border:1px solid #ccc;padding:2px 4px;text-align:center;font-weight:bold;'>Efectivo: L " +
      efectivo.toFixed(2) +
      "</td>" +
      "<td style='border:1px solid #ccc;padding:2px 4px;text-align:center;font-weight:bold;'>Tarjeta: L " +
      tarjeta.toFixed(2) +
      "</td>" +
      "<td style='border:1px solid #ccc;padding:2px 4px;text-align:center;font-weight:bold;'>Transferencia: L " +
      transferencia.toFixed(2) +
      "</td>" +
      "<td style='border:1px solid #ccc;padding:2px 4px;text-align:center;font-weight:bold;'>Cambio: L " +
      cambio.toFixed(2) +
      "</td>" +
      "</tr></table>" +
      // Letras
      "<table style='width:100%;border-collapse:collapse;margin-top:3px;'>" +
      "<tr><td style='border:1px solid #ccc;padding:4px 6px;font-size:14px;font-weight:bold;text-align:center;'>" +
      esc(letras) +
      "</td></tr>" +
      "</table>" +
      // CAI footer
      "<table style='width:100%;border-collapse:collapse;margin-top:3px;font-size:8px;'>" +
      "<tr><td style='border:1px solid #ccc;padding:2px 4px;'><b>CAI:</b> " +
      esc(cai || "—") +
      "</td></tr>" +
      "<tr><td style='border:1px solid #ccc;padding:2px 4px;'><b>Rango autorizado:</b> " +
      esc(rangoStr) +
      "</td></tr>" +
      "<tr><td style='border:1px solid #ccc;padding:2px 4px;'><b>Fecha límite de emisión:</b> " +
      esc(fechaLim || "—") +
      "</td></tr>" +
      "</table>" +
      // Gracias + copia
      "<table style='width:100%;border-collapse:collapse;margin-top:3px;border:none;'>" +
      "<tr><td style='border:none;text-align:center;padding-top:4px;'>" +
      "<div style='font-weight:bold;font-size:12px;'>¡Gracias por su compra!</div>" +
      "<div style='font-weight:bold;font-size:13px;margin-top:2px;'>LA FACTURA ES BENEFICIO DE TODOS, EXÍJALA</div>" +
      "<div style='font-size:7px;color:#666;margin-top:3px;'>" +
      esc(labelCopia) +
      "</div>" +
      "</td></tr></table>" +
      "</div>"
    );
  }

  return (
    "<!DOCTYPE html><html lang='es'><head><meta charset='UTF-8'/>" +
    "<title>Factura " +
    esc(factura) +
    "</title>" +
    "<style>" +
    "@page{size:8.5in 11in;margin:0.3in;}" +
    "*{box-sizing:border-box;margin:0;padding:0;}" +
    "body{font-family:Arial,Helvetica,sans-serif;font-size:9px;color:#000;background:#fff;}" +
    "table{width:100%;border-collapse:collapse;}" +
    "td,th{border:1px solid #ccc;padding:3px 4px;vertical-align:middle;font-size:9px;}" +
    ".sep{border:none;border-top:1.5px dashed #888;margin:8px 0;}" +
    "@media print{body{margin:0;}}" +
    "</style></head><body>" +
    "<div style='width:100%;'>" +
    buildCopia("ORIGINAL: Cliente") +
    "<hr class='sep'/>" +
    buildCopia("COPIA: Emisor") +
    "</div></body></html>"
  );
}

// ─── Construir HTML de cotización (formato actual) ───────────────────────────
function buildCotizacionHTML(venta, detalles, empresa) {
  var empNombre = empresa.nombre || getEmpresaNombreDefault();
  var empRtn = empresa.rtn || "";
  var empDir = empresa.direccion || "";
  var empTel = empresa.telefono || "";
  var empEmail = empresa.email || "";
  var empLogo = empresa.logo || empresa.logoUrl || "";

  var cliente = venta.nombre_cliente || venta.cliente || "Consumidor Final";
  var rtnCliente = venta.rtn || venta.rtn_cliente || "";
  var numero = venta.numero || venta.factura || "";
  var dirCliente = venta.direccion_cliente || "";

  var total = parseFloat(venta.total || 0);
  var subGravado = parseFloat(venta.sub_gravado || venta.subtotal || 0);
  var subExento = parseFloat(venta.sub_exento || 0);
  var subExon = parseFloat(venta.sub_exonerado || 0);
  var isv15 = parseFloat(venta.isv_15 || 0);
  var isv18 = parseFloat(venta.isv_18 || 0);
  var descuento = 0;
  for (var i = 0; i < detalles.length; i++) {
    descuento += parseFloat(detalles[i].descuento || 0);
  }

  var fechaVenta = formatFecha(venta.fecha_venta || venta.created_at || "");
  var partes = fechaVenta.split("/");
  var diaN = partes[0] || "";
  var mesN = partes[1] || "";
  var anioN = partes[2] || "";

  // Filas de productos
  var filas = "";
  for (var k = 0; k < detalles.length; k++) {
    var d = detalles[k];
    var desc = d.descripcion || d.nombre || "";
    var cant = parseFloat(d.cantidad || 0);
    var pu = parseFloat(d.precio_unitario || 0);
    var tot = parseFloat(d.total || cant * pu);
    filas +=
      "<tr>" +
      "<td style='height:52px;vertical-align:middle;font-size:16px;font-weight:700;border:1px solid #9b9b9b;padding:14px 12px;'>" +
      esc(desc) +
      "</td>" +
      "<td style='height:52px;vertical-align:middle;font-size:16px;font-weight:700;border:1px solid #9b9b9b;padding:14px 12px;text-align:right;'>" +
      cant +
      "</td>" +
      "<td style='height:52px;vertical-align:middle;font-size:16px;font-weight:700;border:1px solid #9b9b9b;padding:14px 12px;text-align:right;'>L " +
      pu.toFixed(2) +
      "</td>" +
      "<td style='height:52px;vertical-align:middle;font-size:16px;font-weight:700;border:1px solid #9b9b9b;padding:14px 12px;text-align:right;'>L " +
      tot.toFixed(2) +
      "</td>" +
      "</tr>";
  }
  if (!filas) {
    filas =
      "<tr><td colspan='4' style='padding:20px;text-align:center;font-size:14px;color:#888;'>Sin detalles</td></tr>";
  }

  // Logo
  var logoHtmlCot = empLogo
    ? "<img src='" +
      esc(empLogo) +
      "' alt='Logo' style='max-width:100%;max-height:110px;object-fit:contain;display:block;margin:auto;'/>"
    : "<div style='height:114px;background:#000;display:flex;align-items:center;justify-content:center;color:#46b6ff;font-size:26px;font-weight:700;letter-spacing:1px;text-align:center;'>" +
      "<div>" +
      esc(empNombre) +
      "<br/><small style='font-size:12px;color:#cfcfcf;'>" +
      esc(empDir) +
      "</small></div></div>";

  return (
    "<!DOCTYPE html><html lang='es'><head><meta charset='UTF-8'/>" +
    "<meta name='viewport' content='width=device-width, initial-scale=1.0'/>" +
    "<title>Cotización " +
    esc(numero) +
    "</title>" +
    "<style>" +
    "@page{size:letter portrait;margin:0.35in 0.45in;}" +
    "*{box-sizing:border-box;margin:0;padding:0;}" +
    ":root{--border:#9b9b9b;}" +
    "body{font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#111;background:#fff;}" +
    "table{width:100%;border-collapse:collapse;table-layout:fixed;}" +
    "td,th{border:1px solid var(--border);padding:14px 12px;vertical-align:top;font-size:16px;}" +
    ".top td{height:148px;}" +
    ".grand-total{text-align:right;font-size:18px;font-weight:900;padding:16px 14px;}" +
    "@media print{body{margin:0;}}" +
    "</style></head><body>" +
    "<div style='width:100%;'>" +
    // Header 3 columnas (logo | empresa | cotización)
    "<table class='top'><colgroup>" +
    "<col style='width:23%'/><col style='width:39%'/><col style='width:38%'/>" +
    "</colgroup><tr>" +
    "<td style='vertical-align:middle;'>" +
    logoHtmlCot +
    "</td>" +
    "<td style='vertical-align:top;'>" +
    "<div style='font-size:24px;font-weight:bold;margin-bottom:10px;'>" +
    esc(empNombre) +
    "</div>" +
    "<div style='font-size:18px;font-weight:bold;line-height:1.8;'><b>Dirección:</b> " +
    esc(empDir) +
    "</div>" +
    "<div style='font-size:18px;font-weight:bold;line-height:1.8;'><b>Teléfono:</b> " +
    esc(empTel) +
    "</div>" +
    "<div style='font-size:18px;font-weight:bold;line-height:1.8;'><b>Email:</b> " +
    esc(empEmail) +
    "</div>" +
    "<div style='font-size:18px;font-weight:bold;line-height:1.8;'><b>RTN:</b> " +
    esc(empRtn) +
    "</div>" +
    "</td>" +
    "<td style='vertical-align:top;'>" +
    "<div style='text-align:center;font-size:26px;font-weight:bold;margin-top:8px;line-height:1.25;'>COTIZACIÓN<br/>No. " +
    esc(numero) +
    "</div>" +
    "<div style='font-size:18px;font-weight:bold;margin-top:10px;'>Fecha: " +
    diaN +
    "/" +
    mesN +
    "/" +
    anioN +
    "</div>" +
    "</td>" +
    "</tr></table>" +
    // Cliente
    "<table style='margin-top:8px;'>" +
    "<tr><td style='height:48px;vertical-align:middle;font-size:17px;font-weight:700;'><b>Cliente:</b> " +
    esc(cliente) +
    "</td></tr>" +
    "<tr><td style='height:48px;vertical-align:middle;font-size:17px;font-weight:700;'><b>RTN Cliente:</b> " +
    esc(rtnCliente || "—") +
    "</td></tr>" +
    "<tr><td style='height:48px;vertical-align:middle;font-size:17px;font-weight:700;'><b>Dirección:</b> " +
    esc(dirCliente || "—") +
    "</td></tr>" +
    "</table>" +
    // Productos
    "<table style='margin-top:8px;'>" +
    "<colgroup><col style='width:62%'/><col style='width:12%'/><col style='width:12%'/><col style='width:14%'/></colgroup>" +
    "<tr>" +
    "<th style='text-align:center;font-size:16px;font-weight:800;vertical-align:middle;height:46px;'>Descripción</th>" +
    "<th style='text-align:center;font-size:16px;font-weight:800;vertical-align:middle;height:46px;'>Cant.</th>" +
    "<th style='text-align:center;font-size:16px;font-weight:800;vertical-align:middle;height:46px;'>Precio Unit.</th>" +
    "<th style='text-align:center;font-size:16px;font-weight:800;vertical-align:middle;height:46px;'>Total</th>" +
    "</tr>" +
    filas +
    "</table>" +
    // Totales
    "<table style='margin-top:8px;'>" +
    "<colgroup><col style='width:30%'/><col style='width:20%'/><col style='width:30%'/><col style='width:20%'/></colgroup>" +
    "<tr>" +
    "<td style='height:48px;vertical-align:middle;font-size:16px;font-weight:700;'><b>Descuento:</b></td>" +
    "<td style='height:48px;vertical-align:middle;font-size:16px;font-weight:700;text-align:right;'>L " +
    descuento.toFixed(2) +
    "</td>" +
    "<td style='height:48px;vertical-align:middle;font-size:16px;font-weight:700;'><b>Sub Total Gravado:</b></td>" +
    "<td style='height:48px;vertical-align:middle;font-size:16px;font-weight:700;text-align:right;'>L " +
    subGravado.toFixed(2) +
    "</td>" +
    "</tr><tr>" +
    "<td style='height:48px;vertical-align:middle;font-size:16px;font-weight:700;'><b>Sub Total Exento:</b></td>" +
    "<td style='height:48px;vertical-align:middle;font-size:16px;font-weight:700;text-align:right;'>L " +
    subExento.toFixed(2) +
    "</td>" +
    "<td style='height:48px;vertical-align:middle;font-size:16px;font-weight:700;'><b>Sub Total Exonerado:</b></td>" +
    "<td style='height:48px;vertical-align:middle;font-size:16px;font-weight:700;text-align:right;'>L " +
    subExon.toFixed(2) +
    "</td>" +
    "</tr><tr>" +
    "<td style='height:48px;vertical-align:middle;font-size:16px;font-weight:700;'><b>ISV 15%:</b></td>" +
    "<td style='height:48px;vertical-align:middle;font-size:16px;font-weight:700;text-align:right;'>L " +
    isv15.toFixed(2) +
    "</td>" +
    "<td style='height:48px;vertical-align:middle;font-size:16px;font-weight:700;'><b>ISV 18%:</b></td>" +
    "<td style='height:48px;vertical-align:middle;font-size:16px;font-weight:700;text-align:right;'>L " +
    isv18.toFixed(2) +
    "</td>" +
    "</tr><tr>" +
    "<td colspan='4' class='grand-total'>TOTAL COTIZACIÓN: L " +
    total.toFixed(2) +
    "</td>" +
    "</tr></table>" +
    // Footer
    "<table style='margin-top:8px;'>" +
    "<tr><td style='text-align:center;padding:14px 20px 12px;'>" +
    "<div style='font-size:18px;font-weight:900;'>Precios válidos por 20 días</div>" +
    "<div style='font-size:18px;font-weight:900;margin-top:4px;'>ESTO NO ES UNA FACTURA</div>" +
    "<div style='margin-top:6px;font-size:15px;font-weight:700;color:#4a4a4a;'>¡Gracias por su preferencia! — Cotización sujeta a cambios sin previo aviso</div>" +
    "</td></tr></table>" +
    "</div></body></html>"
  );
}

// ─── Escapar HTML ──────────────────────────────────────────────────────────────
function esc(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
