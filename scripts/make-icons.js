const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function makeIcon() {
    const buildDir = path.join(__dirname, '..', 'build');
    const iconsetDir = path.join(buildDir, 'icon.iconset');

    if (!fs.existsSync(iconsetDir)) fs.mkdirSync(iconsetDir, { recursive: true });

    const src = path.join(buildDir, 'icon.png');

    // Convert to actual PNG at 1024x1024
    const realPng = path.join(buildDir, 'icon_real.png');
    await sharp(src).resize(1024, 1024, { fit: 'cover' }).png().toFile(realPng);

    const sizes = [
        [16, 'icon_16x16.png'],
        [32, 'icon_16x16@2x.png'],
        [32, 'icon_32x32.png'],
        [64, 'icon_32x32@2x.png'],
        [128, 'icon_128x128.png'],
        [256, 'icon_128x128@2x.png'],
        [256, 'icon_256x256.png'],
        [512, 'icon_256x256@2x.png'],
        [512, 'icon_512x512.png'],
        [1024, 'icon_512x512@2x.png'],
    ];

    for (const [size, name] of sizes) {
        await sharp(realPng).resize(size, size).png().toFile(path.join(iconsetDir, name));
        console.log(`  Created ${name} (${size}x${size})`);
    }

    console.log('All iconset PNGs created!');
}

makeIcon().catch(console.error);
