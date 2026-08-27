const Joi = require('joi');

const schemas = {
    alumno: Joi.object({
        nombre: Joi.string().trim().max(255).required(),
        apellido: Joi.string().trim().max(255).required(),
        dni: Joi.string().trim().max(50).allow('', null),
        fecha_nacimiento: Joi.date().allow('', null),
        email: Joi.string().trim().email().max(255).allow('', null),
        telefono: Joi.string().trim().max(50).allow('', null),
        direccion: Joi.string().trim().allow('', null),
        observaciones: Joi.string().trim().allow('', null),
        estado: Joi.string().valid('ACTIVO', 'INACTIVO', 'activo', 'inactivo').default('ACTIVO'),
    }),

    curso: Joi.object({
        nombre: Joi.string().trim().max(100).required(),
        nivel: Joi.string().trim().max(50).allow('', null),
        turno: Joi.string().trim().max(50).allow('', null),
        anio_lectivo: Joi.number().integer().min(2000).max(2100).required(),
        cuota_mensual: Joi.number().min(0).default(0),
        matricula_monto: Joi.number().min(0).default(0),
        matricula_mec: Joi.number().min(0).default(0),
        matricula_inst: Joi.number().min(0).default(0),
        examen_parcial_monto: Joi.number().min(0).default(0),
        examen_parcial_mec: Joi.number().min(0).default(0),
        examen_parcial_inst: Joi.number().min(0).default(0),
        examen_complementario_monto: Joi.number().min(0).default(0),
        examen_complementario_mec: Joi.number().min(0).default(0),
        examen_complementario_inst: Joi.number().min(0).default(0),
        extra_ordinario_monto: Joi.number().min(0).default(0),
        extra_ordinario_mec: Joi.number().min(0).default(0),
        extra_ordinario_inst: Joi.number().min(0).default(0),
        documento_expedido: Joi.string().valid('', 'TITULO', 'CERTIFICACION', 'CONSTANCIA').allow('').default(''),
        documento_monto: Joi.number().min(0).default(0),
        documento_mec: Joi.number().min(0).default(0),
        documento_inst: Joi.number().min(0).default(0),
        numero_resolucion: Joi.string().trim().max(100).allow('', null).default(''),
        modified_by: Joi.string().trim().max(100).allow('', null).default(''),
        recargo_mora_pct: Joi.number().min(0).max(100).default(0),
        dia_vencimiento: Joi.number().integer().min(1).max(31).default(10),
        tipo_periodo: Joi.string().valid('ANUAL', 'SEMESTRAL').default('ANUAL'),
        activo: Joi.boolean().default(true),
    }),

    responsable: Joi.object({
        nombre: Joi.string().trim().max(255).required(),
        apellido: Joi.string().trim().max(255).required(),
        dni: Joi.string().trim().max(50).allow('', null),
        email: Joi.string().trim().email().max(255).allow('', null),
        telefono: Joi.string().trim().max(50).allow('', null),
        telefono_alt: Joi.string().trim().max(50).allow('', null),
        direccion: Joi.string().trim().allow('', null),
    }),

    matricula: Joi.object({
        alumno_id: Joi.number().integer().positive().required(),
        curso_id: Joi.number().integer().positive().required(),
        anio_lectivo: Joi.number().integer().min(2000).max(2100).required(),
        periodo: Joi.number().integer().min(1).default(1),
    }),

    pago: Joi.object({
        alumno_id: Joi.number().integer().positive().required(),
        matricula_id: Joi.number().integer().positive().allow(null),
        cuota_id: Joi.number().integer().positive().allow(null),
        responsable_id: Joi.number().integer().positive().allow(null),
        monto: Joi.number().positive().required(),
        concepto: Joi.string().trim().max(255).allow('', null),
        metodo_pago: Joi.string().trim().max(50).required(),
        comprobante: Joi.string().trim().max(100).allow('', null),
        observaciones: Joi.string().trim().allow('', null),
    }),

    user: Joi.object({
        username: Joi.string().trim().min(3).max(50).required(),
        password: Joi.string().min(8).max(128).required(),
        role_id: Joi.number().integer().positive().allow(null),
        status: Joi.boolean().default(true),
    }),

    userUpdate: Joi.object({
        username: Joi.string().trim().min(3).max(50).required(),
        password: Joi.string().min(8).max(128).allow('', null),
        role_id: Joi.number().integer().positive().allow(null),
        status: Joi.boolean().default(true),
    }),

    login: Joi.object({
        username: Joi.string().trim().required(),
        password: Joi.string().required(),
    }),

    asignarResponsable: Joi.object({
        responsable_id: Joi.number().integer().positive().required(),
        parentesco: Joi.string().trim().max(50).allow('', null),
        es_principal: Joi.boolean().default(false),
    }),

    configUpdate: Joi.object({
        clave: Joi.string().trim().max(100).required(),
        valor: Joi.string().allow('').required(),
    }),

    registerOpen: Joi.object({
        amount: Joi.number().min(0).required(),
    }),

    registerClose: Joi.object({
        finalCash: Joi.number().min(0).required(),
    }),

    cuota: Joi.object({
        nombre: Joi.string().trim().max(100).required(),
        monto: Joi.number().positive().required(),
        fecha_vencimiento: Joi.date().required(),
        orden: Joi.number().integer().positive().default(13),
        anio_lectivo: Joi.number().integer().min(2000).max(2100).required(),
        periodo: Joi.number().integer().min(1).default(1),
    }),

    generarCuotas: Joi.object({
        anio_lectivo: Joi.number().integer().min(2000).max(2100).required(),
    }),

    cursoBatch: Joi.object({
        curso_ids: Joi.array().items(Joi.number().integer().positive()).allow(null),
        campos: Joi.object({
            cuota_mensual: Joi.number().min(0),
            recargo_mora_pct: Joi.number().min(0).max(100),
            dia_vencimiento: Joi.number().integer().min(1).max(31),
            tipo_periodo: Joi.string().valid('ANUAL', 'SEMESTRAL'),
            activo: Joi.boolean(),
            numero_resolucion: Joi.string().trim().max(100).allow(''),
            matricula_mec: Joi.number().min(0),
            matricula_inst: Joi.number().min(0),
            examen_parcial_mec: Joi.number().min(0),
            examen_parcial_inst: Joi.number().min(0),
            examen_complementario_mec: Joi.number().min(0),
            examen_complementario_inst: Joi.number().min(0),
            extra_ordinario_mec: Joi.number().min(0),
            extra_ordinario_inst: Joi.number().min(0),
            documento_expedido: Joi.string().valid('', 'TITULO', 'CERTIFICACION', 'CONSTANCIA'),
            documento_mec: Joi.number().min(0),
            documento_inst: Joi.number().min(0),
        }).min(1).required(),
    }),

    anularPago: Joi.object({
        motivo: Joi.string().trim().allow('', null),
    }),
};

function validate(schema) {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
        if (error) {
            const msg = error.details.map(d => d.message).join('. ');
            return res.status(400).json({ success: false, error: msg, message: msg });
        }
        req.body = value;
        next();
    };
}

module.exports = { schemas, validate };
