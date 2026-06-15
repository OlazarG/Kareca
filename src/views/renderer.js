// --- Utils ---
function formatCurrency(amount) {
    return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG' }).format(amount);
}

function parseCurrency(str) {
    if (!str) return 0;
    const numericStr = str.toString().replace(/\D/g, '');
    return parseInt(numericStr) || 0;
}

function formatInputCurrency(e) {
    let value = e.target.value.replace(/\D/g, '');
    if (value === '') {
        e.target.value = '';
        return;
    }
    value = parseInt(value).toLocaleString('es-PY');
    e.target.value = value;
}

function setupCurrencyInputs() {
    document.querySelectorAll('.currency-input').forEach(input => {
        input.removeEventListener('input', formatInputCurrency);
        input.addEventListener('input', formatInputCurrency);
    });
}

function getLocalDateStr(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function loadCategories() {
    try {
        const categories = await window.electronAPI.getCategories();

        // Populate filter-category
        const filterSelect = document.getElementById('filter-category');
        if (filterSelect) {
            const currentValue = filterSelect.value;
            filterSelect.innerHTML = '<option value="Todas">Todas las Categorías</option>';
            categories.forEach(cat => {
                filterSelect.innerHTML += `<option value="${cat}">${cat}</option>`;
            });
            // Restore selection if it still exists
            filterSelect.value = currentValue || 'Todas';
        }

        // Populate prod-category
        const prodSelect = document.getElementById('prod-category');
        if (prodSelect) {
            const currentValue = prodSelect.value;
            prodSelect.innerHTML = '';
            categories.forEach(cat => {
                prodSelect.innerHTML += `<option value="${cat}">${cat}</option>`;
            });
            if (currentValue && categories.includes(currentValue)) {
                prodSelect.value = currentValue;
            }
        }
    } catch (error) {
        console.error("Error loading categories:", error);
    }
}

async function promptCreateCategory() {
    const { value: categoryName } = await Swal.fire({
        title: 'Nueva Categoría',
        input: 'text',
        inputLabel: 'Nombre de la nueva categoría',
        inputPlaceholder: 'Ej: Dijes',
        showCancelButton: true,
        cancelButtonText: 'Cancelar',
        confirmButtonText: 'Crear',
        confirmButtonColor: '#198754',
        inputValidator: (value) => {
            if (!value || !value.trim()) {
                return '¡Debes ingresar un nombre!';
            }
        }
    });

    if (categoryName) {
        try {
            const cleanName = categoryName.trim();
            await window.electronAPI.createCategory(cleanName);
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: `Categoría "${cleanName}" creada`,
                timer: 1500,
                showConfirmButton: false
            });
            // Reload categories in dropdowns
            await loadCategories();

            // Auto-select the newly created category in the product form
            const prodSelect = document.getElementById('prod-category');
            if (prodSelect) {
                prodSelect.value = cleanName;
            }
        } catch (error) {
            console.error("Error creating category:", error);
            Swal.fire('Error', 'No se pudo crear la categoría.', 'error');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setupCurrencyInputs();
    loadCategories(); // Carga las categorías dinámicamente al inicio

    // POS Search Listener
    document.getElementById('pos-search')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            posSearch();
        }
    });

    document.getElementById('purchases-search')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            purchaseSearch();
        }
    });

    // Products Per Page Listener
    document.getElementById('products-per-page')?.addEventListener('change', () => {
        loadProducts(1); // Reset to page 1 on change
    });

    // Initial Dashboard Load
    loadDashboard();
});

// --- Dashboard Logic ---

async function loadDashboard() {
    const dashDate = document.getElementById('dash-date');
    if (dashDate) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dashDate.innerText = new Date().toLocaleDateString('es-PY', options);
    }

    try {
        const today = getLocalDateStr();

        // 1. Fetch Movements for Stats
        const response = await window.electronAPI.getMovements(today, today, 1, 1000);
        const movements = response.rows || [];

        let totalSales = 0;
        let totalExpenses = 0;
        let txCount = movements.length;

        movements.forEach(m => {
            if (m.type === 'INGRESO') {
                totalSales += parseInt(m.amount);
            } else if (m.type === 'EGRESO') {
                totalExpenses += parseInt(m.amount);
            }
            // APERTURA / CIERRE ignored for specific stats, but counted in txCount
        });

        const balance = totalSales - totalExpenses;

        // Animate/Update Counters
        document.getElementById('dash-sales').innerText = formatCurrency(totalSales);
        document.getElementById('dash-expenses').innerText = formatCurrency(totalExpenses);
        document.getElementById('dash-balance').innerText = formatCurrency(balance);
        document.getElementById('dash-tx-count').innerText = txCount;

        // 2. Low Stock Logic
        const productsResponse = await window.electronAPI.getProducts({ search: '', category: '', page: 1, limit: 1000 });
        const products = productsResponse.rows || [];
        // Filter low stock (stock <= min_stock)
        const lowStock = products.filter(p => {
            const limit = p.min_stock !== undefined ? p.min_stock : 5;
            return p.stock_total <= limit;
        });

        const tbody = document.getElementById('dash-low-stock-body');
        tbody.innerHTML = '';

        if (lowStock.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-success fw-bold py-3"><i class="bi bi-check-circle me-2"></i>Todo el inventario está saludable</td></tr>';
        } else {
            lowStock.forEach(p => {
                const row = `
                    <tr>
                        <td class="fw-bold">${p.name}</td>
                        <td><span class="badge bg-secondary">${p.category}</span></td>
                        <td class="text-center"><span class="badge bg-danger fs-6">${p.stock_total ?? 0}</span></td>
                        <td class="text-end">
                            <button class="btn btn-sm btn-outline-primary" onclick="goToPurchases('${p.name}')">
                                <i class="bi bi-bag-plus"></i> Reponer
                            </button>
                        </td>
                    </tr>
                `;
                tbody.innerHTML += row;
            });
        }

        // Load Tables map
        await loadSalonTables();

    } catch (error) {
        console.error("Dashboard Load Error", error);
    }
}

function goToPurchases(productName) {
    showSection('purchases');
    const input = document.getElementById('purchases-search');
    input.value = productName;
    input.focus();
    // Optional: Trigger search immediately
    purchaseSearch();
}


// Navigation
function showSection(sectionId) {
    document.querySelectorAll('.content-area > div').forEach(div => div.style.display = 'none');
    document.getElementById(`${sectionId}-section`).style.display = 'block';

    // Update Sidebar Active State
    document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
    document.getElementById(`nav-${sectionId}`)?.classList.add('active');

    if (sectionId === 'products') {
        loadProducts();
    }
    if (sectionId === 'pos') {
        document.getElementById('pos-search').focus();
        loadPosHistory();
        loadPosTables();
    }
    if (sectionId === 'purchases') {
        document.getElementById('purchases-search').focus();
    }
    if (sectionId === 'reports') {
        initDates();
        loadReports();
    }
    if (sectionId === 'dashboard') {
        loadDashboard();
    }
    if (sectionId === 'caja') {
        loadCajaSection();
    }
    if (sectionId === 'clients') {
        loadClients();
    }
}

// ... (Existing Code)

// --- Purchases Logic ---

let purchaseCart = [];

async function purchaseSearch() {
    const input = document.getElementById('purchases-search');
    const term = input.value.trim();
    if (!term) return;

    const productsResponse = await window.electronAPI.getProducts({ search: term, category: '', page: 1, limit: 100 });
    const products = productsResponse.rows || [];

    // Auto-add logic similar to POS
    let added = false;
    for (const p of products) {
        const variant = p.variants_data.find(v => v.barcode === term);
        if (variant) {
            addToPurchaseCart(p, variant);
            added = true;
            break;
        } else if (products.length === 1) {
            const v = p.variants_data[0]; // Default to first variant
            addToPurchaseCart(p, v);
            added = true;
            break;
        }
    }

    if (!added) {
        Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Producto no encontrado', timer: 1500, showConfirmButton: false });
    } else {
        input.value = '';
    }
}

function addToPurchaseCart(product, variant) {
    const existingItem = purchaseCart.find(item => item.id === product.id && item.variant_name === variant.variant_name);

    if (existingItem) {
        existingItem.qty++;
    } else {
        // Init cost with base_cost of parent or 0 if undefined? 
        // Or assume cost is unknown. Let's start with 0 or previous cost if we had it.
        // For simple Purchase module, user enters cost.
        purchaseCart.push({
            id: product.id,
            name: product.name,
            variant_name: variant.variant_name,
            cost: parseInt(product.base_cost) || 0,
            qty: 1
        });
    }
    renderPurchaseCart();
}

function renderPurchaseCart() {
    const tbody = document.getElementById('purchases-cart-body');
    tbody.innerHTML = '';
    let total = 0;

    purchaseCart.forEach((item, index) => {
        const subtotal = item.cost * item.qty;
        total += subtotal;

        const row = `
            <tr>
                <td>
                    <div class="fw-bold">${item.name}</div>
                    <small class="text-muted">${item.variant_name}</small>
                </td>
                <td>
                    <input type="text" class="form-control form-control-sm currency-input" 
                        value="${formatCurrency(item.cost)}" 
                        onchange="updatePurchaseCost(${index}, this.value)">
                </td>
                <td>
                    <input type="number" class="form-control form-control-sm" 
                        value="${item.qty}" min="1" 
                        onchange="updatePurchaseQty(${index}, this.value)">
                </td>
                <td class="fw-bold text-primary">${formatCurrency(subtotal)}</td>
                <td>
                    <button class="btn btn-outline-danger btn-sm" onclick="removeFromPurchaseCart(${index})"><i class="bi bi-trash"></i></button>
                </td>
            </tr>
        `;
        tbody.innerHTML += row;
    });

    document.getElementById('purchase-total').innerText = formatCurrency(total);
    // Re-attach currency listeners for the new inputs
    setupCurrencyInputs();
}

function updatePurchaseQty(index, val) {
    if (val < 1) val = 1;
    purchaseCart[index].qty = parseInt(val);
    renderPurchaseCart();
}

function updatePurchaseCost(index, val) {
    purchaseCart[index].cost = parseCurrency(val);
    renderPurchaseCart();
    // Note: renderCart calls setupCurrencyInputs, so it formats nicely on re-render.
    // If we want immediate re-format without re-render, we could do it here, but re-render is safer for totals.
}

function removeFromPurchaseCart(index) {
    purchaseCart.splice(index, 1);
    renderPurchaseCart();
}

function clearPurchaseCart() {
    purchaseCart = [];
    renderPurchaseCart();
    document.getElementById('purchase-supplier').value = '';
    document.getElementById('purchase-method').value = 'Efectivo';
    document.getElementById('purchase-observation').value = '';
}

