require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const https = require('https');

const db = require('./src/database/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'", "ws://localhost:8182"],
            fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://fonts.gstatic.com"],
            formAction: ["'self'"],
            baseUri: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
        }
    }
}));
const allowedOrigins = process.env.NODE_ENV === 'production'
    ? (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean)
    : [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`, `http://localhost:3443`];

app.use(cors({
    origin: (origin, cb) => {
        if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error('Origen no permitido por CORS'));
    }
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'src/views')));

const authRouter = require('./src/routes/auth');
const usersRouter = require('./src/routes/users');
const registerRouter = require('./src/routes/register');
const alumnosRouter = require('./src/routes/alumnos');
const cursosRouter = require('./src/routes/cursos');
const responsablesRouter = require('./src/routes/responsables');
const matriculasRouter = require('./src/routes/matriculas');
const pagosRouter = require('./src/routes/pagos');
const reportesRouter = require('./src/routes/reportes');
const configRouter = require('./src/routes/config');

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/register', registerRouter);
app.use('/api/alumnos', alumnosRouter);
app.use('/api/cursos', cursosRouter);
app.use('/api/responsables', responsablesRouter);
app.use('/api/matriculas', matriculasRouter);
app.use('/api/pagos', pagosRouter);
app.use('/api/reportes', reportesRouter);
app.use('/api/config', configRouter);

app.get('/api/health', (req, res) => {
    res.json({ success: true, status: 'ok' });
});

app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'src/views/index.html'));
});

async function start() {
    try {
        await db.initDatabase();
        console.log('Database initialized');
    } catch (err) {
        console.error('Database initialization failed:', err);
        process.exit(1);
    }

    const useHttps = process.env.HTTPS === 'true';

    if (useHttps) {
        const certDir = path.join(__dirname, 'certs');
        if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });

        const keyPath = path.join(certDir, 'key.pem');
        const certPath = path.join(certDir, 'cert.pem');

        if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
            console.log('Generando certificado SSL auto-firmado...');
            const selfsigned = require('selfsigned');
            const attrs = [{ name: 'commonName', value: 'localhost' }];
            const pems = selfsigned.generate(attrs, { days: 365 });
            fs.writeFileSync(keyPath, pems.private);
            fs.writeFileSync(certPath, pems.cert);
            console.log('Certificado SSL generado en', certDir);
        }

        const httpsOptions = {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath)
        };

        https.createServer(httpsOptions, app).listen(PORT, '0.0.0.0', () => {
            console.log(`K-RECA POS Server running on https://0.0.0.0:${PORT}`);
        });
    } else {
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`K-RECA POS Server running on http://0.0.0.0:${PORT}`);
        });
    }
}

start();
