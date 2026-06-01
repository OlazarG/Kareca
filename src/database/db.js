require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});



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
            throw new Error(`Error: El código de barras '${e.detail}' ya está registrado.`);
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
            throw new Error(`Error: El código de barras '${e.detail}' ya está registrado.`);
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
            INSERT INTO movements (type, description, motive, user_name, payment_method, amount, details_json)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
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
            })
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
        if (sessionRes.rows.length === 0) throw new Error("No hay caja abierta.");
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

module.exports = {
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
    createCategory
};
