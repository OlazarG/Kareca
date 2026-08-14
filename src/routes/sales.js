const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { success, error, safeError } = require('../helpers/apiResponse');
const { verifyToken, requirePermission } = require('../middleware/auth');

router.use(verifyToken);

router.post('/', requirePermission('realizar_ventas'), async (req, res) => {
    try {
        req.body.user = req.user.username;
        const result = await db.processSaleTransaction(req.body);
        return success(res, { sale: result }, 201);
    } catch (err) {
        return safeError(res, err);
    }
});

router.post('/purchases', requirePermission('realizar_compras'), async (req, res) => {
    try {
        req.body.user = req.user.username;
        const result = await db.processPurchaseTransaction(req.body);
        return success(res, { purchase: result }, 201);
    } catch (err) {
        return safeError(res, err);
    }
});

router.get('/movements', requirePermission('ver_reportes'), async (req, res) => {
    try {
        const { dateFrom, dateTo, page, limit } = req.query;
        const result = await db.getMovements(dateFrom, dateTo, parseInt(page) || 1, parseInt(limit) || 1000);
        return success(res, result);
    } catch (err) {
        return safeError(res, err);
    }
});

router.get('/movements/:id', requirePermission('ver_reportes'), async (req, res) => {
    try {
        const movement = await db.getMovementById(parseInt(req.params.id));
        if (!movement) return error(res, 'Movimiento no encontrado', 404);
        return success(res, { movement });
    } catch (err) {
        return safeError(res, err);
    }
});

router.put('/movements/:id', requirePermission('editar_ventas'), async (req, res) => {
    try {
        const { amount, reason, restockItems } = req.body;
        await db.updateMovement(parseInt(req.params.id), amount, reason, req.user.username, restockItems);
        return success(res, { message: 'Movimiento actualizado' });
    } catch (err) {
        return safeError(res, err);
    }
});

module.exports = router;
