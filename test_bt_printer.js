const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');

function runCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, { shell: true, windowsHide: true }, (error, stdout, stderr) => {
            if (error) {
                return reject({ error, stderr: stderr.trim(), stdout: stdout.trim() });
            }
            resolve(stdout.trim());
        });
    });
}

function isWsl() {
    if (os.platform() !== 'linux') return false;
    try {
        const version = fs.readFileSync('/proc/version', 'utf8');
        return /microsoft/i.test(version);
    } catch {
        return false;
    }
}

async function detectWindowsSerialPorts() {
    console.log('--- Detectando puertos serial / COM (Windows) ---');
    try {
        const output = await runCommand('wmic path Win32_SerialPort get DeviceID,Description,PNPDeviceID /format:csv');
        if (!output) {
            console.log('No se devolvió salida de WMIC.');
            return;
        }

        const lines = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        if (lines.length <= 1) {
            console.log('No se encontraron puertos serial en WMIC.');
            return;
        }

        const headers = lines[0].split(',').map(h => h.trim());
        const rows = lines.slice(1);

        rows.forEach((row, index) => {
            const values = row.split(',');
            const record = headers.reduce((obj, header, colIndex) => {
                obj[header] = values[colIndex] ? values[colIndex].trim() : '';
                return obj;
            }, {});

            console.log(`Puerto #${index + 1}:`);
            console.log(`  DeviceID: ${record.DeviceID || record['DeviceID'] || ''}`);
            console.log(`  Description: ${record.Description || ''}`);
            console.log(`  PNPDeviceID: ${record.PNPDeviceID || ''}`);
        });

    } catch (error) {
        console.error('Error al detectar puertos serial:', error.stderr || error.error.message || error);
    }
}

async function detectWindowsBluetoothPorts() {
    console.log('\n--- Detectando dispositivos Bluetooth compatibles (Windows) ---');
    try {
        const output = await runCommand('powershell.exe -NoProfile -Command "Get-PnpDevice -Class Bluetooth | Select-Object FriendlyName,InstanceId,Status | ConvertTo-Csv -NoTypeInformation"');
        if (!output) {
            console.log('No se devolvió salida de PowerShell para dispositivos Bluetooth.');
            return;
        }

        const lines = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        if (lines.length <= 1) {
            console.log('No se encontraron dispositivos Bluetooth con Get-PnpDevice.');
            return;
        }

        const headers = lines[0].split(',').map(h => h.trim());
        const rows = lines.slice(1);

        rows.forEach((row, index) => {
            const values = row.split(',');
            const record = headers.reduce((obj, header, colIndex) => {
                obj[header] = values[colIndex] ? values[colIndex].trim() : '';
                return obj;
            }, {});

            console.log(`Bluetooth #${index + 1}:`);
            console.log(`  FriendlyName: ${record.FriendlyName || ''}`);
            console.log(`  InstanceId: ${record.InstanceId || ''}`);
            console.log(`  Status: ${record.Status || ''}`);
        });
    } catch (error) {
        console.error('Error al detectar Bluetooth:', error.stderr || error.error.message || error);
        console.log('Este comando usa PowerShell; asegúrate de ejecutarlo en un entorno Windows con PowerShell disponible.');
    }
}

async function detectLinuxSerialPorts() {
    console.log('\n--- Detectando puertos serial / tty (Linux) ---');
    try {
        const output = await runCommand('ls /dev/ttyS* /dev/ttyUSB* /dev/ttyACM* /dev/rfcomm* /dev/serial/by-id 2>/dev/null || true');
        if (!output) {
            console.log('No se encontraron dispositivos serial / tty.');
            return;
        }

        const paths = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        paths.forEach((path, index) => {
            console.log(`Puerto #${index + 1}: ${path}`);
        });
    } catch (error) {
        console.error('Error al detectar puertos serial en Linux:', error.stderr || error.error.message || error);
    }
}

async function detectLinuxBluetoothDevices() {
    console.log('\n--- Detectando dispositivos Bluetooth (Linux) ---');
    try {
        let output;
        try {
            output = await runCommand('bluetoothctl devices');
        } catch {
            output = await runCommand('hcitool dev 2>/dev/null || true');
        }

        if (!output) {
            console.log('No se encontraron dispositivos Bluetooth con bluetoothctl ni hcitool.');
            return;
        }

        const lines = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        if (lines.length === 0) {
            console.log('No se encontró salida útil de Bluetooth.');
            return;
        }

        lines.forEach((line, index) => {
            console.log(`Bluetooth #${index + 1}: ${line}`);
        });
    } catch (error) {
        console.error('Error al detectar Bluetooth en Linux:', error.stderr || error.error.message || error);
    }
}

async function main() {
    console.log('Test de detección de impresora Bluetooth / COM');
    console.log('Plataforma:', os.platform());
    console.log('WSL:', isWsl());

    if (os.platform() === 'win32' || isWsl()) {
        await detectWindowsSerialPorts();
        await detectWindowsBluetoothPorts();
    }

    if (os.platform() !== 'win32') {
        await detectLinuxSerialPorts();
        await detectLinuxBluetoothDevices();
    }

    console.log('\nRevisa si tu impresora Bluetooth aparece como:');
    console.log('- un puerto COM/serial Windows (DeviceID, p.ej. COM7)');
    console.log('- un dispositivo Bluetooth con nombre o dirección');
    console.log('- un tty en Linux (/dev/ttyUSB*, /dev/rfcomm*, /dev/ttyACM*)');
}

main().catch(error => {
    console.error('Error inesperado en el test:', error);
    process.exit(1);
});
