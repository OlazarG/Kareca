const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { success, error, safeError } = require('../helpers/apiResponse');
const { verifyToken, requirePermission } = require('../middleware/auth');

router.use(verifyToken);

router.get('/status', async (req, res) => {
    try {
        const status = await db.getRegisterStatus();
        return success(res, { session: status });
    } catch (err) {
        return safeError(res, err);
    }
});

router.post('/open', requirePermission('gestionar_caja'), async (req, res) => {
    try {
        const { amount } = req.body;
        await db.openRegister(amount, req.user.username);
        return success(res, { message: 'Caja abierta' });
    } catch (err) {
        return safeError(res, err);
    }
});

router.post('/close', requirePermission('gestionar_caja'), async (req, res) => {
    try {
        const { finalCash } = req.body;
        await db.closeRegister(finalCash, req.user.username);
        return success(res, { message: 'Caja cerrada' });
    } catch (err) {
        return safeError(res, err);
    }
});

module.exports = router;
