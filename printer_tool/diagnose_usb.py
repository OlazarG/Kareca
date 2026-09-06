"""Script de diagnóstico: muestra qué ve pyusb de todos los dispositivos USB."""

import os
import sys

DLL_NAME = 'libusb-1.0.dll'
_script_dir = os.path.dirname(os.path.abspath(__file__))
if DLL_NAME in os.listdir(_script_dir):
    os.environ['PATH'] = _script_dir + os.pathsep + os.environ.get('PATH', '')

import usb.core
import usb.util

print("=== Todos los dispositivos que ve pyusb ===")
try:
    for dev in usb.core.find(find_all=True):
        try:
            man = usb.util.get_string(dev, dev.iManufacturer) if dev.iManufacturer else "?"
            prod = usb.util.get_string(dev, dev.iProduct) if dev.iProduct else "?"
            print(f"VID:{dev.idVendor:04x} PID:{dev.idProduct:04x} MAN:{man} PROD:{prod}")
        except Exception as e:
            print(f"VID:{dev.idVendor:04x} PID:{dev.idProduct:04x} (error leyendo strings: {e})")
except Exception as e:
    print("Error enumerando:", e)

print()
print("=== Buscando especificamente la SPRT (0483:5720) ===")
try:
    dev = usb.core.find(idVendor=0x0483, idProduct=0x5720)
    if dev is None:
        print("NO encontrada")
    else:
        print("ENCONTRADA:", dev)
        try:
            dev.set_configuration()
            print("set_configuration OK")
        except Exception as e:
            print("set_configuration error:", e)
except Exception as e:
    print("Error:", e)

print()
print("=== Detalle del dispositivo SPRT ===")
try:
    dev = usb.core.find(idVendor=0x0483, idProduct=0x5720)
    if dev:
        for cfg in dev:
            print(f"Config {cfg.bConfigurationValue}: {cfg.bNumInterfaces} interfaces")
            for intf in cfg:
                print(f"  Interface {intf.bInterfaceNumber} class={intf.bInterfaceClass:#04x} alt={intf.bAlternateSetting}")
                for ep in intf:
                    dir_str = "OUT" if usb.util.endpoint_direction(ep.bEndpointAddress) == usb.util.ENDPOINT_OUT else "IN"
                    print(f"    EP {ep.bEndpointAddress:#04x} {dir_str}")
except Exception as e:
    print("Error:", e)
