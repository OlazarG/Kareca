// Resetea la contraseña de un usuario sin conocer la actual.
// Uso: node scripts/reset-password.js <usuario> <nuevaPassword> [--force]
//   --force  obliga a cambiar la contraseña en el próximo login (must_change_password = TRUE)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const crypto = require('crypto');
const { promisify } = require('util');
const { Pool } = require('pg');

const PBKDF2_ITERATIONS = 210000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = 'sha512';
const pbkdf2Async = promisify(crypto.pbkdf2);

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await pbkdf2Async(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST);
    return `${salt}:${PBKDF2_ITERATIONS}:${hash.toString('hex')}`;
}

async function main() {
    const [username, newPassword] = process.argv.slice(2);
    const force = process.argv.includes('--force');

    if (!username || !newPassword) {
        console.error('Uso: node scripts/reset-password.js <usuario> <nuevaPassword> [--force]');
        process.exit(1);
    }
    if (newPassword.length < 8) {
        console.error('La contraseña debe tener al menos 8 caracteres.');
        process.exit(1);
    }

    const requiredEnv = ['DB_USER', 'DB_HOST', 'DB_NAME', 'DB_PASSWORD', 'DB_PORT'];
    const missing = requiredEnv.filter((k) => !process.env[k]);
    if (missing.length > 0) {
        console.error(`Faltan variables de BD en ../.env: ${missing.join(', ')}`);
        process.exit(1);
    }

    const passwordHash = await hashPassword(newPassword);
    const res = await pool.query(
        'UPDATE users SET password_hash = $1, must_change_password = $2 WHERE username = $3 RETURNING id, username',
        [passwordHash, force, username]
    );

    if (res.rows.length === 0) {
        console.error(`Usuario '${username}' no encontrado.`);
        await pool.end();
        process.exit(1);
    }

    console.log(`Contraseña de '${username}' actualizada.`);
    console.log(force
        ? 'Se forzará el cambio de contraseña en el próximo login.'
        : 'El usuario puede iniciar sesión con la nueva contraseña.');
    await pool.end();
}

main().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
});
