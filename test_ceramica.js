const { testPrintAurea } = require('./src/services/newprinter');

console.log("Iniciando prueba de impresión de ticket Áurea...");
testPrintAurea().then(res => {
    console.log("Resultado final:", res);
}).catch(err => {
    console.error("Error de impresión:", err);
});
