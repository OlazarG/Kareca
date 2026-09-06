require('dotenv').config();
const { Pool } = require('pg');
const crypto = require('crypto');
const { promisify } = require('util');

const pbkdf2Async = promisify(crypto.pbkdf2);

const dbConfig = {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'KARECA_DB',
    password: typeof process.env.DB_PASSWORD === 'string' ? process.env.DB_PASSWORD : 'postgres',
    port: Number(process.env.DB_PORT || 5432),
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
};

const pool = new Pool(dbConfig);



pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

pool.on('connect', (client) => {
    const localTZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    if (/^[a-zA-Z0-9_\-\/]+$/.test(localTZ)) {
        client.query(`SET timezone = '${localTZ}'`);
    } else {
        client.query("SET timezone = 'UTC'");
    }
});

const { userError } = require('../helpers/apiResponse');

const PBKDF2_ITERATIONS = 210000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = 'sha512';
const PBKDF2_LEGACY_ITERATIONS = 1000;

function timingSafeEqual(a, b) {
    const bufA = Buffer.isBuffer(a) ? a : Buffer.from(a, 'hex');
    const bufB = Buffer.isBuffer(b) ? b : Buffer.from(b, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await pbkdf2Async(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST);
    return `${salt}:${PBKDF2_ITERATIONS}:${hash.toString('hex')}`;
}

async function checkPassword(password, storedHash) {
    if (!storedHash || typeof storedHash !== 'string') return { match: false };
    const parts = storedHash.split(':');
    let salt, hashHex, iterations;
    if (parts.length === 2) {
        [salt, hashHex] = parts;
        iterations = PBKDF2_LEGACY_ITERATIONS;
    } else if (parts.length === 3) {
        [salt, iterationsStr, hashHex] = parts;
        iterations = parseInt(iterationsStr, 10);
        if (!Number.isInteger(iterations) || iterations < PBKDF2_LEGACY_ITERATIONS) return { match: false };
    } else {
        return { match: false };
    }
    const candidate = await pbkdf2Async(password, salt, iterations, PBKDF2_KEYLEN, PBKDF2_DIGEST);
    const match = timingSafeEqual(Buffer.from(hashHex, 'hex'), candidate);
    return { match, needsRehash: iterations < PBKDF2_ITERATIONS };
}

// Initialize Database Schema
async function initDatabase() {
    const client = await pool.connect();
    try {
        console.log("Connected to PostgreSQL, initializing schema...");
        await client.query('BEGIN');

        // Table: products (Parent)
        await client.query(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                category VARCHAR(100),
                base_cost DECIMAL(15, 2) NOT NULL,
                stock_total INTEGER DEFAULT 0,
                min_stock INTEGER DEFAULT 5, -- Custom Limit
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Table: categories
        await client.query(`
            CREATE TABLE IF NOT EXISTS categories (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) UNIQUE NOT NULL
            );
        `);

        // Seed default categories if empty
        const checkCategories = await client.query('SELECT COUNT(*) FROM categories');
        if (parseInt(checkCategories.rows[0].count) === 0) {
            console.log("Seeding default categories...");
            const defaultCats = ['Aros', 'Collares', 'Cadenas', 'Pulseras', 'Brazaletes', 'Anillos', 'Set', 'Cintos', 'Relojes', 'Hebillas', 'Varios'];
            for (const cat of defaultCats) {
                await client.query('INSERT INTO categories (name) VALUES ($1) ON CONFLICT DO NOTHING', [cat]);
            }
        }

        // Check if min_stock column exists (migration for existing)
        const checkCol = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='products' AND column_name='min_stock'");
        if (checkCol.rows.length === 0) {
            console.log("Migrating: Adding min_stock column...");
            await client.query("ALTER TABLE products ADD COLUMN min_stock INTEGER DEFAULT 5");
        }

        // ... (Rest of Tables)

        // ...

        // ... (Existing tables continue)



        // Create Product Variants Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS product_variants (
                id SERIAL PRIMARY KEY,
                product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
                variant_name VARCHAR(50) NOT NULL,
                barcode VARCHAR(100) UNIQUE,
                quantity INTEGER NOT NULL,
                sale_price NUMERIC(10, 0) NOT NULL
            );
        `);

        // Create Movements Table (Planilla)
        await client.query(`
            CREATE TABLE IF NOT EXISTS movements (
                id SERIAL PRIMARY KEY,
                date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                type VARCHAR(20) NOT NULL, -- 'INGRESO', 'EGRESO'
                description VARCHAR(255),
                motive TEXT, -- JSON string or text detailing items
                user_name VARCHAR(100) DEFAULT 'Cajero',
                payment_method VARCHAR(50),
                amount NUMERIC(15, 0) NOT NULL,
                is_edited BOOLEAN DEFAULT FALSE,
                edit_reason TEXT,
                details_json TEXT
            );
        `);

        // Migration for existing table
        const checkEditCol = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='movements' AND column_name='is_edited'");
        if (checkEditCol.rows.length === 0) {
            console.log("Migrating: Adding is_edited and edit_reason columns...");
            await client.query("ALTER TABLE movements ADD COLUMN is_edited BOOLEAN DEFAULT FALSE");
            await client.query("ALTER TABLE movements ADD COLUMN edit_reason TEXT");
        }

        const checkDetailsCol = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='movements' AND column_name='details_json'");
        if (checkDetailsCol.rows.length === 0) {
            console.log("Migrating: Adding details_json column...");
            await client.query("ALTER TABLE movements ADD COLUMN details_json TEXT");
        }

        // Sales tables
        await client.query(`
            CREATE TABLE IF NOT EXISTS ventas (
                id SERIAL PRIMARY KEY,
                fecha TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                total DECIMAL(15, 2) NOT NULL
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS detalles_venta (
                id SERIAL PRIMARY KEY,
                venta_id INTEGER NOT NULL REFERENCES ventas(id),
                producto_id INTEGER NOT NULL REFERENCES products(id),
                cantidad INTEGER NOT NULL,
                precio_unitario DECIMAL(15, 2) NOT NULL,
                subtotal DECIMAL(15, 2) NOT NULL
            );
        `);

        // Egresos
        await client.query(`
            CREATE TABLE IF NOT EXISTS egresos (
                id SERIAL PRIMARY KEY,
                descripcion TEXT NOT NULL,
                monto DECIMAL(15, 2) NOT NULL,
                fecha TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Cash Sessions (Caja)
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
                status VARCHAR(20) DEFAULT 'OPEN', -- 'OPEN', 'CLOSED'
                user_name VARCHAR(100)
            );
        `);

        // Migration for cash_sessions (if table existed before new columns)
        const checkSessionCols = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='cash_sessions' AND column_name='total_sales_cash'");
        if (checkSessionCols.rows.length === 0) {
            console.log("Migrating: Adding columns to cash_sessions...");
            await client.query("ALTER TABLE cash_sessions ADD COLUMN total_sales_cash DECIMAL(15,2) DEFAULT 0");
            await client.query("ALTER TABLE cash_sessions ADD COLUMN total_sales_other DECIMAL(15,2) DEFAULT 0");
            await client.query("ALTER TABLE cash_sessions ADD COLUMN total_expenses DECIMAL(15,2) DEFAULT 0");
            await client.query("ALTER TABLE cash_sessions ADD COLUMN income_difference DECIMAL(15,2) DEFAULT 0");
            // Check user_name separately just in case
        }

        const checkSessionUser = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='cash_sessions' AND column_name='user_name'");
        if (checkSessionUser.rows.length === 0) {
            await client.query("ALTER TABLE cash_sessions ADD COLUMN user_name VARCHAR(100)");
        }

        // Migrations: TIMESTAMP -> TIMESTAMPTZ for existing tables
        await client.query(`ALTER TABLE movements ALTER COLUMN date TYPE TIMESTAMPTZ USING date AT TIME ZONE 'UTC'`);
        await client.query(`ALTER TABLE ventas ALTER COLUMN fecha TYPE TIMESTAMPTZ USING fecha AT TIME ZONE 'UTC'`);
        await client.query(`ALTER TABLE egresos ALTER COLUMN fecha TYPE TIMESTAMPTZ USING fecha AT TIME ZONE 'UTC'`);
        await client.query(`ALTER TABLE cash_sessions ALTER COLUMN opened_at TYPE TIMESTAMPTZ USING opened_at AT TIME ZONE 'UTC'`);
        await client.query(`ALTER TABLE cash_sessions ALTER COLUMN closed_at TYPE TIMESTAMPTZ USING closed_at AT TIME ZONE 'UTC'`);
        await client.query(`ALTER TABLE products ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC'`);

        // New Table: tables (Mesas)
        await client.query(`
            CREATE TABLE IF NOT EXISTS tables (
                id SERIAL PRIMARY KEY,
                number VARCHAR(50) UNIQUE NOT NULL,
                status VARCHAR(30) DEFAULT 'Libre', -- 'Libre', 'Ocupada', 'Pendiente de Cobro'
                x_pos INTEGER DEFAULT 0,
                y_pos INTEGER DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // New Table: clients (Clientes)
        await client.query(`
            CREATE TABLE IF NOT EXISTS clients (
                id SERIAL PRIMARY KEY,
                dni_ruc VARCHAR(50) UNIQUE NOT NULL,
                razon_social VARCHAR(255) NOT NULL,
                email VARCHAR(255),
                direccion TEXT,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // New Table: tabs (Comandas/Cuentas abiertas)
        await client.query(`
            CREATE TABLE IF NOT EXISTS tabs (
                id SERIAL PRIMARY KEY,
                table_id INTEGER REFERENCES tables(id) ON DELETE SET NULL,
                client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
                status VARCHAR(20) DEFAULT 'OPEN', -- 'OPEN', 'CLOSED'
                opened_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                closed_at TIMESTAMPTZ,
                total DECIMAL(15, 2) DEFAULT 0,
                user_name VARCHAR(100)
            );
        `);

        // New Table: tab_items (Detalle de Comandas)
        await client.query(`
            CREATE TABLE IF NOT EXISTS tab_items (
                id SERIAL PRIMARY KEY,
                tab_id INTEGER REFERENCES tabs(id) ON DELETE CASCADE,
                product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
                variant_name VARCHAR(50),
                quantity INTEGER NOT NULL,
                unit_price DECIMAL(15, 2) NOT NULL,
                subtotal DECIMAL(15, 2) NOT NULL
            );
        `);

        // Migration for cash_sessions blind close column
        const checkDeclaredCol = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='cash_sessions' AND column_name='declared_cash'");
        if (checkDeclaredCol.rows.length === 0) {
            console.log("Migrating: Adding declared_cash column to cash_sessions...");
            await client.query("ALTER TABLE cash_sessions ADD COLUMN declared_cash DECIMAL(15,2) DEFAULT 0");
        }

        // New Table: roles
        await client.query(`
            CREATE TABLE IF NOT EXISTS roles (
                id SERIAL PRIMARY KEY,
                name VARCHAR(50) UNIQUE NOT NULL,
                description TEXT
            );
        `);

        // New Table: permissions
        await client.query(`
            CREATE TABLE IF NOT EXISTS permissions (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) UNIQUE NOT NULL,
                description TEXT
            );
        `);

        // New Table: role_permissions
        await client.query(`
            CREATE TABLE IF NOT EXISTS role_permissions (
                role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
                permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
                PRIMARY KEY (role_id, permission_id)
            );
        `);

        // New Table: users
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL,
                status BOOLEAN DEFAULT TRUE,
                must_change_password BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Migration: add must_change_password to existing users tables
        await client.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE
        `);

        // Sync the 'admin' flag with reality: force a password change ONLY while it
        // still uses the old known default password (admin/admin). This both covers
        // legacy installs and self-heals the flag if a previous version forced it
        // unconditionally on every boot.
        const adminRow = await client.query(`SELECT id, password_hash FROM users WHERE username = 'admin'`);
        if (adminRow.rows.length === 1) {
            const { match } = await checkPassword('admin', adminRow.rows[0].password_hash);
            await client.query(
                `UPDATE users SET must_change_password = $1 WHERE id = $2`,
                [match, adminRow.rows[0].id]
            );
        }

        // New Table: employees (Salarios / Planillas)
        await client.query(`
            CREATE TABLE IF NOT EXISTS employees (
                id SERIAL PRIMARY KEY,
                first_name VARCHAR(100) NOT NULL,
                last_name VARCHAR(100) NOT NULL,
                dni VARCHAR(20) UNIQUE,
                phone VARCHAR(30),
                address TEXT,
                position VARCHAR(100),
                hire_date DATE,
                status BOOLEAN DEFAULT TRUE,
                pay_frequency VARCHAR(20) DEFAULT 'MENSUAL', -- MENSUAL, QUINCENAL, SEMANAL
                salary_type VARCHAR(20) DEFAULT 'FIJO',      -- FIJO, POR_DIA, POR_HORA
                base_amount DECIMAL(15, 2) DEFAULT 0,
                days_per_period INTEGER DEFAULT 26,
                hours_per_day INTEGER DEFAULT 8,
                overtime_rate DECIMAL(3, 2) DEFAULT 1.5,
                work_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5,6], -- 1=Lunes ... 7=Domingo
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Migration for existing employees table
        const checkWorkDays = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='employees' AND column_name='work_days'");
        if (checkWorkDays.rows.length === 0) {
            console.log("Migrating: Adding work_days column...");
            await client.query("ALTER TABLE employees ADD COLUMN work_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5,6]");
        }

        // New Table: payroll_periods (Planillas)
        await client.query(`
            CREATE TABLE IF NOT EXISTS payroll_periods (
                id SERIAL PRIMARY KEY,
                employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
                period_start DATE NOT NULL,
                period_end DATE NOT NULL,
                expected_days INTEGER NOT NULL,
                worked_days INTEGER NOT NULL,
                missed_days INTEGER DEFAULT 0,
                overtime_hours DECIMAL(8, 2) DEFAULT 0,
                gross_salary DECIMAL(15, 2) DEFAULT 0,
                bonus_amount DECIMAL(15, 2) DEFAULT 0,
                advance_amount DECIMAL(15, 2) DEFAULT 0,
                discount_amount DECIMAL(15, 2) DEFAULT 0,
                net_salary DECIMAL(15, 2) DEFAULT 0,
                status VARCHAR(20) DEFAULT 'PENDIENTE', -- PENDIENTE, PAGADO
                payment_date DATE,
                payment_method VARCHAR(30),
                user_name VARCHAR(100),
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (employee_id, period_start)
            );
        `);

        // New Table: salary_transactions (Adelantos, Bonos, Descuentos)
        await client.query(`
            CREATE TABLE IF NOT EXISTS salary_transactions (
                id SERIAL PRIMARY KEY,
                employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
                period_id INTEGER REFERENCES payroll_periods(id) ON DELETE SET NULL,
                transaction_type VARCHAR(20) NOT NULL, -- ADELANTO, BONO, DESCUENTO
                amount DECIMAL(15, 2) NOT NULL,
                description VARCHAR(255),
                movement_id INTEGER REFERENCES movements(id) ON DELETE SET NULL,
                payment_method VARCHAR(50) DEFAULT 'Efectivo',
                user_name VARCHAR(100),
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Seed Roles
        const checkRoles = await client.query('SELECT COUNT(*) FROM roles');
        if (parseInt(checkRoles.rows[0].count) === 0) {
            console.log("Seeding default roles...");
            await client.query(`INSERT INTO roles (name, description) VALUES 
                ('Administrador', 'Acceso total al sistema'),
                ('Cajero', 'Acceso a ventas, clientes, mesas y control de caja'),
                ('Vendedor', 'Acceso a ventas y clientes')
            `);
        }

        // Seed Permissions
        const checkPerms = await client.query('SELECT COUNT(*) FROM permissions');
        if (parseInt(checkPerms.rows[0].count) === 0) {
            console.log("Seeding default permissions...");
            await client.query(`INSERT INTO permissions (name, description) VALUES 
                ('ver_reportes', 'Ver reportes y estadísticas de ventas y movimientos'),
                ('editar_ventas', 'Editar/anular movimientos y ventas realizadas'),
                ('gestionar_productos', 'Crear, editar y eliminar productos e inventario'),
                ('gestionar_caja', 'Abrir, cerrar y controlar la caja registradora'),
                ('gestionar_usuarios', 'Crear, editar y eliminar usuarios del sistema'),
                ('realizar_ventas', 'Acceso al módulo de punto de venta (POS) y cobros'),
                ('realizar_compras', 'Acceso al módulo de compras/reposiciones de mercadería'),
                ('gestionar_mesas', 'Agregar, editar y eliminar mesas del salón'),
                ('gestionar_clientes', 'Crear, editar y eliminar clientes en el sistema')
            `);
        }

        // Seed Role Permissions mappings
        const checkRolePerms = await client.query('SELECT COUNT(*) FROM role_permissions');
        if (parseInt(checkRolePerms.rows[0].count) === 0) {
            console.log("Seeding default role permissions mapping...");
            // Admin role get all
            const adminRole = await client.query("SELECT id FROM roles WHERE name = 'Administrador'");
            const adminId = adminRole.rows[0].id;
            await client.query(`INSERT INTO role_permissions (role_id, permission_id) 
                SELECT $1, id FROM permissions`, [adminId]);

            // Cajero role get: realizar_ventas, gestionar_caja, gestionar_clientes, gestionar_mesas
            const cajeroRole = await client.query("SELECT id FROM roles WHERE name = 'Cajero'");
            const cajeroId = cajeroRole.rows[0].id;
            await client.query(`INSERT INTO role_permissions (role_id, permission_id)
                SELECT $1, id FROM permissions WHERE name IN ('realizar_ventas', 'gestionar_caja', 'gestionar_clientes', 'gestionar_mesas')`, [cajeroId]);

            // Vendedor role get: realizar_ventas, gestionar_clientes
            const vendedorRole = await client.query("SELECT id FROM roles WHERE name = 'Vendedor'");
            const vendedorId = vendedorRole.rows[0].id;
            await client.query(`INSERT INTO role_permissions (role_id, permission_id)
                SELECT $1, id FROM permissions WHERE name IN ('realizar_ventas', 'gestionar_clientes')`, [vendedorId]);
        }

        // New permission: gestionar_salarios (idempotent for existing installations)
        await client.query(`
            INSERT INTO permissions (name, description)
            VALUES ('gestionar_salarios', 'Acceso al módulo de salarios y planillas de empleados')
            ON CONFLICT (name) DO NOTHING
        `);
        await client.query(`
            INSERT INTO role_permissions (role_id, permission_id)
            SELECT r.id, p.id FROM roles r, permissions p
            WHERE r.name = 'Administrador' AND p.name = 'gestionar_salarios'
            ON CONFLICT DO NOTHING
        `);

        // New permission: editar_ticket_template (idempotent for existing installations)
        await client.query(`
            INSERT INTO permissions (name, description)
            VALUES ('editar_ticket_template', 'Acceso al editor de plantillas de tickets y configuración de impresión')
            ON CONFLICT (name) DO NOTHING
        `);
        await client.query(`
            INSERT INTO role_permissions (role_id, permission_id)
            SELECT r.id, p.id FROM roles r, permissions p
            WHERE r.name = 'Administrador' AND p.name = 'editar_ticket_template'
            ON CONFLICT DO NOTHING
        `);

        // New permission: ajustar_reloj_app (idempotent for existing installations)
        await client.query(`
            INSERT INTO permissions (name, description)
            VALUES ('ajustar_reloj_app', 'Puede ajustar el reloj general de la app (afecta ticket impreso y reportes)')
            ON CONFLICT (name) DO NOTHING
        `);
        await client.query(`
            INSERT INTO role_permissions (role_id, permission_id)
            SELECT r.id, p.id FROM roles r, permissions p
            WHERE r.name = 'Administrador' AND p.name = 'ajustar_reloj_app'
            ON CONFLICT DO NOTHING
        `);

        // Seed Admin User
        const checkUsers = await client.query('SELECT COUNT(*) FROM users');
        if (parseInt(checkUsers.rows[0].count) === 0) {
            console.log("Seeding default admin user...");
            const adminRole = await client.query("SELECT id FROM roles WHERE name = 'Administrador'");
            const adminRoleId = adminRole.rows[0].id;
            const tempPassword = crypto.randomBytes(12).toString('base64url');
            const defaultAdminHash = await hashPassword(tempPassword);
            await client.query(`INSERT INTO users (username, password_hash, role_id, status, must_change_password) VALUES 
                ('admin', $1, $2, TRUE, TRUE)`, [defaultAdminHash, adminRoleId]);
            console.log(`Admin inicial creado. Usuario: admin | Contraseña temporal: ${tempPassword}`);
            console.log('Deberá cambiar la contraseña al iniciar sesión.');
        }

        await client.query('COMMIT');
        console.log("Database schema initialized (Tables Recreated).");
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Error initializing database:", e);
    } finally {
        client.release();
    }
}

// Call init on load
initDatabase();

// --- Data Access Methods ---

async function getProducts(search = '', category = '', page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    // Base conditions
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (search) {
        whereClause += ` AND (p.name ILIKE $${paramIndex} OR EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.barcode ILIKE $${paramIndex}))`;
        params.push(`%${search}%`);
        paramIndex++;
    }

    if (category && category !== 'Todas') {
        whereClause += ` AND p.category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
    }

    // 1. Get Total Count
    const countQuery = `SELECT COUNT(*) FROM products p ${whereClause}`;
    // Note: params are compatible since we built them above
    const countRes = await pool.query(countQuery, params);
    const total = parseInt(countRes.rows[0].count);

    // 2. Get Paginated Data
    let query = `
        SELECT p.*, 
               (
                   SELECT json_agg(json_build_object(
                       'variant_name', v.variant_name,
                       'barcode', v.barcode,
                       'quantity', v.quantity,
                       'sale_price', v.sale_price
                   ) ORDER BY v.quantity ASC)
                   FROM product_variants v 
                   WHERE v.product_id = p.id
               ) as variants_data
        FROM products p 
        ${whereClause}
        ORDER BY p.id DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    // Add LIMIT and OFFSET to params
    const pageParams = [...params, limit, offset];

    const res = await pool.query(query, pageParams);

    return {
        rows: res.rows,
        total: total,
        page: page,
        limit: limit,
        totalPages: Math.ceil(total / limit)
    };
}

// Get Single Product Details (Parent + Variants)
async function getProductDetails(id) {
    const productRes = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    if (productRes.rows.length === 0) return null;

    const variantsRes = await pool.query('SELECT * FROM product_variants WHERE product_id = $1 ORDER BY id ASC', [id]);

    return {
        ...productRes.rows[0],
        variants: variantsRes.rows
    };
}

async function createProductWithVariants(productData, variants) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Calculate total stock from variants
        // DECISION: User wants manual stock input. 
        // We use productData.stock_total which comes from the form.
        const totalStock = parseInt(productData.stock_total) || 0;
        const minStock = productData.min_stock || 5;

        const insertProductQuery = `
            INSERT INTO products (name, category, base_cost, stock_total, min_stock)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
        `;
        const productRes = await client.query(insertProductQuery, [
            productData.name,
            productData.category,
            productData.base_cost,
            totalStock,
            minStock
        ]);
        const productId = productRes.rows[0].id;

        const insertVariantQuery = `
            INSERT INTO product_variants (product_id, variant_name, barcode, quantity, sale_price)
            VALUES ($1, $2, $3, $4, $5)
        `;

        for (const variant of variants) {
            await client.query(insertVariantQuery, [
                productId,
                variant.variant_name,
                variant.barcode,
                variant.quantity,
                variant.sale_price
            ]);
        }

        await client.query('COMMIT');
        return { success: true, productId };

    } catch (e) {
        await client.query('ROLLBACK');
        if (e.code === '23505') {
            throw userError(`Error: El código de barras '${e.detail}' ya está registrado.`);
        }
        throw e;
    } finally {
        client.release();
    }
}

// Update Product (Delete all variants and recreate)
async function updateProductWithVariants(id, productData, variants) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Calculate total stock from variants
        // DECISION: User wants manual stock input.
        const totalStock = parseInt(productData.stock_total) || 0;
        const minStock = productData.min_stock || 5;

        // 1. Update Parent
        // Note: We are now updating stock_total here. 
        // However, if the user edits a product, do they WANT to reset stock? 
        // Usually, if we decouple, stock management (increments) is done via Purchases.
        // But if they are "Editing" the product definition, maybe they want to correct the stock manually too.
        // Let's allow it for now as "Correction".
        await client.query(
            'UPDATE products SET name = $1, category = $2, base_cost = $3, stock_total = $4, min_stock = $5 WHERE id = $6',
            [productData.name, productData.category, productData.base_cost, totalStock, minStock, id]
        );

        // 2. Delete OLD Variants
        await client.query('DELETE FROM product_variants WHERE product_id = $1', [id]);

        // 3. Insert NEW Variants
        const insertVariantQuery = `
            INSERT INTO product_variants (product_id, variant_name, barcode, quantity, sale_price)
            VALUES ($1, $2, $3, $4, $5)
        `;

        for (const variant of variants) {
            await client.query(insertVariantQuery, [
                id, // Use existing ID
                variant.variant_name,
                variant.barcode,
                variant.quantity,
                variant.sale_price
            ]);
        }

        await client.query('COMMIT');
        return { success: true };

    } catch (e) {
        await client.query('ROLLBACK');
        if (e.code === '23505') {
            throw userError(`Error: El código de barras '${e.detail}' ya está registrado.`);
        }
        throw e;
    } finally {
        client.release();
    }
}

async function deleteProduct(id) {
    const query = 'DELETE FROM products WHERE id = $1';
    await pool.query(query, [id]);
    return { success: true };
}

// --- Sales & Reports ---

async function processSaleTransaction(saleData) {
    // saleData: { items: [{id, variant_name, qty, ...}], total, method, user }
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        for (const item of saleData.items) {
            // Find variant quantity multiplier (stock_total is calculated in single units usually, but let's assume direct deduction for prototype)
            // Ideally we fetch variant quantity. For now, deducting 1 per qty unless we map it.
            // Let's keep it simple: We just deduct 'quantity' * 'variant_multiplier'.
            // To be safe, let's fetch the variant multiplier.

            const getVariantQuery = `
                 SELECT quantity FROM product_variants WHERE product_id = $1 AND variant_name = $2
            `;
            const varRes = await client.query(getVariantQuery, [item.id, item.variant_name]);

            let multiplier = 1;
            if (varRes.rows.length > 0) {
                multiplier = varRes.rows[0].quantity;
            }

            const totalUnitsToDeduct = item.qty * multiplier;

            const updateStockQuery = `
                UPDATE products 
                SET stock_total = stock_total - $1
                WHERE id = $2
            `;
            await client.query(updateStockQuery, [totalUnitsToDeduct, item.id]);
        }

        // 2. Insert Movement (Ingreso)
        const motiveString = saleData.items.map(i => `${i.name} (${i.variant_name}) x${i.qty}`).join(', ') + (saleData.observation ? ` - Obs: ${saleData.observation}` : '');

        const description = saleData.clientName || 'CLIENTE OCASIONAL';

        const insertMovementQuery = `
            INSERT INTO movements (type, description, motive, user_name, payment_method, amount, details_json, voucher_number)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;

        await client.query(insertMovementQuery, [
            'INGRESO',
            description,
            motiveString,
            saleData.user || 'Cajero',
            saleData.method,
            saleData.total,
            JSON.stringify({
                items: saleData.items,
                received: saleData.received,
                change: saleData.change
            }),
            saleData.voucherNumber || null
        ]);

        await client.query('COMMIT');
        return { success: true };

    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Transaction Error", e);
        throw e;
    } finally {
        client.release();
    }
}

async function getMovements(dateFrom, dateTo, page = 1, limit = 20) {
    // Removed try-catch to allow errors to propagate to the UI (Test DB)
    if (!dateFrom || !dateTo) {
        const today = new Date().toISOString().split('T')[0];
        dateFrom = today;
        dateTo = today;
    }

    const offset = (page - 1) * limit;
    const start = `${dateFrom} 00:00:00`;
    const end = `${dateTo} 23:59:59`;

    // 1. Count
    const countQuery = `
        SELECT COUNT(*) FROM movements 
        WHERE date BETWEEN $1 AND $2
    `;
    const countRes = await pool.query(countQuery, [start, end]);
    const total = parseInt(countRes.rows[0].count || 0);

    // 2. Data
    const query = `
        SELECT * FROM movements 
        WHERE date BETWEEN $1 AND $2 
        ORDER BY date DESC
        LIMIT $3 OFFSET $4
    `;

    const res = await pool.query(query, [start, end, limit, offset]);

    const statsQuery = `
        SELECT 
            SUM(CASE WHEN type = 'INGRESO' THEN amount ELSE 0 END) as total_ingreso,
            SUM(CASE WHEN type = 'EGRESO' THEN amount ELSE 0 END) as total_egreso,
            SUM(CASE WHEN type = 'APERTURA' THEN amount ELSE 0 END) as total_apertura
        FROM movements 
        WHERE date BETWEEN $1 AND $2
    `;
    const statsRes = await pool.query(statsQuery, [start, end]);
    const periodStats = statsRes.rows[0];

    return {
        rows: res.rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        periodStats
    };
}

async function processPurchaseTransaction(purchaseData) {
    // purchaseData: { items: [{id, variant_name, qty, cost, ...}], total, method, supplier }
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        for (const item of purchaseData.items) {
            // 1. Update Stock
            // We increase stock_total. 
            // LIMITATION: If variant multiplier exists, we should ideally normalize.
            // For now assuming 1 Unit input = 1 Unit Stock Increase.
            // If user buys a "Pack", we might need to multiply by pack quantity if we track total units.

            const getVariantQuery = `
                 SELECT quantity FROM product_variants WHERE product_id = $1 AND variant_name = $2
            `;
            const varRes = await client.query(getVariantQuery, [item.id, item.variant_name]);

            let multiplier = 1;
            if (varRes.rows.length > 0) {
                multiplier = varRes.rows[0].quantity;
            }

            const totalUnitsToAdd = item.qty * multiplier; // e.g. 5 Packs of 6 = 30 Units added

            const updateStockQuery = `
                UPDATE products 
                SET stock_total = stock_total + $1
                WHERE id = $2
            `;
            await client.query(updateStockQuery, [totalUnitsToAdd, item.id]);

            // Optional: Update Base Cost if requested? (Ignoring for now to keep simple)
        }

        // 2. Insert Movement (Egreso)
        const motiveString = purchaseData.items.map(i => `${i.name} (${i.variant_name}) x${i.qty}`).join(', ') + (purchaseData.observation ? ` - Obs: ${purchaseData.observation}` : '');

        const description = purchaseData.supplier || 'PROVEEDOR GENERAL';

        const insertMovementQuery = `
            INSERT INTO movements (type, description, motive, user_name, payment_method, amount)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;

        await client.query(insertMovementQuery, [
            'EGRESO', // Expense
            description,
            motiveString,
            purchaseData.user || 'Admin',
            purchaseData.method,
            purchaseData.total
        ]);

        await client.query('COMMIT');
        return { success: true };

    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Purchase Transaction Error", e);
        throw e;
    } finally {
        client.release();
    }
}

// --- Cash Register Logic ---

async function getRegisterStatus() {
    // Find absolute latest session
    const res = await pool.query('SELECT * FROM cash_sessions ORDER BY id DESC LIMIT 1');
    if (res.rows.length === 0) return { status: 'CLOSED' };
    return res.rows[0];
}

async function openRegister(amount, user) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Create Session
        await client.query('INSERT INTO cash_sessions (initial_cash, status, user_name) VALUES ($1, $2, $3)', [amount, 'OPEN', user]);

        // 2. Register Movement
        await client.query(`
                INSERT INTO movements (type, description, motive, user_name, payment_method, amount) 
                VALUES ('APERTURA', 'Apertura de Caja', 'Saldo Inicial', $1, 'Efectivo', $2)
            `, [user, amount]);

        await client.query('COMMIT');
        return { success: true };
    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        throw e;
    } finally {
        client.release();
    }
}

async function closeRegister(finalCash, user) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Get current Open Session
        const sessionRes = await client.query("SELECT * FROM cash_sessions WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1");
        if (sessionRes.rows.length === 0) throw userError("No hay caja abierta.");
        const session = sessionRes.rows[0];

        // 2. Calculate Totals (Movements since opened_at)
        const movementsRes = await client.query('SELECT * FROM movements WHERE date >= $1', [session.opened_at]);
        const movements = movementsRes.rows;

        let salesCash = 0;
        let salesOther = 0;
        let expenses = 0;

        movements.forEach(m => {
            if (m.type === 'APERTURA' || m.type === 'CIERRE') return; // Ignore these for calculation

            const amt = parseInt(m.amount);
            if (m.type === 'INGRESO') {
                if (m.payment_method === 'Efectivo') salesCash += amt;
                else salesOther += amt;
            } else if (m.type === 'EGRESO') {
                expenses += amt;
            }
        });

        // 3. Close Session
        const expectedCash = parseInt(session.initial_cash) + salesCash - expenses;
        const diff = finalCash - expectedCash;

        await client.query(`
                UPDATE cash_sessions 
                SET closed_at = CURRENT_TIMESTAMP, 
                    final_cash = $1, 
                    declared_cash = $1,
                    total_sales_cash = $2, 
                    total_sales_other = $3, 
                    total_expenses = $4, 
                    income_difference = $5, 
                    status = 'CLOSED',
                    user_name = $6 
                WHERE id = $7
            `, [finalCash, salesCash, salesOther, expenses, diff, user, session.id]);

        // 4. Register Movement (CIERRE)
        // We record the declared final cash.
        // Description includes the difference to be helpful.
        const diffText = diff === 0 ? '(Cuadre Ok)' : (diff > 0 ? `(Sobra ${diff})` : `(Falta ${Math.abs(diff)})`);

        // Prepare details JSON for the frontend report
        const closeDetails = {
            expected: expectedCash,
            declared: finalCash,
            difference: diff,
            salesCash: salesCash,
            salesDigital: salesOther,
            expenses: expenses,
            totalBalance: expectedCash + salesOther // Theoretical Total (Cash + Digital)
        };

        await client.query(`
                INSERT INTO movements (type, description, motive, user_name, payment_method, amount, details_json) 
                VALUES ('CIERRE', 'Cierre de Caja', $1, $2, 'Efectivo', $3, $4)
            `, [diffText, user, finalCash, JSON.stringify(closeDetails)]);

        await client.query('COMMIT');
        return { success: true, difference: diff, expected: expectedCash };

    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        throw e;
    } finally {
        client.release();
    }
}

async function updateMovement(id, amount, reason, user, restockItems = []) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Update the movement
        await client.query(`
            UPDATE movements 
            SET amount = $1, 
                is_edited = TRUE, 
                edit_reason = $2 
            WHERE id = $3
        `, [amount, reason, id]);

        // Handle Restocking
        if (restockItems && restockItems.length > 0) {
            for (const item of restockItems) {
                // item: { id, variant_name, qty }
                // We need to find the multiplier again to be safe, or assume qty is correct unit count?
                // In processSale, we deducted (qty * multiplier).
                // Here, we should restore (qty * multiplier).
                // Let's look up the variant again.

                const getVariantQuery = `
                     SELECT quantity FROM product_variants WHERE product_id = $1 AND variant_name = $2
                `;
                const varRes = await client.query(getVariantQuery, [item.id, item.variant_name]);

                let multiplier = 1;
                if (varRes.rows.length > 0) {
                    multiplier = varRes.rows[0].quantity;
                }

                const totalUnitsToRestore = item.qty * multiplier;

                const updateStockQuery = `
                    UPDATE products 
                    SET stock_total = stock_total + $1
                    WHERE id = $2
                `;
                await client.query(updateStockQuery, [totalUnitsToRestore, item.id]);
            }
        }

        await client.query('COMMIT');
        return { success: true };
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Update Movement Error", e);
        throw e;
    } finally {
        client.release();
    }
}

async function getMovementById(id) {
    try {
        const res = await pool.query('SELECT * FROM movements WHERE id = $1', [id]);
        return res.rows[0];
    } catch (e) {
        console.error("Get Movement By ID Error", e);
        throw e;
    }
}

async function getCategories() {
    try {
        const res = await pool.query('SELECT name FROM categories ORDER BY id ASC');
        return res.rows.map(r => r.name);
    } catch (e) {
        console.error("Get Categories Error", e);
        throw e;
    }
}

async function createCategory(name) {
    try {
        await pool.query('INSERT INTO categories (name) VALUES ($1) ON CONFLICT DO NOTHING', [name]);
        return { success: true };
    } catch (e) {
        console.error("Create Category Error", e);
        throw e;
    }
}

// --- Tables (Mesas) ---
async function getTables() {
    try {
        const res = await pool.query('SELECT * FROM tables ORDER BY number ASC');
        return res.rows;
    } catch (e) {
        console.error("Get Tables Error", e);
        throw e;
    }
}

async function createTable(number, x_pos = 0, y_pos = 0) {
    try {
        const res = await pool.query(
            'INSERT INTO tables (number, status, x_pos, y_pos) VALUES ($1, \'Libre\', $2, $3) RETURNING *',
            [number, x_pos, y_pos]
        );
        return res.rows[0];
    } catch (e) {
        console.error("Create Table Error", e);
        throw e;
    }
}

async function updateTableStatus(id, status) {
    try {
        await pool.query('UPDATE tables SET status = $1 WHERE id = $2', [status, id]);
        return { success: true };
    } catch (e) {
        console.error("Update Table Status Error", e);
        throw e;
    }
}

async function updateTablePosition(id, x_pos, y_pos) {
    try {
        await pool.query('UPDATE tables SET x_pos = $1, y_pos = $2 WHERE id = $3', [x_pos, y_pos, id]);
        return { success: true };
    } catch (e) {
        console.error("Update Table Position Error", e);
        throw e;
    }
}

async function deleteTable(id) {
    try {
        await pool.query('DELETE FROM tables WHERE id = $1', [id]);
        return { success: true };
    } catch (e) {
        console.error("Delete Table Error", e);
        throw e;
    }
}

// --- Clients (Clientes) ---
async function getClients(search = '') {
    try {
        let query = 'SELECT * FROM clients';
        const params = [];
        if (search) {
            query += ' WHERE dni_ruc ILIKE $1 OR razon_social ILIKE $1';
            params.push(`%${search}%`);
        }
        query += ' ORDER BY razon_social ASC';
        const res = await pool.query(query, params);
        return res.rows;
    } catch (e) {
        console.error("Get Clients Error", e);
        throw e;
    }
}

async function createClient(clientData) {
    try {
        const res = await pool.query(
            'INSERT INTO clients (dni_ruc, razon_social, email, direccion) VALUES ($1, $2, $3, $4) RETURNING *',
            [clientData.dni_ruc, clientData.razon_social, clientData.email, clientData.direccion]
        );
        return res.rows[0];
    } catch (e) {
        console.error("Create Client Error", e);
        throw e;
    }
}

async function updateClient(id, clientData) {
    try {
        await pool.query(
            'UPDATE clients SET dni_ruc = $1, razon_social = $2, email = $3, direccion = $4 WHERE id = $5',
            [clientData.dni_ruc, clientData.razon_social, clientData.email, clientData.direccion, id]
        );
        return { success: true };
    } catch (e) {
        console.error("Update Client Error", e);
        throw e;
    }
}

async function deleteClient(id) {
    try {
        await pool.query('DELETE FROM clients WHERE id = $1', [id]);
        return { success: true };
    } catch (e) {
        console.error("Delete Client Error", e);
        throw e;
    }
}

// --- Tabs (Comandas / Cuentas Abiertas) ---
async function getOpenTabs() {
    try {
        const query = `
            SELECT t.*, m.number as table_number, c.razon_social as client_name 
            FROM tabs t 
            LEFT JOIN tables m ON t.table_id = m.id 
            LEFT JOIN clients c ON t.client_id = c.id 
            WHERE t.status = 'OPEN'
            ORDER BY t.opened_at DESC
        `;
        const res = await pool.query(query);
        return res.rows;
    } catch (e) {
        console.error("Get Open Tabs Error", e);
        throw e;
    }
}

async function getTabByTable(tableId) {
    try {
        const query = `
            SELECT * FROM tabs WHERE table_id = $1 AND status = 'OPEN' LIMIT 1
        `;
        const res = await pool.query(query, [tableId]);
        if (res.rows.length === 0) return null;
        return res.rows[0];
    } catch (e) {
        console.error("Get Tab By Table Error", e);
        throw e;
    }
}

async function getTabDetails(tabId) {
    try {
        const tabRes = await pool.query(`
            SELECT t.*, m.number as table_number, c.razon_social as client_name, c.dni_ruc as client_ruc 
            FROM tabs t 
            LEFT JOIN tables m ON t.table_id = m.id 
            LEFT JOIN clients c ON t.client_id = c.id 
            WHERE t.id = $1
        `, [tabId]);
        if (tabRes.rows.length === 0) return null;

        const itemsRes = await pool.query(`
            SELECT ti.*, p.name as product_name 
            FROM tab_items ti
            JOIN products p ON ti.product_id = p.id
            WHERE ti.tab_id = $1
            ORDER BY ti.id ASC
        `, [tabId]);

        return {
            ...tabRes.rows[0],
            items: itemsRes.rows
        };
    } catch (e) {
        console.error("Get Tab Details Error", e);
        throw e;
    }
}

async function openTab(tableId, clientId = null, userName = 'Cajero') {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check if there is already an open tab on this table
        const checkTab = await client.query('SELECT id FROM tabs WHERE table_id = $1 AND status = \'OPEN\'', [tableId]);
        if (checkTab.rows.length > 0) {
            throw userError("Ya existe una comanda abierta para esta mesa.");
        }

        // Open the tab
        const tabRes = await client.query(
            'INSERT INTO tabs (table_id, client_id, status, total, user_name) VALUES ($1, $2, \'OPEN\', 0, $3) RETURNING *',
            [tableId, clientId, userName]
        );

        // Update table status to Ocupada
        await client.query('UPDATE tables SET status = \'Ocupada\' WHERE id = $1', [tableId]);

        await client.query('COMMIT');
        return tabRes.rows[0];
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Open Tab Error", e);
        throw e;
    } finally {
        client.release();
    }
}

async function addItemToTab(tabId, item) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const subtotal = item.quantity * item.unit_price;

        // Check if item already exists in the tab
        const checkItem = await client.query(
            'SELECT id, quantity FROM tab_items WHERE tab_id = $1 AND product_id = $2 AND (variant_name = $3 OR (variant_name IS NULL AND $3 IS NULL))',
            [tabId, item.product_id, item.variant_name || null]
        );

        if (checkItem.rows.length > 0) {
            const newQty = checkItem.rows[0].quantity + item.quantity;
            const newSubtotal = newQty * item.unit_price;
            await client.query(
                'UPDATE tab_items SET quantity = $1, subtotal = $2 WHERE id = $3',
                [newQty, newSubtotal, checkItem.rows[0].id]
            );
        } else {
            await client.query(
                'INSERT INTO tab_items (tab_id, product_id, variant_name, quantity, unit_price, subtotal) VALUES ($1, $2, $3, $4, $5, $6)',
                [tabId, item.product_id, item.variant_name || null, item.quantity, item.unit_price, subtotal]
            );
        }

        // Update Tab Total
        await client.query(`
            UPDATE tabs 
            SET total = (SELECT COALESCE(SUM(subtotal), 0) FROM tab_items WHERE tab_id = $1)
            WHERE id = $1
        `, [tabId]);

        await client.query('COMMIT');
        return { success: true };
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Add Item to Tab Error", e);
        throw e;
    } finally {
        client.release();
    }
}

async function removeItemFromTab(tabId, itemId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query('DELETE FROM tab_items WHERE id = $1 AND tab_id = $2', [itemId, tabId]);

        // Update Tab Total
        await client.query(`
            UPDATE tabs 
            SET total = (SELECT COALESCE(SUM(subtotal), 0) FROM tab_items WHERE tab_id = $1)
            WHERE id = $1
        `, [tabId]);

        await client.query('COMMIT');
        return { success: true };
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Remove Item from Tab Error", e);
        throw e;
    } finally {
        client.release();
    }
}

async function closeTabAndProcessSale(tabId, paymentData) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const tabRes = await client.query('SELECT * FROM tabs WHERE id = $1 AND status = \'OPEN\'', [tabId]);
        if (tabRes.rows.length === 0) throw userError("La comanda no existe o ya está cerrada.");
        const tab = tabRes.rows[0];

        const itemsRes = await client.query(`
            SELECT ti.*, p.name as product_name 
            FROM tab_items ti
            JOIN products p ON ti.product_id = p.id
            WHERE ti.tab_id = $1
        `, [tabId]);
        const items = itemsRes.rows;

        const saleItems = [];
        for (const item of items) {
            const getVariantQuery = `
                 SELECT quantity FROM product_variants WHERE product_id = $1 AND variant_name = $2
            `;
            const varRes = await client.query(getVariantQuery, [item.product_id, item.variant_name]);

            let multiplier = 1;
            if (varRes.rows.length > 0) {
                multiplier = varRes.rows[0].quantity;
            }

            const totalUnitsToDeduct = item.quantity * multiplier;

            await client.query(`
                UPDATE products 
                SET stock_total = stock_total - $1
                WHERE id = $2
            `, [totalUnitsToDeduct, item.product_id]);

            saleItems.push({
                id: item.product_id,
                name: item.product_name,
                variant_name: item.variant_name,
                qty: item.quantity,
                sale_price: item.unit_price,
                subtotal: item.subtotal
            });
        }

        const motiveString = saleItems.map(i => `${i.name} (${i.variant_name || 'Estándar'}) x${i.qty}`).join(', ') +
            (paymentData.observation ? ` - Obs: ${paymentData.observation}` : '') + (tab.table_id ? ` [Mesa ${tab.table_id}]` : '');

        const insertMovementQuery = `
            INSERT INTO movements (type, description, motive, user_name, payment_method, amount, details_json, voucher_number)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;

        await client.query(insertMovementQuery, [
            'INGRESO',
            paymentData.clientName || 'CLIENTE OCASIONAL',
            motiveString,
            paymentData.user || 'Cajero',
            paymentData.method,
            tab.total,
            JSON.stringify({
                items: saleItems,
                received: paymentData.received,
                change: paymentData.change,
                tabId: tabId
            }),
            paymentData.voucherNumber || null
        ]);

        await client.query(
            'UPDATE tabs SET status = \'CLOSED\', closed_at = CURRENT_TIMESTAMP WHERE id = $1',
            [tabId]
        );

        if (tab.table_id) {
            await client.query('UPDATE tables SET status = \'Libre\' WHERE id = $1', [tab.table_id]);
        }

        await client.query('COMMIT');
        return { success: true };
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Close Tab Error", e);
        throw e;
    } finally {
        client.release();
    }
}

async function updateTabItems(tabId, items) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Delete all existing items
        await client.query('DELETE FROM tab_items WHERE tab_id = $1', [tabId]);
        
        // Insert current items
        for (const item of items) {
            const subtotal = item.qty * item.price;
            await client.query(
                'INSERT INTO tab_items (tab_id, product_id, variant_name, quantity, unit_price, subtotal) VALUES ($1, $2, $3, $4, $5, $6)',
                [tabId, item.id, item.variant_name || null, item.qty, item.price, subtotal]
            );
        }
        
        // Update Tab Total
        await client.query(`
            UPDATE tabs 
            SET total = (SELECT COALESCE(SUM(subtotal), 0) FROM tab_items WHERE tab_id = $1)
            WHERE id = $1
        `, [tabId]);
        
        await client.query('COMMIT');
        return { success: true };
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Update Tab Items Error", e);
        throw e;
    } finally {
        client.release();
    }
}

