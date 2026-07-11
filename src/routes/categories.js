const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { success, error } = require('../helpers/apiResponse');
const { verifyToken } = require('../middleware/auth');

router.get('/', async (req, res) => {
    try {
        const categories = await db.getCategories();
        return success(res, { categories });
    } catch (err) {
        return error(res, err.message, 500);
    }
});

router.post('/', verifyToken, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return error(res, 'Nombre de categoría requerido');
        await db.createCategory(name.trim());
        return success(res, { message: 'Categoría creada' }, 201);
    } catch (err) {
        return error(res, err.message, 500);
    }
});

module.exports = router;
