'use strict';

class PlatformBridge {
    constructor() {
        this.platform = this.detectPlatform();
        this.endpointMap = this.buildEndpointMap();
    }

    detectPlatform() {
        if (typeof process !== 'undefined' && process.type === 'renderer') {
            return 'electron';
        }
        return 'web';
    }

    isElectron() {
        return this.platform === 'electron';
    }

    isWeb() {
        return this.platform === 'web';
    }

    buildEndpointMap() {
        return {
            'login': { path: '/api/auth/login', method: 'POST', args: ['username', 'password'] },
            'changePassword': { path: '/api/auth/change-password', method: 'POST', args: ['currentPassword', 'newPassword'] },
            'processSale': { path: '/api/sales', method: 'POST' },
            'processPurchase': { path: '/api/sales/purchases', method: 'POST' },
            'getMovements': { path: '/api/sales', method: 'GET', queryParams: ['from', 'to', 'page', 'limit'] },
            'getProducts': { path: '/api/products', method: 'GET' },
            'getCategories': { path: '/api/categories', method: 'GET' },
            'createCategory': { path: '/api/categories', method: 'POST' },
            'getProductDetails': { path: '/api/products/:id', method: 'GET' },
            'deleteProduct': { path: '/api/products/:id', method: 'DELETE' },
            'updateProduct': { path: '/api/products/:id', method: 'PUT', args: ['id', 'productData', 'variants'] },
            'createProductWithVariants': { path: '/api/products', method: 'POST' },
            'getRoles': { path: '/api/roles', method: 'GET' },
            'getPermissions': { path: '/api/permissions', method: 'GET' },
            'getRolePermissions': { path: '/api/roles/:id/permissions', method: 'GET' },
            'updateRolePermissions': { path: '/api/roles/:id/permissions', method: 'PUT' },
            'getTabByTable': { path: '/api/tabs/table/:id', method: 'GET' },
            'closeTabAndProcessSale': { path: '/api/tabs/:id/close-and-process', method: 'POST' },
            'printTicket': 'electron-only',
            'saveExport': 'electron-only',
            'saveExportWord': 'electron-only',
            'getRegisterStatus': { path: '/api/register/status', method: 'GET' },
            'openRegister': { path: '/api/register/open', method: 'POST' },
            'closeRegister': { path: '/api/register/close', method: 'POST' },
            'getTicketTemplate': { path: '/api/ticket/template', method: 'GET' },
            'saveTicketTemplate': { path: '/api/ticket/template', method: 'PUT' },
            'resetTicketTemplate': { path: '/api/ticket/template', method: 'DELETE' },
            'previewTicket': { path: '/api/ticket/preview', method: 'POST' },
            'getTicketImage': 'special',
            'getTables': { path: '/api/tables', method: 'GET' },
            'getClients': { path: '/api/clients', method: 'GET' },
            'getUsers': { path: '/api/users', method: 'GET' },
        };
    }

    async call(method, ...args) {
        if (this.isElectron()) {
            return this.callElectron(method, args);
        } else {
            return this.callHttp(method, args);
        }
    }

    async callElectron(method, args) {
        if (!window.electronAPI || typeof window.electronAPI[method] !== 'function') {
            console.warn(`[PlatformBridge] Electron method ${method} not available, trying HTTP fallback`);
            return this.callHttp(method, args);
        }
        return await window.electronAPI[method](...args);
    }

    async callHttp(method, args) {
        // Casos especiales
        if (method === 'getTicketImage') {
            return this.fetchJson(`/api/ticket/image?path=${encodeURIComponent(args[0])}`, 'GET');
        }
        if (method === 'saveExport' || method === 'saveExportWord' || method === 'printTicket') {
            console.warn(`[PlatformBridge] ${method} no disponible en web`);
            return { success: false, error: `${method} no disponible en web` };
        }

        // Buscar en endpoint map
        let endpoint = this.endpointMap[method];
        if (!endpoint) {
            endpoint = this.inferEndpoint(method, args);
        }

        // Manejo de argumentos especiales
        if (endpoint.args && args.length >= endpoint.args.length) {
            // Construir objeto con argumentos nombrados
            const body = {};
            for (let i = 0; i < endpoint.args.length; i++) {
                body[endpoint.args[i]] = args[i];
            }
            return this.fetchJson(endpoint.path, endpoint.method, body);
        }

        // Manejo de query params
        if (endpoint.queryParams && endpoint.method === 'GET') {
            let path = endpoint.path;
            const params = new URLSearchParams();
            for (let i = 0; i < Math.min(endpoint.queryParams.length, args.length); i++) {
                params.append(endpoint.queryParams[i], args[i]);
            }
            if (params.toString()) {
                path += '?' + params.toString();
            }
            return this.fetchJson(path, endpoint.method);
        }

        // Reemplazar placeholders (:id, :tableId, etc.)
        let path = endpoint.path;
        if (path.includes(':id') && args.length > 0 && (typeof args[0] === 'string' || typeof args[0] === 'number')) {
            path = path.replace(':id', args[0]);
        }

        // Para PUT/POST con objeto
        const body = (endpoint.method !== 'GET' && args.length > 0 && typeof args[0] === 'object') ? args[0] : undefined;

        return this.fetchJson(path, endpoint.method, body);
    }

    inferEndpoint(method, args) {
        let httpMethod = 'GET';
        let path = '/api/';

        if (method.startsWith('create') || method.startsWith('process') || method.startsWith('save') || method.startsWith('open') || method.startsWith('pay')) {
            httpMethod = 'POST';
        } else if (method.startsWith('update') || method.startsWith('close')) {
            httpMethod = 'PUT';
        } else if (method.startsWith('delete')) {
            httpMethod = 'DELETE';
        }

        const resource = method
            .replace(/^(create|update|delete|get|process|save|open|close|pay)/, '')
            .replace(/([A-Z])/g, '-$1')
            .toLowerCase()
            .replace(/^-/, '');

        path += resource;

        if ((httpMethod === 'GET' || httpMethod === 'PUT' || httpMethod === 'DELETE') &&
            args.length > 0 && (typeof args[0] === 'string' || typeof args[0] === 'number')) {
            path += '/' + args[0];
        }

        return { path, method: httpMethod };
    }

    async fetchJson(path, method, body) {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin'
        };

        if (body && method !== 'GET') {
            opts.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(path, opts);

            if (response.status === 401) {
                try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch (e) { }
                window.location.reload();
                return { success: false, message: 'Sesión expirada' };
            }

            if (!response.ok) {
                const text = await response.text();
                return { success: false, error: `HTTP ${response.status}: ${text}` };
            }

            return await response.json();
        } catch (error) {
            console.error(`[PlatformBridge] Error en ${method} ${path}:`, error);
            return { success: false, error: error.message };
        }
    }
}

window.platform = new PlatformBridge();