async function splitTabAndProcessSale(tabId, splits) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const tabRes = await client.query("SELECT * FROM tabs WHERE id = $1 AND status = 'OPEN'", [tabId]);
        if (tabRes.rows.length === 0) throw userError("La comanda no existe o ya está cerrada.");
        const tab = tabRes.rows[0];

        // Validate all splits have items
        for (let i = 0; i < splits.length; i++) {
            if (!splits[i].items || splits[i].items.length === 0) {
                throw userError(`El grupo ${i + 1} no tiene productos asignados.`);
            }
        }

        // Track unique product+variant for single stock deduction
        const deductionMap = new Map();
        for (const split of splits) {
            for (const item of split.items) {
                const key = `${item.product_id}|${item.variant_name || ''}`;
                if (deductionMap.has(key)) {
                    deductionMap.get(key).qty += item.qty;
                } else {
                    deductionMap.set(key, { product_id: item.product_id, variant_name: item.variant_name, qty: item.qty, unit_price: item.unit_price });
                }
            }
        }

        // Deduct stock once per unique product+variant
        for (const entry of deductionMap.values()) {
            const getVariantQuery = `
                 SELECT quantity FROM product_variants WHERE product_id = $1 AND variant_name = $2
            `;
            const varRes = await client.query(getVariantQuery, [entry.product_id, entry.variant_name]);

            let multiplier = 1;
            if (varRes.rows.length > 0) {
                multiplier = varRes.rows[0].quantity;
            }

            const totalUnitsToDeduct = entry.qty * multiplier;

            await client.query(
                'UPDATE products SET stock_total = stock_total - $1 WHERE id = $2',
                [totalUnitsToDeduct, entry.product_id]
            );
        }

        // Create one movement per split
        for (let i = 0; i < splits.length; i++) {
            const split = splits[i];
            const splitTotal = split.items.reduce((sum, item) => sum + item.subtotal, 0);

            const motiveString = split.items.map(item =>
                `${item.product_name} (${item.variant_name || 'Estándar'}) x${item.qty}`
            ).join(', ') + ` - Mesa: ${tab.table_id} (Split ${i + 1}/${splits.length})`;

            await client.query(
                `INSERT INTO movements (type, description, motive, user_name, payment_method, amount, details_json)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    'INGRESO',
                    split.clientName || 'CLIENTE OCASIONAL',
                    motiveString,
                    'Cajero',
                    split.paymentMethod,
                    splitTotal,
                    JSON.stringify({
                        items: split.items,
                        received: split.received || splitTotal,
                        change: split.change || 0,
                        tabId: tabId,
                        splitGroup: i + 1,
                        splitTotal: splits.length
                    })
                ]
            );
        }

        // Close tab and free table
        await client.query(
            "UPDATE tabs SET status = 'CLOSED', closed_at = CURRENT_TIMESTAMP WHERE id = $1",
            [tabId]
        );

        if (tab.table_id) {
            await client.query("UPDATE tables SET status = 'Libre' WHERE id = $1", [tab.table_id]);
        }

        await client.query('COMMIT');
        return { success: true };
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Split Tab Error", e);
        throw e;
    } finally {
        client.release();
    }
}

// --- Authentication & User Management ---

async function authenticateUser(username, password) {
    const res = await pool.query(`
        SELECT u.*, r.name as role_name 
        FROM users u 
        LEFT JOIN roles r ON u.role_id = r.id 
        WHERE u.username = $1 AND u.status = TRUE
    `, [username]);

    if (res.rows.length === 0) {
        return { success: false, message: 'Usuario no encontrado o inactivo.' };
    }

    const user = res.rows[0];
    const check = await checkPassword(password, user.password_hash);
    if (!check.match) {
        return { success: false, message: 'Contraseña incorrecta.' };
    }

    if (check.needsRehash) {
        const newHash = await hashPassword(password);
        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, user.id]);
    }

    // Get permissions
    const permsRes = await pool.query(`
        SELECT p.name 
        FROM role_permissions rp
        JOIN permissions p ON rp.permission_id = p.id
        WHERE rp.role_id = $1
    `, [user.role_id]);

    const permissions = permsRes.rows.map(row => row.name);

    return {
        success: true,
        user: {
            id: user.id,
            username: user.username,
            role_name: user.role_name,
            role_id: user.role_id,
            permissions: permissions,
            must_change_password: !!user.must_change_password
        }
    };
}

async function changePassword(userId, currentPassword, newPassword) {
    const res = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (res.rows.length === 0) return { success: false, message: 'Usuario no encontrado.' };

    const user = res.rows[0];
    const check = await checkPassword(currentPassword, user.password_hash);
    if (!check.match) return { success: false, message: 'La contraseña actual es incorrecta.' };

    const passwordHash = await hashPassword(newPassword);
    await pool.query(
        'UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2',
        [passwordHash, userId]
    );
    return { success: true };
}

async function changePasswordByUsername(username, currentPassword, newPassword) {
    const res = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (res.rows.length === 0) return { success: false, message: 'Usuario no encontrado.' };

    const user = res.rows[0];
    const check = await checkPassword(currentPassword, user.password_hash);
    if (!check.match) return { success: false, message: 'La contraseña actual es incorrecta.' };

    const passwordHash = await hashPassword(newPassword);
    await pool.query(
        'UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2',
        [passwordHash, user.id]
    );
    return { success: true };
}

async function getUsers() {
    const res = await pool.query(`
        SELECT u.id, u.username, u.role_id, r.name as role_name, u.status, u.created_at
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
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
    const passwordHash = await hashPassword(password);
    try {
        await pool.query(
            'INSERT INTO users (username, password_hash, role_id, status) VALUES ($1, $2, $3, TRUE)',
            [username, passwordHash, role_id]
        );
        return { success: true };
    } catch (e) {
        if (e.code === '23505') {
            throw userError(`El usuario '${username}' ya existe.`);
        }
        throw e;
    }
}

async function updateUser(id, userData) {
    const { username, password, role_id, status } = userData;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        if (password && password.trim() !== '') {
            const passwordHash = await hashPassword(password);
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
        if (e.code === '23505') {
            throw userError(`El nombre de usuario '${username}' ya está en uso.`);
        }
        throw e;
    } finally {
        client.release();
    }
}

async function deleteUser(id) {
    const checkRes = await pool.query('SELECT username FROM users WHERE id = $1', [id]);
    if (checkRes.rows.length > 0 && checkRes.rows[0].username === 'admin') {
        throw userError('No se puede eliminar el usuario administrador principal (admin).');
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

        // Delete existing role permissions mapping
        await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);

        // Insert new mappings
        if (permissionIds && permissionIds.length > 0) {
            for (const permId of permissionIds) {
                await client.query(
                    'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)',
                    [roleId, permId]
                );
            }
        }

        await client.query('COMMIT');
        return { success: true };
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Update Role Permissions Error", e);
        throw e;
    } finally {
        client.release();
    }
}

