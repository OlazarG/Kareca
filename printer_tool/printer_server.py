"""Servidor Flask para impresión térmica por USB (con soporte de logo/imagen).

Instalación (Windows):
    python -m venv venv
    venv\\Scripts\\activate
    pip install -r requirements.txt
    python printer_server.py

Endpoints:
    GET  /api/status          - Estado del servidor
    GET  /api/printers        - Listar impresoras USB detectadas
    POST /api/connect         - Conectar a una impresora (vendor_id, product_id)
    POST /api/print           - Imprimir texto
    POST /api/print-image     - Imprimir una imagen (logo)
"""

import os
import sys

# Cargar libusb-1.0.dll desde el directorio del script (si existe) antes de importar pyusb.
# Esto evita el error "NoBackendError: No backend available" cuando el DLL no está en el PATH.
DLL_NAME = 'libusb-1.0.dll'
_script_dir = os.path.dirname(os.path.abspath(__file__))
if DLL_NAME in os.listdir(_script_dir):
    os.environ['PATH'] = _script_dir + os.pathsep + os.environ.get('PATH', '')

import usb.core
import usb.util
from flask import Flask, request, jsonify, render_template
from werkzeug.utils import secure_filename

from printer_utils import ImageConverter
from ticket_templates import (
    get_templates, load_template, save_template, TicketRenderer, render_ticket,
    TEMPLATES_DIR as TEMPLATES_DIR_PATH
)

app = Flask(__name__)

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
ALLOWED_EXTENSIONS = {'.png', '.jpg', '.jpeg'}
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


class ThermalPrinter:
    def __init__(self):
        self.device = None
        self.endpoint = None

    def find_printer(self):
        """Busca impresoras USB (Epson, Star, Zebra, SPRT, etc)."""
        try:
            printers = []
            for device in usb.core.find(find_all=True):
                try:
                    # Filtrar solo dispositivos con interfaz de clase PRINTER (0x07),
                    # igual que el sistema de la cafetería (escpos-usb).
                    is_printer = False
                    try:
                        for cfg in device:
                            for intf in cfg:
                                if intf.bInterfaceClass == 0x07:
                                    is_printer = True
                    except Exception:
                        pass

                    manufacturer = usb.util.get_string(device, device.iManufacturer) if device.iManufacturer else "Unknown"
                    product = usb.util.get_string(device, device.iProduct) if device.iProduct else "Unknown"
                    printers.append({
                        'vendor_id': hex(device.idVendor),
                        'product_id': hex(device.idProduct),
                        'manufacturer': str(manufacturer),
                        'product': str(product),
                        'is_printer': is_printer,
                        'known': (device.idVendor == 0x0483 and device.idProduct == 0x5720)
                    })
                except Exception:
                    pass
            return printers
        except usb.core.NoBackendError:
            return []
        except Exception:
            return []

    def connect(self, vendor_id, product_id):
        """Conecta a una impresora específica por VID/PID."""
        # Resetear estado previo antes de un nuevo intento.
        self.device = None
        self.endpoint = None
        try:
            device = usb.core.find(idVendor=vendor_id, idProduct=product_id)
            if device is None:
                return False, "Impresora no encontrada"
            self.device = device

            # En Windows no hay driver de kernel; en Linux/reloj detachar si es necesario.
            if hasattr(self.device, 'is_kernel_driver_active'):
                try:
                    if self.device.is_kernel_driver_active(0):
                        self.device.detach_kernel_driver(0)
                except Exception:
                    pass

            # Configurar - tolera "Resource busy" en Windows si ya está configurada.
            try:
                self.device.set_configuration()
            except usb.core.USBError as e:
                if 'busy' not in str(e).lower() and 'configuration' not in str(e).lower():
                    raise

            cfg = self.device.get_active_configuration()
            intf = cfg[(0, 0)]

            # Intentar reclamar la interfaz (importante en algunos drivers).
            try:
                usb.util.claim_interface(self.device, intf)
            except usb.core.USBError:
                pass

            self.endpoint = usb.util.find_descriptor(
                intf,
                custom_match=lambda e: usb.util.endpoint_direction(e.bEndpointAddress) == usb.util.ENDPOINT_OUT
            )

            if not self.endpoint:
                self.device = None
                self.endpoint = None
                return False, "No se encontró endpoint de salida"

            return True, "Conectado"
        except Exception as e:
            # Limpiar estado si falla la conexión.
            self.device = None
            self.endpoint = None
            return False, str(e)

    def print_text(self, text):
        """Envía texto a la impresora."""
        if not self.device or not self.endpoint:
            return False, "Impresora no conectada"

        try:
            self.endpoint.write(b'\x1b\x40')            # Reset
            self.endpoint.write(text.encode('utf-8'))    # Texto
            self.endpoint.write(b'\n\n\n')               # Espacios
            self.endpoint.write(b'\x1d\x56\x41')         # Corte
            return True, "Impreso"
        except Exception as e:
            return False, str(e)

    def print_image(self, escpos_data):
        """Envía datos ESC/POS de una imagen a la impresora."""
        if not self.device or not self.endpoint:
            return False, "Impresora no conectada"

        try:
            self.endpoint.write(b'\x1b\x40')      # Reset
            self.endpoint.write(escpos_data)      # Imagen
            self.endpoint.write(b'\n\n\n')        # Espacios
            self.endpoint.write(b'\x1d\x56\x41')  # Corte
            return True, "Imagen impresa"
        except Exception as e:
            return False, str(e)

    def print_escpos(self, escpos_data):
        """Envía una secuencia ESC/POS completa (ticket renderizado)."""
        if not self.device or not self.endpoint:
            return False, "Impresora no conectada"

        try:
            self.endpoint.write(escpos_data)
            return True, "Impreso"
        except Exception as e:
            return False, str(e)


