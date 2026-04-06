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

document.addEventListener('DOMContentLoaded', () => {
    setupCurrencyInputs();

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
        <td><input type="text" class="form-control" required name="v-code" placeholder="Código" value="${code}"></td>
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
            <td><input type="text" class="form-control" required name="v-code" placeholder="Escanee Código"></td>
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
                <td><input type="text" class="form-control" value="${v.barcode}" required name="v-code"></td>
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

    const saleData = {
        items: cart,
        total: currentTotal,
        method: method,
        user: 'Cajero Default', // TODO: User Login
        clientName: 'CLIENTE OCASIONAL', // TODO: Client Input
        observation: document.getElementById('pos-observation').value // Send Observation
    };

    try {
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
                storeName: 'BODEGA K-RECA',
                items: saleData.items,
                total: saleData.total,
                method: saleData.method,
                date: new Date().toLocaleString('es-PY')
            };

            // Fire and forget print (don't await strictly to block UI, but good to know if it fails)
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
            document.getElementById('pos-search').focus();
            loadPosHistory(); // Refresh mini-history
        }
    } catch (error) {
        console.error("Sale Error", error);
        // Show detailed error for debugging
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

            // Update Cards
            document.getElementById('close-expected-cash').innerText = formatCurrency(expectedPhysical);
            document.getElementById('close-expected-digital').innerText = formatCurrency(expectedDigital);
            document.getElementById('close-expected-total').innerText = formatCurrency(expectedTotal);

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
    const valid = expectedPhysical;
    const input = document.getElementById('caja-final-amount');
    const actual = parseCurrency(input.value);

    const diff = actual - valid;
    const diffDisplay = document.getElementById('close-diff-display');

    if (actual === 0 && input.value === '') {
        diffDisplay.innerText = '-';
        diffDisplay.classList.remove('text-success', 'text-danger');
        return;
    }

    if (diff === 0) {
        diffDisplay.innerText = 'Perfecto (0)';
        diffDisplay.classList.remove('text-danger');
        diffDisplay.classList.add('text-success');
    } else if (diff > 0) {
        diffDisplay.innerText = `Sobra: ${formatCurrency(diff)}`;
        diffDisplay.classList.remove('text-danger');
        diffDisplay.classList.add('text-success');
    } else {
        diffDisplay.innerText = `Falta: ${formatCurrency(Math.abs(diff))}`;
        diffDisplay.classList.remove('text-success');
        diffDisplay.classList.add('text-danger');
    }
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
    const notes = document.getElementById('close-notes').value;

    if (isNaN(finalCash) || finalCash < 0) {
        Swal.fire('Error', 'Monto inválido', 'error');
        return;
    }

    // Confirmation
    const diff = finalCash - expectedPhysical;
    let warning = '';
    if (diff !== 0) {
        warning = diff < 0 ? `Atención: Falta ${formatCurrency(Math.abs(diff))}` : `Atención: Sobra ${formatCurrency(diff)}`;
    }

    const confirm = await Swal.fire({
        title: '¿Confirmar Cierre?',
        html: `Declarado: <b>${formatCurrency(finalCash)}</b><br>${warning}<br><small>Se guardará la sesión.</small>`,
        icon: diff === 0 ? 'question' : 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, Cerrar',
        cancelButtonText: 'Cancelar'
    });

    if (!confirm.isConfirmed) return;

    try {
        // Note: passing Notes? Backend closeRegister might need update to store notes in description if desired.
        // Current backend puts Diff in description. We can append notes.
        // But closeRegister signature is (finalCash, user).
        // Let's update backend signature later if we want to save notes specifically?
        // OR just pass notes as User for now? No, that's hacky.
        // For now, ignoring notes in backend, just local logging.
        // Ideally we update backend closeRegister to accept description/notes.

        const result = await window.electronAPI.closeRegister(finalCash, 'Admin');

        await Swal.fire({
            title: 'Caja Cerrada',
            text: 'Turno finalizado exitosamente.',
            icon: 'success'
        });

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
                const items = JSON.parse(detailsJson);
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
            const allItems = JSON.parse(detailsJson);
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
        try {
            items = JSON.parse(sale.details_json || '[]');
        } catch (e) {
            console.error("Error parsing details for reprint", e);
        }

        if (items.length === 0) {
            Swal.fire('Aviso', 'Esta venta es antigua y no tiene detalle de productos para reimprimir.', 'warning');
            return;
        }

        const ticketData = {
            storeName: 'BODEGA K-RECA',
            items: items,
            total: sale.amount,
            method: sale.payment_method,
            date: new Date(sale.date).toLocaleString('es-PY')
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
