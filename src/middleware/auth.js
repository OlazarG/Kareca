const jwt = require('jsonwebtoken');
const { error } = require('../helpers/apiResponse');

const isProduction = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET;

if (isProduction && !JWT_SECRET) {
    console.error('FATAL: JWT_SECRET es obligatorio cuando NODE_ENV=production.');
    console.error('Generá uno con: openssl rand -base64 64');
    process.exit(1);
}

if (!isProduction && !JWT_SECRET) {
    console.warn('ADVERTENCIA: JWT_SECRET no definido. Usando secreto de desarrollo (solo local).');
}

const DEV_SECRET = 'kareca-dev-secret-change-in-production';

const COOKIE_NAME = 'token';
const COOKIE_MAX_AGE = 24 * 60 * 60 * 1000; // 24h, igual al expiresIn del JWT

function getSecret() {
    return JWT_SECRET || DEV_SECRET;
}

function readTokenFromRequest(req) {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
        return header.split(' ')[1];
    }
    const cookies = req.headers.cookie;
    if (cookies) {
        const match = cookies.split(';').map(s => s.trim()).find(c => c.startsWith(COOKIE_NAME + '='));
        if (match) return decodeURIComponent(match.slice(COOKIE_NAME.length + 1));
    }
    return null;
}

function tokenCookieOptions() {
    return {
        httpOnly: true,
        sameSite: 'strict',
        secure: isProduction,
        path: '/',
        maxAge: COOKIE_MAX_AGE
    };
}

function verifyToken(req, res, next) {
    const token = readTokenFromRequest(req);
    if (!token) {
        return error(res, 'Token requerido', 401);
    }

    try {
        req.user = jwt.verify(token, getSecret());
        if (req.user.must_change_password && req.baseUrl !== '/api/auth') {
            return error(res, 'Debe cambiar su contraseña antes de continuar.', 403);
        }
        next();
    } catch (err) {
        return error(res, 'Token inválido o expirado', 401);
    }
}

function requirePermission(permission) {
    return function (req, res, next) {
        if (!req.user) {
            return error(res, 'No autorizado', 401);
        }
        const permissions = req.user.permissions || [];
        if (!permissions.includes(permission)) {
            return error(res, 'No tiene permisos para realizar esta acción', 403);
        }
        next();
    };
}

function generateToken(user) {
    return jwt.sign(
        {
            id: user.id,
            username: user.username,
            role_name: user.role_name,
            role_id: user.role_id,
            permissions: user.permissions,
            must_change_password: !!user.must_change_password
        },
        getSecret(),
        { expiresIn: '24h' }
    );
}

module.exports = {
    verifyToken,
    requirePermission,
    generateToken,
    readTokenFromRequest,
    tokenCookieOptions,
    COOKIE_NAME
};
