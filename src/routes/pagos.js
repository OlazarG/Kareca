const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { success, error, serverError } = require('../helpers/apiResponse');
const { verifyToken } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { validate, schemas } = require('../helpers/validators');

router.use(verifyToken);

router.get('/', authorize('realizar_cobros', 'ver_reportes'), async (req, res) => {
    try {
        const { alumno_id, fecha_from, fecha_to, metodo_pago, page, limit } = req.query;
        const filtros = {
            alumnoId: alumno_id ? parseInt(alumno_id) : undefined,
            fechaFrom: fecha_from,
            fechaTo: fecha_to,
            metodoPago: metodo_pago,
            page: page ? parseInt(page) : undefined,
            limit: limit ? parseInt(limit) : undefined
        };
        const pagos = await db.getPagos(filtros);
        return success(res, pagos);
    } catch (err) {
        return serverError(res, err);
    }
});

router.post('/', authorize('realizar_cobros'), validate(schemas.pago), async (req, res) => {
    try {
        const pago = await db.registrarPago({ ...req.body, user_name: req.user.username });
        return success(res, { pago }, 201);
    } catch (err) {
        return error(res, err.message);
    }
});

router.put('/:id/anular', authorize('realizar_cobros'), validate(schemas.anularPago), async (req, res) => {
    try {
        await db.anularPago(req.params.id, req.body.motivo, req.user.username);
        return success(res, { message: 'Pago anulado' });
    } catch (err) {
        return error(res, err.message);
    }
});

module.exports = router;
