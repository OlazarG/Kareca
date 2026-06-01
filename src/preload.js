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

    // Categories
    getCategories: () => ipcRenderer.invoke('get-categories'),
    createCategory: (name) => ipcRenderer.invoke('create-category', name)
});
