const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { success, error } = require('../helpers/apiResponse');
const { verifyToken, generateToken } = require('../middleware/auth');

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return error(res, 'Usuario y contraseña requeridos');
        }

        const result = await db.authenticateUser(username, password);
        if (result.success) {
            const token = generateToken(result.user);
            return success(res, { token, user: result.user });
        }
        return error(res, result.message || 'Credenciales inválidas', 401);
    } catch (err) {
        console.error('Login error:', err);
        return error(res, 'Error interno del servidor', 500);
    }
});

router.get('/me', verifyToken, (req, res) => {
    return success(res, { user: req.user });
});

module.exports = router;