async function checkUserPermission(userId, permissionName) {
    try {
        const res = await pool.query(`
            SELECT COUNT(*) as count FROM role_permissions rp
            JOIN permissions p ON rp.permission_id = p.id
            JOIN users u ON u.role_id = rp.role_id
            WHERE u.id = $1 AND p.name = $2
        `, [userId, permissionName]);

        return parseInt(res.rows[0].count) > 0;
    } catch (e) {
        console.error("Check User Permission Error", e);
        return false;
    }
}

// --- Employees (Salarios / Planillas) ---
async function getEmployees(search = '') {
    try {
        let query = 'SELECT * FROM employees';
        const params = [];
        if (search) {
            query += ' WHERE first_name ILIKE $1 OR last_name ILIKE $1 OR dni ILIKE $1';
            params.push(`%${search}%`);
        }
        query += ' ORDER BY status DESC, last_name ASC, first_name ASC';
        const res = await pool.query(query, params);
        return res.rows;
    } catch (e) {
        console.error("Get Employees Error", e);
        throw e;
    }
}

async function createEmployee(data) {
    try {
        const res = await pool.query(`
            INSERT INTO employees (first_name, last_name, dni, phone, address, position, hire_date, status, pay_frequency, salary_type, base_amount, days_per_period, hours_per_day, overtime_rate, work_days)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING *
        `, [
            data.first_name, data.last_name, data.dni || null, data.phone || null,
            data.address || null, data.position || null, data.hire_date || null,
            data.status, data.pay_frequency, data.salary_type, data.base_amount,
            data.days_per_period, data.hours_per_day, data.overtime_rate,
            data.work_days && data.work_days.length ? data.work_days : [1,2,3,4,5,6]
        ]);
        return res.rows[0];
    } catch (e) {
        if (e.code === '23505') {
            throw userError(`Ya existe un empleado con el DNI '${data.dni}'.`);
        }
        throw e;
    }
}

