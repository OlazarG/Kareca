const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const db = require('../database/db');
const { success, error } = require('../helpers/apiResponse');
const { verifyToken, generateToken } = require('../middleware/auth');
const { validate, schemas } = require('../helpers/validators');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, error: 'Demasiados intentos. Intente de nuevo en 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
});

router.post('/login', loginLimiter, validate(schemas.login), async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return error(res, 'Usuario y contraseña requeridos');
        }

        const result = await db.authenticateUser(username, password);
        if (result.success) {
            const token = generateToken(result.user);
            const isSecure = process.env.NODE_ENV === 'production' || process.env.HTTPS === 'true';
            res.cookie('token', token, {
                httpOnly: true,
                secure: isSecure,
                sameSite: 'strict',
                maxAge: 24 * 60 * 60 * 1000
            });
            return success(res, { token, user: result.user });
        }
        return error(res, 'Credenciales inválidas', 401);
    } catch (err) {
        console.error('Login error:', err);
        return error(res, 'Error interno del servidor', 500);
    }
});

router.get('/me', verifyToken, (req, res) => {
    return success(res, { user: req.user });
});

router.post('/logout', verifyToken, (req, res) => {
    const { blacklistToken } = require('../middleware/auth');
    let token = req.cookies?.token;
    if (!token) {
        const header = req.headers.authorization;
        if (header && header.startsWith('Bearer ')) {
            token = header.split(' ')[1];
        }
    }
    if (token) blacklistToken(token);
    res.clearCookie('token', { httpOnly: true, sameSite: 'strict' });
    return success(res, { message: 'Sesión cerrada' });
});

module.exports = router;
