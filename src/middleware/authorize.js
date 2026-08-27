const { error } = require('../helpers/apiResponse');

function authorize(...allowedPermissions) {
    return (req, res, next) => {
        if (!req.user || !req.user.permissions) {
            return error(res, 'No autorizado', 403);
        }

        const hasPermission = allowedPermissions.some(p => req.user.permissions.includes(p));
        if (!hasPermission) {
            return error(res, 'No tiene permisos para esta accion', 403);
        }

        next();
    };
}

module.exports = { authorize };
