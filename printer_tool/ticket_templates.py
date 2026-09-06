"""Plantillas de tickets e impresión ESC/POS formateada.

Proporciona un sistema de plantillas de ticket editables con formatos estándar
(ticket de venta, factura, comanda, recibo) y renderizado a ESC/POS.

Cada plantilla está definida como un JSON con secciones/bloques. Los datos
se rellenan mediante placeholders {{campo}}.
"""

import json
import os

TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'templates')


# ---------------------------------------------------------------------------
# Plantillas estándar (seed). Se guardan en TEMPLATES_DIR al primer uso para
# que el usuario pueda editarlas.
# ---------------------------------------------------------------------------
DEFAULT_TEMPLATES = {
    "ticket_venta": {
        "name": "Ticket de Venta",
        "description": "Ticket estándar para punto de venta (80mm / 58mm).",
        "width": 384,
        "line_width": 42,
        "sections": [
            {"type": "center", "text": "{{store_name}}", "size": [2, 2], "bold": True},
            {"type": "center", "text": "{{store_subtitle}}", "bold": False},
            {"type": "center", "text": "{{store_phone}}", "bold": False},
            {"type": "center", "text": "{{dashes}}", "bold": False},
            {"type": "line", "text": "Ticket #{{ticket_num}}", "right": "{{date}}", "bold": True},
            {"type": "separator", "text": "{{dashes}}"},
            {"type": "items", "caption": "Cant  Descripcion             Importe"},
            {"type": "separator", "text": "{{dashes}}"},
            {"type": "line", "text": "SUBTOTAL", "right": "{{subtotal}}", "bold": True},
            {"type": "line", "text": "IVA ({{iva_pct}})", "right": "{{iva_amount}}", "bold": False},
            {"type": "line", "text": "TOTAL", "right": "{{total}}", "bold": True},
            {"type": "separator", "text": "{{dashes}}"},
            {"type": "line", "text": "Forma de pago", "right": "{{method}}", "bold": False},
            {"type": "line", "text": "Efectivo", "right": "{{received}}", "bold": False, "if": "{{method}} == Efectivo"},
            {"type": "line", "text": "Vuelto", "right": "{{change}}", "bold": False, "if": "{{method}} == Efectivo"},
            {"type": "separator", "text": "{{dashes}}"},
            {"type": "center", "text": "{{footer}}", "bold": True},
            {"type": "feed", "lines": 4},
            {"type": "cut"}
        ]
    },
    "factura": {
        "name": "Factura",
        "description": "Factura con IVA y datos del cliente (compatible con el sistema principal).",
        "width": 384,
        "line_width": 42,
        "sections": [
            {"type": "center", "text": "{{store_name}}", "size": [2, 2], "bold": True},
            {"type": "center", "text": "{{store_subtitle}}","bold": False},
            {"type": "center", "text": "FACTURA", "size": [2, 2],"bold": True},
            {"type": "center", "text": "RUC: {{store_ruc}}", "bold": False, "if": "{{store_ruc}}"},
            {"type": "center", "text": "{{store_phone}}", "bold": False},
            {"type": "separator", "text": "{{dashes}}"},
            {"type": "line", "text": "Factura #{{ticket_num}}", "right": "{{date}}", "bold": True},
            {"type": "line", "text": "Cliente", "right": "{{client_name}}", "bold": False, "if": "{{client_name}}"},
            {"type": "line", "text": "RUC/CI", "right": "{{client_ruc}}", "bold": False, "if": "{{client_ruc}}"},
            {"type": "separator", "text": "{{dashes}}"},
            {"type": "items", "caption": "Cant  Descripcion             Importe"},
            {"type": "separator", "text": "{{dashes}}"},
            {"type": "line", "text": "SUBTOTAL", "right": "{{subtotal}}", "bold": True},
            {"type": "line", "text": "IVA ({{iva_pct}})", "right": "{{iva_amount}}", "bold": False},
            {"type": "line", "text": "TOTAL", "right": "{{total}}", "bold": True},
            {"type": "line", "text": "Método", "right": "{{method}}", "bold": False, "if": "{{method}}"},
            {"type": "line", "text": "Efectivo", "right": "{{received}}", "bold": False, "if": "{{method}} == Efectivo"},
            {"type": "line", "text": "Vuelto", "right": "{{change}}", "bold": False, "if": "{{method}} == Efectivo"},
            {"type": "separator", "text": "{{dashes}}"},
            {"type": "center", "text": "{{footer}}", "bold": True},
            {"type": "feed", "lines": 4},
            {"type": "cut"}
        ]
    },
    "comanda": {
        "name": "Comanda / Cocina",
        "description": "Comanda para la cocina con sección de mesa y notas.",
        "width": 384,
        "line_width": 42,
        "sections": [
            {"type": "center", "text": "{{store_name}}", "size": [2, 2], "bold": True},
            {"type": "center", "text": "COMANDAS", "bold": True},
            {"type": "line", "text": "Mesa:", "right": "{{table}}", "bold": True},
            {"type": "line", "text": "Fecha:", "right": "{{date}}", "bold": False},
            {"type": "separator", "text": "{{dashes}}"},
            {"type": "items", "caption": "Cant  Descripcion"},
            {"type": "line", "text": "Nota:", "right": "{{note}}", "bold": False},
            {"type": "separator", "text": "{{dashes}}"},
            {"type": "center", "text": "{{footer}}", "bold": True},
            {"type": "feed", "lines": 4},
            {"type": "cut"}
        ]
    },
    "recibo": {
        "name": "Recibo",
        "description": "Recibo de pago con monto y concepto.",
        "width": 384,
        "line_width": 42,
        "sections": [
            {"type": "center", "text": "{{store_name}}", "size": [2, 2], "bold": True},
            {"type": "center", "text": "RECIBO DE PAGO", "bold": True},
            {"type": "center", "text": "Nro: {{ticket_num}}", "bold": False},
            {"type": "line", "text": "Fecha:", "right": "{{date}}", "bold": False},
            {"type": "line", "text": "Recibí de:", "right": "{{client_name}}", "bold": False},
            {"type": "line", "text": "La suma de:", "right": "{{amount_words}}", "bold": False},
            {"type": "line", "text": "Concepto:", "right": "{{concept}}", "bold": False},
            {"type": "separator", "text": "{{dashes}}"},
            {"type": "center", "text": "MONTO: {{amount}}", "size": [1, 0], "bold": True},
            {"type": "separator", "text": "{{dashes}}"},
            {"type": "center", "text": "{{footer}}", "bold": True},
            {"type": "feed", "lines": 4},
            {"type": "cut"}
        ]
    },
    "ceramica_cafe": {
        "name": "Cerámica Café",
        "description": "Ticket con logo, código de barras, IVA y QR (formato Cerámica Café).",
        "width": 384,
        "line_width": 42,
        "sections": [
            {"type": "center", "text": "{{store_name}}", "size": [2, 2], "bold": True},
            {"type": "center", "text": "{{store_subtitle}}", "bold": False},
            {"type": "center", "text": "{{store_phone}}", "bold": False},
            {"type": "center", "text": "{{dashes_heavy}}", "bold": False},
            {"type": "barcode", "text": "{{barcode}}"},
            {"type": "center", "text": "{{dashes_heavy}}", "bold": False},
            {"type": "line", "text": "Ticket num:", "right": "{{ticket_num}}", "bold": True},
            {"type": "line", "text": "Fecha:", "right": "{{date}}", "bold": False},
            {"type": "separator", "text": "==="},
            {"type": "items", "caption": "Descripción     PVP  Cant    Total"},
            {"type": "separator", "text": "==="},
            {"type": "line", "text": "Subtotal", "right": "{{subtotal}}", "bold": False},
            {"type": "line", "text": "IVA {{iva_pct}}", "right": "{{iva_amount}}", "bold": False},
            {"type": "line", "text": "TOTAL", "right": "{{total}}", "bold": True, "size": [1, 0]},
            {"type": "separator", "text": "==="},
            {"type": "center", "text": "FORMA DE PAGO", "bold": True},
            {"type": "center", "text": "{{method}}", "bold": False},
            {"type": "line", "text": "Entregado", "right": "{{received}}", "bold": False, "if": "{{method}} == Efectivo"},
            {"type": "line", "text": "Cambio", "right": "{{change}}", "bold": False, "if": "{{method}} == Efectivo"},
            {"type": "separator", "text": "==="},
            {"type": "qr", "text": "{{qr_data}}"},
            {"type": "center", "text": "{{footer}}", "bold": True},
            {"type": "feed", "lines": 4},
            {"type": "cut"}
        ]
    }
}


