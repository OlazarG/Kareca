function qs(params) {
    const entries = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '');
    if (entries.length === 0) return '';
    return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

async function api(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const options = { method, headers, credentials: 'same-origin' };
    if (body) options.body = JSON.stringify(body);
    let res;
    try {
        res = await fetch(path, options);
    } catch (e) {
        return { success: false, message: 'No se pudo conectar con el servidor.' };
    }
    if (res.status === 401 && path !== '/api/auth/login') {
        try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch (e) { /* ignore */ }
        window.location.reload();
        return { success: false, message: 'Sesión expirada' };
    }
    try {
        return await res.json();
    } catch (e) {
        return { success: false, message: `Error del servidor (${res.status}). Intente nuevamente.` };
    }
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

window.electronAPI = {
    // --- Auth ---
    login: async (username, password) => {
        const data = await api('POST', '/api/auth/login', { username, password });
        if (data.success) {
            return { success: true, user: data.user };
        }
        return data;
    },
    changePassword: async (username, currentPassword, newPassword) => {
        return await api('POST', '/api/auth/change-password', { currentPassword, newPassword });
    },

    // --- Categories ---
    getCategories: async () => {
        const data = await api('GET', '/api/categories');
        if (!data.success) throw new Error(data.message);
        return data.categories;
    },
    createCategory: async (name) => {
        const data = await api('POST', '/api/categories', { name });
        if (!data.success) throw new Error(data.message);
    },

    // --- Products ---
    getProducts: async (args) => {
        const data = await api('GET', '/api/products' + qs(args));
        if (!data.success) throw new Error(data.message);
        return data;
    },
    getProductDetails: async (id) => {
        const data = await api('GET', '/api/products/' + id);
        if (!data.success) throw new Error(data.message);
        return data.product || data;
    },
    createProductWithVariants: async (productData, variants) => {
        const data = await api('POST', '/api/products', { productData, variants });
        if (!data.success) throw new Error(data.message);
        return data.product;
    },
    updateProduct: async (id, productData, variants) => {
        const data = await api('PUT', '/api/products/' + id, { productData, variants });
        if (!data.success) throw new Error(data.message);
    },
    deleteProduct: async (id) => {
        const data = await api('DELETE', '/api/products/' + id);
        if (!data.success) throw new Error(data.message);
    },

    // --- Sales ---
    processSale: async (saleData) => {
        const data = await api('POST', '/api/sales', saleData);
        if (!data.success) throw new Error(data.message);
        if (data.sale) return { success: true, ...data.sale };
        return data;
    },
    processPurchase: async (purchaseData) => {
        const data = await api('POST', '/api/sales/purchases', purchaseData);
        if (!data.success) throw new Error(data.message);
        return data;
    },
    getMovements: async (dateFrom, dateTo, page, limit) => {
        const data = await api('GET', '/api/sales/movements' + qs({ dateFrom, dateTo, page, limit }));
        if (!data.success) throw new Error(data.message);
        return data;
    },
    getMovementDetails: async (id) => {
        const data = await api('GET', '/api/sales/movements/' + id);
        if (!data.success) throw new Error(data.message);
        return data.movement;
    },
    updateMovement: async ({ id, amount, reason, user, restockItems }) => {
        const data = await api('PUT', '/api/sales/movements/' + id, { id, amount, reason, user, restockItems });
        if (!data.success) throw new Error(data.message);
    },

    // --- Register ---
    getRegisterStatus: async () => {
        const data = await api('GET', '/api/register/status');
        if (!data.success) throw new Error(data.message);
        return data.session;
    },
    openRegister: async (amount, user) => {
        const data = await api('POST', '/api/register/open', { amount, user });
        if (!data.success) throw new Error(data.message);
    },
    closeRegister: async (finalCash, user) => {
        const data = await api('POST', '/api/register/close', { finalCash, user });
        if (!data.success) throw new Error(data.message);
    },

    // --- Tables ---
    getTables: async () => {
        const data = await api('GET', '/api/tables');
        if (!data.success) throw new Error(data.message);
        return data.tables;
    },
    createTable: async (number, x, y) => {
        const data = await api('POST', '/api/tables', { number, x, y });
        if (!data.success) throw new Error(data.message);
    },
    updateTableStatus: async (id, status) => {
        const data = await api('PUT', '/api/tables/' + id + '/status', { status });
        if (!data.success) throw new Error(data.message);
    },
    updateTablePosition: async (id, x, y) => {
        const data = await api('PUT', '/api/tables/' + id + '/position', { x, y });
        if (!data.success) throw new Error(data.message);
    },
    deleteTable: async (id) => {
        const data = await api('DELETE', '/api/tables/' + id);
        if (!data.success) throw new Error(data.message);
    },

    // --- Clients ---
    getClients: async (search) => {
        const data = await api('GET', '/api/clients' + qs({ search }));
        if (!data.success) throw new Error(data.message);
        return data.clients;
    },
    createClient: async (clientData) => {
        const data = await api('POST', '/api/clients', clientData);
        if (!data.success) throw new Error(data.message);
    },
    updateClient: async (id, clientData) => {
        const data = await api('PUT', '/api/clients/' + id, clientData);
        if (!data.success) throw new Error(data.message);
    },
    deleteClient: async (id) => {
        const data = await api('DELETE', '/api/clients/' + id);
        if (!data.success) throw new Error(data.message);
    },

    // --- Salaries / Employees ---
    getEmployees: async (search) => {
        const data = await api('GET', '/api/salaries/employees' + qs({ search }));
        if (!data.success) throw new Error(data.message);
        return data.employees;
    },
    createEmployee: async (employeeData) => {
        const data = await api('POST', '/api/salaries/employees', employeeData);
        if (!data.success) throw new Error(data.message);
        return data.employee;
    },
    updateEmployee: async (id, employeeData) => {
        const data = await api('PUT', '/api/salaries/employees/' + id, employeeData);
        if (!data.success) throw new Error(data.message);
    },
    deleteEmployee: async (id) => {
        const data = await api('DELETE', '/api/salaries/employees/' + id);
        if (!data.success) throw new Error(data.message);
    },

    // --- Salaries / Payroll Periods ---
    getPayrollPeriods: async (employeeId, status) => {
        const data = await api('GET', '/api/salaries/periods' + qs({ employee_id: employeeId, status }));
        if (!data.success) throw new Error(data.message);
        return data.periods;
    },
    getPayrollPeriod: async (id) => {
        const data = await api('GET', '/api/salaries/periods/' + id);
        if (!data.success) throw new Error(data.message);
        return data.period;
    },
    generatePeriods: async (employeeId) => {
        const data = await api('POST', '/api/salaries/periods/generate', { employee_id: employeeId || null });
        if (!data.success) throw new Error(data.message);
        return data.periods;
    },
    updatePayrollPeriod: async (id, periodData) => {
        const data = await api('PUT', '/api/salaries/periods/' + id, periodData);
        if (!data.success) throw new Error(data.message);
        return data.period;
    },
    payPayrollPeriod: async (id, paymentMethod) => {
        const data = await api('POST', '/api/salaries/periods/' + id + '/pay', { payment_method: paymentMethod || 'Efectivo' });
        if (!data.success) throw new Error(data.message);
        return data.period;
    },
    deletePayrollPeriod: async (id) => {
        const data = await api('DELETE', '/api/salaries/periods/' + id);
        if (!data.success) throw new Error(data.message);
        return data;
    },

    // --- Salaries / Transactions (Adelantos, Bonos, Descuentos) ---
    getSalaryTransactions: async (employeeId, periodId, dateFrom, dateTo) => {
        const data = await api('GET', '/api/salaries/transactions' + qs({ employee_id: employeeId, period_id: periodId, dateFrom, dateTo }));
        if (!data.success) throw new Error(data.message);
        return { transactions: data.transactions, totals: data.totals };
    },
    createSalaryTransaction: async (txData) => {
        const data = await api('POST', '/api/salaries/transactions', txData);
        if (!data.success) throw new Error(data.message);
        return data;
    },
    deleteSalaryTransaction: async (id) => {
        const data = await api('DELETE', '/api/salaries/transactions/' + id);
        if (!data.success) throw new Error(data.message);
        return data;
    },
    getSalaryLedger: async (employeeId, dateFrom, dateTo) => {
        const data = await api('GET', '/api/salaries/ledger' + qs({ employee_id: employeeId, dateFrom, dateTo }));
        if (!data.success) throw new Error(data.message);
        return { items: data.items, totals: data.totals };
    },

    // --- Tabs ---
    getOpenTabs: async () => {
        const data = await api('GET', '/api/tabs');
        if (!data.success) throw new Error(data.message);
        return data.tabs;
    },
    getTabByTable: async (tableId) => {
        const data = await api('GET', '/api/tabs/table/' + tableId);
        if (!data.success) return null;
        return data.tab;
    },
    getTabDetails: async (id) => {
        const data = await api('GET', '/api/tabs/' + id);
        if (!data.success) throw new Error(data.message);
        return data.tab;
    },
    openTab: async (tableId, clientId, userName) => {
        const data = await api('POST', '/api/tabs', { tableId, clientId, userName });
        if (!data.success) throw new Error(data.message);
        return data.tab;
    },
    addItemToTab: async (tabId, item) => {
        const data = await api('POST', '/api/tabs/' + tabId + '/items', { item });
        if (!data.success) throw new Error(data.message);
    },
    removeItemFromTab: async (tabId, itemId) => {
        const data = await api('DELETE', '/api/tabs/' + tabId + '/items/' + itemId);
        if (!data.success) throw new Error(data.message);
    },
    closeTabAndProcessSale: async (tabId, paymentData) => {
        const data = await api('POST', '/api/tabs/' + tabId + '/close', { paymentData });
        if (!data.success) throw new Error(data.message);
        return data.result;
    },
    updateTabItems: async (tabId, items) => {
        const data = await api('PUT', '/api/tabs/' + tabId + '/items', { items });
        if (!data.success) throw new Error(data.message);
    },
    splitTabAndProcessSale: async (tabId, splits) => {
        const data = await api('POST', '/api/tabs/' + tabId + '/split', { splits });
        if (!data.success) throw new Error(data.message);
        return data.result;
    },

    // --- Users & Roles ---
    getUsers: async () => {
        const data = await api('GET', '/api/users');
        if (!data.success) throw new Error(data.message);
        return data.users;
    },
    getRoles: async () => {
        const data = await api('GET', '/api/users/roles');
        if (!data.success) throw new Error(data.message);
        return data.roles;
    },
    createUser: async (userData) => {
        const data = await api('POST', '/api/users', userData);
        if (!data.success) throw new Error(data.message);
    },
    updateUser: async (id, userData) => {
        const data = await api('PUT', '/api/users/' + id, userData);
        if (!data.success) throw new Error(data.message);
    },
    deleteUser: async (id) => {
        const data = await api('DELETE', '/api/users/' + id);
        if (!data.success) throw new Error(data.message);
    },
    getPermissions: async () => {
        const data = await api('GET', '/api/users/permissions');
        if (!data.success) throw new Error(data.message);
        return data.permissions;
    },
    getRolePermissions: async (roleId) => {
        const data = await api('GET', '/api/users/roles/' + roleId + '/permissions');
        if (!data.success) throw new Error(data.message);
        return data.permissionIds;
    },
    updateRolePermissions: async (roleId, permissionIds) => {
        const data = await api('PUT', '/api/users/roles/' + roleId + '/permissions', { permissionIds });
        if (!data.success) throw new Error(data.message);
    },

    // --- Barcode ---
    generateBarcodeImage: async ({ text, type, scale, height }) => {
        const data = await api('POST', '/api/exports/barcode', { text, type, scale, height });
        if (!data.success) return data;
        return { success: true, image: data.image, format: data.format };
    },

    // --- Export CSV ---
    saveExport: async (movements) => {
        const data = await api('POST', '/api/exports/csv', { movements });
        if (!data.success) return data;
        downloadFile(data.content, data.filename, 'text/csv;charset=utf-8;');
        return { success: true, path: 'Descargado' };
    },

    // --- Export Word ---
    saveExportWord: async (movements, dateFrom, dateTo) => {
        const data = await api('POST', '/api/exports/word', { movements, dateFrom, dateTo });
        if (!data.success) return data;
        downloadFile(data.content, data.filename, 'application/msword');
        return { success: true, path: 'Descargado' };
    },

    // --- Print (QZ Tray) ---
    printTicket: async (ticketData) => {
        return await printReceipt(ticketData);
    }
};

function toggleSidebar() {
    document.querySelector('.sidebar')?.classList.toggle('open');
    document.querySelector('.sidebar-backdrop')?.classList.toggle('open');
}
