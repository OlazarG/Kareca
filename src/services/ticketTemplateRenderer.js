'use strict';

const fs = require('fs');
const escpos = require('escpos');
const { PNG } = require('pngjs');

//
// Motor de renderizado de plantillas de ticket basado en el servidor Python
// (printer_tool/ticket_templates.py). Portado a Node para que el sistema de
// punto de venta imprima la FACTURA con el mismo diseño.
//
// La plantilla es un JSON con secciones: center, line, separator, items,
// feed, cut, barcode, qr, image. Los placeholders {{campo}} se rellenan con
// los datos de la venta. Los campos camelCase del sistema (storeName, id,
// clientName, ...) se normalizan a snake_case.
//

const ALIASES = {
    storeName: 'store_name',
    storeSubtitle: 'store_subtitle',
    storePhone: 'store_phone',
    storeRuc: 'store_ruc',
    ticketNum: 'ticket_num',
    id: 'ticket_num',
    clientName: 'client_name',
    clientRuc: 'client_ruc',
    clientCI: 'client_ruc',
    ivaPct: 'iva_pct',
    ivaAmount: 'iva_amount',
    amountWords: 'amount_words',
};

const MONEY_KEYS = ['subtotal', 'iva_amount', 'total', 'received', 'change', 'amount'];

function normalizeData(raw) {
    const d = Object.assign({}, raw || {});
    for (const src of Object.keys(ALIASES)) {
        const dst = ALIASES[src];
        if (src in d && !(dst in d)) {
            d[dst] = d[src];
        }
    }
    return d;
}

function defaults(d, lineWidth) {
    d.store_name = d.store_name != null ? d.store_name : 'Mi Negocio';
    d.store_subtitle = d.store_subtitle != null ? d.store_subtitle : '';
    d.store_phone = d.store_phone != null ? d.store_phone : '';
    d.store_ruc = d.store_ruc != null ? d.store_ruc : '';
    d.ticket_num = d.ticket_num != null ? d.ticket_num : '1';
    d.date = d.date != null ? d.date : new Date().toLocaleString('es-PY');
    d.dashes = d.dashes != null ? d.dashes : '-'.repeat(lineWidth);
    d.iva_pct = d.iva_pct != null ? d.iva_pct : '10';
    d.footer = d.footer != null ? d.footer : 'Gracias Por Su Preferencia!';
    d.method = d.method != null ? d.method : '';
    d.client_name = d.client_name != null ? d.client_name : '';
    d.client_ruc = d.client_ruc != null ? d.client_ruc : '';
    d.table = d.table != null ? d.table : '';
    d.note = d.note != null ? d.note : '';
    d.concept = d.concept != null ? d.concept : '';
    d.amount_words = d.amount_words != null ? d.amount_words : '';
    d.items = d.items || [];
    d.dashes_heavy = d.dashes_heavy != null ? d.dashes_heavy : '='.repeat(lineWidth);
    d.barcode = d.barcode != null ? d.barcode : '';
    d.qr_data = d.qr_data != null ? d.qr_data : '';

    for (const m of MONEY_KEYS) {
        d[m] = d[m] != null ? d[m] : 0;
    }

    // Si no hay subtotal pero hay ítems, calcularlo sumando subtotales.
    if (d.subtotal === 0 && d.items && d.items.length) {
        let s = 0;
        for (const it of d.items) {
            let lineTotal = it.total != null ? it.total : it.subtotal;
            if (lineTotal == null) {
                const qty = it.qty != null ? it.qty : (it.quantity != null ? it.quantity : 1);
                const price = it.price != null ? it.price : (it.unit_price != null ? it.unit_price : 0);
                lineTotal = Number(qty) * Number(price);
            }
            s += Number(lineTotal);
        }
        d.subtotal = s;
    }

    return d;
}

