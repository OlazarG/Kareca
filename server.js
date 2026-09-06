require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const path = require('path');

const db = require('./src/database/db');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.set('trust proxy', isProduction ? 1 : false);

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'", "ws://localhost:8182"],
            fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://fonts.gstatic.com"],
        }
    }
}));

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Demasiadas solicitudes. Intente nuevamente más tarde.' }
});
app.use(globalLimiter);

app.use((req, res, next) => {
    res.removeHeader('Access-Control-Allow-Origin');
    res.removeHeader('Access-Control-Allow-Credentials');
    const origin = req.headers.origin;
    if (origin) {
        try {
            const originHost = new URL(origin).host;
            if (originHost !== req.headers.host) {
                return res.status(403).json({ success: false, message: 'Origen no permitido' });
            }
        } catch (e) {
            return res.status(403).json({ success: false, message: 'Origen no permitido' });
        }
    }
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'src/views')));

const authRouter = require('./src/routes/auth');
const productsRouter = require('./src/routes/products');
const categoriesRouter = require('./src/routes/categories');
const salesRouter = require('./src/routes/sales');
const registerRouter = require('./src/routes/register');
const tablesRouter = require('./src/routes/tables');
const clientsRouter = require('./src/routes/clients');
const tabsRouter = require('./src/routes/tabs');
const usersRouter = require('./src/routes/users');
const exportsRouter = require('./src/routes/exports');
const salariesRouter = require('./src/routes/salaries');
const printRouter = require('./src/routes/print');
const ticketTemplateRouter = require('./src/routes/ticketTemplate');

app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/sales', salesRouter);
app.use('/api/register', registerRouter);
app.use('/api/tables', tablesRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/tabs', tabsRouter);
app.use('/api/users', usersRouter);
app.use('/api/exports', exportsRouter);
app.use('/api/salaries', salariesRouter);
app.use('/api/print', printRouter);
app.use('/api/ticket', ticketTemplateRouter);

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

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`K-RECA POS Server running on http://0.0.0.0:${PORT}`);
    });
}

start();
