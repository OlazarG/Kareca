const escpos = require('escpos');
escpos.USB = require('./src/services/usbAdapter');

const device = new escpos.USB(0x0483, 0x070B);
const printer = new escpos.Printer(device);

device.open(function (error) {
    if (error) {
        console.error("Failed to open printer:", error);
        return;
    }
    console.log("Printer opened successfully!");
    printer
        .font('a')
        .align('ct')
        .style('bu')
        .size(1, 1)
        .text('PRUEBA DE IMPRESION')
        .text('SISTEMA GUSTAVO')
        .text('--------------------------------')
        .text('Si puedes leer esto,')
        .text('la impresora funciona correctamente.')
        .feed(2)
        .cut()
        .close();
    console.log("Print command sent.");
});