printer = ThermalPrinter()

# VID/PID de la impresora del sistema de la cafetería (STMicroelectronics).
DEFAULT_VENDOR_ID = 0x0483
DEFAULT_PRODUCT_ID = 0x5720


@app.route('/', methods=['GET'])
def index():
    """Página principal (UI)."""
    return render_template('index.html')


@app.route('/api/status', methods=['GET'])
def status():
    """Estado del servidor."""
    # Si no hay impresora conectada, intenta auto-conectar a la impresora conocida.
    if printer.device is None:
        printer.connect(DEFAULT_VENDOR_ID, DEFAULT_PRODUCT_ID)

    return jsonify({
        'status': 'ok',
        'server': 'running',
        'printer_connected': printer.device is not None
    })


@app.route('/api/printers', methods=['GET'])
def list_printers():
    """Lista todas las impresoras USB disponibles."""
    printers = printer.find_printer()
    return jsonify({
        'status': 'ok',
        'printers': printers,
        'count': len(printers)
    })


@app.route('/api/connect/default', methods=['POST'])
def connect_default_printer():
    """Conecta a la impresora por defecto del sistema (0x0483:0x5720)."""
    success, message = printer.connect(DEFAULT_VENDOR_ID, DEFAULT_PRODUCT_ID)
    if not success:
        return jsonify({'status': 'error', 'message': message, 'connected': False}), 500
    return jsonify({'status': 'ok', 'message': message, 'connected': True})


@app.route('/api/connect', methods=['POST'])
def connect_printer():
    """Conecta a una impresora específica (vendor_id, product_id en hex)."""
    data = request.get_json(force=True) if request.is_json else (request.form or {})
    vendor_id = int(data.get('vendor_id', '0x0'), 16)
    product_id = int(data.get('product_id', '0x0'), 16)

    success, message = printer.connect(vendor_id, product_id)
    if not success:
        return jsonify({'status': 'error', 'message': message, 'connected': False}), 500
    return jsonify({'status': 'ok', 'message': message, 'connected': True})


@app.route('/api/print', methods=['POST'])
def print_text():
    """Imprime texto."""
    data = request.get_json(force=True) if request.is_json else (request.form or {})
    text = data.get('text', '')

    success, message = printer.print_text(text)
    if not success:
        return jsonify({'status': 'error', 'message': message}), 500
    return jsonify({'status': 'ok', 'message': message})


