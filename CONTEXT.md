# K-RECA — Sistema de Gestión de Pagos Educativos

## Descripción General

Sistema de escritorio/web para administrar pagos de institutos educativos. Originalmente un POS de bodega, migrado a gestión educativa con alumnos, cursos, cuotas, matriculas y pagos.

---

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | Node.js + Express 5 |
| Base de datos | PostgreSQL (pg pool) |
| Frontend | SPA vanilla JS + Bootstrap 5 + SweetAlert2 |
| Autenticación | JWT (httpOnly cookie + Bearer) |
| Autorización | RBAC con permisos granulares |
| Impresión | ESC/POS por USB + QZ Tray |
| Desktop | Electron (wrapper) |
| Producción | PM2 + Nginx + Certbot |

---

## Estructura del Proyecto

```
Kareca/
├── server.js                     # Entry point Express
├── main.js                       # Electron main process
├── package.json
├── .env                          # Variables de entorno (dev)
├── .env.production               # Template producción
├── ecosystem.config.js           # PM2 config
├── src/
│   ├── database/
│   │   └── db.js                 # Capa DB completa (1438 líneas)
│   ├── helpers/
│   │   ├── apiResponse.js        # success/error/serverError
│   │   └── validators.js         # Schemas Joi
│   ├── middleware/
│   │   ├── auth.js               # verifyToken + generateToken
│   │   └── authorize.js          # authorize(permisos...)
│   ├── routes/
│   │   ├── auth.js               # Login/Logout/Me
│   │   ├── alumnos.js            # CRUD alumnos + responsables
│   │   ├── cursos.js             # CRUD cursos + cuotas + batch
│   │   ├── responsables.js       # CRUD responsables
│   │   ├── matriculas.js         # Altas/bajas
│   │   ├── pagos.js              # Pagos + anulación
│   │   ├── register.js           # Apertura/cierre caja
│   │   ├── reportes.js           # Estadísticas, deudores, cobros
│   │   ├── config.js             # Config del instituto
│   │   └── users.js              # Usuarios, roles, permisos
│   ├── services/
│   │   ├── printerService.js     # Impresión ESC/POS
│   │   ├── newprinter.js
│   │   ├── oldprinter.js
│   │   └── usbAdapter.js         # Adaptador USB nativo
│   └── views/
│       ├── index.html            # SPA frontend (1387 líneas)
│       ├── renderer.js           # Lógica frontend (1365 líneas)
│       ├── api.js                # API bridge (Electron IPC)
│       ├── escpos.js             # Builder de comandos ESC/POS
│       └── qzPrint.js            # Impresión por QZ Tray
└── deploy/
    ├── backup-db.sh
    ├── setup-droplet.sh
    └── nginx-kareca.conf
```

---

## Base de Datos (PostgreSQL)

### Tablas principales

| Tabla | Propósito |
|-------|-----------|
| `alumnos` | Datos personales de estudiantes |
| `cursos` | Cursos con costos desglosados (MEC/INST) |
| `curso_costos_historial` | Auditoría de cambios en costos |
| `cuotas` | Cuotas mensuales por curso/año |
| `responsables` | Padres/tutores |
| `alumno_responsable` | Relación N:M alumno-responsable |
| `matriculas` | Inscripción de alumno a curso |
| `pagos_recibidos` | Pagos registrados |
| `movements` | Movimientos de caja |
| `cash_sessions` | Sesiones de apertura/cierre |
| `users` | Usuarios del sistema |
| `roles` | Roles RBAC |
| `permissions` | Permisos RBAC |
| `role_permissions` | Asignación permisos a roles |
| `instituto_config` | Configuración clave/valor |

### Columnas de costos en `cursos`

Cada concepto tiene 3 columnas: monto total, aporte MEC, aporte Instituto.

```
matricula_monto = matricula_mec + matricula_inst
examen_parcial_monto = examen_parcial_mec + examen_parcial_inst
examen_complementario_monto = examen_complementario_mec + examen_complementario_inst
extra_ordinario_monto = extra_ordinario_mec + extra_ordinario_inst
```

---

## API — Endpoints

### Autenticación
- `POST /api/auth/login` — login con rate limit
- `GET /api/auth/me` — datos del usuario actual
- `POST /api/auth/logout` — blacklist token

### Alumnos
- `GET /api/alumnos?search=&page=&limit=` — paginado con búsqueda
- `GET /api/alumnos/:id`
- `POST /api/alumnos`
- `PUT /api/alumnos/:id`
- `DELETE /api/alumnos/:id`
- `GET /api/alumnos/:id/responsables`
- `POST /api/alumnos/:id/responsables`
- `DELETE /api/alumnos/:id/responsables/:responsableId`
- `GET /api/alumnos/:id/deuda/:anioLectivo`

### Cursos
- `GET /api/cursos?anio_lectivo=` — filtrar por año
- `GET /api/cursos/:id`
- `GET /api/cursos/:id/historial` — historial de cambios de costos
- `POST /api/cursos`
- `PUT /api/cursos/:id`
- **`PUT /api/cursos/batch`** — edición masiva (requiere `curso_ids[]` + `campos{}`)
- `DELETE /api/cursos/:id`
- `GET /api/cursos/:id/cuotas?anio_lectivo=`
- `POST /api/cursos/:id/cuotas/generar` — genera 12 cuotas automáticas
- `POST /api/cursos/:id/cuotas`
- `DELETE /api/cursos/cuotas/:cuotaId`

### Responsables
- `GET /api/responsables?search=`
- `GET /api/responsables/:id`
- `POST /api/responsables`
- `PUT /api/responsables/:id`
- `DELETE /api/responsables/:id`

