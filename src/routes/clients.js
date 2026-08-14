const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { success, error, safeError } = require('../helpers/apiResponse');
const { verifyToken, requirePermission } = require('../middleware/auth');

router.use(verifyToken);

router.get('/', async (req, res) => {
    try {
        const { search } = req.query;
        const clients = await db.getClients(search || '');
        return success(res, { clients });
    } catch (err) {
        return safeError(res, err);
    }
});

router.post('/', requirePermission('gestionar_clientes'), async (req, res) => {
    try {
        await db.createClient(req.body);
        return success(res, { message: 'Cliente creado' }, 201);
    } catch (err) {
        return safeError(res, err);
    }
});

router.put('/:id', requirePermission('gestionar_clientes'), async (req, res) => {
    try {
        await db.updateClient(parseInt(req.params.id), req.body);
        return success(res, { message: 'Cliente actualizado' });
    } catch (err) {
        return safeError(res, err);
    }
});

router.delete('/:id', requirePermission('gestionar_clientes'), async (req, res) => {
    try {
        await db.deleteClient(parseInt(req.params.id));
        return success(res, { message: 'Cliente eliminado' });
    } catch (err) {
        return safeError(res, err);
    }
});

module.exports = router;
