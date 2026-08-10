const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { success, error } = require('../helpers/apiResponse');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

// --- Employees ---
router.get('/employees', async (req, res) => {
    try {
        const { search } = req.query;
        const employees = await db.getEmployees(search || '');
        return success(res, { employees });
    } catch (err) {
        return error(res, err.message, 500);
    }
});

router.post('/employees', async (req, res) => {
    try {
        const employee = await db.createEmployee(req.body);
        return success(res, { message: 'Empleado creado', employee }, 201);
    } catch (err) {
        return error(res, err.message, 500);
    }
});

router.put('/employees/:id', async (req, res) => {
    try {
        await db.updateEmployee(parseInt(req.params.id), req.body);
        return success(res, { message: 'Empleado actualizado' });
    } catch (err) {
        return error(res, err.message, 500);
    }
});

router.delete('/employees/:id', async (req, res) => {
    try {
        await db.deleteEmployee(parseInt(req.params.id));
        return success(res, { message: 'Empleado eliminado' });
    } catch (err) {
        return error(res, err.message, 500);
    }
});

// --- Payroll Periods (Planillas) ---
router.get('/periods', async (req, res) => {
    try {
        const { employee_id, status } = req.query;
        const periods = await db.getPayrollPeriods(employee_id || null, status || '');
        return success(res, { periods });
    } catch (err) {
        return error(res, err.message, 500);
    }
});

router.get('/periods/:id', async (req, res) => {
    try {
        const period = await db.getPayrollPeriodById(parseInt(req.params.id));
        if (!period) return error(res, 'Período no encontrado', 404);
        return success(res, { period });
    } catch (err) {
        return error(res, err.message, 500);
    }
});

router.post('/periods/generate', async (req, res) => {
    try {
        const { employee_id } = req.body;
        let periods;
        if (employee_id) {
            periods = [await db.generatePayrollPeriod(parseInt(employee_id))];
        } else {
            periods = await db.generateAllPayrollPeriods();
        }
        return success(res, { message: 'Período(s) generado(s)', periods }, 201);
    } catch (err) {
        return error(res, err.message, 500);
    }
});

router.put('/periods/:id', async (req, res) => {
    try {
        const period = await db.updatePayrollPeriod(parseInt(req.params.id), req.body);
        return success(res, { message: 'Período actualizado', period });
    } catch (err) {
        return error(res, err.message, 500);
    }
});

router.post('/periods/:id/pay', async (req, res) => {
    try {
        const period = await db.markPeriodPaid(
            parseInt(req.params.id),
            req.body.payment_method || 'Efectivo',
            req.user.username
        );
        return success(res, { message: 'Planilla marcada como pagada', period });
    } catch (err) {
        return error(res, err.message, 500);
    }
});

router.delete('/periods/:id', async (req, res) => {
    try {
        await db.deletePayrollPeriod(parseInt(req.params.id));
        return success(res, { message: 'Período eliminado' });
    } catch (err) {
        return error(res, err.message, 500);
    }
});

// --- Salary Transactions (Adelantos, Bonos, Descuentos) ---
router.get('/transactions', async (req, res) => {
    try {
        const { employee_id, period_id, dateFrom, dateTo } = req.query;
        const result = await db.getSalaryTransactions({
            employee_id: employee_id || null,
            period_id: period_id || null,
            dateFrom: dateFrom || null,
            dateTo: dateTo || null
        });
        return success(res, result);
    } catch (err) {
        return error(res, err.message, 500);
    }
});

router.post('/transactions', async (req, res) => {
    try {
        const result = await db.createSalaryTransaction(req.body);
        return success(res, { message: 'Transacción registrada', ...result }, 201);
    } catch (err) {
        return error(res, err.message, 500);
    }
});

router.delete('/transactions/:id', async (req, res) => {
    try {
        const result = await db.deleteSalaryTransaction(parseInt(req.params.id));
        return success(res, { message: 'Transacción eliminada', ...result });
    } catch (err) {
        return error(res, err.message, 500);
    }
});

// --- Salary Ledger (Planillas abonadas + Adelantos, Bonos, Descuentos) ---
router.get('/ledger', async (req, res) => {
    try {
        const { employee_id, dateFrom, dateTo } = req.query;
        const result = await db.getSalaryLedger({
            employee_id: employee_id || null,
            dateFrom: dateFrom || null,
            dateTo: dateTo || null
        });
        return success(res, result);
    } catch (err) {
        return error(res, err.message, 500);
    }
});

module.exports = router;
