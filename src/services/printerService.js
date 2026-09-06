const escpos = require('escpos');
const ticketTemplateStore = require('./ticketTemplateStore');
const ticketTemplateRenderer = require('./ticketTemplateRenderer');
const clockOffsetStore = require('./clockOffsetStore');
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

// Imprime el ticket usando la plantilla configurada en el Editor de Ticket.
// Si `data.template` viene incluido (impresión de prueba desde el editor) se usa
// esa plantilla; si no, se usa la plantilla guardada (o la de fábrica).
async function printReceipt(data) {
    return new Promise((resolve, reject) => {
        try {
            const { device, printer } = getPrinter();
            const template = data.template || ticketTemplateStore.getTicketTemplate();
            const offsetMinutes = clockOffsetStore.getTimeOffsetMinutes();
            const printData = Object.assign({}, data, {
                date: new Date(Date.now() + offsetMinutes * 60000).toLocaleString('es-PY')
            });

            device.open(function (error) {
                if (error) {
                    console.error("Printer Error:", error);
                    return reject(error);
                }

                try {
                    ticketTemplateRenderer.render(printer, template, printData);
                    ticketTemplateRenderer.finish(printer);
                    resolve({ success: true });
                } catch (err) {
                    console.error("Error al imprimir la plantilla:", err);
                    try { printer.close(); } catch (e) { /* ignore */ }
                    resolve({ success: false, error: err.message });
                }
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