# ---------------------------------------------------------------------------
# Gestión de plantillas (persistencia en JSON)
# ---------------------------------------------------------------------------
def _ensure_dir():
    os.makedirs(TEMPLATES_DIR, exist_ok=True)


def _template_path(key):
    return os.path.join(TEMPLATES_DIR, key + '.json')


def get_templates():
    """Devuelve todas las plantillas (seed + las personalizadas del usuario)."""
    _ensure_dir()
    result = {}
    # Plantillas estándar
    for key, tpl in DEFAULT_TEMPLATES.items():
        result[key] = {
            'key': key,
            'name': tpl['name'],
            'description': tpl['description'],
            'custom': False,
            'template': tpl,
        }

    # Sobrescribir con versiones personalizadas guardadas
    for fname in os.listdir(TEMPLATES_DIR):
        if not fname.endswith('.json'):
            continue
        key = fname[:-5]
        try:
            with open(_template_path(key), 'r', encoding='utf-8') as f:
                saved = json.load(f)
            result[key] = {
                'key': key,
                'name': saved.get('name', key),
                'description': saved.get('description', ''),
                'custom': True,
                'template': saved,
            }
        except (ValueError, OSError):
            continue

    return result


def load_template(key):
    """Carga una plantilla por clave. Si no existe, crea la semilla."""
    _ensure_dir()
    path = _template_path(key)
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (ValueError, OSError):
            pass
    if key in DEFAULT_TEMPLATES:
        return dict(DEFAULT_TEMPLATES[key])
    return None


