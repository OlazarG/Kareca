# Ejemplos de uso - Ticket Editor Module

## Ejemplo 1: Integración mínima en un proyecto Express + Node.js

### Paso 1: Instalar dependencias

```bash
npm install express pg bootstrap
```

### Paso 2: Copiar archivos

```bash
cp -r ticket-editor-module/src ./
cp -r ticket-editor-module/assets ./
```

### Paso 3: Crear servidor

**server.js**:
```javascript
const express = require('express');
const app = express();

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Base de datos
const db = require('./src/database/db');

// Crear tabla de plantillas
db.pool.query(`
    CREATE TABLE IF NOT EXISTS ticket_templates (
        id VARCHAR(100) PRIMARY KEY,
        template_json JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`);

// Rutas
const ticketRoutes = require('./src/routes/ticketTemplate');
app.use('/api/ticket', ticketRoutes);

app.listen(3000, () => console.log('Servidor en puerto 3000'));
```

### Paso 4: HTML

**public/index.html**:
```html
<!DOCTYPE html>
<html>
<head>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css">
    <link href="https://cdn.jsdelivr.net/npm/sweetalert2@11.10.0/dist/sweetalert2.min.css" rel="stylesheet">
</head>
<body>
    <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
        <div class="container-fluid">
            <a class="navbar-brand" href="#">Mi Tienda</a>
        </div>
    </nav>

    <!-- Sección del editor -->
    <div id="ticket-section" style="display:none;"></div>

    <!-- Botón para abrir editor -->
    <div class="container mt-5">
        <button class="btn btn-primary" onclick="showTicketEditor()">
            Abrir Editor de Ticket
        </button>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11.10.0/dist/sweetalert2.all.min.js"></script>
    <script src="src/services/ticketTemplateStore.js"></script>
    <script src="src/services/ticketTemplateRenderer.js"></script>
    <script src="js/ticket-editor.js"></script>
</body>
</html>
```

## Ejemplo 2: Uso en Electron + React

### Integración en componente React

**src/components/TicketEditor.jsx**:
```jsx
import React, { useState, useEffect } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';

function TicketEditor() {
    const [template, setTemplate] = useState(null);

    useEffect(() => {
        // Cargar plantilla al montar
        loadTemplate();
    }, []);

    async function loadTemplate() {
        try {
            const data = await window.electronAPI.getTicketTemplate();
            setTemplate(data);
        } catch (e) {
            console.error('Error loading template:', e);
        }
    }

    async function handleSave() {
        try {
            await window.electronAPI.saveTicketTemplate(template);
            alert('Plantilla guardada exitosamente');
        } catch (e) {
            alert('Error al guardar: ' + e.message);
        }
    }

    if (!template) return <div>Cargando...</div>;

    return (
        <div className="container-fluid p-4">
            <div className="row">
                <div className="col-md-6">
                    <h3>Configuración</h3>
                    {/* Panel de configuración */}
                </div>
                <div className="col-md-6">
                    <h3>Vista Previa</h3>
                    {/* Vista previa */}
                </div>
            </div>
            <button className="btn btn-success mt-4" onClick={handleSave}>
                Guardar
            </button>
        </div>
    );
}

export default TicketEditor;
```

## Ejemplo 3: Imprimir ticket con plantilla personalizada

### Función completa de impresión

```javascript
async function imprimirTicketCompleto(venta) {
    try {
        // Obtener plantilla
        const template = await window.electronAPI.getTicketTemplate();
        
        // Preparar datos
        const ticketData = {
            storeName: 'Cerámica Café',
            date: new Date().toLocaleString('es-AR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            }),
            items: venta.items.map(item => ({
                name: item.producto,
                variant: item.variante,
                qty: item.cantidad,
                price: item.precio,
                subtotal: item.cantidad * item.precio
            })),
            subtotal: venta.subtotal,
            iva: venta.iva,
            total: venta.total,
            method: venta.metodo_pago,
            voucherNumber: venta.numero_comprobante || '',
            change: venta.vuelto || 0,
            received: venta.monto_recibido || venta.total,
            observation: venta.observacion || ''
        };

        // Renderizar ticket con plantilla
        const ticketHtml = renderTicketPreview(template, ticketData);
        
        // Imprimir
        if (window.electronAPI?.printTicket) {
            const result = await window.electronAPI.printTicket({
                ...ticketData,
                template: template
            });
            
            if (result.success) {
                Swal.fire({
                    icon: 'success',
                    title: 'Ticket impreso',
                    timer: 1500
                });
            } else {
                throw new Error(result.error);
            }
        }

    } catch (e) {
        Swal.fire('Error al imprimir', e.message, 'error');
    }
}
```

## Ejemplo 4: Personalización de estilo

### Crear tu propio CSS

**assets/custom-styles.css**:
```css
/* Heredar estilos base */
@import url('ticket-editor.css');

/* Personalizar para tu marca */
.ticket-section-card {
    border-left-color: #FF6B6B !important;
}

.ticket-preview {
    background: linear-gradient(135deg, #f5f5f5 0%, #fff 100%);
    padding: 16px;
    border-radius: 8px;
}

/* Colores de tu marca */
:root {
    --primary-color: #FF6B6B;
    --secondary-color: #4ECDC4;
}

.btn-success {
    background-color: var(--primary-color) !important;
    border-color: var(--primary-color) !important;
}
```

## Ejemplo 5: Variables personalizadas en plantilla

### Template con variables custom

```json
{
  "version": "2.0",
  "sections": [
    {
      "type": "text",
      "content": "{storeName}",
      "align": "center",
      "bold": true,
      "fontSize": "large"
    },
    {
      "type": "text",
      "content": "Atención al cliente: {customerService}",
      "align": "center",
      "fontSize": "small"
    },
    {
      "type": "divider"
    },
    {
      "type": "table",
      "template": "{name} x{qty}  {price}"
    },
    {
      "type": "text",
      "content": "TOTAL: {total}",
      "align": "right",
      "bold": true
    },
    {
      "type": "text",
      "content": "Gracias por su compra!",
      "align": "center"
    }
  ]
}
```

### Usar variables personalizadas

```javascript
const ticketData = {
    storeName: 'Mi Tienda',
    customerService: '+54 9 1234-5678',  // Variable personalizada
    total: 1500,
    items: []
};
```

## Ejemplo 6: Exportar/Importar plantillas

### Exportar

```javascript
async function exportarPlantilla() {
    const template = await window.electronAPI.getTicketTemplate();
    const dataStr = JSON.stringify(template, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ticket-template-${new Date().toISOString()}.json`;
    link.click();
}
```

### Importar

```javascript
async function importarPlantilla(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const template = JSON.parse(e.target.result);
            await window.electronAPI.saveTicketTemplate(template);
            Swal.fire('Éxito', 'Plantilla importada', 'success');
        } catch (error) {
            Swal.fire('Error', 'Archivo inválido', 'error');
        }
    };
    reader.readAsText(file);
}
```

## Ejemplo 7: Testing automatizado

```javascript
// test-ticket-editor.js
async function runTests() {
    console.log('Iniciando tests...');
    
    // Test 1: Cargar plantilla
    try {
        const template = await window.electronAPI.getTicketTemplate();
        console.log('✓ Plantilla cargada correctamente');
    } catch (e) {
        console.error('✗ Error al cargar plantilla:', e);
    }
    
    // Test 2: Guardar cambios
    try {
        const modified = { ...template, version: '2.1' };
        await window.electronAPI.saveTicketTemplate(modified);
        console.log('✓ Plantilla guardada correctamente');
    } catch (e) {
        console.error('✗ Error al guardar:', e);
    }
    
    // Test 3: Renderizar preview
    try {
        const preview = await renderTicketPreview(template, { total: 100 });
        console.log('✓ Preview rendereado correctamente');
    } catch (e) {
        console.error('✗ Error al renderizar:', e);
    }
    
    console.log('Tests completados');
}
```

## Más ejemplos

Para más ejemplos y casos de uso, consulta:
- `docs/INTEGRATION.md` - Guía completa de integración
- `README.md` - Documentación general
- `examples/` - Proyectos de referencia completos
