const express = require('express');
const path = require('path');
const cors = require('cors');
const compression = require('compression');
const db = require('./src/database/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'src/views')));

// --- API Routes ---

// Products
app.get('/api/products', async (req, res) => {
    try {
        const { search, category, page, limit } = req.query;
        const result = await db.getProducts(search, category, parseInt(page) || 1, parseInt(limit) || 20);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/products/:id', async (req, res) => {
    try {
        const result = await db.getProductDetails(req.params.id);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        const { productData, variants } = req.body;
        const result = await db.createProductWithVariants(productData, variants);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/products/:id', async (req, res) => {
    try {
        const { productData, variants } = req.body;
        const result = await db.updateProductWithVariants(req.params.id, productData, variants);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        const result = await db.deleteProduct(req.params.id);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Sales & Purchases
app.post('/api/sales', async (req, res) => {
    try {
        const result = await db.processSaleTransaction(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/purchases', async (req, res) => {
    try {
        const result = await db.processPurchaseTransaction(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Reports & Movements
app.get('/api/movements', async (req, res) => {
    try {
        const { from, to, page, limit } = req.query;
        const result = await db.getMovements(from, to, parseInt(page) || 1, parseInt(limit) || 20);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/movements/:id', async (req, res) => {
    try {
        const result = await db.getMovementById(req.params.id);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/movements/:id', async (req, res) => {
    try {
        const { amount, reason, user, restockItems } = req.body;
        const result = await db.updateMovement(req.params.id, amount, reason, user, restockItems);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Cash Register
app.get('/api/register/status', async (req, res) => {
    try {
        const result = await db.getRegisterStatus();
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/register/open', async (req, res) => {
    try {
        const { amount, user } = req.body;
        const result = await db.openRegister(amount, user);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/register/close', async (req, res) => {
    try {
        const { finalCash, user } = req.body;
        const result = await db.closeRegister(finalCash, user);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Print Mock (Native printing not available in cloud)
app.post('/api/print', async (req, res) => {
    res.json({ success: false, error: "Impresión directa no disponible en versión web. Use la impresión del navegador." });
});

// Startup
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
