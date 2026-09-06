# Guía de Instalación - K-RECA POS

Este documento detalla los pasos para instalar y configurar el sistema K-RECA POS en una nueva computadora.

## 1. Requisitos Previos

Antes de comenzar, asegúrese de instalar el siguiente software:

*   **Node.js**: Descargue e instale la versión LTS desde [nodejs.org](https://nodejs.org/).
*   **PostgreSQL**: Descargue e instale la última versión desde [postgresql.org](https://www.postgresql.org/).
    *   Durante la instalación, se le pedirá una contraseña para el usuario `postgres`. Anote esta contraseña.
*   **Git** (Opcional): Para clonar el repositorio si no copia los archivos directamente.
*   **Build Tools de Windows** (solo si el paso 4 falla): el sistema usa un módulo nativo (`usb`/`escpos-usb`) para hablar con la impresora térmica. Si `npm install` falla compilando ese módulo, instale las "Herramientas de compilación de Visual Studio" (Desktop development with C++) y Python 3, y vuelva a correr `npm install`.

## 2. Configuración de la Base de Datos

Elija **una** de estas dos opciones:

**Opción A — Manual (pgAdmin):**
1.  Abra **pgAdmin 4** (se instala con PostgreSQL).
2.  Cree una nueva base de datos llamada `KARECA_DB`.
    *   Click derecho en "Databases" -> Create -> Database... -> Name: `KARECA_DB`.

**Opción B — Automática (script):**
1.  Configure primero el archivo `.env` (paso 3) con las credenciales correctas.
2.  Ejecute `node setup_db.js` — crea la base `KARECA_DB` si no existe.

En ambos casos, las **tablas** dentro de la base se crean solas la primera vez que se ejecuta el sistema (paso 6), no hay que crearlas a mano.

## 3. Configuración del Proyecto

1.  Copie la carpeta del proyecto a la nueva computadora.
2.  Abra la carpeta del proyecto y localice el archivo `.env` (si no existe, cree uno nuevo con estos campos).
3.  Complete el archivo `.env` con los siguientes valores:

```env
DB_USER=postgres
DB_HOST=localhost
DB_NAME=KARECA_DB
DB_PASSWORD=su_contraseña_aqui  <-- CAMBIAR ESTO
DB_PORT=5432
PORT=3000
JWT_SECRET=una_clave_larga_y_aleatoria_aqui  <-- CAMBIAR ESTO
```

*   `DB_HOST=localhost` asume que PostgreSQL corre en la misma máquina que la app. Solo cambie esto si la base de datos está en otro servidor (por ejemplo, un servidor central).
*   `JWT_SECRET` se usa para firmar las sesiones de los usuarios. Póngale cualquier texto largo y aleatorio propio — si lo deja vacío, el sistema arranca igual pero con una clave de desarrollo insegura (verá una advertencia en la consola).

## 4. Instalación de Dependencias

Abra una terminal (PowerShell o CMD) en la carpeta del proyecto y ejecute:

```bash
npm install
```

## 5. Configuración de la Impresora (Importante)

El sistema utiliza una impresora térmica USB. Para que Windows la reconozca correctamente con la librería `escpos-usb`, es necesario cambiar el driver a **WinUSB**.

1.  Conecte y encienda la impresora térmica.
2.  Descargue **Zadig** desde [zadig.akeo.ie](https://zadig.akeo.ie/).
3.  Abra Zadig.
4.  En el menú "Options", seleccione **"List All Devices"**.
5.  Busque su impresora en la lista (a veces aparece como "Unknown Device" o con el nombre del fabricante).
6.  Asegúrese de que el driver de destino (a la derecha de la flecha verde) sea **WinUSB**.
7.  Haga clic en **"Replace Driver"** o "Install Driver".

Si la impresora no es el mismo modelo/marca que la ya configurada, el sistema podría no encontrarla: el Vendor ID/Product ID están fijos en `src/services/printerService.js`. Corra `node detect_printer.js` con la impresora conectada para ver su VID/PID real, y avise para ajustarlo si no coincide.

## 6. Ejecutar el Sistema

Para iniciar la app de escritorio (Electron) — es el modo normal para una caja/POS:

```bash
npm run start:electron
```

Para iniciar solo el servidor web/API (sin ventana de escritorio, útil si se accede por navegador):

```bash
npm start
```

**La primera vez que arranca** (con cualquiera de los dos comandos), el sistema crea automáticamente las tablas de la base de datos y un usuario administrador. Mire la consola: va a imprimir algo como:

```
Admin inicial creado. Usuario: admin | Contraseña temporal: xxxxxxxxxxxx
```

**Anote esa contraseña temporal ahora** — no se vuelve a mostrar en ningún lado. Al iniciar sesión por primera vez con `admin`, el sistema va a pedir cambiarla.

Después de loguearse como admin, vaya a **Usuarios → Permisos por Rol** para habilitar qué puede ver/hacer cada rol (por ejemplo, "Editor de Ticket" o "Ajustar Reloj de la App").

## 7. Crear un Instalador (.exe)

Para generar un instalador ejecutable:

```bash
npm run build
```

El instalador se genera en la carpeta `dist`. **Importante**: el build empaqueta el archivo `.env` tal cual esté en ese momento (incluidas las credenciales de base de datos) dentro del instalador — si va a distribuir este `.exe` a otra máquina/local, revise antes qué `DB_HOST`/credenciales quedaron en el `.env` usado para el build.

## Solución de Problemas Comunes

*   **Error de conexión a la base de datos**: Verifique que el servicio de PostgreSQL esté corriendo y que las credenciales en `.env` sean correctas.
*   **Error de impresora**: Asegúrese de haber realizado el paso 5 con Zadig. Si el error persiste, desconecte y vuelva a conectar la impresora, y confirme el VID/PID con `detect_printer.js`.
*   **La hora del ticket o de los reportes está mal**: no hace falta reinstalar nada — un usuario con permiso "Ajustar Reloj de la App" puede corregirlo desde el sidebar sin tocar la configuración de Windows.
*   **Perdí la contraseña temporal del admin**: si `admin` es el único usuario cargado, puede borrar esa fila de la tabla `users` (por pgAdmin) y reiniciar la app — se vuelve a generar un usuario `admin` con una contraseña temporal nueva. Si ya hay más usuarios reales cargados, no borre la tabla entera; pida que un desarrollador restablezca la contraseña directamente en la base.