@app.route('/api/print-image', methods=['POST'])
def print_image():
    """Imprime una imagen (logo). Acepta multipart/form-data con campo 'file'."""
    if 'file' not in request.files:
        return jsonify({'status': 'error', 'message': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'status': 'error', 'message': 'No file selected'}), 400

    if not file.filename.lower().endswith(tuple(ALLOWED_EXTENSIONS)):
        return jsonify({'status': 'error', 'message': 'Solo PNG o JPG'}), 400

    try:
        filename = secure_filename(file.filename)
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)

        width = int(request.form.get('width', 384))  # 80mm = 384, 58mm = 280
        converter = ImageConverter(width=width)
        escpos_data = converter.convert_to_escpos(filepath)

        success, message = printer.print_image(escpos_data)
        os.remove(filepath)

        if not success:
            return jsonify({'status': 'error', 'message': message}), 500
        return jsonify({'status': 'ok', 'message': message})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ---------------------------------------------------------------------------
# Endpoints de plantillas y tickets
# ---------------------------------------------------------------------------
@app.route('/api/templates', methods=['GET'])
def list_templates():
    """Lista todas las plantillas de ticket disponibles."""
    templates = get_templates()
    return jsonify({
        'status': 'ok',
        'templates': templates
    })


@app.route('/api/templates/<key>', methods=['GET'])
def get_template(key):
    """Obtiene una plantilla específica por clave."""
    tpl = load_template(key)
    if tpl is None:
        return jsonify({'status': 'error', 'message': 'Plantilla no encontrada'}), 404
    return jsonify({'status': 'ok', 'template': tpl})


