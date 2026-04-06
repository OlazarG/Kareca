require('dotenv').config();
const { Client } = require('pg');

const dbName = process.env.DB_NAME || 'KARECA_DB'; // Database name remains KARECA_DB for compatibility

async function setup() {
    console.log("Verificando base de datos...");

    // Connect to default 'postgres' database to check/create target DB
    const client = new Client({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: 'postgres',
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
    });

    try {
        await client.connect();

        const res = await client.query(`SELECT 1 FROM pg_database WHERE datname = '${dbName}'`);
        if (res.rows.length === 0) {
            console.log(`Base de datos '${dbName}' no existe. Creando...`);
            await client.query(`CREATE DATABASE "${dbName}"`);
            console.log(`Base de datos '${dbName}' creada exitosamente.`);
        } else {
            console.log(`Base de datos '${dbName}' ya existe.`);
        }

    } catch (e) {
        console.error("Error al configurar la base de datos:", e.message);
        console.log("Asegúrese de que PostgreSQL esté corriendo y las credenciales en .env sean correctas.");
    } finally {
        await client.end();
    }
}

setup();
