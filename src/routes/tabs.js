const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { success, error, safeError } = require('../helpers/apiResponse');
const { verifyToken, requirePermission } = require('../middleware/auth');

router.use(verifyToken, requirePermission('realizar_ventas'));

router.get('/', async (req, res) => {
    try {
        const tabs = await db.getOpenTabs();
        return success(res, { tabs });
    } catch (err) {
        return safeError(res, err);
    }
});

router.get('/table/:tableId', async (req, res) => {
    try {
        const tab = await db.getTabByTable(parseInt(req.params.tableId));
        return success(res, { tab });
    } catch (err) {
        return safeError(res, err);
    }
});

router.get('/:id', async (req, res) => {
    try {
        const details = await db.getTabDetails(parseInt(req.params.id));
        if (!details) return error(res, 'Comanda no encontrada', 404);
        return success(res, { tab: details });
    } catch (err) {
        return safeError(res, err);
    }
});

router.post('/', async (req, res) => {
    try {
        const { tableId, clientId } = req.body;
        const tab = await db.openTab(tableId, clientId, req.user.username);
        return success(res, { tab }, 201);
    } catch (err) {
        return safeError(res, err);
    }
});

router.post('/:id/items', async (req, res) => {
    try {
        await db.addItemToTab(parseInt(req.params.id), req.body.item);
        return success(res, { message: 'Item agregado' }, 201);
    } catch (err) {
        return safeError(res, err);
    }
});

router.delete('/:id/items/:itemId', async (req, res) => {
    try {
        await db.removeItemFromTab(parseInt(req.params.id), parseInt(req.params.itemId));
        return success(res, { message: 'Item eliminado' });
    } catch (err) {
        return safeError(res, err);
    }
});

router.put('/:id/items', async (req, res) => {
    try {
        await db.updateTabItems(parseInt(req.params.id), req.body.items);
        return success(res, { message: 'Items actualizados' });
    } catch (err) {
        return safeError(res, err);
    }
});

router.post('/:id/close', async (req, res) => {
    try {
        req.body.paymentData = req.body.paymentData || {};
        req.body.paymentData.user = req.user.username;
        const result = await db.closeTabAndProcessSale(parseInt(req.params.id), req.body.paymentData);
        return success(res, { result }, 201);
    } catch (err) {
        return safeError(res, err);
    }
});

router.post('/:id/split', async (req, res) => {
    try {
        const result = await db.splitTabAndProcessSale(parseInt(req.params.id), req.body.splits);
        return success(res, { result }, 201);
    } catch (err) {
        return safeError(res, err);
    }
});

module.exports = router;
