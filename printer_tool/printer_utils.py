"""Utilidades para convertir imágenes (logo) a datos ESC/POS para impresoras térmicas.

Uso básico:
    from printer_utils import ImageConverter
    converter = ImageConverter(width=384)  # 80mm @ 203dpi
    escpos_bytes = converter.convert_to_escpos('logo.png')
"""

from PIL import Image
import io


class ImageConverter:
    def __init__(self, width=384):
        """
        width: ancho en píxeles.

        Impresoras comunes:
        - 80mm = 384 pixels @ 203dpi
        - 58mm = 280 pixels @ 203dpi
        """
        self.width = width

    def convert_to_escpos(self, image_path):
        """Convierte PNG a datos ESC/POS para imprimir."""
        # Abrir imagen
        img = Image.open(image_path)

        # Convertir a RGB si es necesario
        if img.mode != 'RGB':
            img = img.convert('RGB')

        # Redimensionar manteniendo proporción
        img.thumbnail((self.width, 800), Image.Resampling.LANCZOS)

        # Crear imagen con fondo blanco
        new_img = Image.new('RGB', (self.width, img.height), (255, 255, 255))
        offset = ((self.width - img.width) // 2, 0)
        new_img.paste(img, offset)

        # Convertir a blanco y negro (1-bit)
        bw_img = new_img.convert('1', dither=Image.Dither.FLOYDSTEINBERG)

        # Generar datos ESC/POS
        escpos_data = self._image_to_escpos(bw_img)
        return escpos_data

    def _image_to_escpos(self, img):
        """Convierte imagen PIL a comandos ESC/POS (GS v 0)."""
        width = img.width
        height = img.height

        # ESC/POS: Comando para imagen (GS v 0)
        # Formato: GS v 0 m xL xH yL yH [datos]

        xL = width // 8          # ancho en bytes (8 píxeles por byte)
        xH = (width // 8) >> 8
        yL = height & 0xFF
        yH = (height >> 8) & 0xFF

        header = bytes([0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH])

        # Convertir imagen a datos binarios
        pixels = img.tobytes()

        return header + pixels


# Ejemplo de uso
def print_logo(endpoint, logo_path):
    """Envía el logo convertido a la impresora a través del endpoint."""
    converter = ImageConverter(width=384)  # 80mm
    escpos_data = converter.convert_to_escpos(logo_path)

    # Enviar a impresora
    endpoint.write(b'\x1b\x40')   # Reset
    endpoint.write(escpos_data)   # Imagen
    endpoint.write(b'\n\n\n')     # Espacios


if __name__ == '__main__':
    import sys
    if len(sys.argv) < 2:
        print("Uso: python printer_utils.py <ruta_al_logo.png> [width]")
        sys.exit(1)
    logo = sys.argv[1]
    width = int(sys.argv[2]) if len(sys.argv) > 2 else 384
    converter = ImageConverter(width=width)
    data = converter.convert_to_escpos(logo)
    out = logo.rsplit('.', 1)[0] + '_escpos.bin'
    with open(out, 'wb') as f:
        f.write(data)
    print(f"Imagen convertida: {len(data)} bytes -> {out}")
