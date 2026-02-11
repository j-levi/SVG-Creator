const sharp = require('sharp');
const path = require('path');

async function processIcon() {
    const src = process.argv[2];
    const dest = path.join(__dirname, '..', 'build', 'icon.png');

    // Read the image, crop to content area, resize to 1024x1024, and ensure
    // we have a clean black square with no border artifacts
    await sharp(src)
        .resize(1024, 1024, { fit: 'cover' })
        .flatten({ background: { r: 0, g: 0, b: 0 } })     // flatten any alpha to black
        .png()
        .toFile(dest);

    console.log('Icon processed and saved to build/icon.png');
}

processIcon().catch(console.error);
