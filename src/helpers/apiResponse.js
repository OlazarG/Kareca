function success(res, data, status = 200) {
    return res.status(status).json({ success: true, ...data });
}

function error(res, message, status = 400) {
    return res.status(status).json({ success: false, message });
}

function safeError(res, err, fallbackStatus = 500) {
    if (err && err.safe) {
        return error(res, err.message, err.status || 400);
    }
    console.error(err);
    return error(res, 'Error interno del servidor', fallbackStatus);
}

function userError(message, status = 400) {
    const e = new Error(message);
    e.safe = true;
    e.status = status;
    return e;
}

module.exports = { success, error, safeError, userError };