async function updateEmployee(id, data) {
    try {
        await pool.query(`
            UPDATE employees
            SET first_name = $1, last_name = $2, dni = $3, phone = $4, address = $5,
                position = $6, hire_date = $7, status = $8, pay_frequency = $9,
                salary_type = $10, base_amount = $11, days_per_period = $12,
                hours_per_day = $13, overtime_rate = $14, work_days = $15
            WHERE id = $16
        `, [
            data.first_name, data.last_name, data.dni || null, data.phone || null,
            data.address || null, data.position || null, data.hire_date || null,
            data.status, data.pay_frequency, data.salary_type, data.base_amount,
            data.days_per_period, data.hours_per_day, data.overtime_rate,
            data.work_days && data.work_days.length ? data.work_days : [1,2,3,4,5,6], id
        ]);
        return { success: true };
    } catch (e) {
        if (e.code === '23505') {
            throw userError(`Ya existe un empleado con el DNI '${data.dni}'.`);
        }
        throw e;
    }
}

async function deleteEmployee(id) {
    try {
        await pool.query('DELETE FROM employees WHERE id = $1', [id]);
        return { success: true };
    } catch (e) {
        console.error("Delete Employee Error", e);
        throw e;
    }
}

// ===================== Payroll Periods (Planillas) =====================

