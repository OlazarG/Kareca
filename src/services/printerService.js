const path = require('path');
const escpos = require('escpos');
// install escpos-usb adapter
try {
    escpos.USB = require('./usbAdapter');
} catch (e) {
    console.warn("escpos-usb not installed or failed to load. Printer service may not work.");
}

function getPrinter() {
    let device;
    const errors = [];

    // 1. Try Specific ID (Zadig)
    try {
        device = new escpos.USB(0x0483, 0x070B);
        return { device, printer: new escpos.Printer(device) };
    } catch (error) {
        errors.push(`Specific(0483:070B): ${error.message}`);
    }

    // 2. Try Generic Auto-Detect
    try {
        device = new escpos.USB();
        return { device, printer: new escpos.Printer(device) };
    } catch (error) {
        errors.push(`Generic: ${error.message}`);
    }

    throw new Error(`Could not find printer.\nAttempts:\n${errors.join('\n')}`);
}

// Helper para alinear texto a la izquierda y derecha en la misma línea
function formatLine(leftText, rightText, width = 42) {
    const spaceCount = width - leftText.length - rightText.length;
    if (spaceCount > 0) {
        return leftText + ' '.repeat(spaceCount) + rightText;
    }
    return leftText + ' ' + rightText;
}

// Imprime el cuerpo del ticket con los datos reales de la venta
function printTicketBody(printer, dashes, data, lineWidth) {
    const storeName = data.storeName || 'Cerámica Café';
    const storeSubtitle = data.storeSubtitle || 'Ventas Minoristas Y Mayoristas';
    const storePhone = data.storePhone || 'WhatsApp:0987122835';
    const ticketNum = data.ticketNum || data.id || '1';
    const dateStr = data.date || new Date().toLocaleString('es-PY');
    const items = data.items || [];
    const total = data.total;
    const subtotalStr = total !== undefined
        ? total.toLocaleString('es-PY')
        : (data.subtotal || '0');

    printer
        .font('b')
        .align('ct')
        .style('b')
        .size(0, 0) // Tamaño mínimo absoluto
        .text(storeName)
        .style('n')
        .text(storeSubtitle)
        .text(storePhone)
        .text(dashes)

        // Sección de Ticket y Fecha
        .align('lt')
        .style('b');

    printer.text(formatLine(`Ticket #${ticketNum}`, dateStr, lineWidth));

    printer
        .style('n')
        .text(dashes);

    // Items
    items.forEach(item => {
        const itemTotal = item.total !== undefined
            ? item.total.toLocaleString('es-PY')
            : (item.price * item.qty).toLocaleString('es-PY');
        const displayName = item.variant_name && item.variant_name.toLowerCase() !== 'unidad'
            ? `${item.name} (${item.variant_name})`
            : item.name;
        const left = `${displayName} x ${item.qty}`;
        printer.text(formatLine(left, itemTotal, lineWidth));
    });

    printer
        .text(dashes)
        .style('b')
        .text(formatLine('SubTotal', subtotalStr + ' Gs', lineWidth))
        .style('n');

    if (data.method) {
        printer.text(formatLine('Forma Pago', data.method, lineWidth));
        if (data.method === 'Efectivo') {
            const receivedStr = data.received !== undefined ? data.received.toLocaleString('es-PY') + ' Gs' : '-';
            const changeStr = data.change !== undefined ? data.change.toLocaleString('es-PY') + ' Gs' : '-';
            printer
                .text(formatLine('Efectivo', receivedStr, lineWidth))
                .text(formatLine('Vuelto', changeStr, lineWidth));
        }
    }

    printer
        .text(dashes)

        // Footer
        .align('ct')
        .style('b')
        .text('Gracias Por Su Preferencia!')
        .cut(false, 2)
        .close();
}

async function printReceipt(data) {
    return new Promise((resolve, reject) => {
        try {
            const { device, printer } = getPrinter();
            const lineWidth = data.lineWidth || 42;

            device.open(function (error) {
                if (error) {
                    console.error("Printer Error:", error);
                    return reject(error);
                }

                const dashes = '-'.repeat(lineWidth);
                const logoPath = path.join(__dirname, '../assets/logo.png');

                // Intentamos cargar el logo
                escpos.Image.load(logoPath, function (image) {
                    // Si no se pudo cargar la imagen, imprimimos solo texto
                    if (image instanceof Error || !(image instanceof escpos.Image)) {
                        console.warn("Logo no disponible, imprimiendo sin imagen:", image && image.message);
                        printTicketBody(printer, dashes, data, lineWidth);
                        return resolve({ success: true, warning: "Printed without logo." });
                    }

                    // Imprimimos el logo con modo raster (el más compatible con impresoras térmicas)
                    try {
                        printer
                            .font('b')
                            .align('ct')
                            .raster(image);

                        printTicketBody(printer, dashes, data, lineWidth);
                        resolve({ success: true });
                    } catch (err) {
                        console.error("Error al imprimir imagen con raster:", err);
                        // Fallback: imprimimos el ticket sin logo
                        printTicketBody(printer, dashes, data, lineWidth);
                        resolve({ success: true, error: err.message });
                    }
                });
            });
        } catch (e) {
            console.error("Print Receipt Exception:", e);
            resolve({ success: false, error: e.message });
        }
    });
}

function openCashDrawer() {
    return new Promise((resolve, reject) => {
        try {
            const { device, printer } = getPrinter();

            device.open(function (error) {
                if (error) return reject(error);

                printer
                    .cashdraw(2) // Pin 2
                    .close();

                resolve({ success: true });
            });
        } catch (e) {
            console.error("Open Drawer Exception:", e);
            resolve({ success: false, error: e.message });
        }
    });
}

module.exports = { printReceipt, openCashDrawer };