@app.route('/api/templates/<key>', methods=['POST'])
def update_template(key):
    """Guarda/actualiza una plantilla personalizada."""
    data = request.get_json(force=True) if request.is_json else (request.form or {})
    template = data.get('template')
    if not template:
        return jsonify({'status': 'error', 'message': 'Falta la plantilla'}), 400
    try:
        save_template(key, template)
        return jsonify({'status': 'ok', 'message': 'Plantilla guardada'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/templates/reset/<key>', methods=['POST'])
def reset_template(key):
    """Restaura una plantilla a su versión estándar de fábrica."""
    _path = os.path.join(TEMPLATES_DIR_PATH, key + '.json')
    try:
        if os.path.exists(_path):
            os.remove(_path)
        return jsonify({'status': 'ok', 'message': 'Plantilla restaurada'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/print/ticket', methods=['POST'])
def print_ticket():
    """Imprime un ticket usando una plantilla y datos proporcionados.

    Body: {"template": "ticket_venta", "data": {...campos...}}
    """
    data = request.get_json(force=True) if request.is_json else (request.form or {})
    key = data.get('template', 'ticket_venta')
    tpl = load_template(key)
    if tpl is None:
        return jsonify({'status': 'error', 'message': 'Plantilla no encontrada'}), 404

    ticket_data = data.get('data', {})
    # Mover items a la raíz si vienen anidados
    if 'items' in data and 'items' not in ticket_data:
        ticket_data['items'] = data['items']

    try:
        line_width = data.get('line_width', tpl.get('line_width', 42))
        renderer = TicketRenderer(tpl, ticket_data, line_width=line_width)
        escpos_data = renderer.render()
        success, message = printer.print_escpos(escpos_data)
        if not success:
            return jsonify({'status': 'error', 'message': message}), 500
        return jsonify({'status': 'ok', 'message': message})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/tickets/preview', methods=['POST'])
def preview_ticket():
    """Genera vista previa en texto plano de un ticket (sin imprimir).

    Body: {"template": "ticket_venta", "data": {...}, "line_width": 42}
    """
    data = request.get_json(force=True) if request.is_json else (request.form or {})
    key = data.get('template', 'ticket_venta')
    tpl = load_template(key)
    if tpl is None:
        return jsonify({'status': 'error', 'message': 'Plantilla no encontrada'}), 404

    ticket_data = data.get('data', {})
    if 'items' in data and 'items' not in ticket_data:
        ticket_data['items'] = data['items']

    try:
        line_width = data.get('line_width', tpl.get('line_width', 42))
        renderer = TicketRenderer(tpl, ticket_data, line_width=line_width)
        text = renderer.render_text()
        return jsonify({'status': 'ok', 'text': text})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ---------------------------------------------------------------------------
# Impresión por HTML / Navegador (80mm)
#   El formato HTML se envía al navegador para imprimir con Ctrl+P, ideal
#   cuando la impresora térmica está instalada como driver de Windows.
# ---------------------------------------------------------------------------
def _fmoney(v, decimals=2):
    """Formatea un número a moneda.

    - Si ya es string (p.ej. '49.90'), se devuelve tal cual (respetando el
      formato que venga del frontend o backend).
    - Si es número, lo formatea con separador de miles (.) y decimales (,)
      estilo es-PY (guaraníes) por defecto, o con punto decimal si se usa
      el formato tipo ejemplo.
    """
    if isinstance(v, str):
        # Ya viene formateado; no tocarlo
        return v if v.strip() else '0.00'
    try:
        if decimals == 0:
            return f"{int(float(v)):,}".replace(',', '.')
        # Formato es-PY: miles con punto, decimales con coma
        s = f"{float(v):,.{decimals}f}"
        return s.replace(',', 'X').replace('.', ',').replace('X', '.')
    except (TypeError, ValueError):
        return '0.00'


def _ticket_html_data(raw):
    """Normaliza los datos del ticket a lo que espera la plantilla HTML."""
    d = dict(raw)
    items = d.get('items', [])
    norm_items = []
    for it in items:
        price = it.get('price', 0)
        qty = it.get('qty', it.get('quantity', 1))
        total = it.get('total', it.get('subtotal'))
        if total is None:
            total = float(price) * float(qty)
        norm_items.append({
            'name': it.get('name', it.get('description', '')),
            'price': _fmoney(price),
            'qty': str(qty),
            'total': _fmoney(total),
        })
    method = d.get('method', 'EFECTIVO')
    return {
        'store_name': d.get('store_name', 'CERÁMICA CAFÉ'),
        'store_subtitle': d.get('store_subtitle', 'Café con Esencia Artesanal'),
        'store_address': d.get('store_address', d.get('store_phone', 'Madrid, España')),
        'logo_url': d.get('logo_url', ''),
        'barcode': d.get('barcode', ''),
        'ticket_num': d.get('ticket_num', '1'),
        'date': d.get('date', ''),
        'items': norm_items,
        'subtotal': _fmoney(d.get('subtotal', 0)),
        'iva_pct': d.get('iva_pct', '21'),
        'iva_amount': _fmoney(d.get('iva_amount', 0)),
        'total': _fmoney(d.get('total', 0)),
        'method': method,
        'received': _fmoney(d.get('received', 0)),
        'change': _fmoney(d.get('change', 0)),
        'footer': d.get('footer', 'Danos tu opinión y gana un vale de 10€'),
        'qr_url': d.get('qr_url', ''),
        'paper_width': d.get('paper_width', 80),
        'body_width': d.get('body_width', 72),
    }


@app.route('/api/tickets/html', methods=['POST'])
def ticket_html():
    """Genera el HTML del ticket 80mm para imprimir en el navegador (Ctrl+P)."""
    data = request.get_json(force=True) if request.is_json else (request.form or {})
    ctx = _ticket_html_data(data.get('data', data))
    html = render_template('ticket_html.html', **ctx)
    return html


@app.route('/api/print/ticket-html', methods=['POST'])
def print_ticket_html():
    """Envía el ticket HTML para imprimir vía navegador (devuelve HTML + flag)."""
    data = request.get_json(force=True) if request.is_json else (request.form or {})
    ctx = _ticket_html_data(data.get('data', data))
    html = render_template('ticket_html.html', **ctx)
    return jsonify({'status': 'ok', 'html': html})


if __name__ == '__main__':
    print("Servidor de impresora térmica iniciado en http://localhost:5000")
    print("Endpoints disponibles:")
    print("  GET   /api/status         - Estado")
    print("  GET   /api/printers       - Listar impresoras")
    print("  POST  /api/connect        - Conectar a impresora")
    print("  POST  /api/print          - Imprimir texto")
    print("  POST  /api/print-image    - Imprimir imagen (logo)")
    print("  GET   /api/templates      - Listar plantillas de ticket")
    print("  GET   /api/templates/<k>  - Obtener plantilla")
    print("  POST  /api/templates/<k>  - Guardar plantilla")
    print("  POST  /api/print/ticket   - Imprimir ticket con plantilla")
    app.run(host='0.0.0.0', port=5000, debug=True)
