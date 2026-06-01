const escpos = require('escpos');
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

// Helper para alinear texto a la izquierda y derecha en la misma linea
function formatLine(leftText, rightText, width = 40) {
    const spaceCount = width - leftText.length - rightText.length;
    if (spaceCount > 0) {
        return leftText + ' '.repeat(spaceCount) + rightText;
    }
    return leftText + ' ' + rightText;
}

// Helper para imprimir el cuerpo del ticket y evitar duplicación
function printTicketBody(printer, dashes, data, lineWidth) {
    printer
        .style('b')
        .size(0, 0) // Tamaño mínimo absoluto
        .text('Aurea Accesorios')
        .style('n')
        .text('Ventas Minoristas Y Mayoristas')
        .text('WhatsApp:0987122835')
        .text(dashes)

        // Sección de Ticket y Fecha
        .align('lt')
        .style('b');

    const ticketNum = data.ticketNum || '3';
    const dateStr = data.date || new Date().toLocaleString('es-PY');

    printer.text(formatLine(`Ticket #${ticketNum}`, dateStr, lineWidth));

    printer
        .style('n')
        .text(dashes);

    // Sección de Items
    const items = data.items || [
        { name: 'Veg Burger', qty: 1, price: 478 }
    ];

    items.forEach(item => {
        const displayName = item.variant_name && item.variant_name.toLowerCase() !== 'unidad'
            ? `${item.name} (${item.variant_name})`
            : item.name;
        const left = `${displayName} x ${item.qty}`;
        const right = item.price.toString();
        printer.text(formatLine(left, right, lineWidth));
    });

    printer
        .text(dashes)
        .style('b')
        .text(formatLine('SubTotal', data.subtotal ? data.subtotal + ' Gs' : '5.500 Gs', lineWidth))
        .style('n');

    if (data.method || data.payment_method) {
        const method = data.method || data.payment_method || 'Efectivo';
        printer.text(formatLine('Forma Pago', method, lineWidth));
        if (method === 'Efectivo') {
            const receivedStr = data.received !== undefined ? data.received.toLocaleString('es-PY') + ' Gs' : '10.000 Gs';
            const changeStr = data.change !== undefined ? data.change.toLocaleString('es-PY') + ' Gs' : '4.500 Gs';
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

async function testPrintAurea(data = {}) {
    const path = require('path');
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

                // Intentamos cargar la imagen
                escpos.Image.load(logoPath, function (image) {
                    // Si el callback devuelve un Error (ej: formato de imagen corrupto o no soportado)
                    if (image instanceof Error || !(image instanceof escpos.Image)) {
                        console.warn("No se pudo cargar el logo. Imprimiendo ticket sin imagen. Detalle:", image);

                        // Imprimimos el cuerpo directamente sin imagen
                        printer.font('b').align('ct');
                        printTicketBody(printer, dashes, data, lineWidth);
                        return resolve({ success: true, warning: "Printed without logo because it failed to load." });
                    }

                    // Si se cargó correctamente, intentamos imprimirla usando raster (mucho más compatible)
                    try {
                        printer
                            .font('b')
                            .align('ct')
                            .raster(image); // raster es síncrono y retorna el objeto printer

                        printTicketBody(printer, dashes, data, lineWidth);
                        resolve({ success: true });
                    } catch (err) {
                        console.error("Error al imprimir la imagen física con raster:", err);
                        // Fallback: imprimir el texto aunque la imagen dé error de impresora
                        printTicketBody(printer, dashes, data, lineWidth);
                        resolve({ success: true, error: err.message });
                    }
                });
            });
        } catch (e) {
            console.error("Print Exception:", e);
            resolve({ success: false, error: e.message });
        }
    });
}

module.exports = { testPrintAurea };
