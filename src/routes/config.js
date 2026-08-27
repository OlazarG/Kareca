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
        const config = await db.getConfig();
        return success(res, config);
    } catch (err) {
        return serverError(res, err);
    }
});

router.put('/', authorize('gestionar_usuarios'), validate(schemas.configUpdate), async (req, res) => {
    try {
        const { clave, valor } = req.body;
        if (!clave || valor === undefined) return error(res, 'Clave y valor requeridos');
        await db.updateConfig(clave, valor);
        return success(res, { message: 'Configuración actualizada' });
    } catch (err) {
        return serverError(res, err);
    }
});

module.exports = router;
