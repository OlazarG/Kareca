# Gestión de Permisos - Sistema K-RECA

## Permisos disponibles

| Permiso | Descripción | Módulo |
|---------|-------------|--------|
| `ver_reportes` | Ver reportes y estadísticas de ventas | Reportes |
| `editar_ventas` | Editar/anular movimientos realizados | Reportes/Ventas |
| `gestionar_productos` | Crear, editar y eliminar productos | Productos |
| `gestionar_caja` | Abrir, cerrar y controlar la caja | Control de Caja |
| `gestionar_usuarios` | Crear, editar y eliminar usuarios | Gestión de Usuarios |
| `realizar_ventas` | Acceso al módulo POS y cobros | Punto de Venta |
| `realizar_compras` | Acceso al módulo de compras | Punto de Compra |
| `gestionar_mesas` | Agregar, editar y eliminar mesas | Salón/Mesas |
| `gestionar_clientes` | Crear, editar y eliminar clientes | Clientes |
| `gestionar_salarios` | Acceso al módulo de salarios | Salarios |
| `editar_ticket_template` | Editor de plantillas de tickets | Editor de Tickets |

## Cómo gestionar permisos por rol

### Opción 1: Desde la interfaz (Gestión de Usuarios)

1. **Ir a**: Sistema → Usuarios
2. **Seleccionar** el rol que deseas modificar
3. **Ver/editar permisos** asociados al rol
4. **Guardar cambios**

### Opción 2: Por base de datos (SQL)

#### Ver permisos de un rol

```sql
SELECT r.name as rol, p.name as permiso, p.description 
FROM role_permissions rp
JOIN roles r ON rp.role_id = r.id
JOIN permissions p ON rp.permission_id = p.id
WHERE r.name = 'Nombre del Rol'
ORDER BY p.name;
```

#### Dar permiso a un rol

```sql
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Cajero' AND p.name = 'editar_ticket_template'
ON CONFLICT DO NOTHING;
```

#### Quitar permiso de un rol

```sql
DELETE FROM role_permissions 
WHERE role_id = (SELECT id FROM roles WHERE name = 'Cajero')
AND permission_id = (SELECT id FROM permissions WHERE name = 'editar_ticket_template');
```

#### Ver todos los permisos

```sql
SELECT * FROM permissions ORDER BY name;
```

## Permisos por rol recomendado

### Administrador
✅ Todos los permisos

### Cajero
- ✅ realizar_ventas
- ✅ gestionar_caja
- ✅ gestionar_clientes
- ✅ gestionar_mesas
- ✅ ver_reportes
- ✅ editar_ticket_template

### Vendedor
- ✅ realizar_ventas
- ✅ gestionar_clientes
- ✅ ver_reportes

### Gerente
- ✅ ver_reportes
- ✅ editar_ventas
- ✅ gestionar_productos
- ✅ gestionar_caja
- ✅ gestionar_usuarios
- ✅ gestionar_clientes
- ✅ gestionar_mesas

## Editor de Tickets - Control de acceso específico

El módulo "Editor de Tickets" se controla con el permiso: **`editar_ticket_template`**

### ¿Quién debería tener acceso?

Típicamente, solo los **Administradores** y **Gerentes** deberían tener acceso a este módulo, ya que permite personalizar cómo se ven todos los tickets impresos.

### Cómo dar acceso al Editor de Tickets

#### Opción A: Por interfaz
1. Ir a **Usuarios** → **Roles**
2. Editar el rol deseado
3. Buscar permiso `editar_ticket_template`
4. Marcar ✓ para activar
5. Guardar

#### Opción B: Por SQL
```sql
-- Dar acceso a Cajeros para editar ticket template
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Cajero' AND p.name = 'editar_ticket_template'
ON CONFLICT DO NOTHING;
```

### Cómo quitar acceso al Editor de Tickets

#### Opción A: Por interfaz
1. Ir a **Usuarios** → **Roles**
2. Editar el rol deseado
3. Buscar permiso `editar_ticket_template`
4. Desmarcar ✗
5. Guardar

#### Opción B: Por SQL
```sql
-- Quitar acceso a Vendedores para editar ticket template
DELETE FROM role_permissions 
WHERE role_id = (SELECT id FROM roles WHERE name = 'Vendedor')
AND permission_id = (SELECT id FROM permissions WHERE name = 'editar_ticket_template');
```

## Efectos de los permisos

### Si un usuario NO tiene permiso `editar_ticket_template`:

1. **Menú**: El enlace "Editor de Ticket" NO aparece en el sidebar
2. **Acceso directo**: Si intenta acceder por URL, se muestra un mensaje de acceso denegado
3. **API**: Las rutas de API retornan error 403 Forbidden

### Si un usuario SÍ tiene permiso `editar_ticket_template`:

1. **Menú**: El enlace "Editor de Ticket" aparece en el sidebar
2. **Acceso**: Puede abrir el editor y personalizar plantillas
3. **API**: Todas las operaciones de ticket (GET, PUT, POST, DELETE) funcionan normalmente

## Ejemplos prácticos

### Caso 1: Permitir que solo Admin edite tickets

```sql
-- Verificar estado actual
SELECT r.name as rol, p.name as permiso
FROM role_permissions rp
JOIN roles r ON rp.role_id = r.id
JOIN permissions p ON rp.permission_id = p.id
WHERE p.name = 'editar_ticket_template';

-- Quitar de todos menos Admin
DELETE FROM role_permissions 
WHERE permission_id = (SELECT id FROM permissions WHERE name = 'editar_ticket_template')
AND role_id != (SELECT id FROM roles WHERE name = 'Administrador');
```

### Caso 2: Permitir que Gerentes editen tickets

```sql
-- Agregar permiso a Gerentes (si el rol existe)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Gerente' AND p.name = 'editar_ticket_template'
ON CONFLICT DO NOTHING;
```

### Caso 3: Crear un nuevo rol "Editor de Tickets"

```sql
-- 1. Crear el rol
INSERT INTO roles (name, description) 
VALUES ('Editor de Tickets', 'Solo puede editar plantillas de tickets');

-- 2. Asignar el permiso
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Editor de Tickets' AND p.name = 'editar_ticket_template';

-- 3. Crear usuario con este rol
INSERT INTO users (username, password_hash, role_id, status)
VALUES ('editor_tickets', 'HASH_SEGURA_AQUI', 
        (SELECT id FROM roles WHERE name = 'Editor de Tickets'), 
        true);
```

## Troubleshooting

### Problema: Usuario no ve el enlace "Editor de Ticket"

**Causa**: El usuario o su rol no tiene el permiso `editar_ticket_template`

**Solución**:
```sql
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE p.name = 'editar_ticket_template'
AND r.id = (SELECT role_id FROM users WHERE username = 'usuario_aqui')
ON CONFLICT DO NOTHING;
```

### Problema: Usuario ve el enlace pero recibe error al hacer clic

**Causa**: El permiso se asignó al usuario pero su sesión no se recargó

**Solución**: Pedir que cierre sesión y vuelva a iniciar

### Problema: Alguien modificó un ticket sin autorización

**Verificación**:
```sql
-- Ver quién tiene acceso a editar tickets
SELECT u.username, r.name as rol
FROM users u
JOIN roles r ON u.role_id = r.id
WHERE r.id IN (
    SELECT role_id FROM role_permissions 
    WHERE permission_id = (SELECT id FROM permissions WHERE name = 'editar_ticket_template')
);
```

## Auditoría (para futuras implementaciones)

Se recomienda agregar auditoría a los cambios de plantilla de ticket:

```sql
-- Tabla de auditoría (futura implementación)
CREATE TABLE IF NOT EXISTS ticket_template_audit (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    old_template JSONB,
    new_template JSONB,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Preguntas frecuentes

**P: ¿Qué pasa si elimino el permiso `editar_ticket_template`?**
R: Se elimina de todos los roles, nadie puede editarlo. El permiso se recreará automáticamente si la BD se reinicializa.

**P: ¿Puede un usuario editar tickets si tiene acceso pero su rol cambió?**
R: No. Los permisos se verifican por rol, si el rol cambia, se revisan nuevamente.

**P: ¿Se puede tener acceso al editor sin estar en un rol?**
R: No. El acceso se da por rol, es obligatorio tener un rol asignado.

**P: ¿Se puede quitar acceso a un usuario específico sin cambiar el rol?**
R: Actualmente no. Solo se pueden manejar permisos a nivel de roles. Para usuarios específicos, crea un rol exclusivo.

## Documentación relacionada

- [INTEGRATION.md](./ticket-editor-module/docs/INTEGRATION.md) - Integración del módulo
- [README.md](./ticket-editor-module/README.md) - Descripción general del módulo
- Archivo: `src/middleware/auth.js` - Middleware de autenticación y permisos
- Archivo: `src/database/db.js` - Funciones de permisos
