require('dotenv').config();
const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

pool.on('connect', (client) => {
    const localTZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    if (/^[a-zA-Z0-9_\/-]+$/.test(localTZ)) {
        client.query(`SET timezone = '${localTZ}'`);
    } else {
        client.query("SET timezone = 'UTC'");
    }
});

// --- Password Hashing ---
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 600000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
    if (!storedHash || !storedHash.includes(':')) return false;
    const [salt, hash] = storedHash.split(':');
    const verifyHash = crypto.pbkdf2Sync(password, salt, 600000, 64, 'sha512').toString('hex');
    return hash === verifyHash;
}

// ============================================================
// SCHEMA INITIALIZATION
// ============================================================
async function initDatabase() {
    const client = await pool.connect();
    try {
        console.log("Connected to PostgreSQL, initializing educational schema...");
        await client.query('BEGIN');

        // --- Drop old POS tables ---
        await client.query('DROP TABLE IF EXISTS tab_items CASCADE');
        await client.query('DROP TABLE IF EXISTS tabs CASCADE');
        await client.query('DROP TABLE IF EXISTS detalles_venta CASCADE');
        await client.query('DROP TABLE IF EXISTS ventas CASCADE');
        await client.query('DROP TABLE IF EXISTS egresos CASCADE');
        await client.query('DROP TABLE IF EXISTS product_variants CASCADE');
        await client.query('DROP TABLE IF EXISTS products CASCADE');
        await client.query('DROP TABLE IF EXISTS categories CASCADE');
        await client.query('DROP TABLE IF EXISTS tables CASCADE');
        await client.query('DROP TABLE IF EXISTS clients CASCADE');

        // --- RBAC: Keep existing ---
        await client.query(`
            CREATE TABLE IF NOT EXISTS roles (
                id SERIAL PRIMARY KEY,
                name VARCHAR(50) UNIQUE NOT NULL,
                description TEXT
            )
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS permissions (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) UNIQUE NOT NULL,
                description TEXT
            )
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS role_permissions (
                role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
                permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
                PRIMARY KEY (role_id, permission_id)
            )
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL,
                status BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // --- Cash Sessions (keep) ---
        await client.query(`
            CREATE TABLE IF NOT EXISTS cash_sessions (
                id SERIAL PRIMARY KEY,
                opened_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                closed_at TIMESTAMPTZ,
                initial_cash DECIMAL(15,2) DEFAULT 0,
                final_cash DECIMAL(15,2) DEFAULT 0,
                total_sales_cash DECIMAL(15,2) DEFAULT 0,
                total_sales_other DECIMAL(15,2) DEFAULT 0,
                total_expenses DECIMAL(15,2) DEFAULT 0,
                income_difference DECIMAL(15,2) DEFAULT 0,
                declared_cash DECIMAL(15,2) DEFAULT 0,
                status VARCHAR(20) DEFAULT 'OPEN',
                user_name VARCHAR(100)
            )
        `);

        // --- Movements (keep, adapt) ---
        await client.query(`
            CREATE TABLE IF NOT EXISTS movements (
                id SERIAL PRIMARY KEY,
                date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                type VARCHAR(20) NOT NULL,
                description VARCHAR(255),
                motive TEXT,
                user_name VARCHAR(100) DEFAULT 'Cajero',
                payment_method VARCHAR(50),
                amount NUMERIC(15, 0) NOT NULL,
                is_edited BOOLEAN DEFAULT FALSE,
                edit_reason TEXT,
                details_json TEXT
            )
        `);

        // --- NEW: Alumnos ---
        await client.query(`
            CREATE TABLE IF NOT EXISTS alumnos (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(255) NOT NULL,
                apellido VARCHAR(255) NOT NULL,
                dni VARCHAR(50) UNIQUE,
                fecha_nacimiento DATE,
                email VARCHAR(255),
                telefono VARCHAR(50),
                direccion TEXT,
                observaciones TEXT,
                estado VARCHAR(20) DEFAULT 'ACTIVO',
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // --- NEW: Cursos ---
        await client.query(`
            CREATE TABLE IF NOT EXISTS cursos (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                nivel VARCHAR(50),
                turno VARCHAR(50),
                anio_lectivo INTEGER NOT NULL,
                cuota_mensual DECIMAL(15,2) DEFAULT 0,
                matricula_monto DECIMAL(15,2) DEFAULT 0,
                matricula_mec DECIMAL(15,2) DEFAULT 0,
                matricula_inst DECIMAL(15,2) DEFAULT 0,
                examen_parcial_monto DECIMAL(15,2) DEFAULT 0,
                examen_parcial_mec DECIMAL(15,2) DEFAULT 0,
                examen_parcial_inst DECIMAL(15,2) DEFAULT 0,
                examen_complementario_monto DECIMAL(15,2) DEFAULT 0,
                examen_complementario_mec DECIMAL(15,2) DEFAULT 0,
                examen_complementario_inst DECIMAL(15,2) DEFAULT 0,
                extra_ordinario_monto DECIMAL(15,2) DEFAULT 0,
                extra_ordinario_mec DECIMAL(15,2) DEFAULT 0,
                extra_ordinario_inst DECIMAL(15,2) DEFAULT 0,
                documento_expedido VARCHAR(50) DEFAULT '',
                documento_monto DECIMAL(15,2) DEFAULT 0,
                documento_mec DECIMAL(15,2) DEFAULT 0,
                documento_inst DECIMAL(15,2) DEFAULT 0,
                numero_resolucion VARCHAR(100) DEFAULT '',
                recargo_mora_pct DECIMAL(5,2) DEFAULT 0,
                dia_vencimiento INTEGER DEFAULT 10,
                tipo_periodo VARCHAR(20) DEFAULT 'ANUAL',
                activo BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query(`ALTER TABLE cursos ADD COLUMN IF NOT EXISTS tipo_periodo VARCHAR(20) DEFAULT 'ANUAL'`);
        await client.query(`ALTER TABLE cursos ADD COLUMN IF NOT EXISTS matricula_mec DECIMAL(15,2) DEFAULT 0`);
        await client.query(`ALTER TABLE cursos ADD COLUMN IF NOT EXISTS matricula_inst DECIMAL(15,2) DEFAULT 0`);
        await client.query(`ALTER TABLE cursos ADD COLUMN IF NOT EXISTS examen_parcial_monto DECIMAL(15,2) DEFAULT 0`);
        await client.query(`ALTER TABLE cursos ADD COLUMN IF NOT EXISTS examen_parcial_mec DECIMAL(15,2) DEFAULT 0`);
        await client.query(`ALTER TABLE cursos ADD COLUMN IF NOT EXISTS examen_parcial_inst DECIMAL(15,2) DEFAULT 0`);
        await client.query(`ALTER TABLE cursos ADD COLUMN IF NOT EXISTS examen_complementario_monto DECIMAL(15,2) DEFAULT 0`);
        await client.query(`ALTER TABLE cursos ADD COLUMN IF NOT EXISTS examen_complementario_mec DECIMAL(15,2) DEFAULT 0`);
        await client.query(`ALTER TABLE cursos ADD COLUMN IF NOT EXISTS examen_complementario_inst DECIMAL(15,2) DEFAULT 0`);
        await client.query(`ALTER TABLE cursos ADD COLUMN IF NOT EXISTS extra_ordinario_monto DECIMAL(15,2) DEFAULT 0`);
        await client.query(`ALTER TABLE cursos ADD COLUMN IF NOT EXISTS extra_ordinario_mec DECIMAL(15,2) DEFAULT 0`);
        await client.query(`ALTER TABLE cursos ADD COLUMN IF NOT EXISTS extra_ordinario_inst DECIMAL(15,2) DEFAULT 0`);
        await client.query(`ALTER TABLE cursos ADD COLUMN IF NOT EXISTS documento_expedido VARCHAR(50) DEFAULT ''`);
        await client.query(`ALTER TABLE cursos ADD COLUMN IF NOT EXISTS documento_monto DECIMAL(15,2) DEFAULT 0`);
        await client.query(`ALTER TABLE cursos ADD COLUMN IF NOT EXISTS documento_mec DECIMAL(15,2) DEFAULT 0`);
        await client.query(`ALTER TABLE cursos ADD COLUMN IF NOT EXISTS documento_inst DECIMAL(15,2) DEFAULT 0`);
        await client.query(`ALTER TABLE cursos ADD COLUMN IF NOT EXISTS numero_resolucion VARCHAR(100) DEFAULT ''`);

        // --- NEW: Historial de costos de cursos ---
        await client.query(`
            CREATE TABLE IF NOT EXISTS curso_costos_historial (
                id SERIAL PRIMARY KEY,
                curso_id INTEGER REFERENCES cursos(id) ON DELETE CASCADE,
                numero_resolucion VARCHAR(100) DEFAULT '',
                cuota_mensual DECIMAL(15,2) DEFAULT 0,
                matricula_monto DECIMAL(15,2) DEFAULT 0,
                matricula_mec DECIMAL(15,2) DEFAULT 0,
                matricula_inst DECIMAL(15,2) DEFAULT 0,
                examen_parcial_monto DECIMAL(15,2) DEFAULT 0,
                examen_parcial_mec DECIMAL(15,2) DEFAULT 0,
                examen_parcial_inst DECIMAL(15,2) DEFAULT 0,
                examen_complementario_monto DECIMAL(15,2) DEFAULT 0,
                examen_complementario_mec DECIMAL(15,2) DEFAULT 0,
                examen_complementario_inst DECIMAL(15,2) DEFAULT 0,
                extra_ordinario_monto DECIMAL(15,2) DEFAULT 0,
                extra_ordinario_mec DECIMAL(15,2) DEFAULT 0,
                extra_ordinario_inst DECIMAL(15,2) DEFAULT 0,
                documento_expedido VARCHAR(50) DEFAULT '',
                documento_monto DECIMAL(15,2) DEFAULT 0,
                documento_mec DECIMAL(15,2) DEFAULT 0,
                documento_inst DECIMAL(15,2) DEFAULT 0,
                modified_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                modified_by VARCHAR(100) DEFAULT ''
            )
        `);

        await client.query(`ALTER TABLE curso_costos_historial ADD COLUMN IF NOT EXISTS documento_expedido VARCHAR(50) DEFAULT ''`);
        await client.query(`ALTER TABLE curso_costos_historial ADD COLUMN IF NOT EXISTS documento_monto DECIMAL(15,2) DEFAULT 0`);
        await client.query(`ALTER TABLE curso_costos_historial ADD COLUMN IF NOT EXISTS documento_mec DECIMAL(15,2) DEFAULT 0`);
        await client.query(`ALTER TABLE curso_costos_historial ADD COLUMN IF NOT EXISTS documento_inst DECIMAL(15,2) DEFAULT 0`);

        // --- NEW: Responsables ---
        await client.query(`
            CREATE TABLE IF NOT EXISTS responsables (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(255) NOT NULL,
                apellido VARCHAR(255) NOT NULL,
                dni VARCHAR(50) UNIQUE,
                email VARCHAR(255),
                telefono VARCHAR(50),
                telefono_alt VARCHAR(50),
                direccion TEXT,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // --- NEW: Alumno-Responsable ---
        await client.query(`
            CREATE TABLE IF NOT EXISTS alumno_responsable (
                alumno_id INTEGER REFERENCES alumnos(id) ON DELETE CASCADE,
                responsable_id INTEGER REFERENCES responsables(id) ON DELETE CASCADE,
                parentesco VARCHAR(50),
                es_principal BOOLEAN DEFAULT FALSE,
                PRIMARY KEY (alumno_id, responsable_id)
            )
        `);

        // --- NEW: Matriculas ---
        await client.query(`
            CREATE TABLE IF NOT EXISTS matriculas (
                id SERIAL PRIMARY KEY,
                alumno_id INTEGER REFERENCES alumnos(id) ON DELETE CASCADE,
                curso_id INTEGER REFERENCES cursos(id) ON DELETE CASCADE,
                anio_lectivo INTEGER NOT NULL,
                periodo INTEGER DEFAULT 1,
                fecha_inscripcion TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                estado VARCHAR(20) DEFAULT 'ACTIVA',
                UNIQUE(alumno_id, curso_id, anio_lectivo, periodo)
            )
        `);

        // --- NEW: Cuotas (plan de pagos por curso) ---
        await client.query(`
            CREATE TABLE IF NOT EXISTS cuotas (
                id SERIAL PRIMARY KEY,
                curso_id INTEGER REFERENCES cursos(id) ON DELETE CASCADE,
                anio_lectivo INTEGER NOT NULL,
                periodo INTEGER DEFAULT 1,
                nombre VARCHAR(100) NOT NULL,
                monto DECIMAL(15, 2) NOT NULL,
                fecha_vencimiento DATE,
                orden INTEGER,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // --- Migraciones: períodos (anual / semestral) ---
        await client.query(`ALTER TABLE matriculas ADD COLUMN IF NOT EXISTS periodo INTEGER DEFAULT 1`);
        await client.query(`ALTER TABLE cuotas ADD COLUMN IF NOT EXISTS periodo INTEGER DEFAULT 1`);
        await client.query(`ALTER TABLE matriculas DROP CONSTRAINT IF EXISTS matriculas_alumno_id_curso_id_anio_lectivo_key`);
        const periodoConstraint = await client.query(`SELECT 1 FROM pg_constraint WHERE conname = 'matriculas_alumno_id_curso_id_anio_lectivo_periodo_key'`);
        if (periodoConstraint.rows.length === 0) {
            await client.query(`ALTER TABLE matriculas ADD CONSTRAINT matriculas_alumno_id_curso_id_anio_lectivo_periodo_key UNIQUE (alumno_id, curso_id, anio_lectivo, periodo)`);
        }
        await client.query(`CREATE INDEX IF NOT EXISTS idx_matriculas_curso_periodo ON matriculas (curso_id, anio_lectivo, periodo, estado)`);

        // --- NEW: Pagos Recibidos ---
        await client.query(`
            CREATE TABLE IF NOT EXISTS pagos_recibidos (
                id SERIAL PRIMARY KEY,
                alumno_id INTEGER REFERENCES alumnos(id) ON DELETE SET NULL,
                matricula_id INTEGER REFERENCES matriculas(id) ON DELETE SET NULL,
                cuota_id INTEGER REFERENCES cuotas(id) ON DELETE SET NULL,
                responsable_id INTEGER REFERENCES responsables(id) ON DELETE SET NULL,
                monto DECIMAL(15, 2) NOT NULL,
                concepto VARCHAR(255),
                metodo_pago VARCHAR(50),
                fecha_pago TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                comprobante VARCHAR(100),
                observaciones TEXT,
                user_name VARCHAR(100),
                estado VARCHAR(20) DEFAULT 'CONFIRMADO',
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // --- NEW: Config del instituto ---
        await client.query(`
            CREATE TABLE IF NOT EXISTS instituto_config (
                id SERIAL PRIMARY KEY,
                clave VARCHAR(100) UNIQUE NOT NULL,
                valor TEXT
            )
        `);

        // Seed config defaults
        const configCount = await client.query('SELECT COUNT(*) FROM instituto_config');
        if (parseInt(configCount.rows[0].count) === 0) {
            await client.query(`INSERT INTO instituto_config (clave, valor) VALUES
                ('nombre_instituto', 'Instituto'),
                ('recargo_mora_default', '10'),
                ('dia_vencimiento_default', '10'),
                ('anio_lectivo_actual', '${new Date().getFullYear()}')
            `);
        }

        // --- Seed Roles ---
        const rolesCount = await client.query('SELECT COUNT(*) FROM roles');
        if (parseInt(rolesCount.rows[0].count) === 0) {
            await client.query(`INSERT INTO roles (name, description) VALUES
                ('Administrador', 'Acceso total al sistema'),
                ('Cobrador', 'Acceso a cobros, alumnos y reportes'),
                ('Consulta', 'Solo consulta de datos')
            `);
        }

        // --- Seed Permissions ---
        const permsCount = await client.query('SELECT COUNT(*) FROM permissions');
        if (parseInt(permsCount.rows[0].count) === 0) {
            await client.query(`INSERT INTO permissions (name, description) VALUES
                ('ver_reportes', 'Ver reportes y estadísticas'),
                ('gestionar_alumnos', 'Crear, editar y eliminar alumnos'),
                ('gestionar_cursos', 'Crear, editar y eliminar cursos y cuotas'),
                ('gestionar_caja', 'Abrir, cerrar y controlar la caja'),
                ('gestionar_usuarios', 'Crear, editar y eliminar usuarios del sistema'),
                ('realizar_cobros', 'Registrar cobros de cuotas'),
                ('gestionar_responsables', 'Crear, editar y eliminar responsables'),
                ('gestionar_matriculas', 'Inscribir y dar de baja alumnos'),
                ('ver_morosidad', 'Ver dashboard de morosidad y deudores')
            `);
        }

        // --- Seed Role Permissions ---
        const rolePermsCount = await client.query('SELECT COUNT(*) FROM role_permissions');
        if (parseInt(rolePermsCount.rows[0].count) === 0) {
            const adminRole = await client.query("SELECT id FROM roles WHERE name = 'Administrador'");
            if (adminRole.rows.length > 0) {
                await client.query(`INSERT INTO role_permissions (role_id, permission_id)
                    SELECT $1, id FROM permissions`, [adminRole.rows[0].id]);
            }

            const cobradorRole = await client.query("SELECT id FROM roles WHERE name = 'Cobrador'");
            if (cobradorRole.rows.length > 0) {
                await client.query(`INSERT INTO role_permissions (role_id, permission_id)
                    SELECT $1, id FROM permissions WHERE name IN
                    ('realizar_cobros', 'gestionar_alumnos', 'gestionar_responsables', 'ver_morosidad', 'ver_reportes', 'gestionar_caja')`,
                    [cobradorRole.rows[0].id]);
            }
        }

        // --- Seed Admin ---
        const usersCount = await client.query('SELECT COUNT(*) FROM users');
        if (parseInt(usersCount.rows[0].count) === 0) {
            const adminRole = await client.query("SELECT id FROM roles WHERE name = 'Administrador'");
            if (adminRole.rows.length > 0) {
                const adminPassword = process.env.ADMIN_PASSWORD || crypto.randomBytes(4).toString('hex');
                const adminHash = hashPassword(adminPassword);
                await client.query(`INSERT INTO users (username, password_hash, role_id, status)
                    VALUES ('admin', $1, $2, TRUE)`, [adminHash, adminRole.rows[0].id]);
                console.log(`Admin user created. Password: ${adminPassword}`);
            }
        } else if (process.env.ADMIN_PASSWORD) {
            const adminHash = hashPassword(process.env.ADMIN_PASSWORD);
            await client.query(`UPDATE users SET password_hash = $1 WHERE username = 'admin'`, [adminHash]);
            console.log('Admin password updated from ADMIN_PASSWORD env var.');
        }

        await client.query('COMMIT');
        console.log("Educational schema initialized successfully.");
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Error initializing database:", e);
    } finally {
        client.release();
    }
}

initDatabase();

// ============================================================
// AUTH & USER MANAGEMENT (kept from Kareca)
// ============================================================

async function authenticateUser(username, password) {
    const res = await pool.query(`
        SELECT u.*, r.name as role_name
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        WHERE u.username = $1 AND u.status = TRUE
    `, [username]);

    if (res.rows.length === 0) {
        return { success: false, message: 'Usuario no encontrado.' };
    }

    const user = res.rows[0];
    if (!verifyPassword(password, user.password_hash)) {
        return { success: false, message: 'Contraseña incorrecta.' };
    }

    const permsRes = await pool.query(`
        SELECT p.name
        FROM role_permissions rp
        JOIN permissions p ON rp.permission_id = p.id
        WHERE rp.role_id = $1
    `, [user.role_id]);

    return {
        success: true,
        user: {
            id: user.id,
            username: user.username,
            role_name: user.role_name,
            role_id: user.role_id,
            permissions: permsRes.rows.map(r => r.name)
        }
    };
}

async function getUsers() {
    const res = await pool.query(`
        SELECT u.id, u.username, u.role_id, r.name as role_name, u.status, u.created_at
        FROM users u LEFT JOIN roles r ON u.role_id = r.id
        ORDER BY u.username ASC
    `);
    return res.rows;
}

async function getRoles() {
    const res = await pool.query('SELECT * FROM roles ORDER BY name ASC');
    return res.rows;
}

async function createUser(userData) {
    const { username, password, role_id } = userData;
    const passwordHash = hashPassword(password);
    try {
        await pool.query(
            'INSERT INTO users (username, password_hash, role_id, status) VALUES ($1, $2, $3, TRUE)',
            [username, passwordHash, role_id]
        );
        return { success: true };
    } catch (e) {
        if (e.code === '23505') throw new Error(`El usuario '${username}' ya existe.`);
        throw e;
    }
}

async function updateUser(id, userData) {
    const { username, password, role_id, status } = userData;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        if (password && password.trim() !== '') {
            const passwordHash = hashPassword(password);
            await client.query(
                'UPDATE users SET username = $1, password_hash = $2, role_id = $3, status = $4 WHERE id = $5',
                [username, passwordHash, role_id, status, id]
            );
        } else {
            await client.query(
                'UPDATE users SET username = $1, role_id = $2, status = $3 WHERE id = $4',
                [username, role_id, status, id]
            );
        }
        await client.query('COMMIT');
        return { success: true };
    } catch (e) {
        await client.query('ROLLBACK');
        if (e.code === '23505') throw new Error(`El nombre de usuario '${username}' ya está en uso.`);
        throw e;
    } finally {
        client.release();
    }
}

async function deleteUser(id) {
    const checkRes = await pool.query('SELECT username FROM users WHERE id = $1', [id]);
    if (checkRes.rows.length > 0 && checkRes.rows[0].username === 'admin') {
        throw new Error('No se puede eliminar el usuario administrador principal.');
    }
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    return { success: true };
}

async function getPermissions() {
    const res = await pool.query('SELECT * FROM permissions ORDER BY description ASC');
    return res.rows;
}

async function getRolePermissions(roleId) {
    const res = await pool.query('SELECT permission_id FROM role_permissions WHERE role_id = $1', [roleId]);
    return res.rows.map(row => row.permission_id);
}

async function updateRolePermissions(roleId, permissionIds) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
        if (permissionIds && permissionIds.length > 0) {
            for (const permId of permissionIds) {
                await client.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)', [roleId, permId]);
            }
        }
        await client.query('COMMIT');
        return { success: true };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

// ============================================================
// ALUMNOS CRUD
// ============================================================

async function getAlumnos(search = '', page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (search) {
        whereClause += ` AND (a.nombre ILIKE $${paramIndex} OR a.apellido ILIKE $${paramIndex} OR a.dni ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
    }

    const countRes = await pool.query(`SELECT COUNT(*) FROM alumnos a ${whereClause}`, params);
    const total = parseInt(countRes.rows[0].count);

    const res = await pool.query(`
        SELECT a.*
        FROM alumnos a
        ${whereClause}
        ORDER BY a.apellido ASC, a.nombre ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]);

    return { rows: res.rows, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function getAlumnoById(id) {
    const res = await pool.query('SELECT * FROM alumnos WHERE id = $1', [id]);
    return res.rows[0] || null;
}

async function createAlumno(data) {
    try {
        const res = await pool.query(
            `INSERT INTO alumnos (nombre, apellido, dni, fecha_nacimiento, email, telefono, direccion, observaciones)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [data.nombre, data.apellido, data.dni, data.fecha_nacimiento, data.email, data.telefono, data.direccion, data.observaciones]
        );
        return res.rows[0];
    } catch (e) {
        if (e.code === '23505') throw new Error(`El DNI '${data.dni}' ya está registrado.`);
        throw e;
    }
}

async function updateAlumno(id, data) {
    try {
        await pool.query(
            `UPDATE alumnos SET nombre=$1, apellido=$2, dni=$3, fecha_nacimiento=$4, email=$5, telefono=$6, direccion=$7, observaciones=$8, estado=$9 WHERE id=$10`,
            [data.nombre, data.apellido, data.dni, data.fecha_nacimiento, data.email, data.telefono, data.direccion, data.observaciones, data.estado || 'ACTIVO', id]
        );
        return { success: true };
    } catch (e) {
        if (e.code === '23505') throw new Error(`El DNI '${data.dni}' ya está registrado.`);
        throw e;
    }
}

async function deleteAlumno(id) {
    await pool.query('DELETE FROM alumnos WHERE id = $1', [id]);
    return { success: true };
}

// ============================================================
// CURSOS CRUD
// ============================================================

async function getCursos(anioLectivo = null) {
    let query = `SELECT c.*,
        (SELECT COUNT(DISTINCT m.alumno_id) FROM matriculas m
         WHERE m.curso_id = c.id AND m.anio_lectivo = c.anio_lectivo AND m.estado = 'ACTIVA') as alumno_count
        FROM cursos c`;
    const params = [];
    if (anioLectivo) {
        query += ' WHERE c.anio_lectivo = $1';
        params.push(anioLectivo);
    }
    query += ' ORDER BY c.anio_lectivo DESC, c.nombre ASC';
    const res = await pool.query(query, params);
    return res.rows;
}

async function getCursoById(id) {
    const res = await pool.query('SELECT * FROM cursos WHERE id = $1', [id]);
    return res.rows[0] || null;
}

async function createCurso(data) {
    const matriculaTotal = (parseFloat(data.matricula_mec) || 0) + (parseFloat(data.matricula_inst) || 0);
    const res = await pool.query(
        `INSERT INTO cursos (nombre, nivel, turno, anio_lectivo, cuota_mensual, matricula_monto, matricula_mec, matricula_inst, examen_parcial_monto, examen_parcial_mec, examen_parcial_inst, examen_complementario_monto, examen_complementario_mec, examen_complementario_inst, extra_ordinario_monto, extra_ordinario_mec, extra_ordinario_inst, documento_expedido, documento_monto, documento_mec, documento_inst, numero_resolucion, recargo_mora_pct, dia_vencimiento, tipo_periodo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) RETURNING *`,
        [data.nombre, data.nivel, data.turno, data.anio_lectivo, data.cuota_mensual, matriculaTotal,
         data.matricula_mec || 0, data.matricula_inst || 0,
         (parseFloat(data.examen_parcial_mec)||0)+(parseFloat(data.examen_parcial_inst)||0), data.examen_parcial_mec || 0, data.examen_parcial_inst || 0,
         (parseFloat(data.examen_complementario_mec)||0)+(parseFloat(data.examen_complementario_inst)||0), data.examen_complementario_mec || 0, data.examen_complementario_inst || 0,
         (parseFloat(data.extra_ordinario_mec)||0)+(parseFloat(data.extra_ordinario_inst)||0), data.extra_ordinario_mec || 0, data.extra_ordinario_inst || 0,
         data.documento_expedido || '', (parseFloat(data.documento_mec)||0)+(parseFloat(data.documento_inst)||0), data.documento_mec || 0, data.documento_inst || 0,
         data.numero_resolucion || '', data.recargo_mora_pct, data.dia_vencimiento, data.tipo_periodo || 'ANUAL']
    );
    return res.rows[0];
}

async function updateCurso(id, data) {
    const matriculaTotal = (parseFloat(data.matricula_mec) || 0) + (parseFloat(data.matricula_inst) || 0);
    await snapshotCursoCostos(id, data.numero_resolucion || '', data.modified_by || '');
    await pool.query(
        `UPDATE cursos SET nombre=$1, nivel=$2, turno=$3, anio_lectivo=$4, cuota_mensual=$5, matricula_monto=$6, matricula_mec=$7, matricula_inst=$8, examen_parcial_monto=$9, examen_parcial_mec=$10, examen_parcial_inst=$11, examen_complementario_monto=$12, examen_complementario_mec=$13, examen_complementario_inst=$14, extra_ordinario_monto=$15, extra_ordinario_mec=$16, extra_ordinario_inst=$17, documento_expedido=$18, documento_monto=$19, documento_mec=$20, documento_inst=$21, numero_resolucion=$22, recargo_mora_pct=$23, dia_vencimiento=$24, tipo_periodo=$25, activo=$26 WHERE id=$27`,
        [data.nombre, data.nivel, data.turno, data.anio_lectivo, data.cuota_mensual, matriculaTotal,
         data.matricula_mec || 0, data.matricula_inst || 0,
         (parseFloat(data.examen_parcial_mec)||0)+(parseFloat(data.examen_parcial_inst)||0), data.examen_parcial_mec || 0, data.examen_parcial_inst || 0,
         (parseFloat(data.examen_complementario_mec)||0)+(parseFloat(data.examen_complementario_inst)||0), data.examen_complementario_mec || 0, data.examen_complementario_inst || 0,
         (parseFloat(data.extra_ordinario_mec)||0)+(parseFloat(data.extra_ordinario_inst)||0), data.extra_ordinario_mec || 0, data.extra_ordinario_inst || 0,
         data.documento_expedido || '', (parseFloat(data.documento_mec)||0)+(parseFloat(data.documento_inst)||0), data.documento_mec || 0, data.documento_inst || 0,
         data.numero_resolucion || '', data.recargo_mora_pct, data.dia_vencimiento, data.tipo_periodo || 'ANUAL', data.activo !== false, id]
    );
    return { success: true };
}

async function batchUpdateCursos(ids, fields, modifiedBy) {
    if (!fields || Object.keys(fields).length === 0) throw new Error('No hay campos para actualizar');

    const fieldMap = {
        cuota_mensual: 'cuota_mensual',
        recargo_mora_pct: 'recargo_mora_pct',
        dia_vencimiento: 'dia_vencimiento',
        tipo_periodo: 'tipo_periodo',
        activo: 'activo',
        numero_resolucion: 'numero_resolucion',
        matricula_mec: 'matricula_mec',
        matricula_inst: 'matricula_inst',
        examen_parcial_mec: 'examen_parcial_mec',
        examen_parcial_inst: 'examen_parcial_inst',
        examen_complementario_mec: 'examen_complementario_mec',
        examen_complementario_inst: 'examen_complementario_inst',
        extra_ordinario_mec: 'extra_ordinario_mec',
        extra_ordinario_inst: 'extra_ordinario_inst',
        documento_expedido: 'documento_expedido',
        documento_mec: 'documento_mec',
        documento_inst: 'documento_inst',
    };

    const montoPairs = [
        { mec: 'matricula_mec', inst: 'matricula_inst', montoCol: 'matricula_monto' },
        { mec: 'examen_parcial_mec', inst: 'examen_parcial_inst', montoCol: 'examen_parcial_monto' },
        { mec: 'examen_complementario_mec', inst: 'examen_complementario_inst', montoCol: 'examen_complementario_monto' },
        { mec: 'extra_ordinario_mec', inst: 'extra_ordinario_inst', montoCol: 'extra_ordinario_monto' },
        { mec: 'documento_mec', inst: 'documento_inst', montoCol: 'documento_monto' },
    ];

    const setClauses = [];
    const staticParams = [];
    let idx = 1;

    for (const [key, col] of Object.entries(fieldMap)) {
        if (fields[key] === undefined) continue;
        setClauses.push(`${col} = $${idx++}`);
        const val = fields[key];
        if (key === 'activo') {
            staticParams.push(val !== false);
        } else if (key === 'tipo_periodo') {
            staticParams.push(val === 'SEMESTRAL' || val === 'ANUAL' ? val : 'ANUAL');
        } else if (key === 'dia_vencimiento') {
            staticParams.push(parseInt(val) || 10);
        } else if (key === 'numero_resolucion') {
            staticParams.push(val ?? '');
        } else if (key === 'documento_expedido') {
            staticParams.push(['', 'TITULO', 'CERTIFICACION', 'CONSTANCIA'].includes(val) ? val : '');
        } else {
            staticParams.push(typeof val === 'number' ? val : (parseFloat(val) || 0));
        }
    }

    const computedMontos = [];
    for (const pair of montoPairs) {
        if (fields[pair.mec] !== undefined || fields[pair.inst] !== undefined) {
            setClauses.push(`${pair.montoCol} = $${idx++}`);
            computedMontos.push(pair);
        }
    }

    if (setClauses.length === 0) throw new Error('No hay campos validos para actualizar');

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let cursos;
        if (ids && ids.length > 0) {
            const res = await client.query('SELECT * FROM cursos WHERE id = ANY($1::int[]) FOR UPDATE', [ids]);
            cursos = res.rows;
        } else {
            const res = await client.query('SELECT * FROM cursos FOR UPDATE');
            cursos = res.rows;
        }

        if (cursos.length === 0) throw new Error('No se encontraron cursos');

        const setStr = setClauses.join(', ');
        const updateSql = `UPDATE cursos SET ${setStr} WHERE id = $${idx}`;

        for (const curso of cursos) {
            const resolucion = fields.numero_resolucion ?? curso.numero_resolucion ?? '';
            await client.query(
                `INSERT INTO curso_costos_historial (curso_id, numero_resolucion, cuota_mensual, matricula_monto, matricula_mec, matricula_inst, examen_parcial_monto, examen_parcial_mec, examen_parcial_inst, examen_complementario_monto, examen_complementario_mec, examen_complementario_inst, extra_ordinario_monto, extra_ordinario_mec, extra_ordinario_inst, documento_expedido, documento_monto, documento_mec, documento_inst, modified_by)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
                [curso.id, resolucion, curso.cuota_mensual, curso.matricula_monto, curso.matricula_mec, curso.matricula_inst,
                 curso.examen_parcial_monto, curso.examen_parcial_mec, curso.examen_parcial_inst,
                 curso.examen_complementario_monto, curso.examen_complementario_mec, curso.examen_complementario_inst,
                 curso.extra_ordinario_monto, curso.extra_ordinario_mec, curso.extra_ordinario_inst,
                 curso.documento_expedido || '', curso.documento_monto || 0, curso.documento_mec || 0, curso.documento_inst || 0,
                 modifiedBy || '']
            );

            const dynamicParams = computedMontos.map(pair => {
                const mec = fields[pair.mec] !== undefined ? fields[pair.mec] : 0;
                const inst = fields[pair.inst] !== undefined ? fields[pair.inst] : 0;
                return (parseFloat(mec) || 0) + (parseFloat(inst) || 0);
            });

            const rowParams = [...staticParams, ...dynamicParams, curso.id];
            await client.query(updateSql, rowParams);
        }

        await client.query('COMMIT');
        return { success: true, updated: cursos.length };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

async function deleteCurso(id) {
    await pool.query('DELETE FROM cursos WHERE id = $1', [id]);
    return { success: true };
}

async function snapshotCursoCostos(cursoId, numeroResolucion, modifiedBy) {
    const curso = await getCursoById(cursoId);
    if (!curso) return;
    await pool.query(
        `INSERT INTO curso_costos_historial (curso_id, numero_resolucion, cuota_mensual, matricula_monto, matricula_mec, matricula_inst, examen_parcial_monto, examen_parcial_mec, examen_parcial_inst, examen_complementario_monto, examen_complementario_mec, examen_complementario_inst, extra_ordinario_monto, extra_ordinario_mec, extra_ordinario_inst, documento_expedido, documento_monto, documento_mec, documento_inst, modified_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [cursoId, numeroResolucion, curso.cuota_mensual, curso.matricula_monto, curso.matricula_mec, curso.matricula_inst,
         curso.examen_parcial_monto, curso.examen_parcial_mec, curso.examen_parcial_inst,
         curso.examen_complementario_monto, curso.examen_complementario_mec, curso.examen_complementario_inst,
         curso.extra_ordinario_monto, curso.extra_ordinario_mec, curso.extra_ordinario_inst,
         curso.documento_expedido || '', curso.documento_monto || 0, curso.documento_mec || 0, curso.documento_inst || 0,
         modifiedBy || '']
    );
}

async function getCursoCostHistory(cursoId) {
    const res = await pool.query(
        'SELECT * FROM curso_costos_historial WHERE curso_id = $1 ORDER BY modified_at DESC',
        [cursoId]
    );
    return res.rows;
}

// ============================================================
// CUOTAS CRUD
// ============================================================

async function getCuotas(cursoId, anioLectivo, periodo = null) {
    let query = 'SELECT * FROM cuotas WHERE curso_id = $1 AND anio_lectivo = $2';
    const params = [cursoId, anioLectivo];
    if (periodo) {
        query += ' AND periodo = $3';
        params.push(periodo);
    }
    query += ' ORDER BY orden ASC';
    const res = await pool.query(query, params);
    return res.rows;
}

async function createCuota(data) {
    const res = await pool.query(
        `INSERT INTO cuotas (curso_id, anio_lectivo, periodo, nombre, monto, fecha_vencimiento, orden)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [data.curso_id, data.anio_lectivo, data.periodo || 1, data.nombre, data.monto, data.fecha_vencimiento, data.orden]
    );
    return res.rows[0];
}

async function deleteCuota(id) {
    await pool.query('DELETE FROM cuotas WHERE id = $1', [id]);
    return { success: true };
}

async function generarCuotasAutomaticas(cursoId, anioLectivo) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM cuotas WHERE curso_id = $1 AND anio_lectivo = $2', [cursoId, anioLectivo]);

        const cursoRes = await client.query('SELECT * FROM cursos WHERE id = $1', [cursoId]);
        if (cursoRes.rows.length === 0) throw new Error('Curso no encontrado');
        const curso = cursoRes.rows[0];

        const mesesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const now = new Date();
        const mesActual = now.getMonth(); // 0-11
        const dia = curso.dia_vencimiento || 10;
        const esSemestral = curso.tipo_periodo === 'SEMESTRAL';
        const cuotasCreadas = [];

        for (let i = 0; i < 12; i++) {
            const mesOffset = (mesActual + i) % 12;
            const yearOffset = Math.floor((mesActual + i) / 12);
            const anioVenc = anioLectivo + yearOffset;
            const mesNum = mesOffset + 1;
            const monto = i === 0 ? curso.matricula_monto : curso.cuota_mensual;
            const nombre = i === 0 ? 'Matrícula' : mesesNombres[mesOffset];
            const periodo = esSemestral ? (i === 0 || mesNum <= 6 ? 1 : 2) : 1;
            const fechaVenc = `${anioVenc}-${String(mesNum).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

            const res = await client.query(
                `INSERT INTO cuotas (curso_id, anio_lectivo, periodo, nombre, monto, fecha_vencimiento, orden)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
                [cursoId, anioLectivo, periodo, nombre, monto, fechaVenc, i + 1]
            );
            cuotasCreadas.push(res.rows[0]);
        }

        await client.query('COMMIT');
        return cuotasCreadas;
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

// ============================================================
// RESPONSABLES CRUD
// ============================================================

async function getResponsables(search = '') {
    let query = 'SELECT * FROM responsables';
    const params = [];
    if (search) {
        query += ' WHERE nombre ILIKE $1 OR apellido ILIKE $1 OR dni ILIKE $1';
        params.push(`%${search}%`);
    }
    query += ' ORDER BY apellido ASC, nombre ASC';
    const res = await pool.query(query, params);
    return res.rows;
}

async function getResponsableById(id) {
    const res = await pool.query('SELECT * FROM responsables WHERE id = $1', [id]);
    return res.rows[0] || null;
}

async function createResponsable(data) {
    try {
        const res = await pool.query(
            `INSERT INTO responsables (nombre, apellido, dni, email, telefono, telefono_alt, direccion)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [data.nombre, data.apellido, data.dni, data.email, data.telefono, data.telefono_alt, data.direccion]
        );
        return res.rows[0];
    } catch (e) {
        if (e.code === '23505') throw new Error(`El DNI '${data.dni}' ya está registrado.`);
        throw e;
    }
}

async function updateResponsable(id, data) {
    try {
        await pool.query(
            `UPDATE responsables SET nombre=$1, apellido=$2, dni=$3, email=$4, telefono=$5, telefono_alt=$6, direccion=$7 WHERE id=$8`,
            [data.nombre, data.apellido, data.dni, data.email, data.telefono, data.telefono_alt, data.direccion, id]
        );
        return { success: true };
    } catch (e) {
        if (e.code === '23505') throw new Error(`El DNI '${data.dni}' ya está registrado.`);
        throw e;
    }
}

async function deleteResponsable(id) {
    await pool.query('DELETE FROM responsables WHERE id = $1', [id]);
    return { success: true };
}

async function getResponsablesByAlumno(alumnoId) {
    const res = await pool.query(`
        SELECT r.*, ar.parentesco, ar.es_principal
        FROM responsables r
        JOIN alumno_responsable ar ON r.id = ar.responsable_id
        WHERE ar.alumno_id = $1
        ORDER BY ar.es_principal DESC
    `, [alumnoId]);
    return res.rows;
}

async function asignarResponsable(alumnoId, responsableId, parentesco, esPrincipal = false) {
    await pool.query(
        `INSERT INTO alumno_responsable (alumno_id, responsable_id, parentesco, es_principal)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (alumno_id, responsable_id) DO UPDATE SET parentesco = $3, es_principal = $4`,
        [alumnoId, responsableId, parentesco, esPrincipal]
    );
    return { success: true };
}

async function desasignarResponsable(alumnoId, responsableId) {
    await pool.query(
        'DELETE FROM alumno_responsable WHERE alumno_id = $1 AND responsable_id = $2',
        [alumnoId, responsableId]
    );
    return { success: true };
}

// ============================================================
// ALUMNOS POR CURSO
// ============================================================

async function getAlumnosByCurso(cursoId, anioLectivo, periodo = null, page = 1, limit = 10) {
    const where = `m.curso_id = $1 AND m.anio_lectivo = $2 AND m.estado = 'ACTIVA'`;
    const params = [cursoId, anioLectivo];
    if (periodo) {
        params.push(periodo);
    }
    const wherePeriodo = periodo ? where + ` AND m.periodo = $3` : where;

    const countRes = await pool.query(`SELECT COUNT(*)::int as total FROM matriculas m WHERE ${wherePeriodo}`, params);
    const total = countRes.rows[0].total;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 10));
    const offset = (pageNum - 1) * limitNum;

    const res = await pool.query(`
        SELECT a.id, a.nombre, a.apellido, a.dni, a.telefono, a.email, a.estado,
               m.periodo, m.fecha_inscripcion, m.anio_lectivo
        FROM alumnos a
        JOIN matriculas m ON a.id = m.alumno_id
        WHERE ${wherePeriodo}
        ORDER BY a.apellido ASC, a.nombre ASC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limitNum, offset]);

    return {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.max(1, Math.ceil(total / limitNum)),
        alumnos: res.rows
    };
}

// ============================================================
// MATRICULAS
// ============================================================

async function getMatriculas(alumnoId = null, cursoId = null, anioLectivo = null, periodo = null) {
    let query = `
        SELECT m.*, a.nombre as alumno_nombre, a.apellido as alumno_apellido, a.dni as alumno_dni,
               c.nombre as curso_nombre, c.nivel, c.turno, c.tipo_periodo
        FROM matriculas m
        JOIN alumnos a ON m.alumno_id = a.id
        JOIN cursos c ON m.curso_id = c.id
        WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (alumnoId) { query += ` AND m.alumno_id = $${paramIndex++}`; params.push(alumnoId); }
    if (cursoId) { query += ` AND m.curso_id = $${paramIndex++}`; params.push(cursoId); }
    if (anioLectivo) { query += ` AND m.anio_lectivo = $${paramIndex++}`; params.push(anioLectivo); }
    if (periodo) { query += ` AND m.periodo = $${paramIndex++}`; params.push(periodo); }

    query += ' ORDER BY a.apellido ASC, a.nombre ASC';
    const res = await pool.query(query, params);
    return res.rows;
}

async function getMatriculaById(id) {
    const res = await pool.query(`
        SELECT m.*, a.nombre as alumno_nombre, a.apellido as alumno_apellido,
               c.nombre as curso_nombre, c.nivel, c.turno
        FROM matriculas m
        JOIN alumnos a ON m.alumno_id = a.id
        JOIN cursos c ON m.curso_id = c.id
        WHERE m.id = $1
    `, [id]);
    return res.rows[0] || null;
}

async function createMatricula(data) {
    try {
        const res = await pool.query(
            `INSERT INTO matriculas (alumno_id, curso_id, anio_lectivo, periodo)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [data.alumno_id, data.curso_id, data.anio_lectivo, data.periodo || 1]
        );
        return res.rows[0];
    } catch (e) {
        if (e.code === '23505') throw new Error('El alumno ya está matriculado en este curso y período para este año lectivo.');
        throw e;
    }
}

async function bajaMatricula(id) {
    await pool.query("UPDATE matriculas SET estado = 'BAJA' WHERE id = $1", [id]);
    return { success: true };
}

// ============================================================
// PAGOS RECIBIDOS
// ============================================================

async function getPagos(filtros = {}) {
    let query = `
        SELECT p.*, a.nombre as alumno_nombre, a.apellido as alumno_apellido,
               r.nombre as responsable_nombre, r.apellido as responsable_apellido,
               c.nombre as curso_nombre, cu.nombre as cuota_nombre
        FROM pagos_recibidos p
        LEFT JOIN alumnos a ON p.alumno_id = a.id
        LEFT JOIN responsables r ON p.responsable_id = r.id
        LEFT JOIN cuotas cu ON p.cuota_id = cu.id
        LEFT JOIN matriculas m ON p.matricula_id = m.id
        LEFT JOIN cursos c ON m.curso_id = c.id
        WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (filtros.alumnoId) { query += ` AND p.alumno_id = $${paramIndex++}`; params.push(filtros.alumnoId); }
    if (filtros.fechaFrom) { query += ` AND p.fecha_pago >= $${paramIndex++}`; params.push(filtros.fechaFrom + ' 00:00:00'); }
    if (filtros.fechaTo) { query += ` AND p.fecha_pago <= $${paramIndex++}`; params.push(filtros.fechaTo + ' 23:59:59'); }
    if (filtros.metodoPago) { query += ` AND p.metodo_pago = $${paramIndex++}`; params.push(filtros.metodoPago); }

    if (filtros.page) {
        const offset = (filtros.page - 1) * (filtros.limit || 20);
        const countRes = await pool.query(query.replace(/SELECT .* FROM/, 'SELECT COUNT(*) FROM'), params);
        const total = parseInt(countRes.rows[0].count);

        query += ' ORDER BY p.fecha_pago DESC';
        query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(filtros.limit || 20, offset);

        const res = await pool.query(query, params);
        return { rows: res.rows, total, page: filtros.page, limit: filtros.limit || 20, totalPages: Math.ceil(total / (filtros.limit || 20)) };
    }

    query += ' ORDER BY p.fecha_pago DESC';
    const res = await pool.query(query, params);
    return res.rows;
}

async function registrarPago(data) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const res = await client.query(
            `INSERT INTO pagos_recibidos (alumno_id, matricula_id, cuota_id, responsable_id, monto, concepto, metodo_pago, comprobante, observaciones, user_name)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [data.alumno_id, data.matricula_id, data.cuota_id, data.responsable_id, data.monto, data.concepto, data.metodo_pago, data.comprobante, data.observaciones, data.user_name]
        );

        await client.query(
            `INSERT INTO movements (type, description, motive, user_name, payment_method, amount, details_json)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                'INGRESO',
                `${data.concepto || 'Pago de cuota'}`,
                `Alumno ID: ${data.alumno_id} - Cuota: ${data.cuota_id || 'N/A'}`,
                data.user_name || 'Sistema',
                data.metodo_pago,
                data.monto,
                JSON.stringify({ pago_id: res.rows[0].id, alumno_id: data.alumno_id, cuota_id: data.cuota_id })
            ]
        );

        await client.query('COMMIT');
        return res.rows[0];
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

async function anularPago(id, motivo, user) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const pagoRes = await client.query('SELECT * FROM pagos_recibidos WHERE id = $1 AND estado = $2', [id, 'CONFIRMADO']);
        if (pagoRes.rows.length === 0) throw new Error('Pago no encontrado o ya anulado.');

        const pago = pagoRes.rows[0];
        await client.query("UPDATE pagos_recibidos SET estado = 'ANULADO' WHERE id = $1", [id]);

        await client.query(
            `INSERT INTO movements (type, description, motive, user_name, payment_method, amount, details_json)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                'EGRESO',
                `Anulación de pago #${id}`,
                motivo || 'Anulación',
                user || 'Sistema',
                pago.metodo_pago,
                pago.monto,
                JSON.stringify({ pago_anulado_id: id })
            ]
        );

        await client.query('COMMIT');
        return { success: true };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

// ============================================================
// DEUDA / MOROSIDAD
// ============================================================

async function getDeudaAlumno(alumnoId, anioLectivo) {
    const res = await pool.query(`
        SELECT
            m.id as matricula_id,
            m.curso_id,
            c.nombre as curso_nombre,
            cu.id as cuota_id,
            cu.nombre as cuota_nombre,
            cu.monto,
            cu.fecha_vencimiento,
            cu.orden,
            COALESCE((
                SELECT SUM(p.monto) FROM pagos_recibidos p
                WHERE p.cuota_id = cu.id AND p.alumno_id = $1 AND p.estado = 'CONFIRMADO'
            ), 0) as monto_pagado,
            cu.monto - COALESCE((
                SELECT SUM(p.monto) FROM pagos_recibidos p
                WHERE p.cuota_id = cu.id AND p.alumno_id = $1 AND p.estado = 'CONFIRMADO'
            ), 0) as saldo_pendiente,
            CASE
                WHEN cu.fecha_vencimiento < CURRENT_DATE
                     AND cu.monto - COALESCE((SELECT SUM(p.monto) FROM pagos_recibidos p WHERE p.cuota_id = cu.id AND p.alumno_id = $1 AND p.estado = 'CONFIRMADO'), 0) > 0
                THEN TRUE
                ELSE FALSE
            END as vencida,
            CASE
                WHEN c.recargo_mora_pct > 0
                     AND cu.fecha_vencimiento < CURRENT_DATE
                     AND cu.monto - COALESCE((SELECT SUM(p.monto) FROM pagos_recibidos p WHERE p.cuota_id = cu.id AND p.alumno_id = $1 AND p.estado = 'CONFIRMADO'), 0) > 0
                THEN ROUND(cu.monto * c.recargo_mora_pct / 100, 0)
                ELSE 0
            END as recargo_mora
        FROM matriculas m
        JOIN cursos c ON m.curso_id = c.id
        JOIN cuotas cu ON cu.curso_id = c.id AND cu.anio_lectivo = m.anio_lectivo AND cu.periodo = m.periodo
        WHERE m.alumno_id = $1 AND m.anio_lectivo = $2 AND m.estado = 'ACTIVA'
        ORDER BY cu.orden ASC
    `, [alumnoId, anioLectivo]);
    return res.rows;
}

async function getDeudores(anioLectivo) {
    const res = await pool.query(`
        SELECT
            a.id as alumno_id,
            a.nombre,
            a.apellido,
            a.dni,
            a.telefono,
            c.nombre as curso,
            COUNT(CASE WHEN cu.fecha_vencimiento < CURRENT_DATE
                       AND cu.monto - COALESCE((SELECT SUM(p.monto) FROM pagos_recibidos p WHERE p.cuota_id = cu.id AND p.alumno_id = a.id AND p.estado = 'CONFIRMADO'), 0) > 0
                  THEN 1 END) as cuotas_vencidas,
            SUM(CASE WHEN cu.fecha_vencimiento < CURRENT_DATE
                     THEN cu.monto - COALESCE((SELECT SUM(p.monto) FROM pagos_recibidos p WHERE p.cuota_id = cu.id AND p.alumno_id = a.id AND p.estado = 'CONFIRMADO'), 0)
                     ELSE 0 END) as deuda_total,
            MAX(CASE WHEN cu.fecha_vencimiento < CURRENT_DATE THEN cu.fecha_vencimiento END) as ultima_fecha_vencida
        FROM alumnos a
        JOIN matriculas m ON a.id = m.alumno_id
        JOIN cursos c ON m.curso_id = c.id
        JOIN cuotas cu ON cu.curso_id = c.id AND cu.anio_lectivo = m.anio_lectivo AND cu.periodo = m.periodo
        WHERE m.anio_lectivo = $1 AND m.estado = 'ACTIVA'
        GROUP BY a.id, a.nombre, a.apellido, a.dni, a.telefono, c.nombre
        HAVING SUM(CASE WHEN cu.fecha_vencimiento < CURRENT_DATE
                        AND cu.monto - COALESCE((SELECT SUM(p.monto) FROM pagos_recibidos p WHERE p.cuota_id = cu.id AND p.alumno_id = a.id AND p.estado = 'CONFIRMADO'), 0) > 0
                   THEN 1 END) > 0
        ORDER BY deuda_total DESC
    `, [anioLectivo]);
    return res.rows;
}

// ============================================================
// REPORTES
// ============================================================

async function getResumenCobros(dateFrom, dateTo) {
    const start = dateFrom + ' 00:00:00';
    const end = dateTo + ' 23:59:59';

    const totalRes = await pool.query(`
        SELECT
            COUNT(*) as cantidad_pagos,
            COALESCE(SUM(monto), 0) as monto_total,
            COALESCE(SUM(CASE WHEN metodo_pago = 'Efectivo' THEN monto ELSE 0 END), 0) as efectivo,
            COALESCE(SUM(CASE WHEN metodo_pago = 'Transferencia' THEN monto ELSE 0 END), 0) as transferencia,
            COALESCE(SUM(CASE WHEN metodo_pago = 'Tarjeta' THEN monto ELSE 0 END), 0) as tarjeta
        FROM pagos_recibidos
        WHERE fecha_pago BETWEEN $1 AND $2 AND estado = 'CONFIRMADO'
    `, [start, end]);

    const porCursoRes = await pool.query(`
        SELECT c.nombre as curso, COUNT(p.id) as cantidad, COALESCE(SUM(p.monto), 0) as total
        FROM pagos_recibidos p
        JOIN matriculas m ON p.matricula_id = m.id
        JOIN cursos c ON m.curso_id = c.id
        WHERE p.fecha_pago BETWEEN $1 AND $2 AND p.estado = 'CONFIRMADO'
        GROUP BY c.nombre
        ORDER BY total DESC
    `, [start, end]);

    const porDiaRes = await pool.query(`
        SELECT DATE(fecha_pago) as fecha, COUNT(*) as cantidad, COALESCE(SUM(monto), 0) as total
        FROM pagos_recibidos
        WHERE fecha_pago BETWEEN $1 AND $2 AND estado = 'CONFIRMADO'
        GROUP BY DATE(fecha_pago)
        ORDER BY fecha DESC
    `, [start, end]);

    return {
        resumen: totalRes.rows[0],
        porCurso: porCursoRes.rows,
        porDia: porDiaRes.rows
    };
}

async function getEstadisticasGenerales(anioLectivo) {
    const alumnosRes = await pool.query(
        "SELECT COUNT(DISTINCT alumno_id) as total FROM matriculas WHERE anio_lectivo = $1 AND estado = 'ACTIVA'", [anioLectivo]
    );
    const cursosRes = await pool.query(
        'SELECT COUNT(*) as total FROM cursos WHERE anio_lectivo = $1 AND activo = TRUE', [anioLectivo]
    );
    const pagosRes = await pool.query(`
        SELECT COALESCE(SUM(monto), 0) as total
        FROM pagos_recibidos
        WHERE estado = 'CONFIRMADO'
          AND EXTRACT(YEAR FROM fecha_pago) = $1
    `, [anioLectivo]);

    const deudoresRes = await getDeudores(anioLectivo);

    return {
        totalAlumnos: parseInt(alumnosRes.rows[0].total),
        totalCursos: parseInt(cursosRes.rows[0].total),
        totalCobrado: parseInt(pagosRes.rows[0].total),
        totalDeudores: deudoresRes.length,
        deudaTotal: deudoresRes.reduce((sum, d) => sum + parseInt(d.deuda_total), 0)
    };
}

// ============================================================
// CONFIG INSTITUTO
// ============================================================

async function getConfig() {
    const res = await pool.query('SELECT * FROM instituto_config');
    const config = {};
    res.rows.forEach(r => { config[r.clave] = r.valor; });
    return config;
}

async function updateConfig(clave, valor) {
    await pool.query(
        'INSERT INTO instituto_config (clave, valor) VALUES ($1, $2) ON CONFLICT (clave) DO UPDATE SET valor = $2',
        [clave, valor]
    );
    return { success: true };
}

// ============================================================
// CASH REGISTER (kept from Kareca)
// ============================================================

async function getRegisterStatus() {
    const res = await pool.query('SELECT * FROM cash_sessions ORDER BY id DESC LIMIT 1');
    if (res.rows.length === 0) return { status: 'CLOSED' };
    return res.rows[0];
}

async function openRegister(amount, user) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('INSERT INTO cash_sessions (initial_cash, status, user_name) VALUES ($1, $2, $3)', [amount, 'OPEN', user]);
        await client.query(
            `INSERT INTO movements (type, description, motive, user_name, payment_method, amount)
             VALUES ('APERTURA', 'Apertura de Caja', 'Saldo Inicial', $1, 'Efectivo', $2)`,
            [user, amount]
        );
        await client.query('COMMIT');
        return { success: true };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

async function closeRegister(finalCash, user) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const sessionRes = await client.query("SELECT * FROM cash_sessions WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1");
        if (sessionRes.rows.length === 0) throw new Error("No hay caja abierta.");
        const session = sessionRes.rows[0];

        const movementsRes = await pool.query('SELECT * FROM movements WHERE date >= $1', [session.opened_at]);
        let salesCash = 0, salesOther = 0, expenses = 0;

        movementsRes.rows.forEach(m => {
            if (m.type === 'APERTURA' || m.type === 'CIERRE') return;
            const amt = parseInt(m.amount);
            if (m.type === 'INGRESO') {
                if (m.payment_method === 'Efectivo') salesCash += amt;
                else salesOther += amt;
            } else if (m.type === 'EGRESO') {
                expenses += amt;
            }
        });

        const expectedCash = parseInt(session.initial_cash) + salesCash - expenses;
        const diff = finalCash - expectedCash;

        await client.query(
            `UPDATE cash_sessions SET closed_at=CURRENT_TIMESTAMP, final_cash=$1, declared_cash=$1,
             total_sales_cash=$2, total_sales_other=$3, total_expenses=$4, income_difference=$5,
             status='CLOSED', user_name=$6 WHERE id=$7`,
            [finalCash, salesCash, salesOther, expenses, diff, user, session.id]
        );

        const diffText = diff === 0 ? '(Cuadre Ok)' : (diff > 0 ? `(Sobra ${diff})` : `(Falta ${Math.abs(diff)})`);
        await client.query(
            `INSERT INTO movements (type, description, motive, user_name, payment_method, amount, details_json)
             VALUES ('CIERRE', 'Cierre de Caja', $1, $2, 'Efectivo', $3, $4)`,
            [diffText, user, finalCash, JSON.stringify({ expected: expectedCash, declared: finalCash, difference: diff, salesCash, salesDigital: salesOther, expenses })]
        );

        await client.query('COMMIT');
        return { success: true, difference: diff, expected: expectedCash };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

async function getMovements(dateFrom, dateTo, page = 1, limit = 20) {
    if (!dateFrom || !dateTo) {
        const today = new Date().toISOString().split('T')[0];
        dateFrom = today;
        dateTo = today;
    }
    const offset = (page - 1) * limit;
    const start = `${dateFrom} 00:00:00`;
    const end = `${dateTo} 23:59:59`;

    const countRes = await pool.query('SELECT COUNT(*) FROM movements WHERE date BETWEEN $1 AND $2', [start, end]);
    const total = parseInt(countRes.rows[0].count || 0);

    const res = await pool.query(
        'SELECT * FROM movements WHERE date BETWEEN $1 AND $2 ORDER BY date DESC LIMIT $3 OFFSET $4',
        [start, end, limit, offset]
    );

    const statsRes = await pool.query(`
        SELECT
            SUM(CASE WHEN type = 'INGRESO' THEN amount ELSE 0 END) as total_ingreso,
            SUM(CASE WHEN type = 'EGRESO' THEN amount ELSE 0 END) as total_egreso,
            SUM(CASE WHEN type = 'APERTURA' THEN amount ELSE 0 END) as total_apertura
        FROM movements WHERE date BETWEEN $1 AND $2
    `, [start, end]);

    return { rows: res.rows, total, page, limit, totalPages: Math.ceil(total / limit), periodStats: statsRes.rows[0] };
}

async function updateMovement(id, amount, reason) {
    await pool.query(
        'UPDATE movements SET amount = $1, is_edited = TRUE, edit_reason = $2 WHERE id = $3',
        [amount, reason, id]
    );
    return { success: true };
}

async function getMovementById(id) {
    const res = await pool.query('SELECT * FROM movements WHERE id = $1', [id]);
    return res.rows[0];
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
    pool,
    initDatabase,
    // Auth
    authenticateUser,
    getUsers,
    getRoles,
    createUser,
    updateUser,
    deleteUser,
    getPermissions,
    getRolePermissions,
    updateRolePermissions,
    // Alumnos
    getAlumnos,
    getAlumnoById,
    createAlumno,
    updateAlumno,
    deleteAlumno,
    // Cursos
    getCursos,
    getCursoById,
    createCurso,
    updateCurso,
    batchUpdateCursos,
    deleteCurso,
    snapshotCursoCostos,
    getCursoCostHistory,
    // Cuotas
    getCuotas,
    createCuota,
    deleteCuota,
    generarCuotasAutomaticas,
    // Responsables
    getResponsables,
    getResponsableById,
    createResponsable,
    updateResponsable,
    deleteResponsable,
    getResponsablesByAlumno,
    asignarResponsable,
    desasignarResponsable,
    // Alumnos por Curso
    getAlumnosByCurso,
    // Matriculas
    getMatriculas,
    getMatriculaById,
    createMatricula,
    bajaMatricula,
    // Pagos
    getPagos,
    registrarPago,
    anularPago,
    // Deuda / Morosidad
    getDeudaAlumno,
    getDeudores,
    // Reportes
    getResumenCobros,
    getEstadisticasGenerales,
    // Config
    getConfig,
    updateConfig,
    // Cash
    getRegisterStatus,
    openRegister,
    closeRegister,
    getMovements,
    updateMovement,
    getMovementById
};
