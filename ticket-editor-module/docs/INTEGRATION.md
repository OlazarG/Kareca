# Guía Completa de Integración - Ticket Editor Module

## Paso 1: Preparar el proyecto destino

### 1.1 Copiar archivos

```bash
# Desde la raíz del proyecto destino
cp -r ticket-editor-module/src ./
cp -r ticket-editor-module/assets ./
```

### 1.2 Estructura esperada en proyecto destino

```
tu-proyecto/
├── src/
│   ├── services/
│   │   ├── ticketTemplateRenderer.js
│   │   ├── ticketTemplateStore.js
│   │   └── ticketTemplate.json
│   ├── routes/
│   │   └── ticketTemplate.js
│   ├── views/
│   │   ├── index.html
│   │   └── renderer.js
│   └── database/
│       └── db.js
├── assets/
│   └── logo.png
└── package.json
```

## Paso 2: Backend - Express.js

### 2.1 Registrar rutas

En tu archivo principal de Express (ej: `server.js`):

```javascript
const express = require('express');
const app = express();

// Otras rutas...

// Registrar rutas de ticket
const ticketRoutes = require('./src/routes/ticketTemplate');
app.use('/api/ticket', ticketRoutes);

app.listen(3000, () => console.log('Servidor escuchando en puerto 3000'));
```

### 2.2 Verificar base de datos

La tabla `ticket_templates` debe existir en PostgreSQL. Si no, créala:

```sql
CREATE TABLE IF NOT EXISTS ticket_templates (
    id VARCHAR(100) PRIMARY KEY,
    template_json JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2.3 Middleware requerido

El módulo espera que estas funciones estén disponibles:

```javascript
// En tu middleware de autenticación
const verifyToken = require('./middleware/auth');
const requirePermission = require('./middleware/auth');

// Aplica a las rutas de ticket
app.use('/api/ticket', verifyToken);
```

## Paso 3: Frontend - HTML

### 3.1 Agregar dependencias en `<head>`

```html
<head>
    <!-- Bootstrap 5 -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <!-- Bootstrap Icons -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css">
    <!-- SweetAlert2 -->
    <link href="https://cdn.jsdelivr.net/npm/sweetalert2@11.10.0/dist/sweetalert2.min.css" rel="stylesheet">
    
    <!-- Estilos del editor -->
    <link rel="stylesheet" href="styles/ticket-editor.css">
</head>
```

### 3.2 Estructura HTML esperada

En tu `index.html`, necesitas:

```html
<body>
    <!-- Sección principal del editor -->
    <div id="ticket-section" style="display:none;">
        <!-- El contenido se inyecta vía JavaScript -->
    </div>

    <!-- Scripts de utilidad -->
    <script>
        // Función para mostrar/ocultar secciones
        function showSection(sectionId) {
            document.querySelectorAll('[id$="-section"]').forEach(el => {
                el.style.display = 'none';
            });
            if (sectionId) {
                document.getElementById(sectionId + '-section').style.display = 'block';
            }
        }
    </script>

    <!-- Scripts externos -->
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11.10.0/dist/sweetalert2.all.min.js"></script>

    <!-- Scripts del módulo -->
    <script src="src/services/ticketTemplateStore.js"></script>
    <script src="src/services/ticketTemplateRenderer.js"></script>
    <script src="js/ticket-editor.js"></script>
    
    <!-- Script principal (renderer.js o equivalent) -->
    <script src="js/renderer.js"></script>
</body>
```

## Paso 4: Frontend - JavaScript

### 4.1 Crear `js/ticket-editor.js`

Este archivo contiene toda la lógica del editor. Aquí está la estructura básica:

```javascript
// Variables globales
let ticketTemplate = null;

// Cargar la sección de ticket al mostrar
async function loadTicketSection() {
    try {
        // Inyectar HTML del editor
        const sectionHtml = `
            <div class="d-flex justify-content-between align-items-center mb-4">
                <h2 class="fw-bold">Editor de Ticket</h2>
                <div class="d-flex gap-2">
                    <button class="btn btn-success" onclick="saveTicketTemplate()">Guardar</button>
                </div>
            </div>
            <div class="row">
                <div class="col-lg-6">
                    <!-- Panel de configuración -->
                </div>
                <div class="col-lg-6">
                    <!-- Vista previa -->
                </div>
            </div>
        `;
        
        const section = document.getElementById('ticket-section');
        section.innerHTML = sectionHtml;
        
        // Cargar plantilla existente
        ticketTemplate = await loadTicketTemplate();
        renderTicketEditor();
        initTicketImageDropzone();
        
    } catch (e) {
        console.error('Error al cargar sección de ticket:', e);
        Swal.fire('Error', 'No se pudo cargar el editor de ticket', 'error');
    }
}

