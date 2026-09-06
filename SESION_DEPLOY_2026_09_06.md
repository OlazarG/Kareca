# Sesión de Deploy - 6 de Septiembre 2026

## ✅ RESUMEN EJECUTIVO

Deploy exitoso de K-RECA al Droplet con:
- ✅ Voucher Number para tarjetas
- ✅ Editor de Tickets (módulo independiente)
- ✅ Sistema de permisos
- ✅ Logo en UI
- ✅ Reportes mejorados

## 🎯 CAMBIOS PRINCIPALES

### 1. Voucher Number (TC/TD)
- Columna `voucher_number` agregada a `movements`
- Se captura en punto de venta
- Se muestra en reportes

### 2. Editor de Tickets - Módulo Independiente
- Ubicación: `ticket-editor-module/`
- Totalmente reutilizable en otros proyectos
- Documentación completa incluida

### 3. Permisos para Editor
- Nuevo permiso: `editar_ticket_template`
- Admin tiene acceso por defecto
- Menú se oculta para usuarios sin permiso
- API protegida con `requirePermission()`

### 4. UI Improvements
- Logo en login (120px) y sidebar (80px)
- Reportes de mesa muestran items: "Café x2, Postre x1 [Mesa 1]"

## 🚀 ESTADO ACTUAL

| Componente | Status | Notas |
|-----------|--------|-------|
| Git Pull | ✅ | /var/www/kareca actualizado |
| BD Migraciones | ✅ | voucher_number, permisos OK |
| Logo | ✅ | Visible en login y sidebar |
| Editor Ticket | 🔧 | Necesita fix loadTicketSection() |
| Permisos | ✅ | Sistema completo |
| Impresora | ⚠️ | No disponible en web (solo Electron) |

## 🔧 PROBLEMAS RESUELTOS

### Problema 1: Dos versiones corriendo
- **Causa**: PM2 en ~/apps/Kareca + Node en /var/www/kareca
- **Solución**: Actualizar /var/www/kareca (producción real)
- **Resultado**: ✅ Resuelto

### Problema 2: Logo no visible
- **Causa**: Archivo en src/assets/, HTML buscaba en src/views/
- **Solución**: cp src/assets/logo.png src/views/logo.png
- **Resultado**: ✅ Resuelto

### Problema 3: loadTicketSection() no funciona
- **Causa**: Usa window.electronAPI (solo Electron)
- **Error**: TypeError: window.electronAPI.getTicketTemplate is not a function
- **Solución**: Detectar Electron vs Web, usar fetch() en web
- **Resultado**: 🔧 EN PROGRESO - Script creado abajo

## 🛠️ PRÓXIMO PASO CRÍTICO

### Ejecutar Fix de Ticket Template

En el Droplet, ejecuta:

```bash
cat > fix-ticket.sh << 'EOF'
#!/bin/bash

echo "Reemplazando función loadTicketSection()..."

python3 << 'PYTHON'
import re

with open('/var/www/kareca/src/views/renderer.js', 'r') as f:
    content = f.read()

old_pattern = r'async function loadTicketSection\(\) \{[\s\S]*?renderTicketEditor\(\);\n\}'

new_function = '''async function loadTicketSection() {
    try {
        const verEl = document.getElementById('ticket-version-label');
        if (verEl) verEl.textContent = 'v' + TICKET_EDITOR_VERSION;
        let res;
        if (window.electronAPI && window.electronAPI.getTicketTemplate) {
            res = await window.electronAPI.getTicketTemplate();
        } else {
            const response = await fetch('/api/ticket/template');
            res = await response.json();
        }
        if (res && res.success && res.template) {
            ticketTemplate = res.template;
        } else {
            ticketTemplate = null;
        }
    } catch (e) {
        console.error('getTicketTemplate', e);
        ticketTemplate = null;
    }
    renderTicketEditor();
}'''

content = re.sub(old_pattern, new_function, content)
with open('/var/www/kareca/src/views/renderer.js', 'w') as f:
    f.write(content)

print("✅ Función reemplazada")
PYTHON

echo "Reiniciando Node..."
kill -9 $(pgrep -f "node /var/www") || true
sleep 2
cd /var/www/kareca && node server.js > /dev/null 2>&1 &
sleep 3

echo "✅ LISTO - Prueba en https://ceramicafe.org/Editor de Ticket"
EOF

chmod +x fix-ticket.sh
./fix-ticket.sh
```

Luego prueba en navegador:
1. https://ceramicafe.org
2. Abre DevTools (F12)
3. Ve a Console
4. ¿Hay errores? ¿Se carga la plantilla?

## 📊 COMMITS DESPLEGADOS

```
caceb84 Add permission management documentation
4463c68 Add permission control for ticket editor module
acc2769 Extract ticket editor module as standalone reusable component
151c803 Show full item details for mesa sales in reports
e646f7a Add logo to login screen and sidebar
dadefbe Implement voucher_number column for tarjeta payment methods
```

## 📁 ARCHIVOS IMPORTANTES

- **PERMISSION_MANAGEMENT.md** - Guía completa de permisos
- **ticket-editor-module/** - Módulo independiente
  - README.md
  - docs/INTEGRATION.md
  - docs/EXAMPLE_USAGE.md
  - docs/CHECKLIST.md
  - src/services/
  - src/routes/

## 🔗 URLs

- Producción: https://ceramicafe.org
- Editor Ticket: Admin → Sidebar → "Editor de Ticket"

## ⚠️ PROBLEMAS PENDIENTES

1. **Registrar cliente desde caja** - "servidor sin respuesta"
   - Necesita: Revisar logs, verificar API
   
2. **Impresora no detecta** - Limitación de web
   - Nota: Funciona en Electron desktop

## 📝 NOTAS IMPORTANTES

- `/var/www/kareca` es la carpeta de PRODUCCIÓN real
- `~/apps/Kareca` NO se usa (PM2 ahí)
- Node se reinicia automáticamente (systemd service)
- PostgreSQL en mismo Droplet
- SSL con Let's Encrypt

---

**Guardar esta sesión para referencia futura**
