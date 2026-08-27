const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { success, error, serverError } = require('../helpers/apiResponse');
const { verifyToken } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { validate, schemas } = require('../helpers/validators');

router.use(verifyToken);

router.get('/', async (req, res) => {
    try {
        const { search } = req.query;
        const responsables = await db.getResponsables(search || '');
        return success(res, { responsables });
    } catch (err) {
        return serverError(res, err);
    }
});

router.get('/:id', async (req, res) => {
    try {
        const responsable = await db.getResponsableById(req.params.id);
        if (!responsable) return error(res, 'Responsable no encontrado', 404);
        return success(res, { responsable });
    } catch (err) {
        return serverError(res, err);
    }
});

router.post('/', authorize('gestionar_responsables'), validate(schemas.responsable), async (req, res) => {
    try {
        const responsable = await db.createResponsable(req.body);
        return success(res, { responsable }, 201);
    } catch (err) {
        return error(res, err.message);
    }
});

router.put('/:id', authorize('gestionar_responsables'), validate(schemas.responsable), async (req, res) => {
    try {
        await db.updateResponsable(req.params.id, req.body);
        return success(res, { message: 'Responsable actualizado' });
    } catch (err) {
        return error(res, err.message);
    }
});

router.delete('/:id', authorize('gestionar_responsables'), async (req, res) => {
    try {
        await db.deleteResponsable(req.params.id);
        return success(res, { message: 'Responsable eliminado' });
    } catch (err) {
        return serverError(res, err);
    }
});

module.exports = router;