def save_template(key, template):
    """Guarda una plantilla personalizada en disco."""
    _ensure_dir()
    with open(_template_path(key), 'w', encoding='utf-8') as f:
        json.dump(template, f, ensure_ascii=False, indent=2)
    return True


# ---------------------------------------------------------------------------
# Renderizado ESC/POS
# ---------------------------------------------------------------------------
def _line(txt, width):
    """Devuelve una línea de una sola pasada"""
    if len(txt) <= width:
        return txt
    return txt[:width]


def _line_right(left, right, width, gap=None):
    """Genera una línea con texto a la izquierda y derecha.

    Si `gap` se define, el espacio entre ambos textos queda fijo (deja de
    pegarse al margen derecho). Si no, el texto derecho se alinea al final.
    """
    left = str(left)
    right = str(right)
    space = width - len(left) - len(right)
    if gap is not None:
        try:
            g = int(gap)
            if g >= 0:
                space = g
        except (TypeError, ValueError):
            pass
    return (left + ' ' * max(0, space) + right)[:width]


def _pad_center(txt, width):
    """Centra texto dentro del ancho."""
    txt = str(txt)
    if len(txt) >= width:
        return txt[:width]
    pad = width - len(txt)
    left = pad // 2
    return ' ' * left + txt


def _replace_placeholders(text, data):
    """Reemplaza {{campo}} por el valor del diccionario de datos."""
    if not text:
        return text
    result = text
    for key, value in data.items():
        result = result.replace('{{' + key + '}}', str(value if value is not None else ''))
    return result


def _resolve_condition(cond, data):
    """Evalúa una condición simple del estilo '{{campo}} == valor'."""
    if not cond:
        return True
    # Soporta: {{campo}} == X, {{campo}} != X
    cond = cond.strip()
    if '==' in cond:
        field, val = cond.split('==', 1)
        key = _replace_placeholders(field.strip(), data).strip('{} ').strip()
        actual = str(data.get(key, ''))
        return actual == val.strip()
    if '!=' in cond:
        field, val = cond.split('!=', 1)
        key = _replace_placeholders(field.strip(), data).strip('{} ').strip()
        actual = str(data.get(key, ''))
        return actual != val.strip()
    if cond.strip() in ('{{empty}}',):
        return False
    return _replace_placeholders(cond, data) != ''


