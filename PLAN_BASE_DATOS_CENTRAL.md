# Plan: Base de Datos Central en el Droplet (Web + Electron)

Objetivo: que cada instalación de Electron (en los locales) y la web del droplet lean y escriban la **misma** base Postgres, en vez de cada una tener su propia base local. Enfoque elegido: **Firewall + SSL directo** (sin VPN).

Este documento es el plan — nada de esto se ejecuta hasta confirmar cada fase.

---

## Estado actual (2026-09-06)

- ✅ **Fase 2** hecha: `listen_addresses = '*'` aplicado y Postgres reiniciado sin caídas. SSL ya estaba `on` (certificado self-signed por defecto de Postgres — no se armó uno nuevo, ver nota en Fase 2).
- ✅ **Fase 4** hecha: rol `kareca_remote` creado con permisos de lectura/escritura (sin CREATE/DROP/ALTER), incluyendo default privileges para tablas futuras. Contraseña generada y guardada (no repetida en este documento).
- ✅ **Fase 5** hecha: `db.js` ya soporta `DB_SSL=true` (commit `e13add2`).
- ⏳ **Nombre real de la base**: es `kareca_db` (minúscula), **no** `KARECA_DB` como se asumía en este documento originalmente — ajustar cualquier comando de acá abajo que diga `KARECA_DB`.
- ⏳ **Pendiente, bloqueado por Fase 0**: todavía no tenemos la IP pública fija de la primera PC/local a migrar → falta la regla de `pg_hba.conf` (Fase 2.3) y la regla de firewall (Fase 3). Nada de esto expone la base todavía: sin esa regla en `pg_hba.conf`, ninguna IP remota puede autenticarse aunque el puerto estuviera abierto.

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

1. ✅ **SSL en Postgres**: ya estaba `ssl = on` desde antes, usando el certificado self-signed que Postgres genera por defecto (`ssl-cert-snakeoil.pem`). El droplet también tiene un certificado real de Let's Encrypt (`certbot`, dominio `ceramicafe.org`), pero **no** se usó para Postgres: la clave privada de Let's Encrypt no es legible por el usuario `postgres` sin armar un hook de renovación aparte, y para esta escala no vale la pena esa complejidad extra. Con el self-signed + `rejectUnauthorized: false` en el cliente, la conexión va cifrada igual, solo no se verifica la identidad del server contra una CA — aceptable estando además detrás del firewall por IP.
2. ✅ **Escuchar en la interfaz pública**: `listen_addresses = '*'` aplicado en `/etc/postgresql/16/main/postgresql.conf` (línea 60, estaba comentada usando el default `localhost`). Postgres reiniciado, PM2 no se cayó.
3. ⏳ **Reglas de acceso** en `pg_hba.conf` — **pendiente, falta la IP**. Cuando la tengamos:
   - Una línea `hostssl` por cada IP pública de local, method `scram-sha-256`. Ejemplo:
     ```
     hostssl  kareca_db  kareca_remote  <IP_LOCAL_1>/32  scram-sha-256
     ```
   - Nada de `0.0.0.0/0` — solo IPs explícitas.
   - Archivo: `/etc/postgresql/16/main/pg_hba.conf` (solo editable con `sudo`).
4. Reiniciar Postgres (o `reload` alcanza para solo `pg_hba.conf`, a diferencia de `listen_addresses` que sí pidió restart completo) después de agregar la regla del punto 3.

## 3. Firewall del droplet — pendiente, falta la IP

- `ufw` ya está activo en el droplet (solo permite hoy 22, 80 y 443). Falta agregar:
  ```
  sudo ufw allow from <IP_LOCAL_1> to any port 5432 proto tcp
  ```
- Este proyecto no usa Cloud Firewall de DigitalOcean todavía (solo `ufw` local) — se puede sumar como capa extra más adelante, no es bloqueante.
- Verificar que el puerto 5432 sigue bloqueado para cualquier otra IP (probar desde afuera antes de dar por cerrado este paso).

## 4. Usuario de base de datos con permisos acotados ✅ hecho

Rol `kareca_remote` ya creado (no se reutilizó `kareca_user`, que es el que usa `server.js`). Permisos otorgados:

```sql
CREATE ROLE kareca_remote WITH LOGIN PASSWORD '...';
GRANT CONNECT ON DATABASE "kareca_db" TO kareca_remote;
GRANT USAGE ON SCHEMA public TO kareca_remote;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kareca_remote;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kareca_remote;
ALTER DEFAULT PRIVILEGES FOR ROLE kareca_user IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kareca_remote;
ALTER DEFAULT PRIVILEGES FOR ROLE kareca_user IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO kareca_remote;
```

Sin permisos de `CREATE`/`DROP`/`ALTER` — este rol no puede tocar el esquema, solo leer/escribir filas. Las últimas dos líneas (`ALTER DEFAULT PRIVILEGES`) aseguran que tablas que `kareca_user` cree en el futuro también queden accesibles para `kareca_remote` automáticamente.

## 5. Cambio de código: soportar SSL en la conexión (`db.js`) ✅ hecho

`src/database/db.js` ya soporta `DB_SSL=true` (commit `e13add2`):

```js
ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
```

`rejectUnauthorized: false` porque usamos el certificado self-signed de Postgres (ver Fase 2, punto 1).

## 6. Configurar cada Electron

En el `.env` de cada máquina con Electron:

```env
DB_HOST=<IP o dominio del droplet>
DB_PORT=5432
DB_USER=kareca_remote
DB_PASSWORD=<contraseña del rol kareca_remote>
DB_NAME=kareca_db
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
