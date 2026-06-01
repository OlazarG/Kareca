const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/assets/logo.png');

if (!fs.existsSync(filePath)) {
    console.error("File does not exist:", filePath);
    process.exit(1);
}

const buffer = fs.readFileSync(filePath);
// PNG dimensions are at offset 16 (width, 4 bytes) and 20 (height, 4 bytes)
const width = buffer.readUInt32BE(16);
const height = buffer.readUInt32BE(20);

console.log(`PNG Dimensions: ${width}x${height}`);
console.log(`File Size: ${(buffer.length / 1024).toFixed(2)} KB`);
