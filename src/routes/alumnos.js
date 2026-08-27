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
        const { search, page, limit } = req.query;
        const result = await db.getAlumnos(search || '', parseInt(page) || 1, parseInt(limit) || 20);
        return success(res, result);
    } catch (err) {
        return serverError(res, err);
    }
});

router.get('/:id', async (req, res) => {
    try {
        const alumno = await db.getAlumnoById(req.params.id);
        if (!alumno) return error(res, 'Alumno no encontrado', 404);
        return success(res, { alumno });
    } catch (err) {
        return serverError(res, err);
    }
});

router.post('/', authorize('gestionar_alumnos'), validate(schemas.alumno), async (req, res) => {
    try {
        const alumno = await db.createAlumno(req.body);
        return success(res, { alumno }, 201);
    } catch (err) {
        return error(res, err.message);
    }
});

router.put('/:id', authorize('gestionar_alumnos'), validate(schemas.alumno), async (req, res) => {
    try {
        await db.updateAlumno(req.params.id, req.body);
        return success(res, { message: 'Alumno actualizado' });
    } catch (err) {
        return error(res, err.message);
    }
});

router.delete('/:id', authorize('gestionar_alumnos'), async (req, res) => {
    try {
        await db.deleteAlumno(req.params.id);
        return success(res, { message: 'Alumno eliminado' });
    } catch (err) {
        return serverError(res, err);
    }
});

router.get('/:id/responsables', async (req, res) => {
    try {
        const responsables = await db.getResponsablesByAlumno(req.params.id);
        return success(res, { responsables });
    } catch (err) {
        return serverError(res, err);
    }
});

router.post('/:id/responsables', authorize('gestionar_alumnos', 'gestionar_responsables'), validate(schemas.asignarResponsable), async (req, res) => {
    try {
        await db.asignarResponsable(req.params.id, req.body.responsable_id, req.body.parentesco, req.body.es_principal);
        return success(res, { message: 'Responsable asignado' }, 201);
    } catch (err) {
        return error(res, err.message);
    }
});

router.delete('/:id/responsables/:responsableId', authorize('gestionar_alumnos', 'gestionar_responsables'), async (req, res) => {
    try {
        await db.desasignarResponsable(req.params.id, req.params.responsableId);
        return success(res, { message: 'Responsable desasignado' });
    } catch (err) {
        return serverError(res, err);
    }
});

router.get('/:id/deuda/:anioLectivo', async (req, res) => {
    try {
        const deuda = await db.getDeudaAlumno(req.params.id, parseInt(req.params.anioLectivo));
        return success(res, { deuda });
    } catch (err) {
        return serverError(res, err);
    }
});

module.exports = router;
