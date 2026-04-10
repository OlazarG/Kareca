// webAPI.js - Bridge to replace electronAPI in web mode
window.electronAPI = {
    // Products
    getProducts: async (args) => {
        const query = new URLSearchParams(args).toString();
        const res = await fetch(`/api/products?${query}`);
        return await res.json();
    },
    getProductDetails: async (id) => {
        const res = await fetch(`/api/products/${id}`);
        return await res.json();
    },
    createProductWithVariants: async (productData, variants) => {
        const res = await fetch('/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productData, variants })
        });
        return await res.json();
    },
    updateProduct: async (id, productData, variants) => {
        const res = await fetch(`/api/products/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productData, variants })
        });
        return await res.json();
    },
    deleteProduct: async (id) => {
        const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
        return await res.json();
    },

    // Sales & Purchases
    processSale: async (saleData) => {
        const res = await fetch('/api/sales', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(saleData)
        });
        return await res.json();
    },
    processPurchase: async (purchaseData) => {
        const res = await fetch('/api/purchases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(purchaseData)
        });
        return await res.json();
    },

    // Reports & Movements
    getMovements: async (from, to, page, limit) => {
        const query = new URLSearchParams({ from, to, page, limit }).toString();
        const res = await fetch(`/api/movements?${query}`);
        return await res.json();
    },
    getMovementDetails: async (id) => {
        const res = await fetch(`/api/movements/${id}`);
        return await res.json();
    },
    updateMovement: async (data) => {
        const res = await fetch(`/api/movements/${data.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return await res.json();
    },

    // Cash Register
    getRegisterStatus: async () => {
        const res = await fetch('/api/register/status');
        return await res.json();
    },
    openRegister: async (amount, user) => {
        const res = await fetch('/api/register/open', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, user })
        });
        return await res.json();
    },
    closeRegister: async (finalCash, user) => {
        const res = await fetch('/api/register/close', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ finalCash, user })
        });
        return await res.json();
    },

    // Exports (Web implementation)
    saveExport: async (movements) => {
        // In web, we generate CSV client-side
        try {
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
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `Reporte_Movimientos_${Date.now()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            return { success: true, path: 'Carpeta de Descargas' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    saveExportWord: async (movements, from, to) => {
         // Generate Word (HTML format) client-side
         try {
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
                <h2 style="text-align: center;">Planilla de Movimientos</h2>
                <p style="text-align: center;">Desde: ${from} Hasta: ${to}</p>
                <div style="text-align: center; margin-bottom: 20px;">
                    <span style="color: green;">Ingresos: ${formatCurrency(totalIngresos)}</span> | 
                    <span style="color: red;">Egresos: ${formatCurrency(totalEgresos)}</span> | 
                    <b>Saldo: ${formatCurrency(totalIngresos - totalEgresos)}</b>
                </div>
                <table border="1" style="width: 100%; border-collapse: collapse; font-size: 11px;">
                    <thead style="background-color: #f2f2f2;">
                        <tr>
                            <th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Motivo</th><th>Usuario</th><th>Método</th><th>Ingreso</th><th>Egreso</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            movements.forEach(m => {
                const isIngreso = m.type === 'INGRESO';
                htmlBody += `
                    <tr>
                        <td>${new Date(m.date).toLocaleString('es-PY')}</td>
                        <td>${m.type}</td>
                        <td>${m.description || ''}</td>
                        <td>${m.motive || ''}</td>
                        <td>${m.user_name || ''}</td>
                        <td>${m.payment_method || '-'}</td>
                        <td>${isIngreso ? formatCurrency(m.amount) : '-'}</td>
                        <td>${!isIngreso ? formatCurrency(m.amount) : '-'}</td>
                    </tr>
                `;
            });

            htmlBody += `</tbody></table>`;
            
            const blob = new Blob([htmlBody], { type: 'application/msword' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `Planilla_Movimientos_${Date.now()}.doc`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            return { success: true, path: 'Carpeta de Descargas' };
         } catch (error) {
            return { success: false, error: error.message };
         }
    },
    printTicket: async (data) => {
        // Mock print for web
        console.log("Print requested:", data);
        return { success: false, error: "Versión web: Use la opción de imprimir del navegador (Ctrl+P) para guardar/imprimir." };
    }
};
