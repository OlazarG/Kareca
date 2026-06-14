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
        console.log("Attempting specific connection: 0x0483, 0x070B");
        device = new escpos.USB(0x0483, 0x070B);
        // Sometimes constructor doesn't throw, but open() does. 
        // But usually USB() throws if device not present.
        return { device, printer: new escpos.Printer(device) };
    } catch (error) {
        console.warn("Specific ID connection failed:", error.message);
        errors.push(`Specific(0483:070B): ${error.message}`);
    }

    // 2. Try Generic Auto-Detect
    try {
        console.log("Attempting generic connection...");
        device = new escpos.USB();
        return { device, printer: new escpos.Printer(device) };
    } catch (error) {
        console.warn("Generic connection failed:", error.message);
        errors.push(`Generic: ${error.message}`);
    }

    // If we're here, nothing worked
    throw new Error(`Could not find printer.\nAttempts:\n${errors.join('\n')}`);
}

async function printReceipt(data) {
    return new Promise((resolve, reject) => {
        try {
            const { device, printer } = getPrinter();

            device.open(function (error) {
                if (error) {
                    console.error("Printer Error:", error);
                    return reject(error);
                }

                const deviceDetail = device.device ?
                    `VID: ${device.device.idVendor} PID: ${device.device.idProduct}` : 'Unknown Device';

                console.log("Printing to:", deviceDetail);

                printer
                    .font('a')
                    .align('ct')
                    .style('b')
                    .size(1, 1) // Normal size
                    .text(data.storeName || 'BODEGA K-RECA')
                    .style('n') // Normal style
                    .text(data.address || 'Asuncion, Paraguay')
                    .text(`Fecha: ${new Date().toLocaleString('es-PY')}`)
                    .text('--------------------------------')
                    .align('lt');

                // Items
                data.items.forEach(item => {
                    const totalItem = (item.price * item.qty).toLocaleString('es-PY');
                    const qty = item.qty;
                    const name = item.name.substring(0, 15); // Cut name

                    printer.text(`${name} x${qty} : ${totalItem}`);
                });

                printer
                    .text('--------------------------------')
                    .align('rt')
                    .style('b')
                    .text(`TOTAL: Gs. ${data.total.toLocaleString('es-PY')}`)
                    .style('n')
                    .align('ct')
                    .text('--------------------------------')
                    .text('Gracias por su compra')
                    .feed(4)
                    .cut()
                    .close();

                resolve({ success: true, deviceInfo: deviceDetail });
            });
        } catch (e) {
            console.error("Print Receipt Exception:", e);
            resolve({ success: false, error: e.message }); // Resolve as false instead of reject to avoid crash
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