### Matrículas
- `GET /api/matriculas?alumno_id=&curso_id=&anio_lectivo=`
- `GET /api/matriculas/:id`
- `POST /api/matriculas`
- `PUT /api/matriculas/:id/baja`

### Pagos
- `GET /api/pagos?alumno_id=&matricula_id=&page=&limit=`
- `POST /api/pagos` — registra pago (inserta en pagos_recibidos + movement)
- `PUT /api/pagos/:id/anular` — reversión con motivo

### Reportes
- `GET /api/reportes/estadisticas?anio_lectivo=`
- `GET /api/reportes/deudores?anio_lectivo=`
- `GET /api/reportes/cobros?desde=&hasta=`
- `GET /api/reportes/movimientos?desde=&hasta=&page=&limit=`

### Caja
- `GET /api/register/status`
- `POST /api/register/open`
- `POST /api/register/close`

### Usuarios y Permisos
- `GET /api/users`
- `POST /api/users`
- `PUT /api/users/:id`
- `DELETE /api/users/:id`
- `GET /api/users/roles`
- `GET /api/users/permissions`
- `GET /api/users/roles/:roleId/permissions`
- `PUT /api/users/roles/:roleId/permissions`

### Configuración
- `GET /api/config`
- `PUT /api/config`

---

## Permisos RBAC

| Permiso | Descripción |
|---------|-------------|
| `ver_reportes` | Ver reportes y estadísticas |
| `gestionar_alumnos` | CRUD alumnos |
| `gestionar_cursos` | CRUD cursos + cuotas + edición masiva |
| `gestionar_caja` | Apertura/cierre de caja |
| `gestionar_usuarios` | Administrar usuarios, roles, permisos |
| `realizar_cobros` | Registrar pagos |
| `gestionar_responsables` | CRUD responsables |
| `gestionar_matriculas` | Altas/bajas de matrículas |
| `ver_morosidad` | Ver reporte de morosidad |

Roles precargados: **Administrador** (todos), **Cobrador** (cobros + morosidad), **Consulta** (solo reportes).

---

## Frontend — Secciones (SPA)

| Sección | ID | Funcionalidad |
|---------|----|---------------|
| Dashboard | `dashboard-section` | Stats (alumnos, cobrado, deudores) + top 10 deudores |
| Cobros | `cobros-section` | Buscar alumno, ver deuda, seleccionar cuotas, registrar pago |
| Caja | `caja-section` | Apertura/cierre con verificación de montos |
| Alumnos | `alumnos-section` | CRUD con búsqueda y paginación |
| Cursos | `cursos-section` | CRUD en cards, edición masiva, generación de cuotas, historial |
| Responsables | `responsables-section` | CRUD con búsqueda |
| Matrículas | `matriculas-section` | Inscripción de alumno a curso, baja |
| Morosidad | `morosidad-section` | Filtros por curso, tabla de deudores |
| Reportes | `reportes-section` | Resumen de cobros por período |
| Usuarios | `usuarios-section` | CRUD usuarios + gestión de roles/permisos |

---

## Funcionalidades Clave

### Edición Masiva de Cursos (`PUT /api/cursos/batch`)

Permite actualizar múltiples cursos simultáneamente.

**Campos actualizables:** `cuota_mensual`, `recargo_mora_pct`, `dia_vencimiento`, `activo`, `numero_resolucion`, y todos los desgloses MEC/INST de costos.

**Regla de totales:** Cuando se actualiza al menos uno de los componentes (`_mec` o `_inst`) de un concepto, el total (`_monto`) se recalcula automáticamente como `mec + inst`. El componente no especificado se asume `0`.

Ejemplo: si un curso tiene `matricula_inst = 880.000` y en la edición masiva se setea solo `matricula_mec = 100.000`, el resultado es `matricula_inst = 0`, `matricula_monto = 100.000`.

**Uso desde el frontend:** Botón "Edición Masiva" en la sección Cursos → Swal con checkboxes de selección + campos a actualizar.

### Formateo de moneda en inputs

Todos los campos con clase `currency-input` aplican auto-formateo con separadores de miles (`.`) al escribir. Al enviar, los puntos se eliminan antes de parsear el valor numérico.

### Historial de costos

Cada vez que se actualiza un curso (individual o masivamente), se guarda una copia de los valores anteriores en `curso_costos_historial` antes de aplicar los cambios.

### Generación automática de cuotas

`POST /api/cursos/:id/cuotas/generar` — crea 12 cuotas (Enero-Diciembre) para un curso/año basadas en `cuota_mensual`.

---

## Variables de Entorno

```
DB_USER=postgres
DB_HOST=localhost
DB_NAME=instituto_db
DB_PASSWORD=***
DB_PORT=5432
JWT_SECRET=***       # 64 chars hex
ADMIN_PASSWORD=***   # Password para seed del admin
PORT=3000            # Opcional, default 3000
NODE_ENV=development # development | production
HTTPS=true           # Opcional
DB_SSL=true          # Opcional
```

---

## Producción

**PM2:** `ecosystem.config.js` — app `kareca-pos`, 1 instancia, max 500MB.

**Nginx:** `deploy/nginx-kareca.conf` — reverse proxy con SSL, HTTP/2, seguridad.

**Backup:** `deploy/backup-db.sh` — pg_dump diario con retención 30 días.

**Setup:** `deploy/setup-droplet.sh` — instalación completa en Ubuntu (Node 20, PostgreSQL, PM2, Nginx, UFW).

---

## Scripts

```bash
npm start          # Iniciar servidor Express
npm run dev        # nodemon server.js
npm run build      # electron-builder (empaquetado)
```