class TicketRenderer:
    """Renderiza una plantilla de ticket a datos ESC/POS."""

    def __init__(self, template, data, line_width=None):
        self.template = template
        self.data = data or {}
        self.line_width = line_width or template.get('line_width', 42)
        self.width = template.get('width', 384)
        self.decimals = data.get('currency_decimals', 0)
        self._out = bytearray()
        self._init_data()

    def _init_data(self):
        """Prepara campos por defecto y formateo de moneda.

        Normaliza los nombres de campo del sistema de la cafetería (camelCase)
        a los nombres snake_case que usan las plantillas, de modo que una misma
        plantilla sirva tanto para datos propios del servidor Python como para
        los datos que envía el sistema principal (storeName, clientName, id,
        ticketNum, clientRuc, ivaPct, ivaAmount, subtotal, total, ...).
        """
        d = self.data
        # Aliases camelCase -> snake_case (del sistema de la cafetería)
        _ALIASES = {
            'storeName': 'store_name',
            'storeSubtitle': 'store_subtitle',
            'storePhone': 'store_phone',
            'storeRuc': 'store_ruc',
            'ticketNum': 'ticket_num',
            'id': 'ticket_num',
            'clientName': 'client_name',
            'clientRuc': 'client_ruc',
            'clientCI': 'client_ruc',
            'ivaPct': 'iva_pct',
            'ivaAmount': 'iva_amount',
            'amountWords': 'amount_words',
            'amount': 'amount',
        }
        for src, dst in _ALIASES.items():
            if src in d and dst not in d:
                d[dst] = d[src]

        d.setdefault('store_name', 'Mi Negocio')
        d.setdefault('store_subtitle', '')
        d.setdefault('store_phone', '')
        d.setdefault('store_ruc', '')
        d.setdefault('ticket_num', '1')
        d.setdefault('date', self._now())
        d.setdefault('dashes', '-' * self.line_width)
        d.setdefault('iva_pct', '10')
        d.setdefault('footer', 'Gracias Por Su Preferencia!')
        d.setdefault('method', '')
        d.setdefault('client_name', '')
        d.setdefault('client_ruc', '')
        d.setdefault('table', '')
        d.setdefault('note', '')
        d.setdefault('concept', '')
        d.setdefault('amount_words', '')
        d.setdefault('items', [])
        d.setdefault('dashes_heavy', '=' * self.line_width)
        d.setdefault('barcode', '')
        d.setdefault('qr_data', '')
        # Montos se dejan sin formatear aquí; el formateo a moneda lo hace _fmt_placeholder.
        for m in ('subtotal', 'iva_amount', 'total', 'received', 'change', 'amount'):
            d.setdefault(m, 0)

        # Si no se informó el subtotal pero hay ítems, lo calculamos sumando los
        # subtotales de cada ítem (forma correcta para datos del sistema principal).
        if d.get('subtotal', 0) == 0 and d.get('items'):
            s = 0
            for it in d.get('items', []):
                line_total = it.get('total', it.get('subtotal'))
                if line_total is None:
                    qty = it.get('qty', it.get('quantity', 1))
                    price = it.get('price', it.get('unit_price', 0))
                    line_total = float(qty) * float(price)
                s += float(line_total)
            d['subtotal'] = s

        self.total = d.get('total')

    def _fmt_placeholder(self, key, value):
        """Formatea un valor de data según el campo (moneda para montos)."""
        if key in ('subtotal', 'iva_amount', 'total', 'received', 'change', 'amount'):
            return self._money(value)
        return str(value if value is not None else '')

    def _replace(self, text):
        """Reemplaza {{campos}} formateando montos según el campo."""
        if not text:
            return text
        result = text
        for key, value in self.data.items():
            result = result.replace('{{' + key + '}}', self._fmt_placeholder(key, value))
        return result

    @staticmethod
    def _now():
        from datetime import datetime
        return datetime.now().strftime('%d/%m/%Y %H:%M')

    @staticmethod
    def _display_name(item):
        """Compone el nombre visible de un ítem (con variante, si aplica).

        Mismo criterio que el sistema principal (printTicketBody): si el ítem
        tiene variante distinta de 'unidad', se muestra 'nombre (variante)'.
        """
        name = item.get('name', item.get('description', ''))
        variant = item.get('variant_name')
        if variant and str(variant).strip().lower() != 'unidad':
            return f'{name} ({variant})'
        return name

    def _money(self, value):
        try:
            v = float(value)
            s = f'{v:,.{self.decimals}f}'
            s = s.replace(',', 'X').replace('.', ',').replace('X', '.')
            return '$ ' + s if self.decimals else f'Gs {s}'
        except (TypeError, ValueError, OverflowError):
            return '$ 0' if self.decimals else 'Gs 0'

    def _esc(self, *args):
        self._out.extend(bytes(args))

    def _text(self, s, encoding='utf-8'):
        self._out.extend(s.encode(encoding))

    def render(self):
        """Genera la secuencia ESC/POS completa del ticket."""
        # Reset
        self._esc(0x1b, 0x40)

        default_font = 'A'
        default_align = 'left'
        default_bold = False
        default_size = [1, 1]

        for section in self.template.get('sections', []):
            stype = section.get('type')

            # Condición opcional por sección
            if 'if' in section and not _resolve_condition(section.get('if'), self.data):
                continue

            if stype == 'separator':
                text = self._replace(section.get('text', '-'))
                self._align('left')
                self._set_font(default_font, default_bold, default_size)
                self._text(_line(text, self.line_width) + '\n')

            elif stype == 'center':
                text = self._replace(section.get('text', ''))
                bold = section.get('bold', default_bold)
                size = section.get('size', default_size)
                w, h = size if size else (1, 1)
                w_mult = max(1, int(w))
                h_mult = max(1, int(h))
                self._set_font(default_font, bold, size)
                if w_mult > 1 or h_mult > 1:
                    # Fuente grande: centrar con la alineación nativa de la impresora
                    # (el padding manual es impreciso con fuentes escaladas).
                    self._align('center')
                    self._text(_line(text, self.line_width) + '\n')
                else:
                    # Fuente normal: padding manual para base alineada.
                    self._align('left')
                    self._text(_pad_center(_line(text, self.line_width), self.line_width) + '\n')

            elif stype == 'line':
                left = self._replace(section.get('text', '')) or ''
                right = (self._replace(section.get('right', '')) or '').strip()
                bold = section.get('bold', default_bold)
                self._align(section.get('align', 'left'))
                self._set_font(section.get('font', default_font), bold, section.get('size', default_size))
                self._text(_line_right(left, right, self.line_width, section.get('gap')) + '\n')

            elif stype == 'items':
                items = self.data.get('items', [])
                caption = self._replace(section.get('caption', ''))
                self._align('left')
                self._set_font(default_font, False, default_size)
                if caption:
                    self._text(_line(caption, self.line_width) + '\n')
                for item in items:
                    name = self._display_name(item)
                    qty = item.get('qty', item.get('quantity', 1))
                    line_total = item.get('total', item.get('subtotal'))
                    if line_total is None:
                        price = item.get('price', item.get('unit_price', 0))
                        line_total = float(qty) * float(price)
                    self._text(_line_right(f'{name} x{qty}', self._money(line_total), self.line_width, section.get('gap')) + '\n')

            elif stype == 'image':
                img_path = self._replace(section.get('image', ''))
                max_w = int(section.get('maxWidth') or self.line_width * 9)
                self._align('center')
                self._set_font(default_font, False, default_size)
                self._text(f'[IMG] (ancho {max_w}px)\n')

            elif stype == 'feed':
                for _ in range(int(section.get('lines', 1))):
                    self._text('\n')

            elif stype == 'barcode':
                value = self._replace(section.get('text', ''))
                self._align('center')
                self._print_barcode(value)

            elif stype == 'qr':
                value = self._replace(section.get('text', ''))
                self._align('center')
                self._print_qr(value)

            elif stype == 'cut':
                self._esc(0x1d, 0x56, 0x41)

        return bytes(self._out)

    def _print_barcode(self, value):
        """Imprime un código de barras (GS k). Comandos estándar ESC/POS."""
        if not value:
            return
        # GS k m n d...: usar CODE128 (m=73) si el valor es alfanumérico,
        # o CODE39 (m=69) para compatibilidad. Elegimos CODE39 (ASCII simple).
        try:
            data = value.encode('ascii')
            if 1 <= len(data) <= 255:
                # GS k 69 <len> <data>
                self._esc(0x1d, 0x6b, 69, len(data))
                self._out.extend(data)
                # Texto de datos debajo del barcode
                self._text('\n')
                self._text(_pad_center(value, self.line_width) + '\n')
        except (UnicodeEncodeError, TypeError):
            # Si no es ASCII simple, imprimir como texto
            self._text('\n')
            self._text(_pad_center(value, self.line_width) + '\n')

    def _print_qr(self, value):
        """Imprime un código QR usando el comando GS ( k (modelo de QR)."""
        if not value:
            return
        try:
            data = value.encode('utf-8')
        except (UnicodeEncodeError, TypeError):
            data = str(value).encode('utf-8', 'replace')

        n = len(data) + 3
        pL = n & 0xFF
        pH = (n >> 8) & 0xFF

        # Función 165: seleccionar modelo (modelo 2, tamaño 6)
        self._esc(0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00)
        # Función 167: tamaño de módulo (3)
        self._esc(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x03)
        # Función 169: nivel de corrección de error (48 = nivel L)
        self._esc(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x30)
        # Función 180: almacenar datos
        self._esc(0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30)
        self._out.extend(data)
        # Función 181: imprimir
        self._esc(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30)

        self._text('\n')
        self._text(_pad_center(value, self.line_width) + '\n')

    def render_text(self):
        """Genera una vista previa en texto plano (sin comandos ESC/POS)."""
        lines = []
        default_bold = False
        default_size = [1, 1]

        for section in self.template.get('sections', []):
            stype = section.get('type')
            if 'if' in section and not _resolve_condition(section.get('if'), self.data):
                continue

            if stype == 'separator':
                lines.append(_line(self._replace(section.get('text', '-')), self.line_width))
            elif stype == 'center':
                text = self._replace(section.get('text', ''))
                size = section.get('size', default_size)
                w = max(1, int(size[0])) if size else 1
                eff = self.line_width // w
                if w > 1:
                    eff = self.line_width // w
                lines.append(_pad_center(_line(text, self.line_width), eff))
            elif stype == 'line':
                left = self._replace(section.get('text', '')) or ''
                right = (self._replace(section.get('right', '')) or '').strip()
                lines.append(_line_right(left, right, self.line_width, section.get('gap')))
            elif stype == 'items':
                caption = self._replace(section.get('caption', ''))
                if caption:
                    lines.append(_line(caption, self.line_width))
                for item in self.data.get('items', []):
                    name = self._display_name(item)
                    qty = item.get('qty', item.get('quantity', 1))
                    line_total = item.get('total', item.get('subtotal'))
                    if line_total is None:
                        line_total = float(qty) * float(item.get('price', 0))
                    lines.append(_line_right(f'{name} x{qty}', self._money(line_total), self.line_width, section.get('gap')))
            elif stype == 'image':
                img_path = self._replace(section.get('image', ''))
                max_w = int(section.get('maxWidth') or self.line_width * 9)
                lines.append(f'[[IMG:{img_path}]]')
            elif stype == 'feed':
                for _ in range(int(section.get('lines', 1))):
                    lines.append('')
            elif stype == 'barcode':
                value = self._replace(section.get('text', ''))
                if value:
                    lines.append('[Código de barras: ' + value + ']')
                    lines.append(_pad_center(value, self.line_width))
            elif stype == 'qr':
                value = self._replace(section.get('text', ''))
                if value:
                    lines.append('█████████████████████')
                    lines.append('█ [Código QR]       █')
                    lines.append('█████████████████████')

        return '\n'.join(lines)

    def _align(self, align):
        cmds = {'left': 0x00, 'center': 0x01, 'right': 0x02}
        code = cmds.get(align, 0x00)
        self._esc(0x1b, 0x61, code)

    def _set_font(self, font, bold, size):
        # Bold on/off
        self._esc(0x1b, 0x45, 0x01 if bold else 0x00)
        # Tamaño: ESC ! n
        #   bits 0-1: ancho  (0=1x, 1=2x)
        #   bits 4-7: alto   (0x10=2x, 0x30=3x, 0x20=?) -- usamos 0=1x, 0x10=2x
        w, h = size if size else (1, 1)
        w_mult = max(1, int(w))
        h_mult = max(1, int(h))
        size_cmd = 0
        if w_mult == 2:
            size_cmd |= 0x01
        if h_mult == 2:
            size_cmd |= 0x10
        if font == 'B':
            size_cmd |= 0x01  # Font B es más estrecha
        self._esc(0x1b, 0x21, size_cmd)


def render_ticket(template, data):
    """Función de conveniencia: renderiza una plantilla con datos."""
    renderer = TicketRenderer(template, data)
    return renderer.render()
