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
        const { anio_lectivo } = req.query;
        const cursos = await db.getCursos(anio_lectivo ? parseInt(anio_lectivo) : null);
        return success(res, { cursos });
    } catch (err) {
        return serverError(res, err);
    }
});

router.get('/:id', async (req, res) => {
    try {
        const curso = await db.getCursoById(req.params.id);
        if (!curso) return error(res, 'Curso no encontrado', 404);
        return success(res, { curso });
    } catch (err) {
        return serverError(res, err);
    }
});

router.get('/:id/alumnos', authorize('gestionar_alumnos', 'ver_reportes', 'gestionar_matriculas', 'gestionar_cursos'), async (req, res) => {
    try {
        const { anio_lectivo, periodo, page, limit } = req.query;
        const config = await db.getConfig();
        const anio = parseInt(anio_lectivo) || parseInt(config.anio_lectivo_actual) || new Date().getFullYear();
        const result = await db.getAlumnosByCurso(req.params.id, anio, periodo ? parseInt(periodo) : null, page, limit);
        return success(res, result);
    } catch (err) {
        return serverError(res, err);
    }
});

router.get('/:id/historial', async (req, res) => {
    try {
        const historial = await db.getCursoCostHistory(req.params.id);
        return success(res, { historial });
    } catch (err) {
        return serverError(res, err);
    }
});

router.post('/', authorize('gestionar_cursos'), validate(schemas.curso), async (req, res) => {
    try {
        const curso = await db.createCurso(req.body);
        return success(res, { curso }, 201);
    } catch (err) {
        return error(res, err.message);
    }
});

router.put('/batch', authorize('gestionar_cursos'), validate(schemas.cursoBatch), async (req, res) => {
    try {
        const { curso_ids, campos } = req.body;
        const result = await db.batchUpdateCursos(
            curso_ids || null,
            campos,
            req.user?.username || ''
        );
        return success(res, { message: `${result.updated} curso(s) actualizado(s)` });
    } catch (err) {
        return error(res, err.message);
    }
});

router.put('/:id', authorize('gestionar_cursos'), validate(schemas.curso), async (req, res) => {
    try {
        await db.updateCurso(req.params.id, { ...req.body, modified_by: req.user?.username || '' });
        return success(res, { message: 'Curso actualizado' });
    } catch (err) {
        return error(res, err.message);
    }
});

router.delete('/:id', authorize('gestionar_cursos'), async (req, res) => {
    try {
        await db.deleteCurso(req.params.id);
        return success(res, { message: 'Curso eliminado' });
    } catch (err) {
        return serverError(res, err);
    }
});

router.get('/:id/cuotas', async (req, res) => {
    try {
        const { anio_lectivo, periodo } = req.query;
        const cuotas = await db.getCuotas(req.params.id, parseInt(anio_lectivo), periodo ? parseInt(periodo) : null);
        return success(res, { cuotas });
    } catch (err) {
        return serverError(res, err);
    }
});

router.post('/:id/cuotas/generar', authorize('gestionar_cursos'), validate(schemas.generarCuotas), async (req, res) => {
    try {
        const { anio_lectivo } = req.body;
        const cuotas = await db.generarCuotasAutomaticas(req.params.id, parseInt(anio_lectivo));
        return success(res, { cuotas }, 201);
    } catch (err) {
        return error(res, err.message);
    }
});

router.post('/:id/cuotas', authorize('gestionar_cursos'), validate(schemas.cuota), async (req, res) => {
    try {
        const cuota = await db.createCuota({ ...req.body, curso_id: req.params.id });
        return success(res, { cuota }, 201);
    } catch (err) {
        return error(res, err.message);
    }
});

router.delete('/cuotas/:cuotaId', authorize('gestionar_cursos'), async (req, res) => {
    try {
        await db.deleteCuota(req.params.cuotaId);
        return success(res, { message: 'Cuota eliminada' });
    } catch (err) {
        return serverError(res, err);
    }
});

module.exports = router;
