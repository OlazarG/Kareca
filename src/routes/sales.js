const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { success, error } = require('../helpers/apiResponse');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

router.post('/', async (req, res) => {
    try {
        const result = await db.processSaleTransaction(req.body);
        return success(res, { sale: result }, 201);
    } catch (err) {
        return error(res, err.message, 500);
    }
});

router.post('/purchases', async (req, res) => {
    try {
        const result = await db.processPurchaseTransaction(req.body);
        return success(res, { purchase: result }, 201);
    } catch (err) {
        return error(res, err.message, 500);
    }
});

router.get('/movements', async (req, res) => {
    try {
        const { dateFrom, dateTo, page, limit } = req.query;
        const result = await db.getMovements(dateFrom, dateTo, parseInt(page) || 1, parseInt(limit) || 1000);
        return success(res, result);
    } catch (err) {
        return error(res, err.message, 500);
    }
});

router.get('/movements/:id', async (req, res) => {
    try {
        const movement = await db.getMovementById(parseInt(req.params.id));
        if (!movement) return error(res, 'Movimiento no encontrado', 404);
        return success(res, { movement });
    } catch (err) {
        return error(res, err.message, 500);
    }
});

router.put('/movements/:id', async (req, res) => {
    try {
        const { amount, reason, user, restockItems } = req.body;
        await db.updateMovement(parseInt(req.params.id), amount, reason, user, restockItems);
        return success(res, { message: 'Movimiento actualizado' });
    } catch (err) {
        return error(res, err.message, 500);
    }
});

module.exports = router;
