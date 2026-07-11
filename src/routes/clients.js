const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { success, error } = require('../helpers/apiResponse');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

router.get('/', async (req, res) => {
    try {
        const { search } = req.query;
        const clients = await db.getClients(search || '');
        return success(res, { clients });
    } catch (err) {
        return error(res, err.message, 500);
    }
});

router.post('/', async (req, res) => {
    try {
        await db.createClient(req.body);
        return success(res, { message: 'Cliente creado' }, 201);
    } catch (err) {
        return error(res, err.message, 500);
    }
});

router.put('/:id', async (req, res) => {
    try {
        await db.updateClient(parseInt(req.params.id), req.body);
        return success(res, { message: 'Cliente actualizado' });
    } catch (err) {
        return error(res, err.message, 500);
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await db.deleteClient(parseInt(req.params.id));
        return success(res, { message: 'Cliente eliminado' });
    } catch (err) {
        return error(res, err.message, 500);
    }
});

module.exports = router;
