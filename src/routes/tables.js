const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { success, error, safeError } = require('../helpers/apiResponse');
const { verifyToken, requirePermission } = require('../middleware/auth');

router.use(verifyToken);

router.get('/', async (req, res) => {
    try {
        const tables = await db.getTables();
        return success(res, { tables });
    } catch (err) {
        return safeError(res, err);
    }
});

router.post('/', requirePermission('gestionar_mesas'), async (req, res) => {
    try {
        const { number, x, y } = req.body;
        await db.createTable(number, x || 0, y || 0);
        return success(res, { message: 'Mesa creada' }, 201);
    } catch (err) {
        return safeError(res, err);
    }
});

router.put('/:id/status', requirePermission('gestionar_mesas'), async (req, res) => {
    try {
        const { status } = req.body;
        await db.updateTableStatus(parseInt(req.params.id), status);
        return success(res, { message: 'Estado actualizado' });
    } catch (err) {
        return safeError(res, err);
    }
});

router.put('/:id/position', requirePermission('gestionar_mesas'), async (req, res) => {
    try {
        const { x, y } = req.body;
        await db.updateTablePosition(parseInt(req.params.id), x, y);
        return success(res, { message: 'Posición actualizada' });
    } catch (err) {
        return safeError(res, err);
    }
});

router.delete('/:id', requirePermission('gestionar_mesas'), async (req, res) => {
    try {
        await db.deleteTable(parseInt(req.params.id));
        return success(res, { message: 'Mesa eliminada' });
    } catch (err) {
        return safeError(res, err);
    }
});

module.exports = router;