function round2(x) {
    return Math.round((x + Number.EPSILON) * 100) / 100;
}

function toYMD(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateOnly(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function countWorkDays(workDays, startDate, endDate) {
    const set = new Set(Array.isArray(workDays) && workDays.length ? workDays.map(Number) : [1, 2, 3, 4, 5, 6]);
    const start = dateOnly(startDate);
    const end = dateOnly(endDate);
    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
        const dow = cur.getDay() === 0 ? 7 : cur.getDay(); // 1=Lunes ... 7=Domingo
        if (set.has(dow)) count++;
        cur.setDate(cur.getDate() + 1);
    }
    return Math.max(1, count);
}

function computePeriodAmounts(emp, referenceDays, expectedDays, workedDays, overtimeHours, bonus = 0, advance = 0, discount = 0) {
    const base = Number(emp.base_amount) || 0;
    const hpd = Number(emp.hours_per_day) || 8;
    const rate = Number(emp.overtime_rate) || 1.5;
    const ref = Math.max(Number(referenceDays) || 1, 1);
    const ed = Math.max(Number(expectedDays) || 1, 1);
    const wd = Math.max(Number(workedDays) || 0, 0);
    const oh = Number(overtimeHours) || 0;

    let hourlyValue = 0;
    let gross = 0;

    if (emp.salary_type === 'POR_HORA') {
        hourlyValue = base;
        gross = hourlyValue * wd * hpd;
    } else if (emp.salary_type === 'POR_DIA') {
        hourlyValue = base / Math.max(hpd, 1);
        gross = base * wd;
    } else { // FIJO: base = sueldo por período (mensual/quincenal/semanal); se prorratea por días trabajados (ref = días de trabajo del período)
        const daily = base / ref;
        hourlyValue = daily / Math.max(hpd, 1);
        gross = daily * wd;
    }

    const overtime = hourlyValue * rate * oh;
    const totalGross = gross + overtime;
    const net = Math.max(0, totalGross + Number(bonus) - Number(advance) - Number(discount));

    return {
        gross_salary: round2(totalGross),
        net_salary: round2(net),
        missed_days: Math.max(0, ed - wd),
        daily_value: round2(hourlyValue * Math.max(hpd, 1)),
        hourly_value: round2(hourlyValue),
        overtime_amount: round2(overtime)
    };
}

function getNextPeriodDates(frequency, fromDate) {
    const d = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
    const start = new Date(d);
    let end;
    if (frequency === 'SEMANAL') {
        const day = d.getDay(); // 0 = Domingo
        const diff = day === 0 ? -6 : 1 - day; // Semana de Lunes a Domingo
        start.setDate(d.getDate() + diff);
        end = new Date(start);
        end.setDate(end.getDate() + 6);
    } else if (frequency === 'QUINCENAL') {
        if (d.getDate() <= 15) {
            start.setDate(1);
            end = new Date(d.getFullYear(), d.getMonth(), 15);
        } else {
            start.setDate(16);
            end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        }
    } else { // MENSUAL
        start.setDate(1);
        end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    }
    return { start, end };
}

function advanceToNextPeriod(frequency, start) {
    if (frequency === 'SEMANAL') {
        return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    }
    if (frequency === 'QUINCENAL') {
        if (start.getDate() === 1) {
            return new Date(start.getFullYear(), start.getMonth(), 16);
        }
        return new Date(start.getFullYear(), start.getMonth() + 1, 1);
    }
    return new Date(start.getFullYear(), start.getMonth() + 1, 1);
}

async function getPayrollPeriods(employeeId = null, status = '') {
    let query = `
        SELECT p.*, e.first_name, e.last_name, e.dni, e.pay_frequency, e.salary_type,
               e.base_amount, e.hours_per_day, e.overtime_rate, e.days_per_period, e.work_days
        FROM payroll_periods p
        JOIN employees e ON p.employee_id = e.id
        WHERE 1=1`;
    const params = [];
    if (employeeId) {
        params.push(employeeId);
        query += ` AND p.employee_id = $${params.length}`;
    }
    if (status) {
        params.push(status);
        query += ` AND p.status = $${params.length}`;
    }
    query += ' ORDER BY p.period_start DESC, p.id DESC';
    const res = await pool.query(query, params);
    return res.rows;
}

async function getPayrollPeriodById(id) {
    const res = await pool.query(`
        SELECT p.*, e.first_name, e.last_name, e.dni, e.pay_frequency, e.salary_type,
               e.base_amount, e.hours_per_day, e.overtime_rate, e.days_per_period, e.work_days
        FROM payroll_periods p
        JOIN employees e ON p.employee_id = e.id
        WHERE p.id = $1
    `, [id]);
    return res.rows[0] || null;
}

async function generatePayrollPeriod(employeeId, targetDate = new Date()) {
    const empRes = await pool.query('SELECT * FROM employees WHERE id = $1 AND status = TRUE', [employeeId]);
    if (!empRes.rows.length) {
        throw userError('Empleado no encontrado o inactivo.');
    }
    const emp = empRes.rows[0];
    let cursor = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());

    for (let i = 0; i < 12; i++) {
        const { start, end } = getNextPeriodDates(emp.pay_frequency, cursor);
        const exists = await pool.query(
            'SELECT id FROM payroll_periods WHERE employee_id = $1 AND period_start = $2',
            [employeeId, toYMD(start)]
        );
        if (exists.rows.length === 0) {
            const expectedDays = countWorkDays(emp.work_days, start, end);
            const workedDays = expectedDays;
            const calc = computePeriodAmounts(emp, expectedDays, expectedDays, workedDays, 0);
            const res = await pool.query(`
                INSERT INTO payroll_periods
                    (employee_id, period_start, period_end, expected_days, worked_days, missed_days, overtime_hours, gross_salary, bonus_amount, advance_amount, discount_amount, net_salary, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'PENDIENTE')
                RETURNING *
            `, [
                employeeId, toYMD(start), toYMD(end), expectedDays, workedDays,
                calc.missed_days, 0, calc.gross_salary, 0, 0, 0, calc.net_salary
            ]);
            return res.rows[0];
        }
        cursor = advanceToNextPeriod(emp.pay_frequency, start);
    }
    throw userError('No se encontró un período pendiente disponible.');
}

