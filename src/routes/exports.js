const express = require('express');
const router = express.Router();
const bwipjs = require('bwip-js');
const { success, error, safeError } = require('../helpers/apiResponse');
const { verifyToken, requirePermission } = require('../middleware/auth');

router.use(verifyToken);

router.post('/csv', requirePermission('ver_reportes'), async (req, res) => {
    try {
        const { movements } = req.body;
        if (!movements || movements.length === 0) {
            return error(res, 'No data to export');
        }

        const header = ['ID', 'Fecha', 'Tipo', 'Descripcion', 'Motivo', 'Monto', 'Usuario', 'MetodoPago'];
        const csvRows = [header.join(';')];

        movements.forEach(m => {
            const row = [
                m.id,
                new Date(m.date).toLocaleString('es-PY'),
                m.type,
                `"${(m.description || '').replace(/"/g, '""')}"`,
                `"${(m.motive || '').replace(/"/g, '""')}"`,
                m.amount,
                m.user_name,
                m.payment_method || '-'
            ];
            csvRows.push(row.join(';'));
        });

        const csvContent = "\uFEFF" + csvRows.join('\n');
        return success(res, {
            content: csvContent,
            filename: `Reporte_Movimientos_${Date.now()}.csv`
        });
    } catch (err) {
        console.error('CSV export error:', err);
        return safeError(res, err);
    }
});

router.post('/word', requirePermission('ver_reportes'), async (req, res) => {
    try {
        const { movements, dateFrom, dateTo } = req.body;
        if (!movements || movements.length === 0) {
            return error(res, 'No data to export');
        }

        const formatCurrency = (amount) => {
            return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG' }).format(amount);
        };

        let totalIngresos = 0;
        let totalEgresos = 0;
        movements.forEach(m => {
            if (m.type === 'INGRESO') totalIngresos += parseInt(m.amount);
            else totalEgresos += parseInt(m.amount);
        });

        let htmlBody = `
            <h2 style="text-align: center; color: #333; margin-bottom: 5px;">Planilla de Movimientos</h2>
            <p style="text-align: center; margin-top: 0; font-size: 10px;"><strong>Desde:</strong> ${dateFrom} <strong>Hasta:</strong> ${dateTo}</p>
            <div style="text-align: center; margin-bottom: 15px; font-size: 10px;">
                <span style="color: green; margin-right: 15px;">Ingresos: ${formatCurrency(totalIngresos)}</span>
                <span style="color: red; margin-right: 15px;">Egresos: ${formatCurrency(totalEgresos)}</span>
                <span style="font-weight: bold;">Saldo: ${formatCurrency(totalIngresos - totalEgresos)}</span>
            </div>
            <table border="1" cellpadding="2" cellspacing="0" style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 10px;">
                <thead style="background-color: #f2f2f2;">
                    <tr>
                        <th style="padding: 3px;">Fecha</th>
                        <th style="padding: 3px;">Tipo</th>
                        <th style="padding: 3px;">Descripción</th>
                        <th style="padding: 3px;">Motivo</th>
                        <th style="padding: 3px;">Usuario</th>
                        <th style="padding: 3px;">Método</th>
                        <th style="padding: 3px;">Ingreso</th>
                        <th style="padding: 3px;">Egreso</th>
                    </tr>
                </thead>
                <tbody>`;

        movements.forEach(m => {
            const dateStr = new Date(m.date).toLocaleString('es-PY');
            const isIngreso = m.type === 'INGRESO';
            const amount = parseInt(m.amount);
            const formattedAmount = formatCurrency(amount);

            const badgeStyle = isIngreso
                ? 'background-color: #198754; color: white; padding: 1px 4px; border-radius: 3px; font-weight: bold; font-size: 9px; display: inline-block;'
                : 'background-color: #dc3545; color: white; padding: 1px 4px; border-radius: 3px; font-weight: bold; font-size: 9px; display: inline-block;';

            htmlBody += `
                <tr>
                    <td>${dateStr}</td>
                    <td style="text-align: center;"><span style="${badgeStyle}">${m.type}</span></td>
                    <td>${m.description || ''}</td>
                    <td>${m.motive || ''}</td>
                    <td>${m.user_name || ''}</td>
                    <td>${m.payment_method || '-'}</td>
                    <td style="text-align: right; color: #198754; font-weight: bold;">${isIngreso ? formattedAmount : '-'}</td>
                    <td style="text-align: right; color: #dc3545; font-weight: bold;">${!isIngreso ? formattedAmount : '-'}</td>
                </tr>`;
        });

        htmlBody += `
                </tbody>
            </table>`;

        const fullHtml = `
            <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
            <head>
                <meta charset='utf-8'>
                <title>Reporte de Movimientos</title>
                <!--[if gte mso 9]>
                <xml>
                <w:WordDocument>
                <w:View>Print</w:View>
                <w:Zoom>100</w:Zoom>
                <w:DoNotOptimizeForBrowser/>
                </w:WordDocument>
                </xml>
                <![endif]-->
                <style>
                    @page { size: A4; margin: 1.0cm; }
                    body { font-family: 'Segoe UI', sans-serif; }
                </style>
            </head>
            <body>${htmlBody}</body>
            </html>`;

        return success(res, {
            content: fullHtml,
            filename: `Planilla_Movimientos_${Date.now()}.doc`
        });
    } catch (err) {
        console.error('Word export error:', err);
        return safeError(res, err);
    }
});

router.post('/barcode', async (req, res) => {
    try {
        let { text, type, scale, height } = req.body;
        if (!text || !text.trim()) {
            return error(res, 'Texto requerido');
        }

        let bcid = type || 'code128';
        if (bcid === 'ean13') {
            const digits = text.replace(/\D/g, '');
            if (digits.length > 12) {
                text = digits.substring(0, 12);
            } else {
                text = digits.padEnd(12, '0');
            }
        }

        const png = await bwipjs.toBuffer({
            bcid: bcid,
            text: text,
            scale: scale || 3,
            height: height || 15,
            includetext: true,
            textxalign: 'center',
            backgroundcolor: 'FFFFFF',
            padding: 5
        });

        return success(res, {
            image: png.toString('base64'),
            format: 'png'
        });
    } catch (err) {
        console.error('Barcode generation error:', err);
        return safeError(res, err);
    }
});

module.exports = router;
