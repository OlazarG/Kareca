# Plan: Base de Datos Central en el Droplet (Web + Electron)

Objetivo: que cada instalación de Electron (en los locales) y la web del droplet lean y escriban la **misma** base Postgres, en vez de cada una tener su propia base local. Enfoque elegido: **Firewall + SSL directo** (sin VPN).

Este documento es el plan — nada de esto se ejecuta hasta confirmar cada fase.

---

## 0. Prerrequisito bloqueante: IP fija de cada local

Este enfoque filtra el firewall por IP pública. **Antes de seguir, hay que confirmar que cada local tiene IP pública fija** (contratada como tal con el ISP). Si el local tiene IP dinámica (lo normal en planes hogareños/comerciales básicos en Paraguay), la regla de firewall se rompe apenas el ISP la cambie, y el POS de ese local se queda sin conexión sin aviso.

- Si **todas** las IPs son fijas → seguimos con el plan tal cual.
- Si **alguna** no es fija → opciones: pedir IP fija al ISP para ese local, usar un servicio de Dynamic DNS + regla de firewall por hostname (algunos firewalls lo soportan), o reconsiderar VPN para ese local puntual.

**Acción**: confirmar IP pública de cada local antes de la Fase 1.

## 1. ¿Hay datos ya cargados en cada local que haya que fusionar?

Si cada Electron ya tiene ventas/productos/clientes propios en su base local, centralizar no es solo "cambiar el `.env`" — hay que decidir qué pasa con esos datos históricos:
- **Empezar en limpio**: el droplet arranca con una base vacía (o con el catálogo de productos común) y cada local sigue desde cero en la base central. Más simple, se pierde el historial viejo de cada local (o se guarda aparte como respaldo).
- **Migrar el historial**: exportar cada base local (`pg_dump`) e importarla a la central, resolviendo conflictos de IDs (ventas/usuarios con el mismo ID autoincremental en distintos locales van a chocar). Más trabajo, no se pierde nada.

**Acción**: confirmar qué local(es) ya tienen datos reales que haya que conservar.

## 2. Preparar Postgres en el droplet para aceptar conexiones remotas

En el droplet (donde ya corre Postgres para `server.js` vía PM2):

1. **Habilitar SSL en Postgres** (obligatorio para este enfoque, los datos viajan por internet pública):
   - Generar certificado (self-signed alcanza si no hay dominio propio, o vía `certbot` si el droplet tiene un dominio).
   - En `postgresql.conf`: `ssl = on`, `ssl_cert_file`, `ssl_key_file`.
2. **Escuchar en la interfaz pública**:
   - `postgresql.conf`: `listen_addresses = '*'` (o la IP pública específica del droplet).
3. **Reglas de acceso** en `pg_hba.conf`:
   - Una línea `hostssl` por cada IP pública de local, method `scram-sha-256`. Ejemplo:
     ```
     hostssl  KARECA_DB  kareca_remote  <IP_LOCAL_1>/32  scram-sha-256
     hostssl  KARECA_DB  kareca_remote  <IP_LOCAL_2>/32  scram-sha-256
     ```
   - Nada de `0.0.0.0/0` — solo IPs explícitas.
4. Reiniciar Postgres y verificar que sigue aceptando conexiones locales del propio droplet (para no romper `server.js`).

## 3. Firewall del droplet

- Preferir el **Cloud Firewall de DigitalOcean** (a nivel de panel, antes de que el tráfico llegue a la VM) como filtro principal, y `ufw` en el droplet como segunda capa.
- Regla: puerto `5432/tcp` permitido **solo** desde las IPs públicas de los locales confirmadas en la Fase 0. Todo lo demás, denegado.
- Verificar que el puerto 5432 sigue bloqueado para cualquier otra IP (probar desde afuera antes de dar por cerrado este paso).

## 4. Usuario de base de datos con permisos acotados

No reutilizar el rol que usa `server.js` (probablemente `postgres` o un superusuario, según `.env` actual). Crear un rol nuevo para las conexiones remotas de Electron:

```sql
CREATE ROLE kareca_remote WITH LOGIN PASSWORD '...';
GRANT CONNECT ON DATABASE "KARECA_DB" TO kareca_remote;
GRANT USAGE ON SCHEMA public TO kareca_remote;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kareca_remote;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kareca_remote;
```

Sin permisos de `CREATE`/`DROP`/`ALTER` — ese rol no debería poder tocar el esquema, solo leer/escribir filas.

## 5. Cambio de código necesario: soportar SSL en la conexión (`db.js`)

Hoy `src/database/db.js` arma el `Pool` de `pg` sin ninguna opción `ssl`. Hace falta agregar soporte, controlado por variable de entorno para no romper el uso local (droplet↔droplet no necesita SSL, Electron↔droplet sí):

```env
DB_SSL=true
```

```js
const dbConfig = {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'KARECA_DB',
    password: ...,
    port: Number(process.env.DB_PORT || 5432),
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
};
```

(`rejectUnauthorized: false` alcanza para un certificado self-signed; si el droplet tiene certificado válido de una CA reconocida, se puede poner `true` para verificarlo de verdad.)

## 6. Configurar cada Electron

En el `.env` de cada máquina con Electron:

```env
DB_HOST=<IP o dominio del droplet>
DB_PORT=5432
DB_USER=kareca_remote
DB_PASSWORD=<contraseña del rol kareca_remote>
DB_NAME=KARECA_DB
DB_SSL=true
```

## 7. Piloto en un solo local antes de escalar

1. Elegir el local con **menos riesgo** si algo sale mal (no el de mayor facturación).
2. Aplicar el `.env` nuevo ahí, dejar el resto sin tocar.
3. Probar: login, venta directa, venta por mesa, apertura/cierre de caja, impresión de ticket, reportes — todo el flujo real, no solo abrir la app.
4. Medir latencia percibida (cada clic ahora depende de internet, no de un Postgres local) — si se siente lento, hay que resolverlo acá antes de escalar al resto.
5. Dejar corriendo así unos días, revisando que no haya cortes de conexión.

## 8. Manejo de "sin internet"

Con este enfoque, si se corta el internet del local, el POS **no puede** operar (no hay caída a una base local de respaldo). Antes de escalar a todos los locales:
- Agregar un mensaje claro en pantalla ("Sin conexión con el servidor, no se puede facturar") en vez de que la app se cuelgue o tire errores crudos cuando el `Pool` de `pg` no puede conectar.
- Definir con el negocio qué hacer operativamente si pasa (¿anotar a mano y cargar después? ¿tener un plan de contingencia por local?).

## 9. Rollout al resto de los locales

Recién después de que el piloto (Fase 7) esté estable unos días: repetir Fase 6 en cada local restante, uno por vez, no todos a la vez.

## 10. Mantenimiento continuo

- **Backups**: `pg_dump` programado (cron) en el droplet — con más locales escribiendo a la misma base, un backup diario ya no es opcional.
- **Monitoreo**: que alguien se entere si Postgres o el droplet se caen (afecta a todos los locales a la vez, no solo a la web).
- **IPs dinámicas**: si el ISP de algún local cambia la IP pública (no debería, si es fija, pero puede pasar), hay que actualizar la regla de firewall/`pg_hba.conf` a mano — documentar quién es responsable de detectarlo.

---

## Resumen de qué falta decidir antes de empezar a ejecutar

1. ¿IP fija confirmada en cada local? (Fase 0 — bloqueante)
2. ¿Hay datos reales en algún local que haya que migrar, o arrancamos en limpio? (Fase 1)
3. ¿Qué local hacemos de piloto primero? (Fase 7)
