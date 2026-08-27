const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { success, error, serverError } = require('../helpers/apiResponse');
const { verifyToken } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');

router.use(verifyToken);

router.get('/cobros', authorize('ver_reportes'), async (req, res) => {
    try {
        const { fecha_from, fecha_to } = req.query;
        const today = new Date().toISOString().split('T')[0];
        const reporte = await db.getResumenCobros(fecha_from || today, fecha_to || today);
        return success(res, reporte);
    } catch (err) {
        return serverError(res, err);
    }
});

router.get('/deudores', authorize('ver_morosidad', 'ver_reportes'), async (req, res) => {
    try {
        const { anio_lectivo } = req.query;
        const config = await db.getConfig();
        const anio = parseInt(anio_lectivo) || parseInt(config.anio_lectivo_actual) || new Date().getFullYear();
        const deudores = await db.getDeudores(anio);
        return success(res, { deudores });
    } catch (err) {
        return serverError(res, err);
    }
});

router.get('/estadisticas', authorize('ver_reportes', 'ver_morosidad'), async (req, res) => {
    try {
        const { anio_lectivo } = req.query;
        const config = await db.getConfig();
        const anio = parseInt(anio_lectivo) || parseInt(config.anio_lectivo_actual) || new Date().getFullYear();
        const stats = await db.getEstadisticasGenerales(anio);
        return success(res, stats);
    } catch (err) {
        return serverError(res, err);
    }
});

router.get('/movimientos', authorize('ver_reportes', 'gestionar_caja'), async (req, res) => {
    try {
        const { fecha_from, fecha_to, page, limit } = req.query;
        const result = await db.getMovements(fecha_from, fecha_to, parseInt(page) || 1, parseInt(limit) || 20);
        return success(res, result);
    } catch (err) {
        return serverError(res, err);
    }
});

module.exports = router;
