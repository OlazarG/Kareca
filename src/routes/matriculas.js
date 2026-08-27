const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { success, error, serverError } = require('../helpers/apiResponse');
const { verifyToken } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { validate, schemas } = require('../helpers/validators');

router.use(verifyToken);

router.get('/', async (req, res) => {
    try {
        const { alumno_id, curso_id, anio_lectivo, periodo } = req.query;
        const matriculas = await db.getMatriculas(
            alumno_id ? parseInt(alumno_id) : null,
            curso_id ? parseInt(curso_id) : null,
            anio_lectivo ? parseInt(anio_lectivo) : null,
            periodo ? parseInt(periodo) : null
        );
        return success(res, { matriculas });
    } catch (err) {
        return serverError(res, err);
    }
});

router.get('/:id', async (req, res) => {
    try {
        const matricula = await db.getMatriculaById(req.params.id);
        if (!matricula) return error(res, 'Matrícula no encontrada', 404);
        return success(res, { matricula });
    } catch (err) {
        return serverError(res, err);
    }
});

router.post('/', authorize('gestionar_matriculas'), validate(schemas.matricula), async (req, res) => {
    try {
        const matricula = await db.createMatricula(req.body);
        return success(res, { matricula }, 201);
    } catch (err) {
        return error(res, err.message);
    }
});

router.put('/:id/baja', authorize('gestionar_matriculas'), async (req, res) => {
    try {
        await db.bajaMatricula(req.params.id);
        return success(res, { message: 'Matrícula dada de baja' });
    } catch (err) {
        return serverError(res, err);
    }
});

module.exports = router;
