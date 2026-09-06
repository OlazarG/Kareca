const express = require('express');
const path = require('path');
const fs = require('fs');
const escpos = require('escpos');
const { PNG } = require('pngjs');
const ticketRenderer = require('../services/ticketTemplateRenderer');
const { getTicketTemplate } = require('../services/ticketTemplateStore');

try {
    escpos.USB = require('../services/usbAdapter');
} catch (e) {
    console.warn("[print] escpos-usb adapter no cargado:", e.message);
}

const router = express.Router();

// Carga y prepara el logo: recorta márgenes blancos y lo escala al ancho de impresión.
function loadLogo(pngPath, maxWidth, callback) {
    fs.readFile(pngPath, function (err, buffer) {
        if (err) return callback(err);
        let png;
        try {
            png = PNG.sync.read(buffer);
        } catch (e) {
            return callback(e);
        }

        const w = png.width, h = png.height;
        const isBlank = (x, y) => {
            const idx = (w * y + x) * 4;
            const a = png.data[idx + 3];
            if (a < 128) return true;
            const r = png.data[idx], g = png.data[idx + 1], b = png.data[idx + 2];
            return r > 250 && g > 250 && b > 250;
        };

        let top = 0;
        while (top < h) { let blank = true; for (let x = 0; x < w; x++) { if (!isBlank(x, top)) { blank = false; break; } } if (!blank) break; top++; }
        let bottom = h - 1;
        while (bottom > top) { let blank = true; for (let x = 0; x < w; x++) { if (!isBlank(x, bottom)) { blank = false; break; } } if (!blank) break; bottom--; }
        let left = 0;
        while (left < w) { let blank = true; for (let y = 0; y < h; y++) { if (!isBlank(left, y)) { blank = false; break; } } if (!blank) break; left++; }
        let right = w - 1;
        while (right > left) { let blank = true; for (let y = 0; y < h; y++) { if (!isBlank(right, y)) { blank = false; break; } } if (!blank) break; right--; }

        const cw = right - left + 1;
        const ch = bottom - top + 1;
        if (cw <= 0 || ch <= 0) return callback(new Error('Logo vacío'));

        // Escalar manteniendo proporción al ancho deseado
        let scale = maxWidth / cw;
        if (scale > 1) scale = 1; // no agrandar más que el original
        const nw = Math.max(1, Math.round(cw * scale));
        const nh = Math.max(1, Math.round(ch * scale));

        const crop = new PNG({ width: nw, height: nh });
        for (let y = 0; y < nh; y++) {
            for (let x = 0; x < nw; x++) {
                const sx = Math.min(w - 1, left + Math.floor(x / scale));
                const sy = Math.min(h - 1, top + Math.floor(y / scale));
                const si = (w * sy + sx) * 4;
                const di = (nw * y + x) * 4;
                crop.data[di] = png.data[si];
                crop.data[di + 1] = png.data[si + 1];
                crop.data[di + 2] = png.data[si + 2];
                crop.data[di + 3] = png.data[si + 3];
            }
        }

        // Construir objeto pixels compatible con escpos.Image
        const colors = 4;
        const pixels = {
            shape: [nw, nh, colors],
            data: Array.from(crop.data)
        };
        callback(null, new escpos.Image(pixels));
    });
}

function getPrinter(device) {
    if (device) {
        return { device, printer: new escpos.Printer(device) };
    }
    const errors = [];
    try {
        const d = new escpos.USB(0x0483, 0x5720);
        return { device: d, printer: new escpos.Printer(d) };
    } catch (error) {
        errors.push('Specific(0483:5720): ' + error.message);
    }
    try {
        const d = new escpos.USB();
        return { device: d, printer: new escpos.Printer(d) };
    } catch (error) {
        errors.push('Generic: ' + error.message);
    }
    throw new Error('Impresora no encontrada. ' + errors.join(' | '));
}

function formatLine(leftText, rightText, width = 42) {
    const spaceCount = width - leftText.length - rightText.length;
    if (spaceCount > 0) {
        return leftText + ' '.repeat(spaceCount) + rightText;
    }
    return leftText + ' ' + rightText;
}

// Centra un texto manualmente sobre el ancho de línea, para alinear todo el ticket
// a la misma base de caracteres (en vez del centrado interno de la impresora).
function centerLine(text, width = 42) {
    const len = text.length;
    if (len >= width) return text;
    const totalPad = width - len;
    const leftPad = Math.floor(totalPad / 2);
    return ' '.repeat(leftPad) + text;
}

function printTicketBody(printer, dashes, data, lineWidth, templateOverride) {
    // Renderiza las secciones de la plantilla (portada del servidor Python)
    // sobre el printer, igual que el servicio principal. Usa la plantilla
    // guardada por el editor de tickets si fue personalizada, o la plantilla
    // enviada en el request para impresiones de prueba desde el editor.
    const template = templateOverride || getTicketTemplate();
    ticketRenderer.render(printer, template, Object.assign({}, data));
    ticketRenderer.finish(printer);
}

// GET /api/print/devices - listar impresoras USB detectadas
router.get('/devices', (req, res) => {
    let devices = [];
    try {
        devices = escpos.USB.findPrinter ? escpos.USB.findPrinter().map(d => ({
            vendorId: d.deviceDescriptor ? d.deviceDescriptor.idVendor : d.idVendor,
            productId: d.deviceDescriptor ? d.deviceDescriptor.idProduct : d.idProduct,
            name: (d.deviceDescriptor && d.deviceDescriptor.iProduct) ? String(d.deviceDescriptor.iProduct) : 'Impresora'
        })) : [];
    } catch (e) {
        devices = [];
    }
    res.json({ success: true, devices, count: devices.length });
});

// POST /api/print/ticket - imprimir ticket
router.post('/ticket', (req, res) => {
    const data = req.body || {};
    try {
        const { device, printer } = getPrinter(data.device);
        const template = data.template || getTicketTemplate();
        const lineWidth = (template && template.line_width) || data.lineWidth || 42;
        device.open(function (error) {
            if (error) {
                console.error('[print] Error abriendo impresora:', error);
                return res.status(500).json({ success: false, message: 'Error abriendo impresora: ' + error.message });
            }
            const dashes = '-'.repeat(lineWidth);
            const logoPath = path.join(__dirname, '../assets/logo.png');
            const maxLogoWidth = data.logoMaxWidth || 300;

            loadLogo(logoPath, maxLogoWidth, function (image) {
                if (image instanceof Error) {
                    printTicketBody(printer, dashes, data, lineWidth, template);
                    return res.json({ success: true, warning: 'Impreso sin logo.' });
                }
                try {
                    printer.font('b').align('ct').raster(image);
                    printTicketBody(printer, dashes, data, lineWidth, template);
                    res.json({ success: true });
                } catch (err) {
                    printTicketBody(printer, dashes, data, lineWidth, template);
                    res.json({ success: true, warning: 'Impreso sin logo (' + err.message + ')' });
                }
            });
        });
    } catch (e) {
        console.error('[print] Excepción:', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

// POST /api/print/cashdraw - abrir cajón
router.post('/cashdraw', (req, res) => {
    try {
        const { device, printer } = getPrinter(req.body && req.body.device);
        device.open(function (error) {
            if (error) {
                return res.status(500).json({ success: false, message: 'Error abriendo impresora: ' + error.message });
            }
            try {
                printer.cashdraw(2).close();
                res.json({ success: true });
            } catch (e) {
                res.status(500).json({ success: false, message: e.message });
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;
