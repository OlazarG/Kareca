const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { success, error, serverError } = require('../helpers/apiResponse');
const { verifyToken } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { validate, schemas } = require('../helpers/validators');

router.use(verifyToken);

router.get('/status', async (req, res) => {
    try {
        const status = await db.getRegisterStatus();
        return success(res, { session: status });
    } catch (err) {
        return serverError(res, err);
    }
});

router.post('/open', authorize('gestionar_caja'), validate(schemas.registerOpen), async (req, res) => {
    try {
        const { amount } = req.body;
        await db.openRegister(amount, req.user.username);
        return success(res, { message: 'Caja abierta' });
    } catch (err) {
        return serverError(res, err);
    }
});

router.post('/close', authorize('gestionar_caja'), validate(schemas.registerClose), async (req, res) => {
    try {
        const { finalCash } = req.body;
        await db.closeRegister(finalCash, req.user.username);
        return success(res, { message: 'Caja cerrada' });
    } catch (err) {
        return serverError(res, err);
    }
});

module.exports = router;
