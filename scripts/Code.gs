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
  return PropertiesService.getScriptProperties().getProperty('SUPABASE_URL') || '';
}
function getSupabaseKey() {
  return PropertiesService.getScriptProperties().getProperty('SUPABASE_KEY') || '';
}
function getEmpresaNombreDefault() {
  return PropertiesService.getScriptProperties().getProperty('EMPRESA_NOMBRE') || 'SOLUCIONES TECNICAS CASTRO';
}

// ─── Helper: consulta REST de Supabase ─────────────────────────────────────────
function supabaseGet(table, queryString) {
  var url = getSupabaseUrl() + '/rest/v1/' + table + '?' + queryString;
  var key = getSupabaseKey();
  try {
    var resp = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers: {
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Accept': 'application/json',
      },
      muteHttpExceptions: true,
    });
    var code = resp.getResponseCode();
    if (code !== 200) {
      Logger.log('supabaseGet error ' + code + ': ' + resp.getContentText());
      return [];
    }
    return JSON.parse(resp.getContentText()) || [];
  } catch (e) {
    Logger.log('supabaseGet exception: ' + e);
    return [];
  }
}

// ─── GET: health-check ─────────────────────────────────────────────────────────
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', message: getEmpresaNombreDefault() + ' – Email Service activo' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── POST: enviar correo ───────────────────────────────────────────────────────
function doPost(e) {
  try {
    var raw = e.postData && e.postData.contents ? e.postData.contents : '{}';
    var payload;
    try { payload = JSON.parse(raw); }
    catch (parseErr) {
      return jsonResponse({ success: false, error: 'JSON inválido: ' + parseErr });
    }

    var to            = payload.to      || '';
    var subject       = payload.subject || 'Documento – ' + getEmpresaNombreDefault();
    var facturaNumero = payload.facturaNumero || payload.facturaNum || '';
    var docType       = payload.type || 'factura';
    var htmlBody      = '';

    if (!to || to.indexOf('@') === -1) {
      return jsonResponse({ success: false, error: 'Correo destinatario inválido: ' + to });
    }

    // ── Intentar construir HTML desde la base de datos ──────────────────────────
    if (facturaNumero) {
      try {
        htmlBody = buildHtmlFromDB(facturaNumero, docType);
      } catch (dbErr) {
        Logger.log('Error buildHtmlFromDB: ' + dbErr);
        htmlBody = '';
      }
    }

    // ── Fallback: usar htmlBody enviado por el frontend ─────────────────────────
    if (!htmlBody) {
      htmlBody = payload.htmlBody || '<p>Adjunto encontrará su documento.</p>';
    }

    var plainText = 'Documento de ' + getEmpresaNombreDefault() + '.\n'
                  + 'Por favor, utilice un cliente de correo que soporte HTML para ver este documento.';

    GmailApp.sendEmail(to, subject, plainText, {
      htmlBody: htmlBody,
      name: getEmpresaNombreDefault(),
    });

    return jsonResponse({ success: true, to: to, subject: subject, source: facturaNumero ? 'db' : 'html' });

  } catch (err) {
    Logger.log('Error en doPost: ' + err);
    return jsonResponse({ success: false, error: String(err) });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ─── Construir HTML de factura consultando Supabase ────────────────────────────
function buildHtmlFromDB(facturaNumero, docType) {
  // 1. Obtener la venta por número de factura
  var ventas = supabaseGet('ventas', 'factura=eq.' + encodeURIComponent(facturaNumero) + '&select=*&limit=1');
  if (!ventas || ventas.length === 0) {
    Logger.log('buildHtmlFromDB: no se encontró venta con factura=' + facturaNumero);
    return '';
  }
  var venta = ventas[0];

  // 2. Detalles de la venta (productos)
  var detalles = supabaseGet('ventas_detalle', 'venta_id=eq.' + encodeURIComponent(venta.id) + '&select=*&order=id.asc');

  // 3. Datos de empresa
  var empresas = supabaseGet('empresa', 'select=*&limit=1');
  var empresa = empresas && empresas.length > 0 ? empresas[0] : {};

  // 4. Pagos registrados para esta factura
  var pagos = supabaseGet('pagos', 'factura=eq.' + encodeURIComponent(facturaNumero) + '&select=*');

  return buildFacturaHTML(venta, detalles || [], empresa, pagos || []);
}

// ─── Número a letras (español) ─────────────────────────────────────────────────
function numeroALetras(num) {
  var unidades = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
                  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS',
                  'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
  var decenas  = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA',
                  'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  var centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
                  'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

  num = Math.round(num * 100) / 100;
  var entero  = Math.floor(num);
  var decimal = Math.round((num - entero) * 100);

  function convertirMenorMil(n) {
    if (n === 0)  return '';
    if (n === 100) return 'CIEN';
    if (n < 20)   return unidades[n];
    if (n < 100) {
      var d = Math.floor(n / 10);
      var u = n % 10;
      return decenas[d] + (u > 0 ? ' Y ' + unidades[u] : '');
    }
    var c = Math.floor(n / 100);
    var resto = n % 100;
    return centenas[c] + (resto > 0 ? ' ' + convertirMenorMil(resto) : '');
  }

  function convertir(n) {
    if (n === 0) return 'CERO';
    var resultado = '';
    var millones = Math.floor(n / 1000000);
    n %= 1000000;
    var miles = Math.floor(n / 1000);
    n %= 1000;
    if (millones > 0) resultado += (millones === 1 ? 'UN MILLÓN ' : convertirMenorMil(millones) + ' MILLONES ');
    if (miles > 0)    resultado += (miles === 1    ? 'MIL '       : convertirMenorMil(miles)    + ' MIL ');
    if (n > 0)        resultado += convertirMenorMil(n);
    return resultado.trim();
  }

  var letras = convertir(entero);
  var cents  = decimal > 0 ? ' CON ' + (decimal < 10 ? '0' + decimal : decimal) + '/100' : ' CON 00/100';
  return letras + cents;
}

// ─── Formatear fecha DD/MM/AAAA ────────────────────────────────────────────────
function formatFecha(isoStr) {
  if (!isoStr) return '—';
  try {
    var d = new Date(isoStr);
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var yyyy = d.getFullYear();
    return dd + '/' + mm + '/' + yyyy;
  } catch (e) { return String(isoStr).substring(0, 10); }
}

// ─── Construir HTML de factura ─────────────────────────────────────────────────
function buildFacturaHTML(venta, detalles, empresa, pagos) {
  var empNombre  = empresa.nombre    || getEmpresaNombreDefault();
  var empRtn     = empresa.rtn       || '';
  var empDir     = empresa.direccion || '';
  var empTel     = empresa.telefono  || '';
  var empEmail   = empresa.email     || '';
  var empLogo    = empresa.logo      || '';

  var cliente    = venta.nombre_cliente || 'Consumidor Final';
  var rtnCliente = venta.rtn            || '';
  var factura    = venta.factura        || '';
  var cai        = venta.cai            || '';
  var rangoDesde = venta.rango_desde    || '';
  var rangoHasta = venta.rango_hasta    || '';
  var fechaLim   = venta.fecha_limite_emision || '';
  var rangoStr   = (rangoDesde && rangoHasta) ? rangoDesde + ' – ' + rangoHasta : (rangoDesde || rangoHasta || '—');

  var fechaVenta = formatFecha(venta.fecha_venta);
  var partesFecha = fechaVenta.split('/');
  var diaN  = partesFecha[0] || '';
  var mesN  = partesFecha[1] || '';
  var anioN = partesFecha[2] || '';

  var total        = parseFloat(venta.total        || 0);
  var subtotalVal  = parseFloat(venta.subtotal     || 0);
  var isv15        = parseFloat(venta.isv_15       || 0);
  var subGravado   = parseFloat(venta.sub_gravado  || 0);
  var subExento    = parseFloat(venta.sub_exento   || 0);
  var subExonerado = parseFloat(venta.sub_exonerado|| 0);
  var descuento    = 0; // sum from detalles
  var cambio       = parseFloat(venta.cambio       || 0);

  // Sumar descuento de detalles
  for (var i = 0; i < detalles.length; i++) {
    descuento += parseFloat(detalles[i].descuento || 0);
  }

  // Pagos
  var efectivo      = 0;
  var tarjeta       = 0;
  var transferencia = 0;
  for (var j = 0; j < pagos.length; j++) {
    var tipo  = String(pagos[j].tipo || '').toLowerCase();
    var monto = parseFloat(pagos[j].monto || 0);
    if (tipo === 'efectivo')      efectivo      += monto;
    else if (tipo === 'tarjeta')  tarjeta       += monto;
    else if (tipo === 'transferencia') transferencia += monto;
  }
  // Fallback desde tipo_pago si no hay pagos registrados
  if (efectivo === 0 && tarjeta === 0 && transferencia === 0 && venta.tipo_pago) {
    var tp = String(venta.tipo_pago).toLowerCase();
    if (tp.indexOf('tarjeta') >= 0)       tarjeta       = total;
    else if (tp.indexOf('transferencia') >= 0) transferencia = total;
    else                                  efectivo      = total;
  }

  var letras = 'SON: ' + numeroALetras(total);

  // ── Filas de productos ───────────────────────────────────────────────────────
  var filasProductos = '';
  for (var k = 0; k < detalles.length; k++) {
    var d = detalles[k];
    var desc  = d.descripcion   || '';
    var cant  = parseFloat(d.cantidad        || 0);
    var pu    = parseFloat(d.precio_unitario || 0);
    var tot   = parseFloat(d.total           || (cant * pu));
    filasProductos += '<tr>'
      + '<td style="padding:2px 4px;font-size:7.5px;border:1px solid #ccc;">' + esc(desc) + '</td>'
      + '<td style="padding:2px 4px;font-size:7.5px;border:1px solid #ccc;text-align:right;">' + cant.toFixed(2) + '</td>'
      + '<td style="padding:2px 4px;font-size:7.5px;border:1px solid #ccc;text-align:right;">L ' + pu.toFixed(2) + '</td>'
      + '<td style="padding:2px 4px;font-size:7.5px;border:1px solid #ccc;text-align:right;">L ' + tot.toFixed(2) + '</td>'
      + '</tr>';
  }
  if (!filasProductos) {
    filasProductos = '<tr><td colspan="4" style="padding:6px;text-align:center;font-size:7px;color:#888;">Sin detalles</td></tr>';
  }

  // ── Logo ─────────────────────────────────────────────────────────────────────
  var logoHtml = empLogo
    ? '<img src="' + esc(empLogo) + '" alt="Logo" style="width:65px;height:auto;object-fit:contain;display:block;margin:auto;" />'
    : '<div style="width:65px;height:45px;border:1px dashed #aaa;display:flex;align-items:center;justify-content:center;font-size:7px;color:#999;">LOGO</div>';

  // ── Armar HTML ───────────────────────────────────────────────────────────────
  return '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>'
    + '<title>Factura ' + esc(factura) + '</title></head>'
    + '<body style="font-family:Arial,Helvetica,sans-serif;font-size:8.5px;color:#000;background:#fff;margin:0;padding:16px;">'

    // Nombre empresa
    + '<div style="font-size:15px;font-weight:900;text-align:center;letter-spacing:1px;text-transform:uppercase;border-bottom:2px solid #000;padding-bottom:3px;margin-bottom:4px;">'
    + esc(empNombre) + '</div>'

    // Encabezado: logo | info | fecha | CAI
    + '<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;border:1px solid #000;margin-bottom:3px;">'
    + '<tr>'
    // Logo
    + '<td style="width:70px;padding:3px;text-align:center;vertical-align:middle;">' + logoHtml + '</td>'
    // Info empresa
    + '<td style="padding:3px 5px;width:28%;vertical-align:top;">'
    + '<div style="font-size:8px;font-weight:900;text-align:center;letter-spacing:1px;margin-bottom:2px;">R.A.C.P</div>'
    + '<div style="font-size:8.5px;font-weight:700;line-height:1.7;"><b>R.T.N:</b> ' + esc(empRtn) + '</div>'
    + '<div style="font-size:8.5px;font-weight:700;line-height:1.7;"><b>Dirección:</b> ' + esc(empDir) + '</div>'
    + '<div style="font-size:8.5px;font-weight:700;line-height:1.7;"><b>Teléfono:</b> ' + esc(empTel) + '</div>'
    + '<div style="font-size:8.5px;font-weight:700;line-height:1.7;"><b>Email:</b> ' + esc(empEmail) + '</div>'
    + '</td>'
    // Fecha
    + '<td style="width:18%;padding:3px;vertical-align:middle;text-align:center;">'
    + '<div style="font-size:9px;font-weight:700;text-align:center;">' + diaN + '/' + mesN + '/' + anioN + '</div>'
    + '</td>'
    // CAI box
    + '<td style="padding:0;width:30%;vertical-align:top;">'
    + '<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">'
    + '<tr><td colspan="2" style="border:1px solid #000;padding:2px 4px;font-size:9px;font-weight:900;text-align:center;letter-spacing:1px;">FACTURA</td></tr>'
    + '</table>'
    + '<div style="text-align:center;padding:2px 3px;">'
    + '<div style="font-size:6.5px;font-weight:700;word-break:break-all;">CAI: ' + esc(cai || '—') + '</div>'
    + '<div style="font-size:11px;font-weight:900;letter-spacing:1px;margin-top:1px;">No. ' + esc(factura) + '</div>'
    + '</div>'
    + '</td>'
    + '</tr></table>'

    // Cliente
    + '<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin-bottom:3px;">'
    + '<tr><td colspan="2" style="border:none;padding:1px 5px;font-size:8px;font-size:8.5px;"><b>Cliente:</b>&nbsp;' + esc(cliente) + '</td></tr>'
    + '<tr><td colspan="2" style="border:none;padding:1px 5px;font-size:8px;"><b>RTN:</b>&nbsp;' + esc(rtnCliente || '—') + '</td></tr>'
    + '</table>'

    // Productos
    + '<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin-bottom:3px;">'
    + '<thead><tr style="background:#fff;">'
    + '<th style="padding:3px 4px;font-size:7.5px;font-weight:700;text-align:left;border:1px solid #000;">Descripción</th>'
    + '<th style="padding:3px 4px;font-size:7.5px;font-weight:700;text-align:right;border:1px solid #000;width:11%;">Cant.</th>'
    + '<th style="padding:3px 4px;font-size:7.5px;font-weight:700;text-align:right;border:1px solid #000;width:11%;">Precio Unit.</th>'
    + '<th style="padding:3px 4px;font-size:7.5px;font-weight:700;text-align:right;border:1px solid #000;width:11%;">Total</th>'
    + '</tr></thead>'
    + '<tbody>' + filasProductos + '</tbody>'
    + '</table>'

    // Totales
    + '<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin-bottom:3px;font-size:7.5px;">'
    + '<tr>'
    + '<td style="padding:2px 4px;font-weight:700;border:1px solid #ccc;width:25%;">Descuento:</td>'
    + '<td style="padding:2px 4px;border:1px solid #ccc;width:25%;">L ' + descuento.toFixed(2) + '</td>'
    + '<td style="padding:2px 4px;font-weight:700;border:1px solid #ccc;width:25%;">Sub Total Gravado:</td>'
    + '<td style="padding:2px 4px;border:1px solid #ccc;width:25%;">L ' + subGravado.toFixed(2) + '</td>'
    + '</tr>'
    + '<tr>'
    + '<td style="padding:2px 4px;font-weight:700;border:1px solid #ccc;">Sub Total Exento:</td>'
    + '<td style="padding:2px 4px;border:1px solid #ccc;">L ' + subExento.toFixed(2) + '</td>'
    + '<td style="padding:2px 4px;font-weight:700;border:1px solid #ccc;">Sub Total Exonerado:</td>'
    + '<td style="padding:2px 4px;border:1px solid #ccc;">L ' + subExonerado.toFixed(2) + '</td>'
    + '</tr>'
    + '<tr>'
    + '<td style="padding:2px 4px;font-weight:700;border:1px solid #ccc;">ISV 15%:</td>'
    + '<td style="padding:2px 4px;border:1px solid #ccc;">L ' + isv15.toFixed(2) + '</td>'
    + '<td style="border:1px solid #ccc;"></td><td style="border:1px solid #ccc;"></td>'
    + '</tr>'
    + '<tr>'
    + '<td colspan="4" style="padding:3px 4px;font-weight:900;font-size:8.5px;border:1px solid #000;text-align:center;">TOTAL FACTURA: L ' + total.toFixed(2) + '</td>'
    + '</tr>'
    + '</table>'

    // Pagos
    + '<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin-bottom:3px;font-size:7.5px;">'
    + '<tr>'
    + '<td style="padding:2px 4px;border:1px solid #ccc;"><b>Efectivo:</b> L ' + efectivo.toFixed(2) + '</td>'
    + '<td style="padding:2px 4px;border:1px solid #ccc;"><b>Tarjeta:</b> L ' + tarjeta.toFixed(2) + '</td>'
    + '<td style="padding:2px 4px;border:1px solid #ccc;"><b>Transferencia:</b> L ' + transferencia.toFixed(2) + '</td>'
    + '<td style="padding:2px 4px;border:1px solid #ccc;"><b>Cambio:</b> L ' + cambio.toFixed(2) + '</td>'
    + '</tr></table>'

    // Total en letras
    + '<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin-bottom:3px;">'
    + '<tr><td style="padding:2px 5px;font-size:7px;font-style:italic;border:1px solid #ccc;">*** ' + esc(letras) + ' Lempiras ***</td></tr>'
    + '</table>'

    // Info fiscal CAI
    + '<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin-bottom:3px;font-size:7px;">'
    + '<tr><td style="padding:1px 4px;border:1px solid #ccc;"><b>CAI:</b> ' + esc(cai || '—') + '</td></tr>'
    + '<tr><td style="padding:1px 4px;border:1px solid #ccc;"><b>Rango autorizado:</b> ' + esc(rangoStr) + '</td></tr>'
    + '<tr><td style="padding:1px 4px;border:1px solid #ccc;"><b>Fecha límite de emisión:</b> ' + esc(fechaLim || '—') + '</td></tr>'
    + '</table>'

    // Mensaje final
    + '<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin-top:4px;">'
    + '<tr><td style="padding:3px 5px;font-size:7px;text-align:center;background:#f8fafc;">¡Gracias por su compra! &nbsp;—&nbsp; LA FACTURA ES BENEFICIO DE TODOS, EXÍJALA</td></tr>'
    + '</table>'

    + '</body></html>';
}

// ─── Escapar HTML ──────────────────────────────────────────────────────────────
function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
