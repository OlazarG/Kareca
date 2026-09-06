'use strict';

const fs = require('fs');
const path = require('path');
const { FACTURA_TEMPLATE } = require('./ticketTemplateRenderer');

// Almacena la plantilla FACTURA editada por el usuario en un JSON aparte.
// Si el archivo no existe (o está corrupto) se usa la plantilla por defecto.
const TEMPLATE_FILE = path.join(__dirname, 'ticketTemplate.json');

function getTicketTemplate() {
    try {
        if (fs.existsSync(TEMPLATE_FILE)) {
            const raw = fs.readFileSync(TEMPLATE_FILE, 'utf-8');
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.sections) && parsed.sections.length) {
                return parsed;
            }
        }
    } catch (e) {
        // Archivo inválido: caemos a la plantilla por defecto.
    }
    return JSON.parse(JSON.stringify(FACTURA_TEMPLATE));
}

function saveTicketTemplate(template) {
    if (!template || !Array.isArray(template.sections) || !template.sections.length) {
        throw new Error('Plantilla inválida: falta la lista de secciones');
    }
    const clean = {
        name: template.name || 'Factura',
        description: template.description || 'Factura con IVA y datos del cliente.',
        width: Number(template.width) || 384,
        line_width: Number(template.line_width) || 42,
        sections: template.sections,
    };
    fs.writeFileSync(TEMPLATE_FILE, JSON.stringify(clean, null, 2), 'utf-8');
    return true;
}

function resetTicketTemplate() {
    try {
        if (fs.existsSync(TEMPLATE_FILE)) fs.unlinkSync(TEMPLATE_FILE);
    } catch (e) {
        // Ignorar: si no existe ya está reseteada.
    }
    return true;
}

function ticketTemplatePath() {
    return TEMPLATE_FILE;
}

module.exports = {
    getTicketTemplate,
    saveTicketTemplate,
    resetTicketTemplate,
    ticketTemplatePath,
};