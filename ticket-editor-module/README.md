# Ticket Editor Module

Módulo independiente para editar plantillas de tickets térmicos. Permite personalizar formato, tamaño, posición y fuentes de forma visual en tiempo real.

## Contenido del Módulo

```
ticket-editor-module/
├── src/
│   ├── services/
│   │   ├── ticketTemplateRenderer.js    # Renderizador de tickets
│   │   ├── ticketTemplateStore.js       # Almacenamiento de plantillas
│   │   └── ticketTemplate.json          # Plantilla por defecto
│   ├── routes/
│   │   └── ticketTemplate.js            # Rutas API del backend
│   └── index.html                       # Interfaz del editor
├── assets/
│   └── logo.png                         # Logo de ejemplo
├── docs/
│   └── INTEGRATION.md                   # Guía de integración
└── README.md                            # Este archivo
```

## Características

- ✅ Editor visual en tiempo real
- ✅ Soporte para múltiples tipos de secciones (texto, imagen, tabla)
- ✅ Configuración de tamaño de rollo (80mm, 80mm alta densidad, 58mm)
- ✅ Arrastrar y soltar imágenes
- ✅ Vista previa con zoom ajustable
- ✅ Guardado y restauración de plantillas
- ✅ Impresión de prueba

## Requisitos

### Frontend
- Bootstrap 5.x
- Bootstrap Icons (BI)
- Electron (opcional, para IPC)
- SweetAlert2 (para modales)

### Backend
- Express.js
- PostgreSQL (o adaptable a otras BD)
- Middleware de autenticación y permisos

## Instalación Rápida

### 1. Copiar archivos al proyecto

```bash
# En tu proyecto destino
cp -r ticket-editor-module/src .
cp -r ticket-editor-module/assets .
```

### 2. Registrar la ruta en el backend (Express)

```javascript
// En tu archivo de rutas principal
const ticketRoutes = require('./routes/ticketTemplate');
app.use('/api/ticket', ticketRoutes);
```

### 3. Incluir en tu HTML principal

```html
<!-- En el <head> -->
<link rel="stylesheet" href="styles/ticket-editor.css">

<!-- En el <body> -->
<div id="ticket-section" style="display:none;">
    <!-- Contenido del editor -->
</div>

<!-- Scripts -->
<script src="services/ticketTemplateStore.js"></script>
<script src="services/ticketTemplateRenderer.js"></script>
<script src="js/ticket-editor.js"></script>
```

### 4. Disponibilizar API si usas Electron

```javascript
// En preload.js
electronAPI: {
    getTicketTemplate: () => ipcRenderer.invoke('get-ticket-template'),
    saveTicketTemplate: (template) => ipcRenderer.invoke('save-ticket-template', template),
    resetTicketTemplate: () => ipcRenderer.invoke('reset-ticket-template'),
    previewTicket: (template, data) => ipcRenderer.invoke('preview-ticket', template, data),
}
```

## Uso

### Mostrar el editor

```javascript
showSection('ticket'); // Asume que tienes una función showSection
```

### Cargar plantilla existente

```javascript
const template = await loadTicketTemplate();
ticketTemplate = template;
renderTicketEditor();
```

### Guardar cambios

```javascript
await saveTicketTemplate();
```

### Usar la plantilla para imprimir

```javascript
const ticketData = {
    storeName: 'Mi Tienda',
    items: [{name: 'Producto', qty: 2, price: 100}],
    total: 200,
    date: new Date().toLocaleString(),
    voucherNumber: '123456'
};

const preview = await window.electronAPI.previewTicket(ticketTemplate, ticketData);
```

## Estructura de la Plantilla

```json
{
  "id": "default",
  "version": "2.0",
  "paperWidth": 384,
  "lineWidth": 42,
  "sections": [
    {
      "type": "text",
      "content": "{storeName}",
      "align": "center",
      "fontSize": "large",
      "bold": true
    },
    {
      "type": "table",
      "template": "{name} x{qty}  {price}",
      "align": "left"
    },
    {
      "type": "image",
      "imagePath": "logo.png",
      "width": 100
    }
  ]
}
```

## Variables disponibles en templates

- `{storeName}` - Nombre de la tienda
- `{date}` - Fecha y hora
- `{items}` - Lista de productos (para tablas)
- `{total}` - Total de venta
- `{method}` - Método de pago
- `{voucherNumber}` - Número de comprobante
- `{change}` - Cambio
- `{received}` - Monto recibido

## Personalización

### Agregar nuevos tipos de sección

En `ticketTemplateRenderer.js`, agrega un nuevo tipo en `renderSection()`:

```javascript
case 'customType':
    // Tu lógica aquí
    break;
```

### Cambiar estilos

Los estilos están en `assets/ticket-editor.css`. Personaliza según tu marca.

### Agregar campos personalizados

Modifica `ticketTemplate.json` con tus campos específicos.

## Solución de problemas

### Las imágenes no se muestran
- Verifica que la ruta sea correcta
- Asegúrate de que el archivo existe en `assets/`
- Comprueba los permisos de lectura

### El ticket se ve angosto al imprimir
- Cambia el tipo de rollo a "80mm Alta densidad (576px, 64c)"
- Aumenta el ancho en píxeles

### Los cambios no se guardan
- Verifica que la ruta POST `/api/ticket/template` está registrada
- Comprueba que tienes permisos de escritura en la BD

## Licencia

MIT - Libre para usar en tus proyectos

## Soporte

Para problemas, consulta la guía de integración completa en `docs/INTEGRATION.md`
