const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { success, error } = require('../helpers/apiResponse');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

router.get('/', async (req, res) => {
    try {
        const { search, category, page, limit } = req.query;
        const result = await db.getProducts(search, category, parseInt(page) || 1, parseInt(limit) || 20);
        return success(res, result);
    } catch (err) {
        console.error('getProducts error:', err);
        return error(res, err.message, 500);
    }
});

router.get('/:id', async (req, res) => {
    try {
        const result = await db.getProductDetails(parseInt(req.params.id));
        if (!result) return error(res, 'Producto no encontrado', 404);
        return success(res, result);
    } catch (err) {
        return error(res, err.message, 500);
    }
});

router.post('/', async (req, res) => {
    try {
        const { productData, variants } = req.body;
        const result = await db.createProductWithVariants(productData, variants);
        return success(res, { product: result }, 201);
    } catch (err) {
        return error(res, err.message, 500);
    }
});

router.put('/:id', async (req, res) => {
    try {
        const { productData, variants } = req.body;
        const result = await db.updateProductWithVariants(parseInt(req.params.id), productData, variants);
        return success(res, { product: result });
    } catch (err) {
        return error(res, err.message, 500);
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await db.deleteProduct(parseInt(req.params.id));
        return success(res, { message: 'Producto eliminado' });
    } catch (err) {
        return error(res, err.message, 500);
    }
});

module.exports = router;
