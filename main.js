const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const db = require('./src/database/db');
const fs = require('fs');
const bwipjs = require('bwip-js');

// ... (Create Window Code) ...

ipcMain.handle('save-export', async (event, movements) => {
    try {
        if (!movements || movements.length === 0) {
            return { success: false, message: 'No data to export' };
        }

        // CSV Header
        const header = ['ID', 'Fecha', 'Tipo', 'Descripcion', 'Motivo', 'Monto', 'Usuario', 'MetodoPago'];
        const csvRows = [header.join(';')];

        // CSV Rows
        movements.forEach(m => {
            const row = [
                m.id,
                new Date(m.date).toLocaleString('es-PY'),
                m.type,
                `"${(m.description || '').replace(/"/g, '""')}"`, // Escape quotes
                `"${(m.motive || '').replace(/"/g, '""')}"`,
                m.amount,
                m.user_name,
                m.payment_method || '-'
            ];
            csvRows.push(row.join(';'));
        });

        const csvContent = "\uFEFF" + csvRows.join('\n');

        // Show Save Dialog
        const { canceled, filePath } = await dialog.showSaveDialog({
            title: 'Exportar Reporte',
            defaultPath: `Reporte_Movimientos_${Date.now()}.csv`,
            filters: [{ name: 'CSV File', extensions: ['csv'] }]
        });

        if (canceled) {
            return { cancelled: true };
        }

        // Write File
        fs.writeFileSync(filePath, csvContent);
        return { success: true, path: filePath };

    } catch (error) {
        console.error("Export Logic Error", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('save-export-word', async (event, movements, dateFrom, dateTo) => {
    try {
        if (!movements || movements.length === 0) {
            return { success: false, message: 'No data to export' };
        }

        // Format Currency Helper
        const formatCurrency = (amount) => {
            return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG' }).format(amount);
        };

        // Calculate Totals for Header
        let totalIngresos = 0;
        let totalEgresos = 0;
        movements.forEach(m => {
            if (m.type === 'INGRESO') totalIngresos += parseInt(m.amount);
            else totalEgresos += parseInt(m.amount);
        });

        // HTML Content for Word
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
                <tbody>
        `;

        movements.forEach(m => {
            const dateStr = new Date(m.date).toLocaleString('es-PY');
            const isIngreso = m.type === 'INGRESO';
            const amount = parseInt(m.amount);
            const formattedAmount = formatCurrency(amount);

            // Badge Style - Smaller and more compact
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
                </tr>
            `;
        });

        htmlBody += `
                </tbody>
            </table>
        `;

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
                    @page {
                        size: A4;
                        margin: 1.0cm;
                    }
                    body { font-family: 'Segoe UI', sans-serif; }
                </style>
            </head>
            <body>
                ${htmlBody}
            </body>
            </html>
        `;

        // Show Save Dialog
        const { canceled, filePath } = await dialog.showSaveDialog({
            title: 'Exportar a Word',
            defaultPath: `Planilla_Movimientos_${Date.now()}.doc`,
            filters: [{ name: 'Word Document', extensions: ['doc'] }]
        });

        if (canceled) return { cancelled: true };

        fs.writeFileSync(filePath, fullHtml);
        return { success: true, path: filePath };

    } catch (error) {
        console.error("Export Word Error", error);
        return { success: false, error: error.message };
    }
});

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'src/preload.js')
        },
        icon: path.join(__dirname, 'build/icon.png')
    });

    win.loadFile('src/views/index.html');
}

app.whenReady().then(() => {
    // Check for DB Configuration
    if (!process.env.DB_PASSWORD) {
        dialog.showErrorBox(
            'Error de Configuración',
            'No se encontró la contraseña de la base de datos (DB_PASSWORD).\n\nAsegúrese de que el archivo .env exista en la carpeta del programa y contenga las credenciales correctas.'
        );
    }

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// --- IPC Handlers ---

ipcMain.handle('generate-barcode-image', async (event, { text, type, scale, height }) => {
    try {
        if (!text || !text.trim()) {
            return { success: false, error: 'Texto requerido' };
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

        return {
            success: true,
            image: png.toString('base64'),
            format: 'png'
        };
    } catch (error) {
        console.error('Barcode generation error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-products', async (event, { search, category, page, limit } = {}) => {
    return await db.getProducts(search, category, page, limit);
});

ipcMain.handle('get-product-details', async (event, id) => {
    return await db.getProductDetails(id);
});

ipcMain.handle('create-product', async (event, { productData, variants }) => {
    return await db.createProductWithVariants(productData, variants);
});

ipcMain.handle('update-product', async (event, id, productData, variants) => {
    return await db.updateProductWithVariants(id, productData, variants);
});

// Sales & Reports
ipcMain.handle('process-sale', async (event, saleData) => {
    return await db.processSaleTransaction(saleData);
});

let printerService;
try {
    printerService = require('./src/services/printerService');
} catch (error) {
    console.error("Failed to load printerService (likely native module issue):", error);
    // Fallback mock
    printerService = {
        printReceipt: async () => ({ success: false, error: "Servicio de impresión no disponible (Driver no cargado)." })
    };
}

ipcMain.handle('process-purchase', async (event, purchaseData) => {
    return await db.processPurchaseTransaction(purchaseData);
});

ipcMain.handle('print-ticket', async (event, ticketData) => {
    try {
        if (!printerService) throw new Error("Printer Service not initialized");
        const result = await printerService.printReceipt(ticketData);
        return result; // Includes success and deviceInfo
    } catch (error) {
        console.error("Printing Failed:", error);
        return { success: false, error: error.message };
        // We return success: false but don't throw, allowing the app to continue
    }
});

ipcMain.handle('get-movements', async (event, dateFrom, dateTo, page, limit) => {
    return await db.getMovements(dateFrom, dateTo, page, limit);
});

ipcMain.handle('delete-product', async (event, id) => {
    return await db.deleteProduct(id);
});

// --- Cash Register IPC ---
ipcMain.handle('get-register-status', async () => {
    return await db.getRegisterStatus();
});

ipcMain.handle('open-register', async (event, amount, user) => {
    return await db.openRegister(amount, user);
});

ipcMain.handle('close-register', async (event, finalCash, user) => {
    return await db.closeRegister(finalCash, user);
});

ipcMain.handle('update-movement', async (event, { id, amount, reason, user, restockItems }) => {
    return await db.updateMovement(id, amount, reason, user, restockItems);
});

ipcMain.handle('get-movement-details', async (event, id) => {
    return await db.getMovementById(id);
});

ipcMain.handle('get-categories', async () => {
    return await db.getCategories();
});

ipcMain.handle('create-category', async (event, name) => {
    return await db.createCategory(name);
});

// --- Mesas IPC ---
ipcMain.handle('get-tables', async () => {
    return await db.getTables();
});

ipcMain.handle('create-table', async (event, number, x, y) => {
    return await db.createTable(number, x, y);
});

ipcMain.handle('update-table-status', async (event, id, status) => {
    return await db.updateTableStatus(id, status);
});

ipcMain.handle('update-table-position', async (event, id, x, y) => {
    return await db.updateTablePosition(id, x, y);
});

ipcMain.handle('delete-table', async (event, id) => {
    return await db.deleteTable(id);
});

// --- Clientes IPC ---
ipcMain.handle('get-clients', async (event, search) => {
    return await db.getClients(search);
});

ipcMain.handle('create-client', async (event, clientData) => {
    return await db.createClient(clientData);
});

ipcMain.handle('update-client', async (event, id, clientData) => {
    return await db.updateClient(id, clientData);
});

ipcMain.handle('delete-client', async (event, id) => {
    return await db.deleteClient(id);
});

// --- Comandas / Tabs IPC ---
ipcMain.handle('get-open-tabs', async () => {
    return await db.getOpenTabs();
});

ipcMain.handle('get-tab-by-table', async (event, tableId) => {
    return await db.getTabByTable(tableId);
});

ipcMain.handle('get-tab-details', async (event, id) => {
    return await db.getTabDetails(id);
});

ipcMain.handle('open-tab', async (event, tableId, clientId, userName) => {
    return await db.openTab(tableId, clientId, userName);
});

ipcMain.handle('add-item-to-tab', async (event, tabId, item) => {
    return await db.addItemToTab(tabId, item);
});

ipcMain.handle('remove-item-from-tab', async (event, tabId, itemId) => {
    return await db.removeItemFromTab(tabId, itemId);
});

ipcMain.handle('close-tab-and-process-sale', async (event, tabId, paymentData) => {
    return await db.closeTabAndProcessSale(tabId, paymentData);
});

ipcMain.handle('update-tab-items', async (event, tabId, items) => {
    return await db.updateTabItems(tabId, items);
});

ipcMain.handle('split-tab-and-process-sale', async (event, tabId, splits) => {
    return await db.splitTabAndProcessSale(tabId, splits);
});

// --- Usuarios IPC ---
ipcMain.handle('login', async (event, username, password) => {
    return await db.authenticateUser(username, password);
});

ipcMain.handle('get-users', async () => {
    return await db.getUsers();
});

ipcMain.handle('get-roles', async () => {
    return await db.getRoles();
});

ipcMain.handle('create-user', async (event, userData) => {
    return await db.createUser(userData);
});

ipcMain.handle('update-user', async (event, id, userData) => {
    return await db.updateUser(id, userData);
});

ipcMain.handle('delete-user', async (event, id) => {
    return await db.deleteUser(id);
});

// --- Permisos IPC ---
ipcMain.handle('get-permissions', async () => {
    return await db.getPermissions();
});

ipcMain.handle('get-role-permissions', async (event, roleId) => {
    return await db.getRolePermissions(roleId);
});

ipcMain.handle('update-role-permissions', async (event, roleId, permissionIds) => {
    return await db.updateRolePermissions(roleId, permissionIds);
});

