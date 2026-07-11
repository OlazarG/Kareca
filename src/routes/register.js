const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { success, error } = require('../helpers/apiResponse');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

router.get('/status', async (req, res) => {
    try {
        const status = await db.getRegisterStatus();
        return success(res, { session: status });
    } catch (err) {
        return error(res, err.message, 500);
    }
});

router.post('/open', async (req, res) => {
    try {
        const { amount } = req.body;
        await db.openRegister(amount, req.user.username);
        return success(res, { message: 'Caja abierta' });
    } catch (err) {
        return error(res, err.message, 500);
    }
});

router.post('/close', async (req, res) => {
    try {
        const { finalCash } = req.body;
        await db.closeRegister(finalCash, req.user.username);
        return success(res, { message: 'Caja cerrada' });
    } catch (err) {
        return error(res, err.message, 500);
    }
});

module.exports = router;