async function generateAllPayrollPeriods() {
    const emps = await pool.query('SELECT id FROM employees WHERE status = TRUE ORDER BY id ASC');
    const results = [];
    for (const e of emps.rows) {
        try {
            results.push(await generatePayrollPeriod(e.id));
        } catch (err) {
            console.error('Skip period generation for employee', e.id, err.message);
        }
    }
    return results;
}

async function updatePayrollPeriod(id, data) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const res = await client.query(`
            SELECT p.*, e.pay_frequency, e.salary_type, e.base_amount, e.hours_per_day,
                   e.overtime_rate, e.days_per_period, e.work_days
            FROM payroll_periods p
            JOIN employees e ON p.employee_id = e.id
            WHERE p.id = $1
        `, [id]);
        if (!res.rows.length) {
            await client.query('ROLLBACK');
            throw userError('Período no encontrado.');
        }
        const period = res.rows[0];
        const expectedDays = data.expected_days !== undefined && data.expected_days !== null && data.expected_days !== ''
            ? Number(data.expected_days) : Number(period.expected_days);
        const workedDays = data.worked_days !== undefined && data.worked_days !== null && data.worked_days !== ''
            ? Number(data.worked_days) : Number(period.worked_days);
        const overtimeHours = data.overtime_hours !== undefined && data.overtime_hours !== null && data.overtime_hours !== ''
            ? Number(data.overtime_hours) : Number(period.overtime_hours || 0);

        const sums = await sumPeriodTransactions(client, id);
        const bonus = sums.bonus;
        const advance = sums.advance;
        const discount = sums.discount;

        const calc = computePeriodAmounts(period, countWorkDays(period.work_days, period.period_start, period.period_end), expectedDays, workedDays, overtimeHours, bonus, advance, discount);

        const update = await client.query(`
            UPDATE payroll_periods
            SET expected_days = $1, worked_days = $2, missed_days = $3, overtime_hours = $4,
                bonus_amount = $5, advance_amount = $6, discount_amount = $7,
                gross_salary = $8, net_salary = $9
            WHERE id = $10
            RETURNING *
        `, [expectedDays, workedDays, calc.missed_days, overtimeHours, bonus, advance, discount, calc.gross_salary, calc.net_salary, id]);
        await client.query('COMMIT');
        return update.rows[0];
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Update Payroll Period Error", e);
        throw e;
    } finally {
        client.release();
    }
}

