require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function resetDb() {
    try {
        console.log("Conectando a la base de datos para eliminar registros...");
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // Truncate all tables with CASCADE to handle foreign keys
            // RESTART IDENTITY resets the auto-increment counters to 1
            const query = `
                TRUNCATE TABLE 
                    products, 
                    product_variants, 
                    movements, 
                    ventas, 
                    detalles_venta, 
                    egresos, 
                    cash_sessions 
                RESTART IDENTITY CASCADE;
            `;

            console.log("Ejecutando TRUNCATE...");
            await client.query(query);

            await client.query('COMMIT');
            console.log("✅ Base de datos limpiada exitosamente. Todos los registros han sido eliminados.");

        } catch (e) {
            await client.query('ROLLBACK');
            console.error("❌ Error al limpiar la base de datos:", e);
        } finally {
            client.release();
        }

    } catch (err) {
        console.error("Error de conexión:", err);
    } finally {
        await pool.end();
    }
}

resetDb();