async function confirmPurchase() {
    if (purchaseCart.length === 0) {
        Swal.fire('Atención', 'El carrito de compra está vacío.', 'warning');
        return;
    }

    const total = purchaseCart.reduce((sum, item) => sum + (item.cost * item.qty), 0);
    const supplier = document.getElementById('purchase-supplier').value;
    const method = document.getElementById('purchase-method').value;
    const observation = document.getElementById('purchase-observation').value;

    const result = await Swal.fire({
        title: '¿Confirmar Compra?',
        html: `Total Egreso: <b>${formatCurrency(total)}</b><br>Método: <b>${method}</b><br>Se aumentará el stock de los productos.`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, Confirmar',
        cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
        const purchaseData = {
            items: purchaseCart,
            total: total,
            supplier: supplier,
            method: method,
            observation: observation,
            user: 'Admin'
        };

        try {
            await window.electronAPI.processPurchase(purchaseData);

            Swal.fire('Compra Registrada', 'Stock actualizado correctamente.', 'success');
            clearPurchaseCart();

        } catch (error) {
            console.error("Purchase Error", error);
            Swal.fire('Error', 'No se pudo registrar la compra.', 'error');
        }
    }
}

// --- Dynamic Form Logic ---

function addVariantRow(name = '', code = '', qty = 1, price = '') {
    const tbody = document.getElementById('variants-body');
    const row = document.createElement('tr');
    row.classList.add('variant-row');

    let formattedPrice = price;
    if (price && typeof price === 'number') {
        formattedPrice = price.toLocaleString('es-PY');
    }

    row.innerHTML = `
        <td><input type="text" class="form-control" placeholder="Ej: Six Pack" required name="v-name" value="${name}"></td>
        <td>
            <div class="input-group input-group-sm">
                <input type="text" class="form-control" required name="v-code" placeholder="Código" value="${code}">
                <button class="btn btn-outline-primary" type="button" onclick="openBarcodeGenerator(this)" title="Generar código de barras">
                    <i class="bi bi-upc-scan"></i>
                </button>
            </div>
        </td>
        <td><input type="number" class="form-control" min="1" required name="v-qty" value="${qty}"></td>
        <td><input type="text" class="form-control currency-input" required name="v-price" placeholder="0" value="${formattedPrice}"></td>
        <td><button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.parentElement.remove()">X</button></td>
    `;
    tbody.appendChild(row);
    setupCurrencyInputs();
}

function resetForm() {
    document.getElementById('product-form').reset();
    document.getElementById('edit-prod-id').value = '';
    document.getElementById('prod-stock').value = 0;
    document.getElementById('prod-min-stock').value = 5; // Restored

    document.getElementById('form-title').innerText = 'Registrar Nuevo Producto';
    document.getElementById('btn-save').innerText = 'Guardar Producto';
    document.getElementById('btn-save').classList.remove('btn-warning');
    document.getElementById('btn-save').classList.add('btn-success');
    document.getElementById('btn-cancel-edit').style.display = 'none';

    const tbody = document.getElementById('variants-body');
    tbody.innerHTML = `
        <tr class="variant-row">
            <td><input type="text" class="form-control" value="Unidad" required name="v-name"></td>
            <td>
                <div class="input-group input-group-sm">
                    <input type="text" class="form-control" required name="v-code" placeholder="Escanee Código">
                    <button class="btn btn-outline-primary" type="button" onclick="openBarcodeGenerator(this)" title="Generar código de barras">
                        <i class="bi bi-upc-scan"></i>
                    </button>
                </div>
            </td>
            <td><input type="number" class="form-control" value="1" min="1" required name="v-gty" readonly></td>
            <td><input type="text" class="form-control currency-input" required name="v-price" placeholder="0"></td>
            <td></td> 
        </tr>
    `;
    setupCurrencyInputs();
}

// --- Product Management ---

let searchTimeout;
// --- Pagination State ---
let currentProductPage = 1;
let currentReportsPage = 1;
const ITEMS_PER_PAGE = 20;

// ... (Existing Code)

// --- Helper: Render Pagination ---
function renderPagination(totalItems, limit, currentPage, containerId, callbackName) {
    const totalPages = Math.ceil(totalItems / limit);
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    // if (totalPages <= 1) return; // Always show for visibility

    let html = '<ul class="pagination mb-0">';

    // Prev
    const prevDisabled = currentPage === 1 ? 'disabled' : '';
    html += `
        <li class="page-item ${prevDisabled}">
            <button class="page-link" onclick="${callbackName}(${currentPage - 1})">Anterior</button>
        </li>
    `;

    // Pages (Simple range for now, can be optimized for large range)
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, currentPage + 2);

    if (startPage > 1) {
        html += `<li class="page-item"><button class="page-link" onclick="${callbackName}(1)">1</button></li>`;
        if (startPage > 2) html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
    }

    for (let i = startPage; i <= endPage; i++) {
        const active = i === currentPage ? 'active' : '';
        html += `
            <li class="page-item ${active}">
                <button class="page-link" onclick="${callbackName}(${i})">${i}</button>
            </li>
        `;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        html += `<li class="page-item"><button class="page-link" onclick="${callbackName}(${totalPages})">${totalPages}</button></li>`;
    }

    // Next
    const nextDisabled = currentPage === totalPages ? 'disabled' : '';
    html += `
        <li class="page-item ${nextDisabled}">
            <button class="page-link" onclick="${callbackName}(${currentPage + 1})">Siguiente</button>
        </li>
    `;

    html += '</ul>';
    container.innerHTML = html;
}


// --- Products Logic ---

async function loadProducts(page = 1) {
    currentProductPage = page;
    const body = document.getElementById('products-table-body');
    const search = document.getElementById('search-input').value;
    const category = document.getElementById('filter-category').value;

    body.innerHTML = '<tr><td colspan="7" class="text-center">Cargando...</td></tr>';

    const limitSelect = document.getElementById('products-per-page');
    const limitPromise = limitSelect ? parseInt(limitSelect.value) : ITEMS_PER_PAGE;

    // Fallback if NaN or 0
    const limit = limitPromise || ITEMS_PER_PAGE;

    try {
        const response = await window.electronAPI.getProducts({
            search,
            category,
            page: currentProductPage,
            limit: limit
        });

        const products = response.rows || []; // Handle structure mismatch if backend not updated yet
        const total = response.total || 0;

        body.innerHTML = '';

        if (products.length === 0) {
            body.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No se encontraron productos.</td></tr>';
            renderPagination(0, ITEMS_PER_PAGE, 1, 'products-pagination', 'loadProducts');
            return;
        }

        products.forEach(p => {
            // ... (Row generation logic same as before) ...
            const variantCount = p.variants_data ? p.variants_data.length : 0;
            const varsTooltip = p.variants_data ? p.variants_data.map(v => `${v.variant_name}: ${v.quantity}`).join(', ') : '-';

            // Calc Total Stock (Backend does it, or we sum variants if decoupled? Now decoupling means manual but backend returns stock_total)
            // Use p.stock_total
            const stockClass = p.stock_total <= 5 ? 'text-danger fw-bold' : 'text-success';

            const row = `
                <tr>
                    <td>${p.id}</td>
                    <td>${p.variants_data && p.variants_data[0] ? p.variants_data[0].barcode : '-'}</td>
                    <td class="fw-bold text-primary">${p.name}</td>
                    <td><span class="badge bg-secondary">${p.category}</span></td>
                    <td title="${varsTooltip}">${variantCount} varian.</td>
                    <td class="${stockClass}">${p.stock_total}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-warning me-1" onclick="editProduct(${p.id})"><i class="bi bi-pencil"></i></button>
                        <button class="btn btn-sm btn-outline-danger" onclick="confirmDelete(${p.id}, '${p.name}')"><i class="bi bi-trash"></i></button>
                    </td>
                </tr>
            `;
            body.innerHTML += row;
        });

        renderPagination(total, limit, currentProductPage, 'products-pagination', 'loadProducts');

    } catch (e) {
        console.error(e);
        body.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error al cargar productos</td></tr>';
    }
}

function applyFilters() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        loadProducts(1); // Reset to page 1
    }, 300);
}

async function editProduct(id) {
    try {
        const product = await window.electronAPI.getProductDetails(id);
        if (!product) return;

        document.getElementById('edit-prod-id').value = product.id;
        document.getElementById('prod-name').value = product.name;
        document.getElementById('prod-category').value = product.category;
        document.getElementById('prod-base-cost').value = parseInt(product.base_cost).toLocaleString('es-PY');
        document.getElementById('prod-min-stock').value = product.min_stock || 5; // Restored
        document.getElementById('prod-stock').value = product.stock_total; // Restored

        const tbody = document.getElementById('variants-body');
        tbody.innerHTML = '';

        product.variants.forEach(v => {
            const isUnit = v.quantity === 1 && v.variant_name === 'Unidad';
            const formattedPrice = parseInt(v.sale_price).toLocaleString('es-PY');

            const row = document.createElement('tr');
            row.classList.add('variant-row');
            row.innerHTML = `
                <td><input type="text" class="form-control" value="${v.variant_name}" required name="v-name"></td>
                <td>
                    <div class="input-group input-group-sm">
                        <input type="text" class="form-control" value="${v.barcode}" required name="v-code">
                        <button class="btn btn-outline-primary" type="button" onclick="openBarcodeGenerator(this)" title="Generar código de barras">
                            <i class="bi bi-upc-scan"></i>
                        </button>
                    </div>
                </td>
                <td><input type="number" class="form-control" value="${v.quantity}" min="1" required name="v-qty" ${isUnit ? 'readonly' : ''}></td>
                <td><input type="text" class="form-control currency-input" value="${formattedPrice}" required name="v-price" min="0"></td>
                <td>${isUnit ? '' : '<button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.parentElement.remove()">X</button>'}</td>
            `;
            tbody.appendChild(row);
        });

        setupCurrencyInputs();

        document.getElementById('form-title').innerText = `Editando: ${product.name}`;
        const btnSave = document.getElementById('btn-save');
        btnSave.innerText = 'Guardar Edición';
        btnSave.classList.remove('btn-success');
        btnSave.classList.add('btn-warning');
        document.getElementById('btn-cancel-edit').style.display = 'inline-block';

        const bsCollapse = new bootstrap.Collapse(document.getElementById('newProductForm'), { show: true });
        document.getElementById('newProductForm').classList.add('show');
        document.getElementById('product-form').scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        console.error("Edit error", error);
        Swal.fire('Error', 'No se pudieron cargar los datos.', 'error');
    }
}