async function markPeriodPaid(id, method = 'Efectivo', userName = null) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const period = (await client.query(`
            SELECT p.*, e.pay_frequency, e.salary_type, e.base_amount, e.hours_per_day,
                   e.overtime_rate, e.days_per_period, e.work_days
            FROM payroll_periods p
            JOIN employees e ON p.employee_id = e.id
            WHERE p.id = $1
        `, [id])).rows[0];
        if (!period) {
            await client.query('ROLLBACK');
            throw userError('Período no encontrado.');
        }
        if (period.status === 'PAGADO') {
            await client.query('ROLLBACK');
            throw userError('El período ya está pagado.');
        }
        await recalcPeriodFromTransactions(client, id);
        const res = await client.query(
            `UPDATE payroll_periods
             SET status = 'PAGADO', payment_date = CURRENT_DATE, payment_method = $1, user_name = $2
             WHERE id = $3
             RETURNING *`,
            [method, userName, id]
        );
        await client.query('COMMIT');
        return res.rows[0];
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Mark Payroll Period Paid Error", e);
        throw e;
    } finally {
        client.release();
    }
}

async function deletePayrollPeriod(id) {
    try {
        await pool.query('DELETE FROM payroll_periods WHERE id = $1', [id]);
        return { success: true };
    } catch (e) {
        console.error("Delete Payroll Period Error", e);
        throw e;
    }
}

async function sumPeriodTransactions(client, periodId) {
    const res = await client.query(`
        SELECT
            COALESCE(SUM(CASE WHEN transaction_type = 'ADELANTO' THEN amount END), 0) AS adelantos,
            COALESCE(SUM(CASE WHEN transaction_type = 'BONO' THEN amount END), 0) AS bonos,
            COALESCE(SUM(CASE WHEN transaction_type = 'DESCUENTO' THEN amount END), 0) AS descuentos
        FROM salary_transactions
        WHERE period_id = $1
    `, [periodId]);
    return {
        bonus: Number(res.rows[0].bonos) || 0,
        advance: Number(res.rows[0].adelantos) || 0,
        discount: Number(res.rows[0].descuentos) || 0
    };
}

