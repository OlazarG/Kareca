const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { success, error, serverError } = require('../helpers/apiResponse');
const { verifyToken } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { validate, schemas } = require('../helpers/validators');

router.use(verifyToken);
router.use(authorize('gestionar_usuarios'));

router.get('/', async (req, res) => {
    try {
        const users = await db.getUsers();
        return success(res, { users });
    } catch (err) {
        return serverError(res, err);
    }
});

router.post('/', validate(schemas.user), async (req, res) => {
    try {
        await db.createUser(req.body);
        return success(res, { message: 'Usuario creado' }, 201);
    } catch (err) {
        return error(res, err.message);
    }
});

router.put('/:id', validate(schemas.userUpdate), async (req, res) => {
    try {
        await db.updateUser(parseInt(req.params.id), req.body);
        return success(res, { message: 'Usuario actualizado' });
    } catch (err) {
        return error(res, err.message);
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await db.deleteUser(parseInt(req.params.id));
        return success(res, { message: 'Usuario eliminado' });
    } catch (err) {
        return serverError(res, err);
    }
});

router.get('/roles', async (req, res) => {
    try {
        const roles = await db.getRoles();
        return success(res, { roles });
    } catch (err) {
        return serverError(res, err);
    }
});

router.get('/permissions', async (req, res) => {
    try {
        const permissions = await db.getPermissions();
        return success(res, { permissions });
    } catch (err) {
        return serverError(res, err);
    }
});

router.get('/roles/:roleId/permissions', async (req, res) => {
    try {
        const permissionIds = await db.getRolePermissions(parseInt(req.params.roleId));
        return success(res, { permissionIds });
    } catch (err) {
        return serverError(res, err);
    }
});

router.put('/roles/:roleId/permissions', async (req, res) => {
    try {
        await db.updateRolePermissions(parseInt(req.params.roleId), req.body.permissionIds);
        return success(res, { message: 'Permisos actualizados' });
    } catch (err) {
        return serverError(res, err);
    }
});

module.exports = router;
