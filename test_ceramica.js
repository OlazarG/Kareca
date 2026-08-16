const { testPrintCeramica } = require('./src/services/newprinter');

console.log("Iniciando prueba de impresión de ticket Cerámica Café...");
testPrintCeramica().then(res => {
    console.log("Resultado final:", res);
}).catch(err => {
    console.error("Error de impresión:", err);
});