async function confirmDelete(id, name) {
    const result = await Swal.fire({
        title: '¿Eliminar Producto?',
        text: `Se eliminará "${name}" y todo su historial.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sí, eliminar'
    });

    if (result.isConfirmed) {
        try {
            await window.electronAPI.deleteProduct(id);
            Swal.fire('Eliminado', 'Producto eliminado.', 'success');
            loadProducts();
            resetForm();
        } catch (error) {
            Swal.fire('Error', 'No se pudo eliminar.', 'error');
        }
    }
}

document.getElementById('product-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const editId = document.getElementById('edit-prod-id').value;
    const rawCost = document.getElementById('prod-base-cost').value;
    const baseCost = parseCurrency(rawCost);
    const minStock = parseInt(document.getElementById('prod-min-stock').value) || 5; // Restored
    const stock = parseInt(document.getElementById('prod-stock').value) || 0;

    const productData = {
        name: document.getElementById('prod-name').value,
        category: document.getElementById('prod-category').value,
        base_cost: baseCost,
        min_stock: minStock, // Restored
        stock_total: stock
    };

    const variants = [];
    const rows = document.querySelectorAll('.variant-row');

    rows.forEach(row => {
        const inputs = row.querySelectorAll('input');
        const rawPrice = inputs[3].value;
        const price = parseCurrency(rawPrice);

        variants.push({
            variant_name: inputs[0].value,
            barcode: inputs[1].value,
            quantity: parseInt(inputs[2].value),
            sale_price: price
        });
    });

    try {
        if (editId) {
            await window.electronAPI.updateProduct(editId, productData, variants);
            Swal.fire({ title: 'Actualizado', text: 'Cambios guardados correctamente.', icon: 'success', timer: 1500, showConfirmButton: false });
        } else {
            await window.electronAPI.createProductWithVariants(productData, variants);
            Swal.fire({ title: 'Registrado', text: 'Producto guardado correctamente.', icon: 'success', timer: 1500, showConfirmButton: false });
        }

        resetForm();
        loadProducts();

    } catch (error) {
        console.error('Error:', error);
        let msg = error.message.replace('Error invoking remote method \'create-product\': ', '');
        msg = msg.replace('Error invoking remote method \'update-product\': ', '');
        Swal.fire('Error', msg, 'error');
    }
});


// --- POS Logic ---

let cart = [];

async function posSearch() {
    const input = document.getElementById('pos-search');
    const term = input.value.trim();
    if (!term) return;

    // Use existing getProducts to find items
    const productsResponse = await window.electronAPI.getProducts({ search: term, category: '', page: 1, limit: 100 });
    const products = productsResponse.rows || [];

    if (products.length === 0) {
        Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Producto no encontrado', timer: 1500, showConfirmButton: false });
        input.value = '';
        return;
    }

    // 1. Exact Barcode Match Preference
    for (const p of products) {
        const exactVariant = p.variants_data.find(v => v.barcode === term);
        if (exactVariant) {
            addToCart(p, exactVariant);
            input.value = '';
            return;
        }
    }

    // 2. If no exact match, Show Selection Modal
    // Flatten all variants from all found products
    let allOptions = [];
    products.forEach(p => {
        if (p.variants_data) {
            p.variants_data.forEach(v => {
                allOptions.push({
                    product: p,
                    variant: v
                });
            });
        }
    });

    if (allOptions.length === 1) {
        // Only one option found (and it wasn't exact barcode match, but name match), just add it?
        // Or confirm? Let's add it for speed.
        addToCart(allOptions[0].product, allOptions[0].variant);
        input.value = '';
        return;
    }

    // Show Selection UI
    let htmlContent = '<div class="list-group text-start">';
    allOptions.forEach((opt, index) => {
        htmlContent += `
            <button class="list-group-item list-group-item-action" onclick="selectPosItem(${index})">
                <div class="d-flex w-100 justify-content-between">
                    <h6 class="mb-1 fw-bold">${opt.product.name}</h6>
                    <small class="text-primary fw-bold">${formatCurrency(opt.variant.sale_price)}</small>
                </div>
                <small class="text-muted">${opt.variant.variant_name} | Stock: ${opt.variant.quantity}u/eq</small>
            </button>
        `;
    });
    htmlContent += '</div>';

    // Store options temporarily to access via index
    window.currentPosOptions = allOptions;

    await Swal.fire({
        title: 'Seleccione Presentación',
        html: htmlContent,
        showConfirmButton: false,
        showCloseButton: true,
        width: '600px'
    });

    // Input clearing handled in selectPosItem or after modal close? 
    // Usually input clear is good if user made a choice.
    input.value = '';
}

function selectPosItem(index) {
    const opt = window.currentPosOptions[index];
    if (opt) {
        addToCart(opt.product, opt.variant);
        Swal.close();
    }
}

function addToCart(product, variant) {
    const existingItem = cart.find(item => item.id === product.id && item.variant_name === variant.variant_name);

    if (existingItem) {
        existingItem.qty++;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            variant_name: variant.variant_name,
            price: variant.sale_price,
            qty: 1
        });
    }

    renderCart();
}

function renderCart() {
    const tbody = document.getElementById('pos-cart-body');
    tbody.innerHTML = '';
    let total = 0;
    let itemCount = 0;

    cart.forEach((item, index) => {
        const subtotal = item.price * item.qty;
        total += subtotal;
        itemCount += item.qty;

        const row = `
            <tr>
                <td>
                    <div class="fw-bold">${item.name}</div>
                    <small class="text-muted">${item.variant_name}</small>
                </td>
                <td>${formatCurrency(item.price)}</td>
                <td>
                    <input type="number" class="form-control form-control-sm" value="${item.qty}" min="1" onchange="updateCartQty(${index}, this.value)">
                </td>
                <td class="fw-bold">${formatCurrency(subtotal)}</td>
                <td>
                    <button class="btn btn-outline-danger btn-sm" onclick="removeFromCart(${index})"><i class="bi bi-trash"></i></button>
                </td>
            </tr>
        `;
        tbody.innerHTML += row;
    });

    document.getElementById('pos-total').innerText = formatCurrency(total);
    document.getElementById('pos-item-count').innerText = itemCount;
}
// check
async function testDbConnection() {
    try {
        const today = getLocalDateStr();
        const res = await window.electronAPI.getMovements(today, today, 1, 10);
        alert("Conexión DB Exitosa. Datos recibidos: " + JSON.stringify(res));
    } catch (e) {
        alert("Error de Conexión: " + e.message);
    }
}

async function loadReports(page = 1) {
    currentReportsPage = page;
    const dFrom = document.getElementById('report-date-from').value;
    const dTo = document.getElementById('report-date-to').value;

    const tbody = document.getElementById('reports-table-body');
    tbody.innerHTML = '<tr><td colspan="9" class="text-center">Cargando...</td></tr>';

    try {
        // Request "All" (or effectively all) for Reports as requested
        const response = await window.electronAPI.getMovements(dFrom, dTo, 1, 1000000);
        const movements = response?.rows || [];
        const total = response?.total || 0;
        const periodStats = response?.periodStats;

        // Update Global for Export
        currentMovements = movements;

        // Update Header Stats (Use PERIOD stats)
        if (periodStats) {
            const tIng = parseInt(periodStats.total_ingreso) || 0;
            const tEgr = parseInt(periodStats.total_egreso) || 0;
            const balance = tIng - tEgr;

            document.getElementById('stat-ingresos').innerText = `Gs. ${formatCurrency(tIng).replace('Gs.', '').trim()}`; // Format consistency
            document.getElementById('stat-egresos').innerText = `Gs. ${formatCurrency(tEgr).replace('Gs.', '').trim()}`;
            document.getElementById('stat-saldo').innerText = `Gs. ${formatCurrency(balance).replace('Gs.', '').trim()}`;
        }

        // Calculate Cash in box and Digital Income from movements list
        let cashBox = 0;
        let digital = 0;
        movements.forEach(m => {
            const amt = parseInt(m.amount) || 0;
            if (m.type === 'APERTURA') {
                cashBox += amt;
            } else if (m.type === 'INGRESO') {
                if (m.payment_method === 'Efectivo') {
                    cashBox += amt;
                } else {
                    digital += amt;
                }
            } else if (m.type === 'EGRESO') {
                if (m.payment_method === 'Efectivo' || !m.payment_method) {
                    cashBox -= amt;
                }
            }
        });

        document.getElementById('stat-cash-box').innerText = `Gs. ${formatCurrency(cashBox).replace('Gs.', '').trim()}`;
        document.getElementById('stat-digital').innerText = `Gs. ${formatCurrency(digital).replace('Gs.', '').trim()}`;

        tbody.innerHTML = '';

        if (movements.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">No hay movimientos en este periodo.</td></tr>';
            renderPagination(0, ITEMS_PER_PAGE, 1, 'reports-pagination', 'loadReports');
            return;
        }

        let runningBalance = 0; // Note: Relative to page. Resolving this requires full fetch.
        // If we want "True" running balance, we need it from backend or complex logic.
        // For now, let's just sum it visually relative to page start or leave it.
        // User hasn't complained about logic yet, just "functionality broken".

        movements.forEach(m => {
            // ... (Row Rendering Logic) ...
            const amount = parseInt(m.amount);
            if (m.type === 'INGRESO' || m.type === 'APERTURA') runningBalance += amount;
            else if (m.type === 'EGRESO') runningBalance -= amount;

            const dateObj = new Date(m.date);
            const dateStr = dateObj.toLocaleDateString('es-PY');
            const timeStr = dateObj.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });

            let rowHtml = '';

            // Custom Row for APERTURA
            if (m.type === 'APERTURA') {
                rowHtml = `
                    <tr style="background-color: #e8f5e9; border-left: 5px solid #28a745;">
                        <td colspan="9" class="p-0">
                            <div class="d-flex align-items-center p-3">
                                <div class="bg-success text-white rounded-circle d-flex align-items-center justify-content-center me-3" style="width: 40px; height: 40px;">
                                    <i class="bi bi-shop fs-5"></i>
                                </div>
                                <div>
                                    <h6 class="text-success fw-bold mb-0 text-uppercase">APERTURA DE CAJA</h6>
                                    <small class="text-muted">${dateStr}, ${timeStr}</small>
                                </div>
                                <div class="ms-auto d-flex gap-5 pe-4">
                                    <div class="text-center">
                                        <small class="text-muted d-block text-uppercase" style="font-size: 0.75rem;">Monto Inicial</small>
                                        <span class="fw-bold fs-5">${formatCurrency(amount)}</span>
                                    </div>
                                    <div class="text-center">
                                        <small class="text-muted d-block text-uppercase" style="font-size: 0.75rem;">Responsable</small>
                                        <span class="fw-bold">${m.user_name}</span>
                                    </div>
                                </div>
                            </div>
                        </td>
                    </tr>
                `;
            }
            // Custom Row for CIERRE
            else if (m.type === 'CIERRE') {
                let details = null;
                try {
                    if (m.details_json) {
                        details = JSON.parse(m.details_json);
                    }
                } catch (e) { console.error("Error parsing cierre details", e); }

                // Fallback if details missing (old records)
                const hasDetails = details !== null;
                const expected = hasDetails ? details.expected : amount;
                const declared = hasDetails ? details.declared : amount;
                const diff = hasDetails ? details.difference : 0;
                const cashBox = hasDetails ? details.declared : amount;
                const digital = hasDetails ? details.salesDigital : 0;
                const totalBalance = hasDetails ? details.totalBalance : (amount + digital);

                let diffColor = '';
                let diffText = '';

                if (!hasDetails) {
                    diffColor = 'text-muted';
                    diffText = '-';
                } else {
                    diffColor = diff === 0 ? 'text-success' : (diff > 0 ? 'text-success' : 'text-danger');
                    diffText = diff === 0 ? 'Exacto' : (diff > 0 ? `+${formatCurrency(diff)}` : formatCurrency(diff));
                }

                rowHtml = `
                    <tr style="background-color: #fff3e0; border-left: 5px solid #fd7e14;">
                        <td colspan="9" class="p-0">
                            <div class="d-flex align-items-center p-3">
                                <div class="bg-warning text-white rounded-circle d-flex align-items-center justify-content-center me-3" style="width: 40px; height: 40px;">
                                    <i class="bi bi-check-lg fs-4"></i>
                                </div>
                                <div>
                                    <h6 class="text-warning fw-bold mb-0 text-uppercase" style="color: #fd7e14 !important;">CIERRE DE CAJA</h6>
                                    <small class="text-muted">${dateStr}, ${timeStr}</small>
                                </div>
                                
                                <div class="ms-auto d-flex gap-4 align-items-center pe-2">
                                    <div class="text-center px-3 border-end">
                                        <small class="text-muted d-block text-uppercase" style="font-size: 0.7rem;">Efectivo en Caja</small>
                                        <span class="fw-bold text-success">${formatCurrency(cashBox)}</span>
                                    </div>
                                    <div class="text-center px-3 border-end">
                                        <small class="text-muted d-block text-uppercase" style="font-size: 0.7rem;">Digital Neto</small>
                                        <span class="fw-bold text-primary" style="color: #6f42c1 !important;">${formatCurrency(digital)}</span>
                                    </div>
                                    <div class="text-center px-3 border-end">
                                        <small class="text-muted d-block text-uppercase" style="font-size: 0.7rem;">Saldo Total</small>
                                        <span class="fw-bold text-primary">${formatCurrency(totalBalance)}</span>
                                    </div>

                                    <div class="d-flex gap-3 ms-2" style="font-size: 0.85rem;">
                                        <div>
                                            <span class="text-muted d-block" style="font-size: 0.7rem;">Esperado</span>
                                            <strong>${hasDetails ? formatCurrency(expected) : '-'}</strong>
                                        </div>
                                        <div>
                                            <span class="text-muted d-block" style="font-size: 0.7rem;">Declarado</span>
                                            <strong>${formatCurrency(declared)}</strong>
                                        </div>
                                        <div>
                                            <span class="text-muted d-block" style="font-size: 0.7rem;">Diferencia</span>
                                            <strong class="${diffColor}">${diffText}</strong>
                                        </div>
                                        <div>
                                            <span class="text-muted d-block" style="font-size: 0.7rem;">Responsable</span>
                                            <strong>${m.user_name}</strong>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </td>
                    </tr>
                `;
            }
            // Standard Row
            else {
                const isIngreso = m.type === 'INGRESO';
                const isEgreso = m.type === 'EGRESO';
                const badgeClass = isIngreso ? 'bg-success' : (isEgreso ? 'bg-danger' : 'bg-secondary');

                rowHtml = `
                    <tr>
                        <td>${dateStr} <small class="text-muted">${timeStr}</small></td>
                        <td><span class="badge ${badgeClass}">${m.type}</span></td>
                        <td>
                            ${m.description}
                            ${m.is_edited ? `<i class="bi bi-pencil-fill text-warning ms-1" title="Editado: ${m.edit_reason}"></i>` : ''}
                            ${isIngreso ? `
                                <i class="bi bi-pencil-square text-primary ms-2 cursor-pointer" onclick="initiateEditSale(${m.id})" title="Editar Venta" style="cursor: pointer;"></i>
                                <i class="bi bi-printer text-secondary ms-2 cursor-pointer" onclick="reprintTicket(${m.id})" title="Reimprimir Ticket" style="cursor: pointer;"></i>
                            ` : ''}
                        </td>
                        <td>${m.motive || '-'}</td>
                        <td>${m.user_name}</td>
                        <td>${m.payment_method || '-'}</td>
                        <td class="text-end text-success">${isIngreso ? formatCurrency(amount) : '-'}</td>
                        <td class="text-end text-danger">${isEgreso ? formatCurrency(amount) : '-'}</td>
                        <td class="text-end fw-bold">${formatCurrency(runningBalance)}</td>
                    </tr>
                `;
            }
            tbody.innerHTML += rowHtml;
        });

        // renderPagination(total, ITEMS_PER_PAGE, currentReportsPage, 'reports-pagination', 'loadReports');
        document.getElementById('reports-pagination').innerHTML = ''; // Ensure it's empty

    } catch (e) {
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger fw-bold">FATAL ERROR: ${e.message}</td></tr>`;
    }
}

function updateCartQty(index, newQty) {
    if (newQty < 1) newQty = 1;
    cart[index].qty = parseInt(newQty);
    renderCart();
}

function removeFromCart(index) {
    cart.splice(index, 1);
    renderCart();
}

function clearCart() {
    cart = [];
    renderCart();
    document.getElementById('pos-observation').value = '';
}

// --- Checkout Logic ---

let currentTotal = 0;

function initiateCheckout() {
    if (cart.length === 0) {
        Swal.fire('Carrito Vacío', 'Agrega productos antes de cobrar.', 'warning');
        return;
    }

    // Calculate total
    currentTotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

    // Reset Modal State
    document.getElementById('modal-total-display').innerText = formatCurrency(currentTotal);
    document.getElementById('payment-method').value = 'Efectivo';
    document.getElementById('amount-received').value = '';
    document.getElementById('change-display').innerText = 'Gs. 0';
    togglePaymentInputs();

    // Show Modal
    const modal = new bootstrap.Modal(document.getElementById('paymentModal'));
    modal.show();

    // Delay focus to ensure modal is rendered
    setTimeout(() => {
        document.getElementById('amount-received').focus();
    }, 500);
}

function togglePaymentInputs() {
    const method = document.getElementById('payment-method').value;
    const cashSection = document.getElementById('cash-payment-section');

    if (method === 'Efectivo') {
        cashSection.style.display = 'block';
        setTimeout(() => document.getElementById('amount-received').focus(), 100);
    } else {
        cashSection.style.display = 'none';
        document.getElementById('change-display').innerText = 'Gs. 0'; // Reset change
    }
}

function calculateChange() {
    const rawReceived = document.getElementById('amount-received').value;
    const received = parseCurrency(rawReceived);

    // Auto-update currency formatting for input
    const input = document.getElementById('amount-received');
    if (rawReceived !== '') {
        // Prevent cursor jumping issue ideally, but for simple proto:
        // input.value = received.toLocaleString('es-PY'); 
        // Note: formatInputCurrency global listener already handles 'input' event for .currency-input
    }

    if (received >= currentTotal) {
        const change = received - currentTotal;
        document.getElementById('change-display').innerText = formatCurrency(change);
        document.getElementById('change-display').classList.remove('text-danger');
        document.getElementById('change-display').classList.add('text-success');
    } else {
        document.getElementById('change-display').innerText = 'Falta: ' + formatCurrency(currentTotal - received);
        document.getElementById('change-display').classList.add('text-danger');
        document.getElementById('change-display').classList.remove('text-success');
    }
}

async function processSale() {
    const method = document.getElementById('payment-method').value;
    let received = 0;

    if (method === 'Efectivo') {
        received = parseCurrency(document.getElementById('amount-received').value);
        if (received < currentTotal) {
            Swal.fire('Monto Insuficiente', 'El monto recibido es menor al total.', 'error');
            return;
        }
    } else {
        received = currentTotal;
    }

    let clientName = 'CLIENTE OCASIONAL';
    if (window.selectedCheckoutClient) {
        clientName = window.selectedCheckoutClient.razon_social;
    }

    const opType = document.getElementById('pos-op-type').value;

    try {
        if (opType === 'table') {
            const tableId = parseInt(document.getElementById('pos-table-select').value);
            if (!tableId) {
                Swal.fire('Error', 'Seleccione una mesa para cobrar.', 'error');
                return;
            }
            const tab = await window.electronAPI.getTabByTable(tableId);
            if (!tab) {
                Swal.fire('Error', 'No se encontró una comanda abierta para esta mesa.', 'error');
                return;
            }

            const paymentData = {
                method: method,
                received: received,
                change: (received - currentTotal) > 0 ? (received - currentTotal) : 0,
                clientName: clientName,
                observation: document.getElementById('pos-observation').value,
                user: 'Cajero'
            };

            const result = await window.electronAPI.closeTabAndProcessSale(tab.id, paymentData);
            if (result.success) {
                const modalEl = document.getElementById('paymentModal');
                const modal = bootstrap.Modal.getInstance(modalEl);
                modal.hide();

                await Swal.fire({
                    title: '¡Mesa Liberada y Venta Confirmada!',
                    text: 'Comanda cerrada, stock descontado y mesa libre.',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false
                });

                // Clear states
                clearCart();
                clearSelectedCheckoutClient();
                // Reset opType to direct
                document.getElementById('pos-op-type').value = 'direct';
                togglePosOpType();
                loadPosHistory();
            }
        } else {
            const saleData = {
                items: cart,
                total: currentTotal,
                method: method,
                user: 'Cajero', 
                clientName: clientName, 
                observation: document.getElementById('pos-observation').value,
                received: received,
                change: (received - currentTotal) > 0 ? (received - currentTotal) : 0
            };

            const result = await window.electronAPI.processSale(saleData);
            if (result.success) {
                const modalEl = document.getElementById('paymentModal');
                const modal = bootstrap.Modal.getInstance(modalEl);
                modal.hide();

                await Swal.fire({
                    title: '¡Venta Confirmada!',
                    text: 'Stock actualizado y venta registrada.',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false
                });

                // Print Ticket
                const ticketData = {
                    id: result.id,
                    storeName: 'Aurea Accesorios',
                    items: saleData.items,
                    total: saleData.total,
                    method: saleData.method,
                    date: new Date().toLocaleString('es-PY'),
                    received: saleData.received,
                    change: saleData.change
                };

                window.electronAPI.printTicket(ticketData).then(res => {
                    if (!res.success) {
                        console.warn("No se pudo imprimir el ticket", res.error);
                        Swal.fire({
                            toast: true, position: 'bottom-end',
                            icon: 'warning', title: 'Impresora no detectada',
                            showConfirmButton: false, timer: 3000
                        });
                    }
                });

                clearCart();
                clearSelectedCheckoutClient();
                document.getElementById('pos-search').focus();
                loadPosHistory();
            }
        }
    } catch (error) {
        console.error("Sale Error", error);
        const msg = error.message.replace('Error invoking remote method \'process-sale\': ', '');
        Swal.fire('Error', `No se pudo procesar la venta.\nDetalle: ${msg}`, 'error');
    }
}


// (Legacy Reports Logic Removed to fix duplicate function error)
// The correct loadReports is defined earlier in the file.

async function exportReports() {
    if (!currentMovements || currentMovements.length === 0) {
        Swal.fire('Atención', 'No hay datos para exportar. Genere el reporte primero.', 'warning');
        return;
    }

    try {
        const result = await window.electronAPI.saveExport(currentMovements);
        if (result.success) {
            Swal.fire('Exportado', `Archivo guardado exitosamente.\nUbicación: ${result.path}`, 'success');
        } else if (result.cancelled) {
            // User cancelled save dialog, do nothing or show info
        } else {
            Swal.fire('Error', 'No se pudo exportar el archivo.', 'error');
        }

    } catch (error) {
        console.error("Export Error", error);
        Swal.fire('Error', 'Ocurrió un error al exportar.', 'error');
    }
}

async function exportReportsWord() {
    if (!currentMovements || currentMovements.length === 0) {
        Swal.fire('Atención', 'No hay datos para exportar. Genere el reporte primero.', 'warning');
        return;
    }

    const dateFrom = document.getElementById('report-date-from').value;
    const dateTo = document.getElementById('report-date-to').value;

    try {
        const result = await window.electronAPI.saveExportWord(currentMovements, dateFrom, dateTo);
        if (result.success) {
            Swal.fire('Exportado', `Archivo Word guardado exitosamente.\nUbicación: ${result.path}`, 'success');
        } else if (result.cancelled) {
            // User cancelled save dialog
        } else {
            Swal.fire('Error', 'No se pudo exportar el archivo.', 'error');
        }
    } catch (error) {
        console.error("Export Word Error", error);
        Swal.fire('Error', 'Ocurrió un error al exportar.', 'error');
    }
}


// Set default dates on load
function initDates() {
    const today = getLocalDateStr();
    const dateFrom = document.getElementById('report-date-from');
    const dateTo = document.getElementById('report-date-to');

    if (dateFrom && dateTo) {
        dateFrom.value = today;
        dateTo.value = today;
    }
}

let currentPosMovements = []; // Global store for POS history

async function loadPosHistory() {
    const tbody = document.getElementById('pos-history-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Cargando...</td></tr>';

    try {
        const today = getLocalDateStr();
        // Fetch movements for today
        const response = await window.electronAPI.getMovements(today, today, 1, 1000);
        const movements = response.rows || [];

        // Filter only 'INGRESO' (Sales)
        const sales = movements.filter(m => m.type === 'INGRESO');

        // Store for access by ID
        currentPosMovements = sales;

        tbody.innerHTML = '';
        if (sales.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Sin ventas hoy.</td></tr>';
            return;
        }

        // Descending order (newest first)
        sales.reverse().forEach(m => {
            const dateObj = new Date(m.date);
            const timeStr = dateObj.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });

            const total = parseInt(m.amount);
            const motive = m.motive || 'Varios';

            const row = `
                <tr>
                    <td class="text-muted">${timeStr}</td>
                    <td>
                        <small>${motive}</small>
                        ${m.is_edited ? '<span class="badge bg-warning text-dark" style="font-size: 0.7em;">Editado</span>' : ''}
                    </td>
                    <td class="text-end">
                        <div class="fw-bold text-success">${formatCurrency(total)}</div>
                        <button class="btn btn-sm btn-link text-warning p-0" onclick="initiateEditSale(${m.id})" title="Editar Venta">
                            <i class="bi bi-pencil-square"></i>
                        </button>
                        <button class="btn btn-sm btn-link text-secondary p-0 ms-2" onclick="reprintTicket(${m.id})" title="Reimprimir Ticket">
                            <i class="bi bi-printer"></i>
                        </button>
                    </td>
                </tr>
            `;
            tbody.innerHTML += row;
        });

    } catch (error) {
        console.error("POS History Load Error", error);
        tbody.innerHTML = '<tr><td colspan="3" class="text-danger text-center">Error</td></tr>';
    }
}

