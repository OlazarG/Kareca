const jwt = require('jsonwebtoken');
const { error } = require('../helpers/apiResponse');

const JWT_SECRET = process.env.JWT_SECRET || 'kareca-dev-secret-change-in-production';
const tokenBlacklist = new Set();

function verifyToken(req, res, next) {
    let token = req.cookies?.token;

    if (!token) {
        const header = req.headers.authorization;
        if (!header || !header.startsWith('Bearer ')) {
            return error(res, 'Token requerido', 401);
        }
        token = header.split(' ')[1];
    }

    if (tokenBlacklist.has(token)) {
        return error(res, 'Token inválido o expirado', 401);
    }

    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        return error(res, 'Token inválido o expirado', 401);
    }
}

function generateToken(user) {
    return jwt.sign(
        { id: user.id, username: user.username, role_name: user.role_name, role_id: user.role_id, permissions: user.permissions },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
}

function blacklistToken(token) {
    tokenBlacklist.add(token);
}

module.exports = { verifyToken, generateToken, blacklistToken };
