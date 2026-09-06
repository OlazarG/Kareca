'use strict';

const express = require('express');
const clockOffsetStore = require('../services/clockOffsetStore');
const { verifyToken, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.use(verifyToken);

// GET /api/clock-offset
router.get('/', requirePermission('ajustar_reloj_app'), (req, res) => {
    try {
        res.json({ success: true, offsetMinutes: clockOffsetStore.getTimeOffsetMinutes() });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// PUT /api/clock-offset
router.put('/', requirePermission('ajustar_reloj_app'), (req, res) => {
    try {
        clockOffsetStore.setTimeOffsetMinutes(req.body && req.body.offsetMinutes);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

module.exports = router;
