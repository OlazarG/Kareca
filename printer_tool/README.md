# Printer Tool (Python)

Herramienta independiente en Python para imprimir tickets y logos en una impresora
térmica por **USB directo**, sin necesidad de QZ Tray.

## Archivos

- `printer_utils.py` — Convierte un PNG/JPG (logo) a bytes ESC/POS (GS v 0).
- `printer_server.py` — Servidor Flask que expone endpoints para conectar e imprimir.
- `requirements.txt` — Dependencias.

## Instalación (Windows)

```bat
cd printer_tool
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

> Si `pyusb` no encuentra la impresora, instala el driver **WinUSB/Zadig** para el
> dispositivo de la impresora (los mismos pasos usados para el adaptador Node).

## Ejecutar

```bat
venv\Scripts\activate
python printer_server.py
```

El servidor queda en `http://localhost:5000`.

## Endpoints

| Método | Ruta              | Descripción                                   |
|--------|-------------------|-----------------------------------------------|
| GET    | `/api/status`     | Estado del servidor y conexión de impresora  |
| GET    | `/api/printers`   | Lista impresoras USB detectadas (VID/PID)    |
| POST   | `/api/connect`    | Conecta por VID/PID                          |
| POST   | `/api/print`      | Imprime texto                                |
| POST   | `/api/print-image`| Imprime una imagen (logo)                    |

## Ejemplos con curl

```bash
# Listar impresoras
curl http://localhost:5000/api/printers

# Conectar (reemplaza VID/PID por los de tu impresora)
curl -X POST http://localhost:5000/api/connect \
  -H "Content-Type: application/json" \
  -d "{\"vendor_id\": \"0x0483\", \"product_id\": \"0x5720\"}"

# Imprimir texto
curl -X POST http://localhost:5000/api/print \
  -H "Content-Type: application/json" \
  -d "{\"text\": \"Hola desde printer_tool\"}"

# Imprimir logo (80mm por defecto; usa width=280 en impresoras de 58mm)
curl -X POST http://localhost:5000/api/print-image \
  -F "file=@../src/assets/logo.png"
```

## Notas sobre el ancho de la imagen

- **80mm** → `width=384` píxeles
- **58mm** → `width=280` píxeles

El convertidor redimensiona manteniendo proporción, centra la imagen y la convierte
a blanco y negro (1 bit). Se puede cambiar el ancho con el parámetro `width`
en `print-image`.