// Llamar cuando navegas a la sección
function showTicketEditor() {
    showSection('ticket');
    loadTicketSection();
}
```

### 4.2 Integrar con Electron (si aplica)

En `preload.js`:

```javascript
const { ipcRenderer } = require('electron');

window.electronAPI = {
    // ... otras APIs ...
    
    getTicketTemplate: () => ipcRenderer.invoke('get-ticket-template'),
    saveTicketTemplate: (template) => ipcRenderer.invoke('save-ticket-template', template),
    resetTicketTemplate: () => ipcRenderer.invoke('reset-ticket-template'),
    previewTicket: (template, data) => ipcRenderer.invoke('preview-ticket', template, data),
};
```

En `main.js`:

```javascript
const { ipcMain } = require('electron');
const db = require('./src/database/db');

ipcMain.handle('get-ticket-template', async () => {
    return await db.getTicketTemplate();
});

ipcMain.handle('save-ticket-template', async (event, template) => {
    return await db.saveTicketTemplate(template);
});

// ... más handlers ...
```

## Paso 5: Base de datos - Node.js con PostgreSQL

### 5.1 Agregar funciones en `src/database/db.js`

```javascript
async function getTicketTemplate() {
    try {
        const res = await pool.query(
            'SELECT template_json FROM ticket_templates WHERE id = $1',
            ['default']
        );
        return res.rows[0]?.template_json || getDefaultTicketTemplate();
    } catch (e) {
        console.error('Error getting ticket template:', e);
        return getDefaultTicketTemplate();
    }
}

async function saveTicketTemplate(template) {
    try {
        await pool.query(
            `INSERT INTO ticket_templates (id, template_json, updated_at)
             VALUES ($1, $2, CURRENT_TIMESTAMP)
             ON CONFLICT(id) DO UPDATE SET template_json = $2, updated_at = CURRENT_TIMESTAMP`,
            ['default', JSON.stringify(template)]
        );
        return { success: true };
    } catch (e) {
        console.error('Error saving ticket template:', e);
        throw e;
    }
}

function getDefaultTicketTemplate() {
    return require('../services/ticketTemplate.json');
}

module.exports = { getTicketTemplate, saveTicketTemplate, /* ... */ };
```

## Paso 6: Usar la plantilla para imprimir

### 6.1 En la función de impresión

```javascript
async function printTicketFromSale(saleData) {
    try {
        // Obtener plantilla actual
        const template = ticketTemplate || await loadTicketTemplate();
        
        // Preparar datos para imprimir
        const ticketData = {
            storeName: 'Mi Tienda',
            date: new Date().toLocaleString('es-AR'),
            items: saleData.items,
            total: saleData.total,
            method: saleData.method,
            voucherNumber: saleData.voucherNumber || '',
            change: saleData.change || 0,
            received: saleData.received || saleData.total
        };
        
        // Render y imprimir
        const ticketHtml = renderTicketForPrint(template, ticketData);
        
        if (window.electronAPI?.printTicket) {
            const res = await window.electronAPI.printTicket(ticketData);
            if (res.success) {
                console.log('Ticket impreso');
            }
        } else {
            // Fallback a navegador
            window.print();
        }
        
    } catch (e) {
        console.error('Error printing:', e);
        Swal.fire('Error', 'No se pudo imprimir el ticket', 'error');
    }
}
```

## Paso 7: Menú de navegación

### 7.1 Agregar enlace en sidebar/navbar

```html
<!-- En sidebar o menú principal -->
<a href="#" onclick="showTicketEditor()" id="nav-ticket-editor">
    <i class="bi bi-receipt-cutoff me-2"></i>Editor de Ticket
</a>
```

## Troubleshooting

### Problema: "window.electronAPI is undefined"

**Solución**: Verifica que `preload.js` está siendo cargado en `BrowserWindow`:

```javascript
const mainWindow = new BrowserWindow({
    webPreferences: {
        preload: path.join(__dirname, 'src/preload.js')
    }
});
```

### Problema: "Cannot find module 'ticketTemplate.json'"

**Solución**: Asegúrate que el archivo existe en `src/services/ticketTemplate.json`

### Problema: "API endpoint not found (404)"

**Solución**: Verifica que las rutas estén registradas en Express:

```javascript
// Revisar en server.js
console.log('Rutas registradas:', app._router.stack.map(r => r.route?.path || r.name));
```

### Problema: Las imágenes no se muestran

**Solución**: 

1. Verifica que el archivo existe en `assets/`
2. Comprueba que la ruta es relativa correctamente
3. Revisa los permisos de lectura

## Testing

### Test básico

```javascript
// En consola del navegador
loadTicketSection();
showSection('ticket');

// Verificar que se cargó
console.log(ticketTemplate);
```

### Test de guardado

```javascript
// Hacer cambios en el editor
// Luego ejecutar:
await saveTicketTemplate();
// Verificar en la BD que se guardó
```

## Ejemplos completos

Ver carpeta `examples/` en el repositorio para implementaciones de referencia.
