const escpos = require('escpos');
try {
    escpos.USB = require('escpos-usb');
} catch (e) {
    console.error("escpos-usb not installed");
    process.exit(1);
}

console.log("Searching for USB devices...");
try {
    const devices = escpos.USB.findPrinter();
    if (devices && devices.length > 0) {
        console.log(`Found ${devices.length} device(s):`);
        devices.forEach((device, index) => {
            console.log(`Device #${index + 1}:`);
            console.log(`  VID: 0x${device.deviceDescriptor.idVendor.toString(16).toUpperCase().padStart(4, '0')}`);
            console.log(`  PID: 0x${device.deviceDescriptor.idProduct.toString(16).toUpperCase().padStart(4, '0')}`);
            // console.log('  Full details:', device);
        });
    } else {
        console.log("No USB printers found via escpos-usb.");
        console.log("Make sure the printer is on and the driver (WinUSB) is installed via Zadig if necessary.");
    }
} catch (error) {
    console.error("Error searching for devices:", error);
}
