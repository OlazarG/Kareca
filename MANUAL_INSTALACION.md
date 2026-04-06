# Manual de Instalación Completo - K-RECA POS

Este documento detalla **absolutamente todo** lo que necesita la nueva computadora para que el sistema funcione correctamente.

**¿Necesito instalar NPM o Node.js?**
**NO.** La versión ejecutable (`.exe`) ya trae todo lo necesario en su interior. No hace falta instalar Node.js ni usar comandos `npm`. Si tienes errores, suele ser por la Base de Datos o Drivers.

---

## 1. Requisitos del Sistema (Instalar en la nueva PC)

Antes de abrir el sistema, asegúrese de instalar estos 3 componentes:

### A. Base de Datos (PostgreSQL)
El sistema no guarda los datos en el aire, necesita este motor de base de datos.
1.  Descargue e instale la última versión desde: [https://www.postgresql.org/download/windows/](https://www.postgresql.org/download/windows/)
2.  **MUY IMPORTANTE:** Durante la instalación, le pedirá crear una contraseña para el usuario `postgres`. **Anótela**, es la llave de su sistema.
3.  Al terminar, abra el programa **pgAdmin 4** (se instala solo).
4.  Haga clic derecho en "Databases" -> **Create** -> **Database...**
5.  Escriba el nombre: `KARECA_DB` y guarde.

### B. Librerías de Visual C++ (Para que funcione la impresora y USB)
A veces Windows no trae estas librerías y el sistema falla al intentar conectar con dispositivos USB.
1.  Descargue e instale el **"Visual C++ Redistributable"** (versiones x64 y x86) desde el sitio oficial de Microsoft:
    *   [Enlace directo a Microsoft](https://learn.microsoft.com/es-es/cpp/windows/latest-supported-vc-redist)

### C. Driver de Impresora Térmica (Zadig)
El sistema usa un modo especial para imprimir rápido. No usa el driver normal de Windows.
1.  Conecte su impresora térmica y enciéndala.
2.  Descargue **Zadig**: [https://zadig.akeo.ie/](https://zadig.akeo.ie/)
3.  Abra Zadig y vaya al menú **Options** -> **List All Devices**.
4.  Busque su impresora en la lista (puede salir como "Unknown Device" o el nombre de la marca).
5.  Mire la casilla de la derecha (flecha verde). Debe seleccionar **WinUSB**.
6.  Haga clic en **Replace Driver** o **Install Driver**.
    *   *Nota: Si después quiere usar la impresora con Word/Excel, tendrá que desinstalar este driver, pero para el sistema K-RECA es obligatorio.*

---

## 2. Instalación del Archivo `.env` (Credenciales)

El sistema necesita saber la contraseña que puso en el paso 1.A.

1.  Lleve la carpeta del sistema (`KARECA_SISTEMA`) a la nueva PC.
2.  Entre en la carpeta donde está el archivo `K-RECA POS.exe`.
3.  Cree un archivo nuevo llamado `.env` (sin .txt al final).
4.  Ábralo con el Bloc de Notas y pegue esto:

```env
DB_USER=postgres
DB_HOST=localhost
DB_NAME=KARECA_DB
DB_PASSWORD=AQUI_SU_CONTRASEÑA
DB_PORT=5432
```

5.  Cambie `AQUI_SU_CONTRASEÑA` por la que definió al instalar PostgreSQL.

---

## 3. Solución de Problemas Comunes

### "Error al cargar productos" o Pantalla en Blanco
*   **Causa 1:** La contraseña en el archivo `.env` está mal.
    *   *Solución:* Revise el archivo. Asegúrese de que no haya espacios extra.
*   **Causa 2:** No creó la base de datos `KARECA_DB`.
    *   *Solución:* Abra pgAdmin y verifique que exista.
*   **Causa 3:** El servicio de PostgreSQL no está corriendo.
    *   *Solución:* Busque "Servicios" en Windows, busque "postgresql-x64-..." y asegúrese de que diga "En ejecución".

### "Error de Impresora" o el sistema se cierra al intentar imprimir
*   **Causa:** Falta el driver WinUSB o las librerías Visual C++.
    *   *Solución:* Repita los pasos **1.B** y **1.C** de esta guía.
