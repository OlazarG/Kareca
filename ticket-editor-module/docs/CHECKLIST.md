# Checklist de Integración - Ticket Editor Module

Usa este checklist al integrar el módulo en un nuevo proyecto.

## 📋 Pre-integración

- [ ] Verificas que el proyecto tiene Express.js instalado
- [ ] Verificas que el proyecto tiene PostgreSQL disponible
- [ ] Verificas que el proyecto tiene Bootstrap 5 en el HTML

## 🔧 Paso 1: Copiar archivos

### Backend
- [ ] Copias `ticket-editor-module/src/services/ticketTemplate*.js` a `src/services/`
- [ ] Copias `ticket-editor-module/src/services/ticketTemplate.json` a `src/services/`
- [ ] Copias `ticket-editor-module/src/routes/ticketTemplate.js` a `src/routes/`

### Frontend
- [ ] Copias `ticket-editor-module/assets/logo.png` a `assets/` (u otra carpeta)

### Documentación
- [ ] Guardas `docs/INTEGRATION.md` para referencia
- [ ] Guardas `docs/EXAMPLE_USAGE.md` para ejemplos

## 🗄️ Paso 2: Base de datos

- [ ] Creas tabla `ticket_templates` en PostgreSQL:
  ```sql
  CREATE TABLE IF NOT EXISTS ticket_templates (
      id VARCHAR(100) PRIMARY KEY,
      template_json JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  ```

- [ ] Verificas que la conexión PostgreSQL está configurada en tu proyecto

## 🚀 Paso 3: Backend - Express

### Registrar rutas
- [ ] Abres `server.js` o equivalente
- [ ] Importas las rutas:
  ```javascript
  const ticketRoutes = require('./src/routes/ticketTemplate');
  ```
- [ ] Registras en la app:
  ```javascript
  app.use('/api/ticket', ticketRoutes);
  ```

### Verificar autenticación
- [ ] Verificas que `verifyToken` está disponible en `ticketTemplate.js`
- [ ] Verificas que `requirePermission` está disponible
- [ ] Ajustas los nombres de funciones si es necesario

## 💻 Paso 4: Frontend - HTML

### Incluir dependencias en `<head>`
- [ ] Bootstrap CSS:
  ```html
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  ```
- [ ] Bootstrap Icons:
  ```html
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css">
  ```
- [ ] SweetAlert2:
  ```html
  <link href="https://cdn.jsdelivr.net/npm/sweetalert2@11.10.0/dist/sweetalert2.min.css" rel="stylesheet">
  ```

### Incluir estructura HTML
- [ ] Copias la sección `<div id="ticket-section">` del archivo original a tu `index.html`
- [ ] Verificas que todos los `id` sean únicos en tu página

### Incluir scripts antes de `</body>`
- [ ] Scripts externos:
  ```html
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11.10.0/dist/sweetalert2.all.min.js"></script>
  ```

- [ ] Scripts del módulo:
  ```html
  <script src="src/services/ticketTemplateStore.js"></script>
  <script src="src/services/ticketTemplateRenderer.js"></script>
  <script src="js/ticket-editor.js"></script>
  ```

## 🧠 Paso 5: JavaScript - Funciones principales

### Crear `js/ticket-editor.js` con:

- [ ] Variable global: `let ticketTemplate = null;`
- [ ] Función: `loadTicketSection()`
- [ ] Función: `showTicketEditor()`
- [ ] Función: `showSection(id)` (si no existe)
- [ ] Función: `renderTicketEditor()` (verificas en renderer.js del original)
- [ ] Función: `saveTicketTemplate()` (verificas en renderer.js del original)

### En tu `renderer.js` principal:

- [ ] Importas las funciones de ticket
- [ ] Llamas a `loadTicketSection()` cuando cargas la sección de ticket
- [ ] Verificas que `window.electronAPI` está definido (si usas Electron)