// --- Cash Register Logic ---

// --- Cash Register Logic ---

let expectedPhysical = 0; // Global to access in calc
let activeSessionId = null;

async function loadCajaSection() {
    try {
        const session = await window.electronAPI.getRegisterStatus();
        const viewOpen = document.getElementById('caja-view-open');
        const viewActive = document.getElementById('caja-view-active');

        if (session && session.status === 'OPEN') {
            activeSessionId = session.id;
            viewOpen.style.display = 'none';
            viewActive.style.display = 'block';

            // Fetch movements
            // session.opened_at might be a Date object from PG
            const openedAt = new Date(session.opened_at);
            const dateStr = getLocalDateStr(openedAt); // Safe conversion
            const response = await window.electronAPI.getMovements(dateStr, dateStr, 1, 1000);
            const movements = response.rows || [];
            // Note: This might fetch movements before open time if same day. 
            // ideally backend strictly filters >= opened_at. 
            // Assuming for now session implies 'Today's Shift'.

            // Calc Stats
            const initial = parseInt(session.initial_cash);
            let cashSales = 0;
            let cashExpenses = 0;
            let digitalSales = 0;

            movements.forEach(m => {
                // Filter by time if needed, but assuming shift = day for simplicity or backend handles strictly.
                // Actually closeRegister backend logic handles strictly >= opened_at. 
                // We should replicate roughly here or ask backend for stats?
                // Replicating roughly:
                const mDate = new Date(m.date);
                const sDate = new Date(session.opened_at);
                if (mDate < sDate) return;

                const amt = parseInt(m.amount);
                if (m.type === 'INGRESO') {
                    if (m.payment_method === 'Efectivo') cashSales += amt;
                    else digitalSales += amt;
                } else if (m.type === 'EGRESO') {
                    cashExpenses += amt;
                }
            });

            expectedPhysical = initial + cashSales - cashExpenses;
            const expectedDigital = digitalSales;
            const expectedTotal = expectedPhysical + expectedDigital;

            // Update Cards (Oculto para Cierre Ciego)
            document.getElementById('close-expected-cash').innerText = "Gs. *** (Cierre Ciego)";
            document.getElementById('close-expected-digital').innerText = "Gs. *** (Cierre Ciego)";
            document.getElementById('close-expected-total').innerText = "Gs. *** (Cierre Ciego)";

            // Attach listener for diff
            const input = document.getElementById('caja-final-amount');
            input.oninput = calculateCloseDiff;
            calculateCloseDiff(); // Init
            setupCurrencyInputs();

        } else {
            viewOpen.style.display = 'block';
            viewActive.style.display = 'none';
            document.getElementById('caja-initial-amount').value = '';
        }

    } catch (error) {
        console.error("Load Caja Error", error);
        Swal.fire('Error', 'No se pudo cargar el estado de caja.', 'error');
    }
}

