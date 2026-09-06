#!/bin/bash

echo "=========================================="
echo "  Fix Ticket Template - loadTicketSection"
echo "=========================================="
echo ""

cd /var/www/kareca || exit 1

echo "PASO 1: Backup del archivo original..."
cp src/views/renderer.js src/views/renderer.js.backup.$(date +%s)
echo "✅ Backup creado"
echo ""

echo "PASO 2: Ejecutando script Python para reemplazar función..."
python3 << 'PYTHON'
import re

print("  - Leyendo archivo...")
with open('/var/www/kareca/src/views/renderer.js', 'r') as f:
    content = f.read()

print("  - Buscando función antigua...")
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

print("  - Reemplazando función...")
content = re.sub(old_pattern, new_function, content)

print("  - Guardando cambios...")
with open('/var/www/kareca/src/views/renderer.js', 'w') as f:
    f.write(content)

print("✅ Función reemplazada correctamente")
PYTHON

echo ""
echo "PASO 3: Matando proceso Node actual..."
kill -9 $(pgrep -f "node /var/www/kareca/server.js") || echo "  (no hay proceso corriendo)"
sleep 2
echo "✅ Proceso matado"
echo ""

echo "PASO 4: Reiniciando Node..."
cd /var/www/kareca && node server.js > /dev/null 2>&1 &
sleep 3
echo "✅ Node reiniciado"
echo ""

echo "PASO 5: Verificando que esté corriendo..."
if pgrep -f "node /var/www/kareca/server.js" > /dev/null; then
    echo "✅ Node está corriendo"
else
    echo "❌ Error: Node no está corriendo"
    exit 1
fi

echo ""
echo "=========================================="
echo "✅ FIX COMPLETADO"
echo "=========================================="
echo ""
echo "Próximo paso:"
echo "1. Abre: https://ceramicafe.org"
echo "2. Abre DevTools (F12)"
echo "3. Ve a Console"
echo "4. Busca errores"
echo "5. Abre: Editor de Ticket"
echo ""
echo "¿Ves la plantilla cargada sin errores?"