async function recalcPeriodFromTransactions(client, periodId) {
    const period = (await client.query(`
        SELECT p.*, e.pay_frequency, e.salary_type, e.base_amount, e.hours_per_day,
               e.overtime_rate, e.days_per_period, e.work_days
        FROM payroll_periods p
        JOIN employees e ON p.employee_id = e.id
        WHERE p.id = $1
    `, [periodId])).rows[0];
    if (!period) return null;
    const sums = await sumPeriodTransactions(client, periodId);
    const calc = computePeriodAmounts(
        period, countWorkDays(period.work_days, period.period_start, period.period_end),
        period.expected_days, period.worked_days, period.overtime_hours || 0,
        sums.bonus, sums.advance, sums.discount
    );
    const update = await client.query(`
        UPDATE payroll_periods
        SET bonus_amount = $1, advance_amount = $2, discount_amount = $3,
            gross_salary = $4, net_salary = $5
        WHERE id = $6
        RETURNING *
    `, [sums.bonus, sums.advance, sums.discount, calc.gross_salary, calc.net_salary, periodId]);
    return update.rows[0];
}

async function getSalaryTransactions(filters = {}) {
    let where = [];
    const params = [];
    if (filters.employee_id) {
        params.push(Number(filters.employee_id));
        where.push(`t.employee_id = $${params.length}`);
    }
    if (filters.period_id) {
        params.push(Number(filters.period_id));
        where.push(`t.period_id = $${params.length}`);
    }
    if (filters.dateFrom) {
        params.push(`${filters.dateFrom} 00:00:00`);
        where.push(`t.created_at >= $${params.length}`);
    }
    if (filters.dateTo) {
        params.push(`${filters.dateTo} 23:59:59`);
        where.push(`t.created_at <= $${params.length}`);
    }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const baseFrom = `
        FROM salary_transactions t
        JOIN employees e ON e.id = t.employee_id
        LEFT JOIN payroll_periods p ON p.id = t.period_id
        ${whereClause}
    `;
    const res = await pool.query(`
        SELECT t.*, e.first_name, e.last_name, p.period_start, p.period_end
        ${baseFrom}
        ORDER BY t.created_at DESC
    `, params);
    const totalsRes = await pool.query(`
        SELECT
            COALESCE(SUM(CASE WHEN t.transaction_type = 'ADELANTO' THEN t.amount ELSE 0 END), 0) AS adelantos,
            COALESCE(SUM(CASE WHEN t.transaction_type = 'BONO' THEN t.amount ELSE 0 END), 0) AS bonos,
            COALESCE(SUM(CASE WHEN t.transaction_type = 'DESCUENTO' THEN t.amount ELSE 0 END), 0) AS descuentos
        ${baseFrom}
    `, params);
    return {
        transactions: res.rows,
        totals: totalsRes.rows[0]
    };
}

async function getSalaryLedger(filters = {}) {
    const salWhere = ['p.status = $1', 'p.payment_date IS NOT NULL'];
    const salParams = ['PAGADO'];
    if (filters.employee_id) {
        salParams.push(Number(filters.employee_id));
        salWhere.push(`p.employee_id = $${salParams.length}`);
    }
    if (filters.dateFrom) {
        salParams.push(filters.dateFrom);
        salWhere.push(`p.payment_date >= $${salParams.length}`);
    }
    if (filters.dateTo) {
        salParams.push(filters.dateTo);
        salWhere.push(`p.payment_date <= $${salParams.length}`);
    }
    const offset = salParams.length;
    const txWhere = [];
    const txParams = [];
    if (filters.employee_id) {
        txParams.push(Number(filters.employee_id));
        txWhere.push(`t.employee_id = $${offset + txParams.length}`);
    }
    if (filters.dateFrom) {
        txParams.push(`${filters.dateFrom} 00:00:00`);
        txWhere.push(`t.created_at >= $${offset + txParams.length}`);
    }
    if (filters.dateTo) {
        txParams.push(`${filters.dateTo} 23:59:59`);
        txWhere.push(`t.created_at <= $${offset + txParams.length}`);
    }
    const txClause = txWhere.length ? `WHERE ${txWhere.join(' AND ')}` : '';
    const res = await pool.query(`
        WITH sal AS (
            SELECT 'SALARIO' AS concepto,
                   p.payment_date::timestamp AS fecha,
                   e.first_name || ' ' || e.last_name AS empleado,
                   p.id, p.employee_id, p.period_start, p.period_end,
                   p.net_salary AS monto,
                   p.user_name AS usuario, p.payment_method AS metodo,
                   'Salario abonado' AS descripcion
            FROM payroll_periods p
            JOIN employees e ON e.id = p.employee_id
            WHERE ${salWhere.join(' AND ')}
        ),
        txs AS (
            SELECT t.transaction_type AS concepto,
                   t.created_at AS fecha,
                   e.first_name || ' ' || e.last_name AS empleado,
                   t.id, t.employee_id, pp.period_start, pp.period_end,
                   t.amount AS monto,
                   t.user_name AS usuario, t.payment_method AS metodo,
                   COALESCE(t.description, '') AS descripcion
            FROM salary_transactions t
            JOIN employees e ON e.id = t.employee_id
            LEFT JOIN payroll_periods pp ON pp.id = t.period_id
            ${txClause}
        )
        SELECT * FROM sal
        UNION ALL
        SELECT * FROM txs
        ORDER BY fecha DESC
    `, [...salParams, ...txParams]);
    const items = res.rows;
    const totals = { salarios: 0, adelantos: 0, bonos: 0, descuentos: 0 };
    for (const it of items) {
        const m = Number(it.monto) || 0;
        if (it.concepto === 'SALARIO') totals.salarios += m;
        else if (it.concepto === 'ADELANTO') totals.adelantos += m;
        else if (it.concepto === 'BONO') totals.bonos += m;
        else if (it.concepto === 'DESCUENTO') totals.descuentos += m;
    }
    totals.neto = totals.salarios + totals.bonos - totals.adelantos - totals.descuentos;
    return { items, totals };
}

async function createSalaryTransaction(data) {
    let {
        employee_id, period_id, transaction_type, amount,
        description, payment_method, user_name
    } = data;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const employee = (await client.query('SELECT * FROM employees WHERE id = $1', [employee_id])).rows[0];
        if (!employee) throw userError('Empleado no encontrado');

        let period = null;
        if (period_id) {
            period = (await client.query('SELECT * FROM payroll_periods WHERE id = $1', [period_id])).rows[0];
            if (!period) throw userError('Período no encontrado');
        } else if (transaction_type === 'DESCUENTO') {
            const next = (await client.query(`
                SELECT * FROM payroll_periods
                WHERE employee_id = $1 AND status = 'PENDIENTE'
                ORDER BY period_start ASC
                LIMIT 1
            `, [employee_id])).rows[0];
            if (next) {
                period = next;
                period_id = next.id;
            }
        }

        const periodRef = period
            ? `Período ${period.period_start.toISOString().slice(0, 10)} - ${period.period_end.toISOString().slice(0, 10)}`
            : 'Sin período';

        const descriptionText = description && description.trim()
            ? description.trim()
            : `${transaction_type} de Salario - ${employee.first_name} ${employee.last_name}`;

        let movementId = null;
        const requiresMovement = transaction_type === 'ADELANTO' || transaction_type === 'BONO';
        if (requiresMovement) {
            const movementRes = await client.query(`
                INSERT INTO movements (type, description, motive, user_name, payment_method, amount, date)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id
            `, [
                'EGRESO',
                descriptionText,
                periodRef,
                user_name || 'Admin',
                payment_method || 'Efectivo',
                Math.round(Number(amount)),
                new Date()
            ]);
            movementId = movementRes.rows[0].id;
        }

        const txRes = await client.query(`
            INSERT INTO salary_transactions
                (employee_id, period_id, transaction_type, amount, description, movement_id, payment_method, user_name)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [
            employee_id, period_id || null, transaction_type, Number(amount),
            descriptionText, movementId, payment_method || 'Efectivo', user_name || 'Admin'
        ]);

        let updatedPeriod = null;
        if (period_id) {
            updatedPeriod = await recalcPeriodFromTransactions(client, period_id);
        }

        await client.query('COMMIT');
        return { transaction: txRes.rows[0], period: updatedPeriod };
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Create Salary Transaction Error", e);
        throw e;
    } finally {
        client.release();
    }
}

async function deleteSalaryTransaction(id) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const tx = (await client.query('SELECT * FROM salary_transactions WHERE id = $1', [id])).rows[0];
        if (!tx) throw userError('Transacción no encontrada');

        if (tx.movement_id) {
            await client.query('DELETE FROM movements WHERE id = $1', [tx.movement_id]);
        }
        await client.query('DELETE FROM salary_transactions WHERE id = $1', [id]);

        let updatedPeriod = null;
        if (tx.period_id) {
            updatedPeriod = await recalcPeriodFromTransactions(client, tx.period_id);
        }

        await client.query('COMMIT');
        return { deleted: true, period: updatedPeriod };
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Delete Salary Transaction Error", e);
        throw e;
    } finally {
        client.release();
    }
}

module.exports = {
    getPermissions,
    getRolePermissions,
    updateRolePermissions,
    checkUserPermission,
    authenticateUser,
    changePassword,
    changePasswordByUsername,
    getUsers,
    getRoles,
    createUser,
    updateUser,
    deleteUser,
    initDatabase,
    pool,
    getProducts,
    getProductDetails,
    createProductWithVariants,
    updateProductWithVariants,
    deleteProduct,
    processSaleTransaction,
    processPurchaseTransaction,
    getMovements,
    getRegisterStatus,
    openRegister,
    closeRegister,
    updateMovement,
    getMovementById,
    getCategories,
    createCategory,
    // New exports
    getTables,
    createTable,
    updateTableStatus,
    updateTablePosition,
    deleteTable,
    getClients,
    createClient,
    updateClient,
    deleteClient,
    getEmployees,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    getPayrollPeriods,
    getPayrollPeriodById,
    generatePayrollPeriod,
    generateAllPayrollPeriods,
    updatePayrollPeriod,
    markPeriodPaid,
    deletePayrollPeriod,
    getSalaryTransactions,
    getSalaryLedger,
    createSalaryTransaction,
    deleteSalaryTransaction,
    getOpenTabs,
    getTabByTable,
    getTabDetails,
    openTab,
    addItemToTab,
    removeItemFromTab,
    closeTabAndProcessSale,
    updateTabItems,
    splitTabAndProcessSale
};