function calculateCloseDiff() {
    const diffDisplay = document.getElementById('close-diff-display');
    diffDisplay.innerText = 'Oculto (Cierre Ciego)';
    diffDisplay.className = 'form-control form-control-lg bg-light border-0 fw-bold text-muted';
}

async function openRegister() {
    const rawAmount = document.getElementById('caja-initial-amount').value;
    const amount = parseCurrency(rawAmount);

    if (isNaN(amount) || amount < 0) {
        Swal.fire('Error', 'Monto inválido', 'error');
        return;
    }

    try {
        await window.electronAPI.openRegister(amount, 'Admin'); // User hardcoded
        Swal.fire({
            title: 'Caja Abierta',
            text: 'Turno iniciado correctamente',
            icon: 'success',
            timer: 1500,
            showConfirmButton: false
        });
        loadCajaSection();
    } catch (error) {
        console.error("Open Register Error", error);
        Swal.fire('Error', 'No se pudo abrir la caja.', 'error');
    }
}

async function closeRegister() {
    const rawAmount = document.getElementById('caja-final-amount').value;
    const finalCash = parseCurrency(rawAmount);
    const notes = document.getElementById('close-notes').value.trim();

    if (isNaN(finalCash) || finalCash < 0 || rawAmount === '') {
        Swal.fire('Error', 'Debe declarar un monto válido para cerrar caja.', 'error');
        return;
    }

    const confirm = await Swal.fire({
        title: '¿Confirmar Declaración y Cierre?',
        html: `Monto Declarado: <b>${formatCurrency(finalCash)}</b><br><small class="text-danger">Una vez confirmado, no podrá modificar el monto declarado.</small>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, Declarar y Cerrar',
        cancelButtonText: 'Cancelar'
    });

    if (!confirm.isConfirmed) return;

    try {
        // We call the closeRegister API which calculates stats and commits the transaction
        const result = await window.electronAPI.closeRegister(finalCash, 'Admin');

        const diff = finalCash - expectedPhysical;
        let diffHtml = '';
        if (diff === 0) {
            diffHtml = `<span class="text-success fw-bold">Perfecto (0)</span>`;
        } else if (diff > 0) {
            diffHtml = `<span class="text-success fw-bold">Sobrante de ${formatCurrency(diff)}</span>`;
        } else {
            diffHtml = `<span class="text-danger fw-bold">Faltante de ${formatCurrency(Math.abs(diff))}</span>`;
        }

        await Swal.fire({
            title: 'Caja Cerrada Exitosamente',
            html: `
                <div class="text-start p-3 bg-light rounded">
                    <p><b>Efectivo Declarado:</b> ${formatCurrency(finalCash)}</p>
                    <p><b>Efectivo Esperado:</b> ${formatCurrency(expectedPhysical)}</p>
                    <p><b>Diferencia:</b> ${diffHtml}</p>
                    ${notes ? `<p><b>Notas:</b> ${notes}</p>` : ''}
                </div>
            `,
            icon: 'success',
            confirmButtonText: 'Entendido'
        });

        // Reset field
        document.getElementById('caja-final-amount').value = '';
        document.getElementById('close-notes').value = '';
        loadCajaSection();

    } catch (error) {
        console.error("Close Register Error", error);
        Swal.fire('Error', 'No se pudo cerrar la caja.', 'error');
    }
}

// --- Edit Sale Logic ---

async function initiateEditSale(id) {
    try {
        // Fetch fresh data from backend
        const sale = await window.electronAPI.getMovementDetails(id);

        if (!sale) {
            Swal.fire('Error', 'No se encontraron los datos de la venta.', 'error');
            return;
        }

        editSale(sale);
    } catch (error) {
        console.error("Error fetching sale details", error);
        Swal.fire('Error', `No se pudo cargar la venta. Detalle: ${error.message}`, 'error');
    }
}

function editSale(sale) {
    const id = sale.id;
    const currentAmount = sale.amount;
    const currentReason = sale.edit_reason;
    const detailsJson = sale.details_json;

    document.getElementById('edit-sale-id').value = id;
    document.getElementById('edit-sale-amount').value = parseInt(currentAmount).toLocaleString('es-PY');
    document.getElementById('edit-sale-reason').value = currentReason || '';
    document.getElementById('edit-sale-details').value = detailsJson || ''; // Store JSON string

    // Reset Scenario
    document.getElementById('edit-scenario').value = 'correction';
    toggleEditScenario();

    const modal = new bootstrap.Modal(document.getElementById('editSaleModal'));
    modal.show();

    setTimeout(() => {
        document.getElementById('edit-sale-amount').focus();
        setupCurrencyInputs();
    }, 500);
}

function toggleEditScenario() {
    const scenario = document.getElementById('edit-scenario').value;
    const amountInput = document.getElementById('edit-sale-amount');
    const restockSection = document.getElementById('restock-section');
    const noteText = document.getElementById('edit-note-text');
    const detailsJson = document.getElementById('edit-sale-details').value;

    if (scenario === 'refund') {
        amountInput.value = '0';
        amountInput.readOnly = true;
        restockSection.style.display = 'block';
        noteText.innerText = 'El ingreso será anulado (0 Gs). Seleccione productos para devolver al stock.';

        // Render Checkboxes
        const container = document.getElementById('restock-items-container');
        container.innerHTML = '';

        if (detailsJson && detailsJson !== 'null' && detailsJson !== 'undefined') {
            try {
                const parsed = JSON.parse(detailsJson);
                const items = Array.isArray(parsed) ? parsed : (parsed.items || []);
                if (items.length > 0) {
                    items.forEach((item, index) => {
                        const div = document.createElement('div');
                        div.classList.add('form-check');
                        div.innerHTML = `
                            <input class="form-check-input restock-check" type="checkbox" value="${index}" id="restock-check-${index}">
                            <label class="form-check-label" for="restock-check-${index}">
                                ${item.name} (${item.variant_name}) x${item.qty}
                            </label>
                        `;
                        container.appendChild(div);
                    });
                } else {
                    container.innerHTML = '<div class="text-center text-muted small">Detalles vacíos.</div>';
                }
            } catch (e) {
                console.error("Error parsing details", e);
                container.innerHTML = '<div class="text-center text-muted small">Error al cargar detalles.</div>';
            }
        } else {
            container.innerHTML = '<div class="text-center text-muted small fst-italic">No hay detalles de productos disponibles para esta venta (Venta antigua).</div>';
        }

    } else {
        // Correction
        amountInput.readOnly = false;
        restockSection.style.display = 'none';
        noteText.innerText = 'Esta acción solo corrige el monto financiero.';
    }
}

async function confirmEditSale() {
    const id = document.getElementById('edit-sale-id').value;
    const rawAmount = document.getElementById('edit-sale-amount').value;
    const amount = parseCurrency(rawAmount);
    const reason = document.getElementById('edit-sale-reason').value.trim();
    const scenario = document.getElementById('edit-scenario').value;
    const detailsJson = document.getElementById('edit-sale-details').value;

    if (!reason) {
        Swal.fire('Atención', 'El motivo de la edición es obligatorio.', 'warning');
        return;
    }

    let restockItems = [];
    if (scenario === 'refund' && detailsJson) {
        try {
            const parsed = JSON.parse(detailsJson);
            const allItems = Array.isArray(parsed) ? parsed : (parsed.items || []);
            const checkboxes = document.querySelectorAll('.restock-check:checked');
            checkboxes.forEach(cb => {
                const index = parseInt(cb.value);
                if (allItems[index]) {
                    restockItems.push(allItems[index]);
                }
            });
        } catch (e) {
            console.error("Error processing restock", e);
        }
    }

    try {
        const result = await window.electronAPI.updateMovement({
            id: id,
            amount: amount,
            reason: reason,
            user: 'Admin',
            restockItems: restockItems
        });

        if (result.success) {
            const modalEl = document.getElementById('editSaleModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            modal.hide();

            let msg = 'El movimiento ha sido editado correctamente.';
            if (restockItems.length > 0) {
                msg += ` Se han devuelto ${restockItems.length} productos al stock.`;
            }

            Swal.fire({
                title: 'Actualizado',
                text: msg,
                icon: 'success',
                timer: 2000,
                showConfirmButton: false
            });

            // Refresh Views
            loadPosHistory();
            if (document.getElementById('reports-section').style.display !== 'none') {
                loadReports(currentReportsPage);
            }
        }
    } catch (error) {
        console.error("Edit Sale Error", error);
        Swal.fire('Error', 'No se pudo actualizar el movimiento.', 'error');
    }
}

async function reprintTicket(id) {
    try {
        const sale = await window.electronAPI.getMovementDetails(id);
        if (!sale) {
            Swal.fire('Error', 'Venta no encontrada', 'error');
            return;
        }

        let items = [];
        let received = undefined;
        let change = undefined;
        try {
            const parsed = JSON.parse(sale.details_json || '[]');
            if (Array.isArray(parsed)) {
                items = parsed;
            } else {
                items = parsed.items || [];
                received = parsed.received;
                change = parsed.change;
            }
        } catch (e) {
            console.error("Error parsing details for reprint", e);
        }

        if (items.length === 0) {
            Swal.fire('Aviso', 'Esta venta es antigua y no tiene detalle de productos para reimprimir.', 'warning');
            return;
        }

        const ticketData = {
            id: sale.id,
            storeName: 'Aurea Accesorios',
            items: items,
            total: sale.amount,
            method: sale.payment_method,
            date: new Date(sale.date).toLocaleString('es-PY'),
            received: received,
            change: change
        };

        const res = await window.electronAPI.printTicket(ticketData);
        if (res.success) {
            const Toast = Swal.mixin({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 1500,
                timerProgressBar: true
            });
            Toast.fire({
                icon: 'success',
                title: 'Ticket reimpreso'
            });
        } else {
            Swal.fire('Error', 'No se pudo imprimir el ticket.', 'error');
        }
    } catch (e) {
        console.error("Reprint Error", e);
        Swal.fire('Error', 'Error al intentar reimprimir: ' + e.message, 'error');
    }
}

// --- Mesas (Salón) Front Logic ---
async function loadSalonTables() {
    const container = document.getElementById('salon-tables-container');
    if (!container) return;

    container.innerHTML = '<div class="col-12 text-center text-muted">Cargando mesas...</div>';

    try {
        const tables = await window.electronAPI.getTables();
        container.innerHTML = '';

        if (tables.length === 0) {
            container.innerHTML = '<div class="col-12 text-center text-muted py-3">No hay mesas registradas. ¡Agrega una nueva mesa arriba!</div>';
            return;
        }

        tables.forEach(t => {
            let statusBadge = '';
            let cardBorder = '';
            let footerBtn = '';

            if (t.status === 'Libre') {
                statusBadge = `<span class="badge bg-success">Libre</span>`;
                cardBorder = 'border-success';
                footerBtn = `<button class="btn btn-sm btn-primary w-100" onclick="quickOpenTab(${t.id})"><i class="bi bi-cart-plus"></i> Abrir Cuenta</button>`;
            } else if (t.status === 'Ocupada') {
                statusBadge = `<span class="badge bg-danger">Ocupada</span>`;
                cardBorder = 'border-danger';
                footerBtn = `
                    <div class="d-flex gap-1">
                        <button class="btn btn-sm btn-outline-primary" onclick="loadTabInPOS(${t.id})" title="Pedido"><i class="bi bi-pencil-square"></i></button>
                        <button class="btn btn-sm btn-outline-info" onclick="initiateSplit(${t.id})" title="Dividir Cuenta"><i class="bi bi-diagram-2"></i></button>
                        <button class="btn btn-sm btn-success flex-grow-1" onclick="quickCheckoutTab(${t.id})"><i class="bi bi-cash-coin"></i> Cobrar</button>
                    </div>
                `;
            } else {
                statusBadge = `<span class="badge bg-warning text-dark">Pendiente</span>`;
                cardBorder = 'border-warning';
                footerBtn = `<button class="btn btn-sm btn-warning w-100" onclick="loadTabInPOS(${t.id})"><i class="bi bi-cash-coin"></i> Cobrar Cuenta</button>`;
            }

            const col = document.createElement('div');
            col.className = 'col-md-3';
            col.innerHTML = `
                <div class="card h-100 border-2 ${cardBorder} shadow-sm">
                    <div class="card-body p-3 d-flex flex-column justify-content-between">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h5 class="card-title fw-bold mb-0">Mesa ${t.number}</h5>
                            ${statusBadge}
                        </div>
                        <div class="text-center my-3">
                            <i class="bi bi-shop text-muted fs-1"></i>
                        </div>
                        <div>
                            ${footerBtn}
                            <button class="btn btn-link btn-sm text-danger w-100 mt-2 p-0 text-center text-decoration-none" style="font-size: 0.8rem;" onclick="confirmDeleteTable(${t.id}, '${t.number}')">
                                <i class="bi bi-trash"></i> Eliminar Mesa
                            </button>
                        </div>
                    </div>
                </div>
            `;
            container.appendChild(col);
        });

    } catch (e) {
        console.error("Error loading salon tables:", e);
        container.innerHTML = '<div class="col-12 text-center text-danger">Error al cargar el mapa del salón.</div>';
    }
}

async function promptCreateTable() {
    const { value: number } = await Swal.fire({
        title: 'Agregar Nueva Mesa',
        input: 'text',
        inputLabel: 'Número o Nombre de la Mesa',
        inputPlaceholder: 'Ej: 1, 2B, VIP...',
        showCancelButton: true,
        cancelButtonText: 'Cancelar',
        confirmButtonText: 'Agregar',
        confirmButtonColor: '#198754',
        inputValidator: (value) => {
            if (!value || !value.trim()) {
                return '¡Debes ingresar un número o identificación!';
            }
        }
    });

    if (number) {
        try {
            await window.electronAPI.createTable(number.trim(), 0, 0);
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: `Mesa ${number} agregada`, timer: 1500, showConfirmButton: false });
            await loadSalonTables();
        } catch (e) {
            console.error("Error creating table:", e);
            Swal.fire('Error', 'No se pudo crear la mesa. Puede que el número ya exista.', 'error');
        }
    }
}

async function confirmDeleteTable(id, number) {
    const confirm = await Swal.fire({
        title: `¿Eliminar Mesa ${number}?`,
        text: "Esta acción no se puede deshacer.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    });

    if (confirm.isConfirmed) {
        try {
            await window.electronAPI.deleteTable(id);
            Swal.fire('Eliminada', `La mesa ${number} ha sido eliminada.`, 'success');
            await loadSalonTables();
        } catch (e) {
            console.error("Error deleting table:", e);
            Swal.fire('Error', 'No se pudo eliminar la mesa.', 'error');
        }
    }
}

async function quickOpenTab(tableId) {
    try {
        const clients = await window.electronAPI.getClients('');
        
        let clientOptions = '<option value="">CLIENTE OCASIONAL</option>';
        clients.forEach(c => {
            clientOptions += `<option value="${c.id}">${c.razon_social} (RUC: ${c.dni_ruc})</option>`;
        });

        const { value: formValues } = await Swal.fire({
            title: 'Abrir Comanda / Tab',
            html: `
                <div class="text-start mb-3">
                    <label class="form-label fw-bold">Asociar Cliente (Opcional)</label>
                    <select id="swal-tab-client" class="form-select">${clientOptions}</select>
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Abrir Mesa',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                return document.getElementById('swal-tab-client').value;
            }
        });

        if (formValues !== undefined) {
            const clientId = formValues ? parseInt(formValues) : null;
            await window.electronAPI.openTab(tableId, clientId, 'Cajero');
            loadTabInPOS(tableId);
        }
    } catch (e) {
        console.error("Error opening tab:", e);
        Swal.fire('Error', 'No se pudo abrir la comanda en la mesa.', 'error');
    }
}

