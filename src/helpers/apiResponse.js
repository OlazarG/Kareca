function success(res, data, status = 200) {
    return res.status(status).json({ success: true, ...data });
}

function error(res, message, status = 400) {
    return res.status(status).json({ success: false, error: message, message });
}

function serverError(res, err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
}

module.exports = { success, error, serverError };
