const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    createProductWithVariants: (productData, variants) => ipcRenderer.invoke('create-product', { productData, variants }),
    updateProduct: (id, data, variants) => ipcRenderer.invoke('update-product', id, data, variants),
    getProducts: (args) => ipcRenderer.invoke('get-products', args),
    getProductDetails: (id) => ipcRenderer.invoke('get-product-details', id),
    deleteProduct: (id) => ipcRenderer.invoke('delete-product', id),

    // Sales & Reports
    processSale: (saleData) => ipcRenderer.invoke('process-sale', saleData),
    processPurchase: (purchaseData) => ipcRenderer.invoke('process-purchase', purchaseData),
    getMovements: (from, to, page, limit) => ipcRenderer.invoke('get-movements', from, to, page, limit),
    saveExport: (data) => ipcRenderer.invoke('save-export', data),
    saveExportWord: (data, from, to) => ipcRenderer.invoke('save-export-word', data, from, to),
    printTicket: (data) => ipcRenderer.invoke('print-ticket', data),

    // Cash Register
    getRegisterStatus: () => ipcRenderer.invoke('get-register-status'),
    openRegister: (amount, user) => ipcRenderer.invoke('open-register', amount, user),
    closeRegister: (finalCash, user) => ipcRenderer.invoke('close-register', finalCash, user),

    // Edit Sale
    updateMovement: (data) => ipcRenderer.invoke('update-movement', data),
    getMovementDetails: (id) => ipcRenderer.invoke('get-movement-details', id),

    // Barcode Generator
    generateBarcodeImage: (data) => ipcRenderer.invoke('generate-barcode-image', data),

    // Categories
    getCategories: () => ipcRenderer.invoke('get-categories'),
    createCategory: (name) => ipcRenderer.invoke('create-category', name),

    // Mesas (New)
    getTables: () => ipcRenderer.invoke('get-tables'),
    createTable: (number, x, y) => ipcRenderer.invoke('create-table', number, x, y),
    updateTableStatus: (id, status) => ipcRenderer.invoke('update-table-status', id, status),
    updateTablePosition: (id, x, y) => ipcRenderer.invoke('update-table-position', id, x, y),
    deleteTable: (id) => ipcRenderer.invoke('delete-table', id),

    // Clientes (New)
    getClients: (search) => ipcRenderer.invoke('get-clients', search),
    createClient: (clientData) => ipcRenderer.invoke('create-client', clientData),
    updateClient: (id, clientData) => ipcRenderer.invoke('update-client', id, clientData),
    deleteClient: (id) => ipcRenderer.invoke('delete-client', id),

    // Comandas/Tabs (New)
    getOpenTabs: () => ipcRenderer.invoke('get-open-tabs'),
    getTabByTable: (tableId) => ipcRenderer.invoke('get-tab-by-table', tableId),
    getTabDetails: (id) => ipcRenderer.invoke('get-tab-details', id),
    openTab: (tableId, clientId, userName) => ipcRenderer.invoke('open-tab', tableId, clientId, userName),
    addItemToTab: (tabId, item) => ipcRenderer.invoke('add-item-to-tab', tabId, item),
    removeItemFromTab: (tabId, itemId) => ipcRenderer.invoke('remove-item-from-tab', tabId, itemId),
    closeTabAndProcessSale: (tabId, paymentData) => ipcRenderer.invoke('close-tab-and-process-sale', tabId, paymentData),
    updateTabItems: (tabId, items) => ipcRenderer.invoke('update-tab-items', tabId, items),
    splitTabAndProcessSale: (tabId, splits) => ipcRenderer.invoke('split-tab-and-process-sale', tabId, splits),

    // Authentication & Users
    login: (username, password) => ipcRenderer.invoke('login', username, password),
    changePassword: (username, currentPassword, newPassword) => ipcRenderer.invoke('change-password', username, currentPassword, newPassword),
    getUsers: () => ipcRenderer.invoke('get-users'),
    getRoles: () => ipcRenderer.invoke('get-roles'),
    createUser: (userData) => ipcRenderer.invoke('create-user', userData),
    updateUser: (id, userData) => ipcRenderer.invoke('update-user', id, userData),
    deleteUser: (id) => ipcRenderer.invoke('delete-user', id),
    getPermissions: () => ipcRenderer.invoke('get-permissions'),
    getRolePermissions: (roleId) => ipcRenderer.invoke('get-role-permissions', roleId),
    updateRolePermissions: (roleId, permissionIds) => ipcRenderer.invoke('update-role-permissions', roleId, permissionIds)
});
