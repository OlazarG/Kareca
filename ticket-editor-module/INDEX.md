# Índice del Módulo - Ticket Editor

## 📁 Estructura de carpetas

```
ticket-editor-module/
│
├── 📄 README.md                     ← COMIENZA AQUÍ
│   └─ Descripción general, características, requisitos
│
├── 📄 package.json                  
│   └─ Configuración y dependencias del módulo
│
├── 📄 INDEX.md                      ← Este archivo
│   └─ Guía de navegación del módulo
│
├── 📁 src/                          ← CÓDIGO FUENTE
│   │
│   ├── 📁 services/
│   │   ├── ticketTemplateRenderer.js    (20 KB) - Renderizador de tickets
│   │   ├── ticketTemplateStore.js       (2 KB)  - Gestor de almacenamiento
│   │   └── ticketTemplate.json          (190 KB)- Plantilla por defecto
│   │
│   ├── 📁 routes/
│   │   └── ticketTemplate.js            (4 KB)  - Rutas API (GET, PUT, DELETE)
│   │
│   └── 📄 index.html                    (NO INCLUIDO - Ver guía de integración)
│       └─ Interfaz HTML del editor (buscar en kareca/src/views/index.html)
│
├── 📁 assets/                       ← RECURSOS
│   └── logo.png                     - Logo de ejemplo
│
├── 📁 docs/                         ← DOCUMENTACIÓN
│   ├── 📄 INTEGRATION.md            ← Guía paso a paso de integración
│   │   └─ Cómo copiar, configurar y usar en tu proyecto
│   │
│   ├── 📄 EXAMPLE_USAGE.md          ← Ejemplos prácticos
│   │   └─ 7 ejemplos diferentes de uso
│   │
│   └── 📄 API_REFERENCE.md          (PRÓXIMAMENTE)
│       └─ Referencia completa de APIs
│
└── 📄 LICENSE                       - MIT (sin restricciones)
```

## 🎯 Rutas rápidas

### Para comenzar
- 📖 Lee primero: `README.md`
- 🚀 Instrucciones: `docs/INTEGRATION.md`
- 💡 Ejemplos: `docs/EXAMPLE_USAGE.md`

### Archivos importantes
| Archivo | Propósito | Usar cuando... |
|---------|-----------|---------|
| `ticketTemplateRenderer.js` | Renderiza tickets en HTML/texto | Necesitas mostrar vista previa |
| `ticketTemplateStore.js` | Maneja almacenamiento | Guardas/cargas plantillas |
| `ticketTemplate.js` (ruta) | API REST del backend | Conectas con servidor |
| `ticketTemplate.json` | Plantilla por defecto | Necesitas estructura base |

## 📚 Guía de lectura por rol

### 👨‍💻 Desarrollador Backend
1. Lee: `README.md` (requisitos)
2. Lee: `docs/INTEGRATION.md` (paso 2)
3. Usa: `src/routes/ticketTemplate.js`
4. Copia: `src/routes/` a tu proyecto

### 👨‍💻 Desarrollador Frontend
1. Lee: `README.md` (características)
2. Lee: `docs/INTEGRATION.md` (pasos 3-4)
3. Copia: `src/services/` a tu proyecto
4. Integra: HTML del editor en tu `index.html`

### 👨‍💼 Integrador (Full Stack)
1. Lee: `README.md` (completo)
2. Sigue: `docs/INTEGRATION.md` (todos los pasos)
3. Prueba: `docs/EXAMPLE_USAGE.md` (ejemplo 1)

### 🎨 Diseñador / UI-UX
1. Revisa: Estructura HTML (en `kareca/src/views/index.html` línea 1539)
2. Personaliza: Estilos en `assets/` y CSS
3. Consulta: `docs/EXAMPLE_USAGE.md` (ejemplo 4 - personalización)

## 🔧 Configuración rápida (3 pasos)

```bash
# 1. Copiar archivos
cp -r ticket-editor-module/src ./
cp -r ticket-editor-module/assets ./

# 2. Registrar rutas (en server.js)
const routes = require('./src/routes/ticketTemplate');
app.use('/api/ticket', routes);

# 3. Incluir en HTML
<script src="src/services/ticketTemplateStore.js"></script>
<script src="src/services/ticketTemplateRenderer.js"></script>
```

## 📊 Tamaños de archivo

| Archivo | Tamaño | Complejidad |
|---------|--------|-----------|
| ticketTemplateRenderer.js | 20 KB | ⭐⭐⭐ Alta |
| ticketTemplate.json | 190 KB | ⭐ Baja (datos) |
| ticketTemplate.js (ruta) | 4 KB | ⭐⭐ Media |
| ticketTemplateStore.js | 2 KB | ⭐ Baja |

## 🧠 Conceptos clave

### Plantilla (Template)
```json
{
  "sections": [
    { "type": "text", "content": "{storeName}" },
    { "type": "table", "template": "{name} x{qty}" }
  ]
}
```

### Datos (Data)
```javascript
{
  "storeName": "Mi Tienda",
  "items": [...],
  "total": 1000
}
```

### Resultado (Output)
```
         MI TIENDA
    
    Café x2         200
    Pan x1          100
    
    TOTAL:         300
```

## 🔌 Dependencias externas

### Obligatorias
- ✅ Bootstrap 5
- ✅ Bootstrap Icons (BI)
- ✅ Express.js (backend)

### Opcionales
- 📦 Electron (desktop)
- 📦 React (frontend framework)
- 📦 SweetAlert2 (modales)

## ✅ Checklist de integración

- [ ] Copiaste archivos de `src/`
- [ ] Copiaste `assets/`
- [ ] Registraste rutas en Express
- [ ] Incluiste scripts en HTML
- [ ] Configuraste base de datos
- [ ] Probaste cargar plantilla
- [ ] Probaste guardar cambios
- [ ] Probaste imprimir

## 🆘 Soporte y troubleshooting

### Problemas comunes

| Problema | Solución |
|----------|----------|
| "Cannot find module" | Verifica ruta en `require()` |
| Las imágenes no cargan | Revisa que existan en `assets/` |
| API retorna 404 | Confirma rutas en Express |
| Vista previa no actualiza | Comprueba que `ticketTemplate` se modificó |

### Recursos de ayuda
- 📖 Ver: `docs/INTEGRATION.md` (Troubleshooting)
- 💡 Ver: `docs/EXAMPLE_USAGE.md` (Ejemplo 7 - Testing)
- 🔍 Revisa: Consola del navegador (F12)

## 📝 Licencia

MIT - Libre para usar, modificar y distribuir en tus proyectos

## 🎉 ¿Listo para empezar?

1. Abre: `docs/INTEGRATION.md`
2. Sigue los pasos paso a paso
3. Si tienes dudas, consulta: `docs/EXAMPLE_USAGE.md`

¡Buena suerte! 🚀
