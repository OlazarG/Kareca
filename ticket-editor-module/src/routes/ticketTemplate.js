'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const ticketTemplateStore = require('../services/ticketTemplateStore');
const ticketTemplateRenderer = require('../services/ticketTemplateRenderer');

const router = express.Router();

// GET /api/ticket/image?path=... -> base64 de un PNG para el preview del editor
router.get('/image', (req, res) => {
    try {
        const imagePath = String(req.query.path || '');
        if (!imagePath) return res.json({ success: false, error: 'Falta el parámetro path' });
        const buffer = fs.readFileSync(imagePath);
        let png;
        try {
            png = PNG.sync.read(buffer);
        } catch (e) {
            return res.json({ success: false, error: 'El archivo no es un PNG válido' });
        }
        if (!png.width || !png.height) {
            return res.json({ success: false, error: 'Imagen vacía' });
        }
        res.json({ success: true, base64: buffer.toString('base64'), format: 'png' });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// GET /api/ticket/template
router.get('/template', (req, res) => {
    try {
        const template = ticketTemplateStore.getTicketTemplate();
        res.json({ success: true, template });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// PUT /api/ticket/template
router.put('/template', (req, res) => {
    try {
        ticketTemplateStore.saveTicketTemplate(req.body);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// DELETE /api/ticket/template
router.delete('/template', (req, res) => {
    try {
        ticketTemplateStore.resetTicketTemplate();
        const template = ticketTemplateStore.getTicketTemplate();
        res.json({ success: true, template });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// POST /api/ticket/preview
router.post('/preview', (req, res) => {
    try {
        const { template, data } = req.body || {};
        const tpl = template || ticketTemplateStore.getTicketTemplate();
        const text = ticketTemplateRenderer.renderText(tpl, data || {});
        res.json({ success: true, text });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// POST /api/ticket/upload-image
router.post('/upload-image', (req, res) => {
    try {
        const { dataUrl } = req.body || {};
        if (!dataUrl || !dataUrl.startsWith('data:image/')) {
            console.warn('[ticket] upload-image: Data URL inválido');
            return res.json({ success: false, error: 'Data URL inválido' });
        }

        const parts = dataUrl.split(',');
        if (parts.length < 2) {
            console.warn('[ticket] upload-image: Data URL malformado');
            return res.json({ success: false, error: 'Data URL malformado' });
        }

        const base64Data = parts[1];
        let buffer;
        try {
            buffer = Buffer.from(base64Data, 'base64');
        } catch (e) {
            console.warn('[ticket] upload-image: Error decodificando base64:', e.message);
            return res.json({ success: false, error: 'Error decodificando base64' });
        }

        const imagesDir = path.join(__dirname, '../services/images');
        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
        }

        const filename = 'ticket_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9) + '.png';
        const filepath = path.join(imagesDir, filename);
        fs.writeFileSync(filepath, buffer);
        console.log('[ticket] upload-image: Imagen guardada en', filepath);

        res.json({ success: true, path: filepath });
    } catch (error) {
        console.error('[ticket] upload-image: Error:', error.message);
        res.json({ success: false, error: error.message });
    }
});

module.exports = router;