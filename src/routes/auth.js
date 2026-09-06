const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { success, error, safeError } = require('../helpers/apiResponse');
const { verifyToken, generateToken, tokenCookieOptions, COOKIE_NAME } = require('../middleware/auth');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        const username = req.body && req.body.username ? String(req.body.username).toLowerCase() : '';
        return `${ipKeyGenerator(req.ip)}:${username}`;
    },
    handler: (req, res) => res.status(429).json({
        success: false,
        message: 'Demasiados intentos de inicio de sesión. Intente nuevamente en 15 minutos.'
    })
});

router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return error(res, 'Usuario y contraseña requeridos');
        }

        const result = await db.authenticateUser(username, password);
        if (result.success) {
            const token = generateToken(result.user);
            res.cookie(COOKIE_NAME, token, tokenCookieOptions());
            return success(res, { user: result.user });
        }
        return error(res, result.message || 'Credenciales inválidas', 401);
    } catch (err) {
        console.error('Login error:', err);
        return error(res, 'Error interno del servidor', 500);
    }
});

router.post('/change-password', verifyToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return error(res, 'Contraseña actual y nueva requeridas');
        }
        if (typeof newPassword !== 'string' || newPassword.length < 8) {
            return error(res, 'La nueva contraseña debe tener al menos 8 caracteres');
        }
        const result = await db.changePassword(req.user.id, currentPassword, newPassword);
        if (!result.success) {
            return error(res, result.message, 400);
        }
        return success(res, { message: 'Contraseña actualizada. Inicie sesión nuevamente.' });
    } catch (err) {
        return safeError(res, err);
    }
});

router.get('/me', verifyToken, (req, res) => {
    return success(res, { user: req.user });
});

router.get('/check-permission', verifyToken, async (req, res) => {
    try {
        const permission = req.query.permission;
        if (!permission) {
            return error(res, 'Permiso no especificado', 400);
        }

        const result = await db.checkUserPermission(req.user.id, permission);
        return success(res, { hasPermission: result });
    } catch (err) {
        console.error('Check permission error:', err);
        return error(res, 'Error verificando permisos', 500);
    }
});

router.post('/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return success(res, { message: 'Sesión cerrada' });
});

module.exports = router;