## 🖥️ Paso 6: Electron (si aplica)

### En `preload.js`
- [ ] Expones API de ticket:
  ```javascript
  getTicketTemplate: () => ipcRenderer.invoke('get-ticket-template'),
  saveTicketTemplate: (t) => ipcRenderer.invoke('save-ticket-template', t),
  ```

### En `main.js`
- [ ] Registras handlers de IPC:
  ```javascript
  ipcMain.handle('get-ticket-template', () => db.getTicketTemplate());
  ipcMain.handle('save-ticket-template', (e, t) => db.saveTicketTemplate(t));
  ```

## 🧪 Paso 7: Testing

### Test 1: Cargar plantilla
- [ ] Abres la consola (F12)
- [ ] Ejecutas: `await window.electronAPI.getTicketTemplate()` o `await loadTicketTemplate()`
- [ ] Verificas que retorna un objeto con `sections`

### Test 2: Mostrar editor
- [ ] Ejecutas: `showTicketEditor()`
- [ ] Verificas que aparece la interfaz de editor

### Test 3: Realizar cambio
- [ ] Cambias algo en el editor (ej: ancho de rollo)
- [ ] Verificas que la vista previa se actualiza

### Test 4: Guardar
- [ ] Haces clic en "Guardar"
- [ ] Verificas en consola que no hay errores
- [ ] Recarcas la página
- [ ] Verificas que los cambios persisten

## 📱 Paso 8: Usar en impresión

### En función de imprimir:
- [ ] Cargas la plantilla: `const template = await loadTicketTemplate();`
- [ ] Preparas datos de venta
- [ ] Llamas a `printTicketFromEditor()` o similar
- [ ] Verificas que se imprime con la plantilla personalizada

## 🎨 Paso 9: Personalización (opcional)

- [ ] Ajustas estilos CSS en `ticket-editor.css`
- [ ] Cambias colores de marca en variables CSS
- [ ] Modifica logo en `assets/`
- [ ] Ajusta estructura de plantilla por defecto en `ticketTemplate.json`

## 🐛 Paso 10: Debugging

Si algo no funciona:

### Verificar rutas
- [ ] `curl http://localhost:3000/api/ticket/template` (debería retornar JSON)
- [ ] Verificas en `network` del navegador (F12)

### Verificar scripts
- [ ] Abres consola (F12)
- [ ] Ejecutas: `typeof ticketTemplateStore` (debería ser "object")
- [ ] Ejecutas: `typeof ticketTemplateRenderer` (debería ser "object")

### Verificar BD
- [ ] Conectas a PostgreSQL: `psql -U postgres -d tu_db`
- [ ] Consultas: `SELECT * FROM ticket_templates;`
- [ ] Verificas que la tabla existe y tiene datos

### Verificar configuración
- [ ] Revisa logs del servidor: `npm run dev` con nodemon
- [ ] Busca errores en consola del navegador
- [ ] Revisa `docs/INTEGRATION.md` sección Troubleshooting

## ✅ Verificación final

- [ ] El editor carga sin errores
- [ ] Puedes hacer cambios en el editor
- [ ] La vista previa se actualiza en tiempo real
- [ ] Los cambios se guardan en la BD
- [ ] El ticket se imprime con la plantilla personalizada
- [ ] Los cambios persisten después de recargar

## 📞 En caso de problemas

1. **Mensaje de error específico**: Busca en `docs/INTEGRATION.md` sección "Troubleshooting"
2. **No encuentras solución**: Revisa `docs/EXAMPLE_USAGE.md` para ejemplos similares
3. **Aún sin resolver**: Verifica que seguiste todos los pasos de este checklist

## 🎉 ¡Completado!

Cuando marques todos los ✅, el módulo de ticket editor está completamente integrado y funcional en tu proyecto.

---

**Tiempo estimado**: 30-60 minutos
**Dificultad**: Media
**Soporte**: Consulta documentación incluida