function money(value, decimals) {
    try {
        const v = Number(value);
        if (typeof v !== 'number' || isNaN(v)) throw new Error('nan');
        if (decimals > 0) {
            const s = v.toLocaleString('es-PY', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
            return '$ ' + s;
        }
        return 'Gs ' + v.toLocaleString('es-PY');
    } catch (e) {
        return decimals > 0 ? '$ 0' : 'Gs 0';
    }
}

function fmtPlaceholder(key, value, decimals) {
    if (MONEY_KEYS.indexOf(key) !== -1) {
        return money(value, decimals);
    }
    return value != null ? String(value) : '';
}

function replacePlaceholders(text, data, decimals) {
    if (!text) return text;
    let result = text;
    for (const key of Object.keys(data)) {
        const re = new RegExp('{{' + key + '}}', 'g');
        result = result.replace(re, fmtPlaceholder(key, data[key], decimals));
    }
    return result;
}

function resolveCondition(cond, data) {
    if (!cond) return true;
    cond = String(cond).trim();
    if (cond.indexOf('==') !== -1) {
        const parts = cond.split('==');
        let field = parts[0].trim();
        const key = field.replace(/[{}]/g, '').trim();
        return String(data[key] != null ? data[key] : '') === String(parts[1].trim());
    }
    if (cond.indexOf('!=') !== -1) {
        const parts = cond.split('!=');
        const key = parts[0].trim().replace(/[{}]/g, '').trim();
        return String(data[key] != null ? data[key] : '') !== String(parts[1].trim());
    }
    if (cond === '{{empty}}') return false;
    return replacePlaceholders(cond, data) !== '';
}

function line(txt, width) {
    if (txt.length <= width) return txt;
    return txt.slice(0, width);
}

function lineRight(left, right, width, gap) {
    left = String(left);
    right = String(right);
    let space = width - left.length - right.length;
    // Si la sección define un gap explícito, lo usamos tal cual: el valor deja
    // de quedar pegado al margen derecho y el espacio pasa a estar controlado.
    if (gap !== undefined && gap !== null && gap !== '') {
        const g = Number(gap);
        if (!isNaN(g) && g >= 0) space = g;
    }
    return (left + ' '.repeat(Math.max(0, space)) + right).slice(0, width);
}

// Alineación de una sección. Si la plantilla define "align" (left|center|right)
// se respeta; si no, se usa el valor por defecto según el tipo de sección.
function sectionAlign(section, type) {
    if (section.align && String(section.align).trim()) {
        return String(section.align).trim().toLowerCase();
    }
    const map = { separator: 'left', center: 'center', items: 'left', barcode: 'center', qr: 'center', image: 'center' };
    return map[type] || 'left';
}

// Carga una imagen desde el filesystem o desde un data URL base64.
// La escala (manteniendo proporción) a máximo `maxW` puntos del rollo
// y la devuelve como escpos.Image listo para `printer.raster()`.
// Devuelve null si el archivo no existe o no es imagen válida.
function loadTicketImage(src, maxW) {
    if (!src) {
        console.warn('[loadTicketImage] src está vacío');
        return null;
    }
    let buffer;
    try {
        if (typeof src === 'string' && src.startsWith('data:image/')) {
            console.log('[loadTicketImage] Detectado data URL, decodificando...');
            const parts = src.split(',');
            if (parts.length < 2) {
                console.warn('[loadTicketImage] Data URL malformado, no tiene coma');
                return null;
            }
            const base64Data = parts[1];
            buffer = Buffer.from(base64Data, 'base64');
            console.log('[loadTicketImage] Buffer decodificado, tamaño:', buffer.length);
        } else {
            console.log('[loadTicketImage] Leyendo desde filesystem:', src);
            buffer = fs.readFileSync(src);
        }
    } catch (e) {
        console.warn('[loadTicketImage] Error al cargar imagen:', e.message);
        return null;
    }
    let png;
    try {
        png = PNG.sync.read(buffer);
        console.log('[loadTicketImage] PNG leído exitosamente, size:', png.width, 'x', png.height);
    } catch (e) {
        console.warn('[loadTicketImage] PNG.sync.read falló:', e.message, '| Buffer size:', buffer.length);
        return null;
    }
    const w = png.width, h = png.height;
    if (w <= 0 || h <= 0) return null;
    const scale = Math.min(1, Math.max(1, maxW) / w);
    const nw = Math.max(1, Math.round(w * scale));
    const nh = Math.max(1, Math.round(h * scale));
    const crop = new PNG({ width: nw, height: nh });
    for (let y = 0; y < nh; y++) {
        for (let x = 0; x < nw; x++) {
            const sx = Math.min(w - 1, Math.floor(x / scale));
            const sy = Math.min(h - 1, Math.floor(y / scale));
            const si = (w * sy + sx) * 4;
            const di = (nw * y + x) * 4;
            crop.data[di] = png.data[si];
            crop.data[di + 1] = png.data[si + 1];
            crop.data[di + 2] = png.data[si + 2];
            crop.data[di + 3] = png.data[si + 3];
        }
    }
    const pixels = { shape: [nw, nh, 4], data: Array.from(crop.data) };
    return new escpos.Image(pixels);
}

// Aplica fuente (A/B), negrita, tamaño y alineación de una sección al printer.
function applyPrinterStyle(printer, section, type) {
    const font = String(section.font || 'b');
    printer.font(font);
    const sz = section.size || [1, 1];
    const w = Math.max(1, Number(sz[0]) || 1);
    const h = Math.max(1, Number(sz[1] || sz[0]) || 1);
    printer.style(section.bold ? 'b' : 'n');
    const a = sectionAlign(section, type);
    printer.align(a === 'center' ? 'ct' : a === 'right' ? 'rt' : 'lt');
    printer.size(w - 1, h - 1);
}

function padCenter(txt, width) {
    txt = String(txt);
    if (txt.length >= width) return txt.slice(0, width);
    const left = Math.floor((width - txt.length) / 2);
    return ' '.repeat(left) + txt;
}

function displayName(item) {
    const name = item.name != null ? item.name : (item.description != null ? item.description : '');
    const variant = item.variant_name;
    if (variant && String(variant).trim().toLowerCase() !== 'unidad') {
        return `${name} (${variant})`;
    }
    return name;
}

function prepare(template, data) {
    const lineWidth = template.line_width || 42;
    const decimals = data.currency_decimals != null ? Number(data.currency_decimals) : 0;
    const d = defaults(normalizeData(data), lineWidth);
    return { template, data: d, lineWidth, decimals };
}

//
// Salida en texto plano (para vista previa / depuración).
//
function renderText(template, data) {
    const { template: tpl, data: d, lineWidth: width, decimals } = prepare(template, data);
    const out = [];
    let imgIndex = 0;

    for (const section of (tpl.sections || [])) {
        if (section.if && !resolveCondition(section.if, d)) continue;
        const type = section.type;

        if (type === 'separator') {
            out.push(line(replacePlaceholders(section.text, d, decimals), width));
        } else if (type === 'center') {
            const text = replacePlaceholders(section.text, d, decimals);
            const w = section.size && section.size[0] ? Math.max(1, Number(section.size[0])) : 1;
            out.push(padCenter(line(text, width), width / w));
        } else if (type === 'line') {
            const left = replacePlaceholders(section.text, d, decimals) || '';
            const right = (replacePlaceholders(section.right, d, decimals) || '').trim();
            out.push(lineRight(left, right, width, section.gap));
        } else if (type === 'image') {
            out.push('[[IMG:' + (imgIndex++) + ']]');
        } else if (type === 'items') {
            const caption = replacePlaceholders(section.caption, d, decimals) || '';
            if (caption) out.push(line(caption, width));
            for (const item of (d.items || [])) {
                const name = displayName(item);
                const qty = item.qty != null ? item.qty : (item.quantity != null ? item.quantity : 1);
                let lineTotal = item.total != null ? item.total : item.subtotal;
                if (lineTotal == null) {
                    const price = item.price != null ? item.price : (item.unit_price != null ? item.unit_price : 0);
                    lineTotal = Number(qty) * Number(price);
                }
                out.push(lineRight(`${name} x${qty}`, money(lineTotal, decimals), width, section.gap));
            }
        } else if (type === 'feed') {
            const n = Number(section.lines || 1);
            for (let i = 0; i < n; i++) out.push('');
        } else if (type === 'barcode') {
            const value = replacePlaceholders(section.text, d, decimals);
            if (value) {
                out.push('[Código de barras: ' + value + ']');
                out.push(padCenter(value, width));
            }
        } else if (type === 'qr') {
            const value = replacePlaceholders(section.text, d, decimals);
            if (value) {
                out.push('█████████████████████');
                out.push('█ [Código QR]       █');
                out.push('█████████████████████');
            }
        }
    }

    return out.join('\n');
}

//
// Renderizado al printer escpos.Printer.
//
function render(printer, template, data) {
    const { template: tpl, data: d, lineWidth: width, decimals } = prepare(template, data);

    printer
        .font('b')
        .align('lt')
        .style('n')
        .size(0, 0);

    for (const section of (tpl.sections || [])) {
        if (section.if && !resolveCondition(section.if, d)) continue;
        const type = section.type;

        if (type === 'separator') {
            const text = line(replacePlaceholders(section.text, d, decimals), width);
            applyPrinterStyle(printer, section, type);
            printer.text(text);
        } else if (type === 'center') {
            const text = replacePlaceholders(section.text, d, decimals);
            const size = section.size || [1, 1];
            const w = Math.max(1, Number(size[0]));
            const h = Math.max(1, Number(size[1] || 1));
            applyPrinterStyle(printer, section, type);
            if (w > 1 || h > 1) {
                // Fuente grande: usar la alineación nativa de la impresora.
                printer.text(line(text, width));
            } else {
                // Fuente normal: padding manual para base alineada.
                printer.align('lt');
                printer.text(padCenter(line(text, width), width));
            }
        } else if (type === 'line') {
            const left = replacePlaceholders(section.text, d, decimals) || '';
            const right = (replacePlaceholders(section.right, d, decimals) || '').trim();
            const text = lineRight(left, right, width, section.gap);
            applyPrinterStyle(printer, section, type);
            printer.text(text);
        } else if (type === 'items') {
            const caption = replacePlaceholders(section.caption, d, decimals) || '';
            applyPrinterStyle(printer, section, type);
            if (caption) printer.text(line(caption, width));
            for (const item of (d.items || [])) {
                const name = displayName(item);
                const qty = item.qty != null ? item.qty : (item.quantity != null ? item.quantity : 1);
                let lineTotal = item.total != null ? item.total : item.subtotal;
                if (lineTotal == null) {
                    const price = item.price != null ? item.price : (item.unit_price != null ? item.unit_price : 0);
                    lineTotal = Number(qty) * Number(price);
                }
                printer.text(lineRight(`${name} x${qty}`, money(lineTotal, decimals), width, section.gap));
            }
        } else if (type === 'image') {
            const src = replacePlaceholders(section.image || '', d, decimals);
            const maxW = Math.max(1, Number(section.maxWidth) || 0) || width;
            const a = sectionAlign(section, type);
            printer.align(a === 'center' ? 'ct' : a === 'right' ? 'rt' : 'lt').style('n');
            const img = loadTicketImage(src, maxW);
            if (img) {
                printer.raster(img);
            } else {
                const label = src ? '[Imagen no encontrada]' : '[Imagen sin archivo]';
                printer.text(padCenter(line(label, width), width));
            }
        } else if (type === 'feed') {
            printer.feed(Number(section.lines || 1));
        } else if (type === 'barcode') {
            const value = replacePlaceholders(section.text, d, decimals);
            if (value) {
                printer.align('ct').style('n');
                try {
                    printer.barcode(value, 'CODE39');
                    printer.text(padCenter(value, width));
                } catch (e) {
                    printer.text('\n');
                    printer.text(padCenter(value, width));
                }
            }
        } else if (type === 'qr') {
            const value = replacePlaceholders(section.text, d, decimals);
            if (value) {
                printer.align('ct').style('n');
                try {
                    printer.qrcode(value, 1, 'M', 7);
                } catch (e) {
                    printer.text('\n');
                    printer.text(padCenter(value, width));
                }
                printer.text('\n');
            }
        } else if (type === 'cut') {
            printer.cut(false, 3);
        }
    }

    return printer;
}

function finish(printer) {
    // La plantilla ya incluye feed y cut; aquí solo cerramos el dispositivo.
    printer.close();
}

// Plantilla FACTURA (portada de printer_tool/ticket_templates.py).
const FACTURA_TEMPLATE = {
    name: 'Factura',
    description: 'Factura con IVA y datos del cliente (compatible con el sistema principal).',
    width: 384,
    line_width: 42,
    sections: [
        { type: 'center', text: '{{store_name}}', size: [2, 2], bold: true },
        { type: 'center', text: '{{store_subtitle}}', bold: false },
        { type: 'center', text: 'FACTURA', bold: true },
        { type: 'center', text: 'RUC: {{store_ruc}}', bold: false, if: '{{store_ruc}}' },
        { type: 'center', text: '{{store_phone}}', bold: false },
        { type: 'separator', text: '{{dashes}}' },
        { type: 'line', text: 'Factura #{{ticket_num}}', right: '{{date}}', bold: true },
        { type: 'line', text: 'Cliente', right: '{{client_name}}', bold: false, if: '{{client_name}}' },
        { type: 'line', text: 'RUC/CI', right: '{{client_ruc}}', bold: false, if: '{{client_ruc}}' },
        { type: 'separator', text: '{{dashes}}' },
        { type: 'items', caption: 'Cant  Descripcion             Importe' },
        { type: 'separator', text: '{{dashes}}' },
        { type: 'line', text: 'SUBTOTAL', right: '{{subtotal}}', bold: true },
        { type: 'line', text: 'IVA ({{iva_pct}})', right: '{{iva_amount}}', bold: false },
        { type: 'line', text: 'TOTAL', right: '{{total}}', bold: true },
        { type: 'separator', text: '{{dashes}}' },
        { type: 'line', text: 'Método', right: '{{method}}', bold: false, if: '{{method}}' },
        { type: 'line', text: 'Efectivo', right: '{{received}}', bold: false, if: '{{method}} == Efectivo' },
        { type: 'line', text: 'Vuelto', right: '{{change}}', bold: false, if: '{{method}} == Efectivo' },
        { type: 'separator', text: '{{dashes}}' },
        { type: 'center', text: '{{footer}}', bold: true },
        { type: 'feed', lines: 4 },
        { type: 'cut' }
    ]
};

module.exports = {
    FACTURA_TEMPLATE,
    render,
    renderText,
    finish,
    normalizeData,
};
