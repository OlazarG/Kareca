const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { success, error, safeError } = require('../helpers/apiResponse');
const { verifyToken, requirePermission } = require('../middleware/auth');

router.use(verifyToken);

router.get('/', async (req, res) => {
    try {
        const { search, category, page, limit } = req.query;
        const result = await db.getProducts(search, category, parseInt(page) || 1, parseInt(limit) || 20);
        return success(res, result);
    } catch (err) {
        return safeError(res, err);
    }
});

router.get('/:id', async (req, res) => {
    try {
        const result = await db.getProductDetails(parseInt(req.params.id));
        if (!result) return error(res, 'Producto no encontrado', 404);
        return success(res, result);
    } catch (err) {
        return safeError(res, err);
    }
});

router.post('/', requirePermission('gestionar_productos'), async (req, res) => {
    try {
        const { productData, variants } = req.body;
        const result = await db.createProductWithVariants(productData, variants);
        return success(res, { product: result }, 201);
    } catch (err) {
        return safeError(res, err);
    }
});

router.put('/:id', requirePermission('gestionar_productos'), async (req, res) => {
    try {
        const { productData, variants } = req.body;
        const result = await db.updateProductWithVariants(parseInt(req.params.id), productData, variants);
        return success(res, { product: result });
    } catch (err) {
        return safeError(res, err);
    }
});

router.delete('/:id', requirePermission('gestionar_productos'), async (req, res) => {
    try {
        await db.deleteProduct(parseInt(req.params.id));
        return success(res, { message: 'Producto eliminado' });
    } catch (err) {
        return safeError(res, err);
    }
});

module.exports = router;
