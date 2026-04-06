# Guía de Instalación - K-RECA POS

Este documento detalla los pasos para instalar y configurar el sistema K-RECA POS en una nueva computadora.

## 1. Requisitos Previos

Antes de comenzar, asegúrese de instalar el siguiente software:

*   **Node.js**: Descargue e instale la versión LTS desde [nodejs.org](https://nodejs.org/).
*   **PostgreSQL**: Descargue e instale la última versión desde [postgresql.org](https://www.postgresql.org/).
    *   Durante la instalación, se le pedirá una contraseña para el usuario `postgres`. Anote esta contraseña.
*   **Git** (Opcional): Para clonar el repositorio si no copia los archivos directamente.

## 2. Configuración de la Base de Datos

1.  Abra **pgAdmin 4** (se instala con PostgreSQL) o use la línea de comandos.
2.  Cree una nueva base de datos llamada `KARECA_DB`.
    *   En pgAdmin: Click derecho en "Databases" -> Create -> Database... -> Name: `KARECA_DB`.

## 3. Configuración del Proyecto

1.  Copie la carpeta del proyecto a la nueva computadora.
2.  Abra la carpeta del proyecto y localice el archivo `.env`.
3.  Edite el archivo `.env` con las credenciales de su base de datos local:

```env
DB_USER=postgres
DB_HOST=localhost
DB_NAME=KARECA_DB
DB_PASSWORD=su_contraseña_aqui  <-- CAMBIAR ESTO
DB_PORT=5432
```

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

## 6. Ejecutar el Sistema

Para iniciar el sistema en modo desarrollo:

```bash
npm start
```

Para crear un instalador ejecutable (.exe):

```bash
npm run build
```
El instalador se generará en la carpeta `dist`.

## Solución de Problemas Comunes

*   **Error de conexión a la base de datos**: Verifique que el servicio de PostgreSQL esté corriendo y que la contraseña en el archivo `.env` sea correcta.
*   **Error de impresora**: Asegúrese de haber realizado el paso 5 con Zadig. Si el error persiste, desconecte y vuelva a conectar la impresora.
