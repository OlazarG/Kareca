'use strict';

const fs = require('fs');
const path = require('path');

// Ajuste manual (en minutos, puede ser negativo) aplicado como reloj general
// de la app: ticket impreso, reportes y cualquier "hora actual" que use la
// app. Sirve para corregir la hora sin depender del reloj/zona horaria
// configurados en el sistema operativo.
const SETTINGS_FILE = path.join(__dirname, 'clockOffset.json');

function getTimeOffsetMinutes() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
            const parsed = JSON.parse(raw);
            const n = Number(parsed.timeOffsetMinutes);
            if (!isNaN(n)) return n;
        }
    } catch (e) {
        // Archivo inválido: usamos 0 (sin ajuste).
    }
    return 0;
}

function setTimeOffsetMinutes(minutes) {
    const n = Number(minutes);
    if (isNaN(n)) throw new Error('El ajuste debe ser un número de minutos');
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ timeOffsetMinutes: n }, null, 2), 'utf-8');
    return true;
}

module.exports = { getTimeOffsetMinutes, setTimeOffsetMinutes };
