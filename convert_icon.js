
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(() => {
    try {
        const iconPath = path.join(__dirname, 'build', 'icon.png');
        console.log(`Reading icon from: ${iconPath}`);

        const image = nativeImage.createFromPath(iconPath);

        if (image.isEmpty()) {
            console.error('Failed to load image');
            app.quit();
            return;
        }

        const pngBuffer = image.toPNG();
        const outputPath = path.join(__dirname, 'build', 'icon_fixed.png');

        fs.writeFileSync(outputPath, pngBuffer);
        console.log(`Converted icon saved to: ${outputPath}`);

        // Optional: overwrite original
        fs.writeFileSync(iconPath, pngBuffer);
        console.log('Overwrote original icon.png with PNG data');

        app.quit();
    } catch (err) {
        console.error('Error:', err);
        app.quit();
    }
});