function loadTabInPOS(tableId) {
    showSection('pos');
    
    document.getElementById('pos-op-type').value = 'table';
    togglePosOpType();
    
    setTimeout(() => {
        const select = document.getElementById('pos-table-select');
        select.value = tableId;
        loadSelectedTableTab();
    }, 100);
}

async function quickCheckoutTab(tableId) {
    loadTabInPOS(tableId);
    setTimeout(() => {
        initiateCheckout();
    }, 200);
}

// --- POS Tables Logic ---
async function loadPosTables() {
    const select = document.getElementById('pos-table-select');
    if (!select) return;

    try {
        const tables = await window.electronAPI.getTables();
        select.innerHTML = '<option value="">-- Seleccionar Mesa --</option>';
        tables.forEach(t => {
            const label = t.status === 'Ocupada' ? `Mesa ${t.number} (Ocupada)` : `Mesa ${t.number}`;
            select.innerHTML += `<option value="${t.id}">${label}</option>`;
        });
    } catch (e) {
        console.error("Error loading POS tables:", e);
    }
}

function togglePosOpType() {
    const opType = document.getElementById('pos-op-type').value;
    const tableContainer = document.getElementById('pos-table-select-container');
    const saveTabBtn = document.getElementById('btn-save-to-tab');

    if (opType === 'table') {
        tableContainer.style.display = 'block';
        saveTabBtn.style.display = 'block';
    } else {
        tableContainer.style.display = 'none';
        saveTabBtn.style.display = 'none';
        clearCart();
    }
}

async function loadSelectedTableTab() {
    const tableId = parseInt(document.getElementById('pos-table-select').value);
    if (!tableId) {
        clearCart();
        return;
    }

    try {
        const tab = await window.electronAPI.getTabByTable(tableId);
        if (tab) {
            const details = await window.electronAPI.getTabDetails(tab.id);
            cart = [];
            if (details && details.items) {
                details.items.forEach(ti => {
                    cart.push({
                        id: ti.product_id,
                        name: ti.product_name,
                        variant_name: ti.variant_name,
                        price: parseFloat(ti.unit_price),
                        qty: parseInt(ti.quantity)
                    });
                });
            }
            renderCart();
            
            if (details.client_id) {
                window.selectedCheckoutClient = {
                    id: details.client_id,
                    razon_social: details.client_name,
                    dni_ruc: details.client_ruc
                };
                updateCheckoutClientIndicator();
            } else {
                clearSelectedCheckoutClient();
            }
        } else {
            clearCart();
            clearSelectedCheckoutClient();
        }
    } catch (e) {
        console.error("Error loading selected table tab:", e);
    }
}

async function saveCartToTab() {
    const tableId = parseInt(document.getElementById('pos-table-select').value);
    if (!tableId) {
        Swal.fire('Error', 'Seleccione una mesa para guardar la comanda.', 'error');
        return;
    }

    if (cart.length === 0) {
        Swal.fire('Carrito Vacío', 'Agregue productos antes de guardar en la mesa.', 'warning');
        return;
    }

    try {
        let tab = await window.electronAPI.getTabByTable(tableId);
        let clientId = window.selectedCheckoutClient ? window.selectedCheckoutClient.id : null;
        
        if (!tab) {
            tab = await window.electronAPI.openTab(tableId, clientId, 'Cajero');
        }

        await window.electronAPI.updateTabItems(tab.id, cart);

        Swal.fire({
            title: '¡Guardado!',
            text: 'Productos guardados en la comanda de la mesa.',
            icon: 'success',
            timer: 1500,
            showConfirmButton: false
        });

        clearCart();
        clearSelectedCheckoutClient();
        document.getElementById('pos-op-type').value = 'direct';
        togglePosOpType();
        showSection('dashboard');

    } catch (e) {
        console.error("Error saving comanda items:", e);
        Swal.fire('Error', 'No se pudo guardar la comanda.', 'error');
    }
}

// --- Split de Cuentas ---
window.splitTabId = null;
window.splitTableId = null;
window.splitItems = [];
window.splitGroups = [];
window.splitUnassigned = [];

async function initiateSplit(tableId) {
    try {
        const tab = await window.electronAPI.getTabByTable(tableId);
        if (!tab) {
            Swal.fire('Atención', 'No hay una comanda abierta en esta mesa.', 'info');
            return;
        }

        const details = await window.electronAPI.getTabDetails(tab.id);
        if (!details || !details.items || details.items.length === 0) {
            Swal.fire('Atención', 'La comanda no tiene productos.', 'info');
            return;
        }

        window.splitTabId = tab.id;
        window.splitTableId = tableId;
        window.splitItems = details.items.map(item => ({
            product_id: item.product_id,
            product_name: item.product_name,
            variant_name: item.variant_name,
            qty: parseInt(item.quantity),
            unit_price: parseFloat(item.unit_price),
            subtotal: parseFloat(item.subtotal)
        }));
        window.splitGroups = [];
        window.splitUnassigned = window.splitItems.map((_, i) => i);

        document.getElementById('split-table-info').innerText = `Mesa ${details.table_number || tableId} - Comanda #${tab.id}`;
        document.getElementById('split-client-info').innerText = details.client_name ? `Cliente: ${details.client_name} (RUC: ${details.client_ruc || '-'})` : '';

        renderSplitUI();

        const modal = new bootstrap.Modal(document.getElementById('splitModal'));
        modal.show();

        if (window.splitItems.length > 0) {
            addSplitGroup();
        }
    } catch (e) {
        console.error("Error initiating split:", e);
        Swal.fire('Error', 'No se pudo cargar la comanda.', 'error');
    }
}

function renderSplitUI() {
    const loading = document.getElementById('split-loading');
    const content = document.getElementById('split-content');
    if (loading) loading.style.display = 'none';
    if (content) content.style.display = 'block';

    // Unassigned items
    const unassignedSection = document.getElementById('split-unassigned-section');
    const unassignedContainer = document.getElementById('split-unassigned-items');
    const unassignedCount = document.getElementById('split-unassigned-count');

    if (window.splitUnassigned.length === 0) {
        unassignedSection.style.display = 'none';
    } else {
        unassignedSection.style.display = 'block';
        unassignedCount.innerText = window.splitUnassigned.length;
        unassignedContainer.innerHTML = '';

        window.splitUnassigned.forEach((itemIdx, ui) => {
            const item = window.splitItems[itemIdx];
            const div = document.createElement('div');
            div.className = 'd-flex justify-content-between align-items-center border-bottom py-2';
            div.innerHTML = `
                <div class="flex-grow-1">
                    <span class="fw-bold">${item.product_name}</span>
                    <small class="text-muted ms-2">${item.variant_name || ''}</small>
                    <span class="badge bg-secondary ms-2">x${item.qty}</span>
                    <span class="ms-2 text-primary fw-bold">${formatCurrency(item.subtotal)}</span>
                </div>
                <div class="btn-group btn-group-sm">
                    ${window.splitGroups.map((g, gi) => `
                        <button class="btn btn-outline-primary" onclick="assignItemToGroup(${ui}, ${gi})" title="Asignar a ${g.label}">
                            ${g.label.replace('Persona ', 'P')}
                        </button>
                    `).join('')}
                </div>
            `;
            unassignedContainer.appendChild(div);
        });
    }

    // Groups
    const container = document.getElementById('split-groups-container');
    container.innerHTML = '';

    if (window.splitGroups.length === 0) {
        container.innerHTML = '<div class="text-center text-muted py-4"><i class="bi bi-people fs-1 d-block mb-2"></i>Agregue al menos una persona para dividir la cuenta.</div>';
        updateSplitTotals();
        return;
    }

    window.splitGroups.forEach((group, gi) => {
        const groupTotal = group.items.reduce((sum, i) => sum + i.subtotal, 0);
        const card = document.createElement('div');
        card.className = 'card border-primary mb-3';
        card.innerHTML = `
            <div class="card-header bg-primary bg-opacity-10 py-2 d-flex justify-content-between align-items-center">
                <div>
                    <span class="fw-bold"><i class="bi bi-person-circle me-1"></i>${group.label}</span>
                    <span class="badge bg-primary ms-2">${formatCurrency(groupTotal)}</span>
                </div>
                <div>
                    <button class="btn btn-sm btn-outline-danger" onclick="removeSplitGroup(${gi})" title="Eliminar persona">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>
            </div>
            <div class="card-body py-2">
                ${group.items.length === 0 ? '<p class="text-muted small mb-0">Sin productos asignados</p>' : `
                <table class="table table-sm table-borderless mb-2">
                    <tbody>
                        ${group.items.map((item, ii) => `
                            <tr>
                                <td class="ps-0">${item.product_name} <small class="text-muted">${item.variant_name || ''}</small></td>
                                <td class="text-center">x${item.qty}</td>
                                <td class="text-end">${formatCurrency(item.subtotal)}</td>
                                <td class="text-end pe-0" style="width: 30px;">
                                    <button class="btn btn-sm btn-link text-danger p-0" onclick="unassignItemFromGroup(${gi}, ${ii})" title="Quitar producto">
                                        <i class="bi bi-x-circle"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                `}
                <div class="row g-2 align-items-end">
                    <div class="col-md-4">
                        <label class="form-label small text-muted">Método de pago</label>
                        <select class="form-select form-select-sm" onchange="updateSplitGroupMethod(${gi}, this.value)">
                            <option value="Efectivo" ${group.paymentMethod === 'Efectivo' ? 'selected' : ''}>Efectivo</option>
                            <option value="QR" ${group.paymentMethod === 'QR' ? 'selected' : ''}>QR</option>
                            <option value="Transferencia" ${group.paymentMethod === 'Transferencia' ? 'selected' : ''}>Transferencia</option>
                        </select>
                    </div>
                    <div class="col-md-4">
                        <label class="form-label small text-muted">Cliente (opcional)</label>
                        <input type="text" class="form-control form-control-sm" placeholder="Nombre..." value="${group.clientName === 'CLIENTE OCASIONAL' ? '' : group.clientName}" onchange="updateSplitGroupClient(${gi}, this.value)">
                    </div>
                    <div class="col-md-4 text-md-end">
                        <small class="text-muted">Subtotal</small>
                        <div class="fw-bold fs-6">${formatCurrency(groupTotal)}</div>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(card);
    });

    updateSplitTotals();
    document.getElementById('split-content').scrollTop = 0;
}

function addSplitGroup() {
    const num = window.splitGroups.length + 1;
    window.splitGroups.push({
        label: `Persona ${num}`,
        items: [],
        paymentMethod: 'Efectivo',
        clientName: 'CLIENTE OCASIONAL'
    });
    renderSplitUI();
}

function removeSplitGroup(index) {
    const group = window.splitGroups[index];
    // Return items to unassigned
    group.items.forEach(item => {
        const foundIdx = window.splitItems.findIndex(si =>
            si.product_id === item.product_id &&
            si.variant_name === item.variant_name &&
            si.qty === item.qty &&
            si.unit_price === item.unit_price
        );
        if (foundIdx >= 0 && !window.splitUnassigned.includes(foundIdx)) {
            window.splitUnassigned.push(foundIdx);
        }
    });
    window.splitGroups.splice(index, 1);
    // Re-label
    window.splitGroups.forEach((g, i) => { g.label = `Persona ${i + 1}`; });
    renderSplitUI();
}

function assignItemToGroup(unassignedIdx, groupIdx) {
    const itemIdx = window.splitUnassigned[unassignedIdx];
    const item = window.splitItems[itemIdx];

    const existing = window.splitGroups[groupIdx].items.find(i =>
        i.product_id === item.product_id && i.variant_name === item.variant_name
    );

    if (existing) {
        existing.qty += item.qty;
        existing.subtotal += item.subtotal;
    } else {
        window.splitGroups[groupIdx].items.push({ ...item });
    }

    window.splitUnassigned.splice(unassignedIdx, 1);
    renderSplitUI();
}

function unassignItemFromGroup(groupIdx, itemIdx) {
    const item = window.splitGroups[groupIdx].items[itemIdx];
    const foundSrcIdx = window.splitItems.findIndex(si =>
        si.product_id === item.product_id &&
        si.variant_name === item.variant_name &&
        si.subtotal === item.subtotal
    );
    if (foundSrcIdx >= 0 && !window.splitUnassigned.includes(foundSrcIdx)) {
        window.splitUnassigned.push(foundSrcIdx);
    }
    window.splitGroups[groupIdx].items.splice(itemIdx, 1);
    renderSplitUI();
}

function splitEqualParts() {
    const numPeople = window.splitGroups.length;
    if (numPeople === 0) {
        Swal.fire('Atención', 'Agregue al menos una persona primero.', 'info');
        return;
    }

    // Return all items to unassigned
    window.splitGroups.forEach(g => { g.items = []; });

    // Distribute items round-robin
    let personIdx = 0;
    for (const item of window.splitItems) {
        // split quantities if needed
        let remaining = item.qty;
        while (remaining > 0) {
            const qtyPerPerson = Math.ceil(remaining / (numPeople - personIdx));
            const toAssign = Math.min(qtyPerPerson, remaining);
            const subtotal = toAssign * item.unit_price;
            const existing = window.splitGroups[personIdx % numPeople].items.find(i =>
                i.product_id === item.product_id && i.variant_name === item.variant_name
            );
            if (existing) {
                existing.qty += toAssign;
                existing.subtotal += subtotal;
            } else {
                window.splitGroups[personIdx % numPeople].items.push({
                    product_id: item.product_id,
                    product_name: item.product_name,
                    variant_name: item.variant_name,
                    qty: toAssign,
                    unit_price: item.unit_price,
                    subtotal: subtotal
                });
            }
            remaining -= toAssign;
            personIdx = (personIdx + 1) % numPeople;
        }
    }

    window.splitUnassigned = [];
    renderSplitUI();
}

function updateSplitGroupMethod(index, value) {
    window.splitGroups[index].paymentMethod = value;
}

function updateSplitGroupClient(index, value) {
    window.splitGroups[index].clientName = value.trim() || 'CLIENTE OCASIONAL';
}

function updateSplitTotals() {
    const totalComanda = window.splitItems.reduce((sum, i) => sum + i.subtotal, 0);
    const totalAssigned = window.splitGroups.reduce((sum, g) =>
        sum + g.items.reduce((s, i) => s + i.subtotal, 0), 0
    );

    document.getElementById('split-total-display').innerText = formatCurrency(totalComanda);
    document.getElementById('split-assigned-display').innerText = formatCurrency(totalAssigned);

    const warning = document.getElementById('split-balance-warning');
    if (totalAssigned < totalComanda) {
        warning.style.display = 'inline';
    } else {
        warning.style.display = 'none';
    }

    const processBtn = document.getElementById('btn-process-split');
    processBtn.disabled = totalAssigned < totalComanda || window.splitGroups.length === 0;
}

async function processSplit() {
    const unassignedCount = window.splitUnassigned.length;
    if (unassignedCount > 0) {
        Swal.fire('Productos sin asignar',
            `Faltan asignar ${unassignedCount} producto(s) a alguna persona.`,
            'warning');
        return;
    }

    if (window.splitGroups.length === 0) {
        Swal.fire('Sin grupos', 'Agregue al menos una persona para dividir la cuenta.', 'warning');
        return;
    }

    const validGroups = window.splitGroups.filter(g => g.items.length > 0);
    if (validGroups.length === 0) {
        Swal.fire('Sin productos', 'Cada persona debe tener al menos un producto asignado.', 'warning');
        return;
    }

    const confirm = await Swal.fire({
        title: '¿Dividir Cuenta?',
        html: `
            <p>Se dividirá la cuenta en <strong>${validGroups.length} grupo(s)</strong>.</p>
            <p class="mb-1">Cada grupo generará un comprobante de pago independiente.</p>
            <div class="text-start small">
                ${validGroups.map((g, i) => `
                    <div class="border-bottom py-1">
                        <strong>${g.label}</strong>: ${formatCurrency(g.items.reduce((s, it) => s + it.subtotal, 0))} 
                        (${g.paymentMethod}) ${g.clientName !== 'CLIENTE OCASIONAL' ? `- ${g.clientName}` : ''}
                    </div>
                `).join('')}
            </div>
        `,
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'Sí, dividir cuenta',
        confirmButtonColor: '#198754',
        cancelButtonText: 'Cancelar'
    });

    if (!confirm.isConfirmed) return;

    try {
        const splits = validGroups.map(g => ({
            items: g.items.map(i => ({
                product_id: i.product_id,
                product_name: i.product_name,
                variant_name: i.variant_name || null,
                qty: i.qty,
                unit_price: i.unit_price,
                subtotal: i.subtotal
            })),
            paymentMethod: g.paymentMethod,
            received: g.items.reduce((s, i) => s + i.subtotal, 0),
            change: 0,
            clientName: g.clientName
        }));

        const result = await window.electronAPI.splitTabAndProcessSale(window.splitTabId, splits);

        if (result.success) {
            const modalEl = document.getElementById('splitModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();

            await Swal.fire({
                title: '¡Cuenta Dividida!',
                html: `Se procesaron <strong>${splits.length} pago(s)</strong> correctamente.<br>La mesa ha sido liberada.`,
                icon: 'success',
                timer: 2000,
                showConfirmButton: false
            });

            clearSplitState();
            loadSalonTables();
            showSection('dashboard');
        }
    } catch (e) {
        console.error("Split Error", e);
        const msg = e.message.replace('Error invoking remote method \'split-tab-and-process-sale\': ', '');
        Swal.fire('Error', `No se pudo dividir la cuenta.\nDetalle: ${msg}`, 'error');
    }
}

function clearSplitState() {
    window.splitTabId = null;
    window.splitTableId = null;
    window.splitItems = [];
    window.splitGroups = [];
    window.splitUnassigned = [];
    document.getElementById('split-table-info').innerText = 'Mesa # - Comanda';
    document.getElementById('split-client-info').innerText = '';
}

// --- Clientes Front Logic ---
window.selectedCheckoutClient = null;

function toggleFastClientForm() {
    const form = document.getElementById('checkout-client-fast-form');
    const btn = document.getElementById('btn-toggle-fast-client');
    if (form.style.display === 'none') {
        form.style.display = 'block';
        btn.innerHTML = '<i class="bi bi-person-dash-fill me-1"></i> Cancelar Registro';
    } else {
        form.style.display = 'none';
        btn.innerHTML = '<i class="bi bi-person-plus-fill me-1"></i> + Registrar Cliente Nuevo';
        clearFastClientFields();
    }
}

function clearFastClientFields() {
    document.getElementById('fast-client-ruc').value = '';
    document.getElementById('fast-client-name').value = '';
    document.getElementById('fast-client-email').value = '';
    document.getElementById('fast-client-address').value = '';
}

async function searchClientInCheckout() {
    const term = document.getElementById('checkout-client-search').value.trim();
    if (!term) {
        Swal.fire('Atención', 'Ingrese un RUC o Nombre para buscar.', 'warning');
        return;
    }

    try {
        const clients = await window.electronAPI.getClients(term);
        if (clients.length === 0) {
            Swal.fire('No encontrado', 'No se encontró ningún cliente. Puede registrar uno nuevo.', 'info');
            document.getElementById('checkout-client-fast-form').style.display = 'block';
            document.getElementById('fast-client-ruc').value = term;
            document.getElementById('btn-toggle-fast-client').innerHTML = '<i class="bi bi-person-dash-fill me-1"></i> Cancelar Registro';
            return;
        }

        if (clients.length === 1) {
            window.selectedCheckoutClient = clients[0];
            updateCheckoutClientIndicator();
        } else {
            let htmlOptions = '<div class="list-group text-start">';
            clients.forEach((c, index) => {
                htmlOptions += `
                    <button class="list-group-item list-group-item-action" onclick="selectCheckoutClient(${index})">
                        <h6 class="mb-1 fw-bold">${c.razon_social}</h6>
                        <small>RUC/DNI: ${c.dni_ruc} | Dirección: ${c.direccion || '-'}</small>
                    </button>
                `;
            });
            htmlOptions += '</div>';

            window.checkoutClientOptions = clients;
            await Swal.fire({
                title: 'Seleccione Cliente',
                html: htmlOptions,
                showConfirmButton: false,
                showCloseButton: true
            });
        }
    } catch (e) {
        console.error(e);
    }
}

function selectCheckoutClient(index) {
    const c = window.checkoutClientOptions[index];
    if (c) {
        window.selectedCheckoutClient = c;
        updateCheckoutClientIndicator();
        Swal.close();
    }
}

function updateCheckoutClientIndicator() {
    if (window.selectedCheckoutClient) {
        document.getElementById('chk-client-name').innerText = window.selectedCheckoutClient.razon_social;
        document.getElementById('chk-client-ruc').innerText = `RUC: ${window.selectedCheckoutClient.dni_ruc}`;
        document.getElementById('checkout-client-selected').style.display = 'block';
        document.getElementById('checkout-client-fast-form').style.display = 'none';
        document.getElementById('btn-toggle-fast-client').innerHTML = '<i class="bi bi-person-plus-fill me-1"></i> + Registrar Cliente Nuevo';
        clearFastClientFields();
    }
}

function clearSelectedCheckoutClient() {
    window.selectedCheckoutClient = null;
    document.getElementById('checkout-client-selected').style.display = 'none';
    document.getElementById('checkout-client-search').value = '';
}

async function saveFastClient() {
    const ruc = document.getElementById('fast-client-ruc').value.trim();
    const name = document.getElementById('fast-client-name').value.trim();
    const email = document.getElementById('fast-client-email').value.trim();
    const address = document.getElementById('fast-client-address').value.trim();

    if (!ruc || !name) {
        Swal.fire('Campos Obligatorios', 'RUC/DNI y Razón Social son requeridos.', 'warning');
        return;
    }

    try {
        const clientData = { dni_ruc: ruc, razon_social: name, email, direccion: address };
        const saved = await window.electronAPI.createClient(clientData);
        if (saved) {
            window.selectedCheckoutClient = saved;
            updateCheckoutClientIndicator();
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Cliente registrado', timer: 1500, showConfirmButton: false });
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'No se pudo registrar el cliente (RUC duplicado o inválido).', 'error');
    }
}

// --- Clientes Admin Section Logic ---
async function loadClients() {
    const tbody = document.getElementById('clients-table-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Cargando clientes...</td></tr>';

    try {
        const term = document.getElementById('client-search-input').value.trim();
        const clients = await window.electronAPI.getClients(term);

        tbody.innerHTML = '';
        if (clients.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No se encontraron clientes.</td></tr>';
            return;
        }

        clients.forEach(c => {
            const row = `
                <tr>
                    <td>${c.id}</td>
                    <td class="fw-bold">${c.dni_ruc}</td>
                    <td>${c.razon_social}</td>
                    <td>${c.email || '-'}</td>
                    <td>${c.direccion || '-'}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-warning me-1" onclick="editClient(${c.id})"><i class="bi bi-pencil"></i></button>
                        <button class="btn btn-sm btn-outline-danger" onclick="confirmDeleteClient(${c.id}, '${c.razon_social}')"><i class="bi bi-trash"></i></button>
                    </td>
                </tr>
            `;
            tbody.innerHTML += row;
        });
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error al cargar clientes.</td></tr>';
    }
}

function searchClientsList() {
    loadClients();
}

function resetClientForm() {
    document.getElementById('client-form').reset();
    document.getElementById('edit-client-id').value = '';
    document.getElementById('client-form-title').innerText = 'Registrar Nuevo Cliente';
    document.getElementById('btn-save-client').innerText = 'Guardar Cliente';
}

document.getElementById('client-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-client-id').value;
    const clientData = {
        dni_ruc: document.getElementById('client-ruc').value.trim(),
        razon_social: document.getElementById('client-name').value.trim(),
        email: document.getElementById('client-email').value.trim(),
        direccion: document.getElementById('client-address').value.trim()
    };

    try {
        if (id) {
            await window.electronAPI.updateClient(id, clientData);
            Swal.fire({ title: 'Actualizado', text: 'Datos actualizados correctamente.', icon: 'success', timer: 1500, showConfirmButton: false });
        } else {
            await window.electronAPI.createClient(clientData);
            Swal.fire({ title: 'Registrado', text: 'Cliente registrado correctamente.', icon: 'success', timer: 1500, showConfirmButton: false });
        }
        resetClientForm();
        loadClients();
        const bsCollapse = bootstrap.Collapse.getInstance(document.getElementById('newClientForm'));
        bsCollapse?.hide();
    } catch (error) {
        console.error(error);
        Swal.fire('Error', 'No se pudo guardar el cliente.', 'error');
    }
});

async function editClient(id) {
    try {
        const clients = await window.electronAPI.getClients('');
        const c = clients.find(item => item.id === id);
        if (!c) return;

        document.getElementById('edit-client-id').value = c.id;
        document.getElementById('client-ruc').value = c.dni_ruc;
        document.getElementById('client-name').value = c.razon_social;
        document.getElementById('client-email').value = c.email || '';
        document.getElementById('client-address').value = c.direccion || '';

        document.getElementById('client-form-title').innerText = `Editando Cliente: ${c.razon_social}`;
        document.getElementById('btn-save-client').innerText = 'Guardar Cambios';

        const bsCollapse = new bootstrap.Collapse(document.getElementById('newClientForm'), { show: true });
        document.getElementById('newClientForm').classList.add('show');
    } catch (e) {
        console.error(e);
    }
}

async function confirmDeleteClient(id, name) {
    const confirm = await Swal.fire({
        title: `¿Eliminar Cliente "${name}"?`,
        text: "Se desvinculará de futuras comandas.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    });

    if (confirm.isConfirmed) {
        try {
            await window.electronAPI.deleteClient(id);
            Swal.fire('Eliminado', 'El cliente ha sido eliminado.', 'success');
            loadClients();
        } catch (e) {
            console.error(e);
            Swal.fire('Error', 'No se pudo eliminar el cliente.', 'error');
        }
    }
}

// --- Barcode Generator Logic ---

let currentBarcodeBase64 = null;

function openBarcodeGenerator(btnElement) {
    const modal = new bootstrap.Modal(document.getElementById('barcodeGeneratorModal'));
    const textInput = document.getElementById('barcode-text');
    const previewImg = document.getElementById('barcode-preview-img');
    const previewPlaceholder = document.getElementById('barcode-preview-placeholder');
    const actions = document.getElementById('barcode-actions');
    const targetRow = document.getElementById('barcode-target-row');

    previewImg.style.display = 'none';
    previewPlaceholder.style.display = 'block';
    actions.style.display = 'none';
    currentBarcodeBase64 = null;

    if (btnElement) {
        const row = btnElement.closest('.variant-row');
        if (row) {
            const codeInput = row.querySelector('input[name="v-code"]');
            if (codeInput) {
                textInput.value = codeInput.value;
                targetRow.value = codeInput.name + '_' + Array.from(row.parentElement.children).indexOf(row);
            }
        }
    } else {
        textInput.value = '';
        targetRow.value = '';
    }

    modal.show();
    setTimeout(() => textInput.focus(), 300);
}

function onBarcodeTextChange() {
    const text = document.getElementById('barcode-text').value.trim();
    if (text.length > 1) {
        generateBarcode();
    }
}

async function generateBarcode() {
    const text = document.getElementById('barcode-text').value.trim();
    const type = document.getElementById('barcode-type').value;
    const scale = parseInt(document.getElementById('barcode-scale').value);

    if (!text) {
        Swal.fire('Atención', 'Ingrese un texto para codificar.', 'warning');
        return;
    }

    const previewImg = document.getElementById('barcode-preview-img');
    const previewPlaceholder = document.getElementById('barcode-preview-placeholder');
    const actions = document.getElementById('barcode-actions');

    previewImg.style.display = 'none';
    previewPlaceholder.style.display = 'block';
    previewPlaceholder.innerText = 'Generando...';

    try {
        const result = await window.electronAPI.generateBarcodeImage({ text, type, scale });

        if (result.success) {
            currentBarcodeBase64 = result.image;
            previewImg.src = 'data:image/png;base64,' + result.image;
            previewImg.style.display = 'block';
            previewPlaceholder.style.display = 'none';
            actions.style.display = 'flex';
        } else {
            previewPlaceholder.innerText = 'Error: ' + result.error;
            actions.style.display = 'none';
        }
    } catch (error) {
        console.error('Barcode generation error:', error);
        previewPlaceholder.innerText = 'Error al generar código.';
        actions.style.display = 'none';
    }
}

async function copyBarcodeImage() {
    if (!currentBarcodeBase64) return;

    try {
        const response = await fetch('data:image/png;base64,' + currentBarcodeBase64);
        const blob = await response.blob();
        await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
        ]);
        Swal.fire({
            toast: true, position: 'top-end',
            icon: 'success', title: 'Imagen copiada al portapapeles',
            timer: 1500, showConfirmButton: false
        });
    } catch (err) {
        console.error('Clipboard error:', err);
        Swal.fire('Error', 'No se pudo copiar la imagen al portapapeles.', 'error');
    }
}

function downloadBarcodeImage() {
    if (!currentBarcodeBase64) return;

    const text = document.getElementById('barcode-text').value.trim() || 'codigo';
    const link = document.createElement('a');
    link.download = `codigo_${text.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
    link.href = 'data:image/png;base64,' + currentBarcodeBase64;
    link.click();
}

async function copyBarcodeText() {
    const text = document.getElementById('barcode-text').value.trim();
    if (!text) return;

    try {
        await navigator.clipboard.writeText(text);
        Swal.fire({
            toast: true, position: 'top-end',
            icon: 'success', title: 'Texto copiado al portapapeles',
            timer: 1500, showConfirmButton: false
        });
    } catch (err) {
        console.error('Clipboard error:', err);
        Swal.fire('Error', 'No se pudo copiar el texto.', 'error');
    }
}

function assignBarcodeToVariant() {
    const text = document.getElementById('barcode-text').value.trim();
    if (!text) return;

    const targetRow = document.getElementById('barcode-target-row').value;
    const variantRows = document.querySelectorAll('.variant-row');

    if (targetRow) {
        const parts = targetRow.split('_');
        const idx = parseInt(parts[1]);
        if (!isNaN(idx) && variantRows[idx]) {
            const input = variantRows[idx].querySelector('input[name="v-code"]');
            if (input) {
                input.value = text;
                Swal.fire({
                    toast: true, position: 'top-end',
                    icon: 'success', title: 'Código asignado a la variante',
                    timer: 1500, showConfirmButton: false
                });
                const modal = bootstrap.Modal.getInstance(document.getElementById('barcodeGeneratorModal'));
                if (modal) modal.hide();
                return;
            }
        }
    }

    const options = [];
    variantRows.forEach((row, i) => {
        const nameInput = row.querySelector('input[name="v-name"]');
        const codeInput = row.querySelector('input[name="v-code"]');
        const name = nameInput ? nameInput.value : `Variante ${i + 1}`;
        const code = codeInput ? codeInput.value : '';
        options.push({ index: i, name, code });
    });

    if (options.length === 0) {
        Swal.fire('Atención', 'No hay variantes para asignar el código.', 'info');
        return;
    }

    let html = '<div class="list-group text-start">';
    options.forEach((opt, i) => {
        html += `
            <button class="list-group-item list-group-item-action" onclick="assignToVariantIndex(${i})">
                <div class="d-flex justify-content-between align-items-center">
                    <span class="fw-bold">${opt.name}</span>
                    <small class="text-muted">${opt.code || '(vacío)'}</small>
                </div>
            </button>
        `;
    });
    html += '</div>';

    window._barcodeVariantOptions = options;
    Swal.fire({
        title: 'Seleccione variante',
        html: html,
        showConfirmButton: false,
        showCloseButton: true,
        width: '400px'
    });
}

function assignToVariantIndex(optIndex) {
    const text = document.getElementById('barcode-text').value.trim();
    const options = window._barcodeVariantOptions;
    if (!options || !options[optIndex]) return;

    const variantRows = document.querySelectorAll('.variant-row');
    const row = variantRows[options[optIndex].index];
    if (row) {
        const input = row.querySelector('input[name="v-code"]');
        if (input) {
            input.value = text;
            Swal.close();
            Swal.fire({
                toast: true, position: 'top-end',
                icon: 'success', title: 'Código asignado a la variante',
                timer: 1500, showConfirmButton: false
            });
            const modal = bootstrap.Modal.getInstance(document.getElementById('barcodeGeneratorModal'));
            if (modal) modal.hide();
        }
    }
}
