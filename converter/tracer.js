const sharp = require('sharp');
const potrace = require('potrace');
const path = require('path');

/**
 * Convert a raster image to SVG.
 *
 * @param {string} filePath – absolute path to the source image
 * @param {object} opts
 * @param {string}  opts.mode          – 'bw' | 'color' | 'posterize'
 * @param {number}  opts.numColors     – number of colour layers (color/posterize mode, 2-32)
 * @param {number}  opts.threshold     – BW threshold 0-255 (bw mode)
 * @param {string}  opts.turnPolicy    – potrace turn policy
 * @param {number}  opts.turdSize      – suppress speckles smaller than this (px²)
 * @param {number}  opts.optTolerance  – curve optimisation tolerance
 * @param {boolean} opts.invert        – invert colours before tracing
 * @param {number}  opts.resolution    – max dimension to process (default 4096)
 * @returns {Promise<string>} SVG markup
 */
async function convertImageToSvg(filePath, opts = {}) {
    const {
        mode = 'color',
        numColors = 16,
        threshold = 128,
        turnPolicy = potrace.Potrace.TURNPOLICY_MINORITY,
        turdSize = 2,
        optTolerance = 0.2,
        invert = false,
        resolution = 4096,
    } = opts;

    // ── 1. Preprocess with Sharp ────────────────────────────────────
    let pipeline = sharp(filePath).rotate(); // auto-rotate from EXIF

    // Get metadata for aspect-aware resize
    const meta = await sharp(filePath).metadata();
    const maxDim = Math.max(meta.width || 1, meta.height || 1);
    if (maxDim > resolution) {
        pipeline = pipeline.resize({
            width: resolution,
            height: resolution,
            fit: 'inside',
            withoutEnlargement: true,
        });
    }

    // Gentle sharpen — too much creates tracing artifacts
    pipeline = pipeline.sharpen({ sigma: 0.8 });

    if (mode === 'bw') {
        return await traceBW(pipeline, { threshold, turnPolicy, turdSize, optTolerance, invert });
    } else if (mode === 'posterize') {
        return await tracePosterize(pipeline, { numColors, turnPolicy, turdSize, optTolerance });
    } else {
        return await traceColor(pipeline, { numColors, turnPolicy, turdSize, optTolerance });
    }
}

// ═══════════════════════════════════════════════════════════════════
//  B & W  tracing
// ═══════════════════════════════════════════════════════════════════
function traceBW(pipeline, { threshold, turnPolicy, turdSize, optTolerance, invert }) {
    return new Promise(async (resolve, reject) => {
        let buf = await pipeline.greyscale().png().toBuffer();

        const traceOpts = {
            threshold,
            turnPolicy,
            turdSize,
            optTolerance,
            color: invert ? '#ffffff' : '#000000',
            background: invert ? '#000000' : 'transparent',
        };

        potrace.trace(buf, traceOpts, (err, svg) => {
            if (err) return reject(err);
            resolve(svg);
        });
    });
}

// ═══════════════════════════════════════════════════════════════════
//  Posterize tracing (built-in potrace posterize)
// ═══════════════════════════════════════════════════════════════════
function tracePosterize(pipeline, { numColors, turnPolicy, turdSize, optTolerance }) {
    return new Promise(async (resolve, reject) => {
        const buf = await pipeline.png().toBuffer();

        const traceOpts = {
            steps: numColors,
            turnPolicy,
            turdSize,
            optTolerance,
            fillStrategy: potrace.Potrace.FILL_DOMINANT,
        };

        potrace.posterize(buf, traceOpts, (err, svg) => {
            if (err) return reject(err);
            resolve(svg);
        });
    });
}

// ═══════════════════════════════════════════════════════════════════
//  Full-colour tracing  (quantize → per-layer trace → composite)
// ═══════════════════════════════════════════════════════════════════
async function traceColor(pipeline, { numColors, turnPolicy, turdSize, optTolerance }) {
    // Get image as raw RGBA pixels
    const processed = pipeline.png();
    const { data: rawBuf, info } = await processed.raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    const totalPixels = width * height;

    // Quantize colours using k-means with more samples and iterations
    const palette = quantize(rawBuf, channels, numColors);

    // Assign every pixel to a palette colour (full pass, not sampled)
    const assignments = new Uint8Array(totalPixels);
    for (let i = 0; i < totalPixels; i++) {
        const off = i * channels;
        const r = rawBuf[off], g = rawBuf[off + 1], b = rawBuf[off + 2];
        const a = channels === 4 ? rawBuf[off + 3] : 255;
        if (a < 128) {
            assignments[i] = 255; // transparent
        } else {
            assignments[i] = nearestColorIndex(r, g, b, palette);
        }
    }

    // Find the background colour (most frequent) to render first
    const freq = new Uint32Array(palette.length);
    for (let i = 0; i < totalPixels; i++) {
        if (assignments[i] < palette.length) freq[assignments[i]]++;
    }
    let bgIndex = 0;
    for (let i = 1; i < palette.length; i++) {
        if (freq[i] > freq[bgIndex]) bgIndex = i;
    }

    // Order layers: background first, then rest by frequency (desc)
    const layerOrder = Array.from({ length: palette.length }, (_, i) => i);
    layerOrder.sort((a, b) => {
        if (a === bgIndex) return -1;
        if (b === bgIndex) return 1;
        return freq[b] - freq[a];
    });

    // Build layers: one greyscale bitmap per colour
    const pathsSvg = [];

    for (const ci of layerOrder) {
        const color = palette[ci];
        // Skip colours with very few pixels
        if (freq[ci] < 10) continue;

        const bitmapBuf = Buffer.alloc(width * height);
        for (let i = 0; i < totalPixels; i++) {
            bitmapBuf[i] = assignments[i] === ci ? 0 : 255; // 0 = foreground
        }

        const greyPng = await sharp(bitmapBuf, { raw: { width, height, channels: 1 } })
            .png()
            .toBuffer();

        const svgLayer = await new Promise((resolve, reject) => {
            potrace.trace(greyPng, {
                threshold: 128,
                turnPolicy,
                turdSize,
                optTolerance,
                color: rgbToHex(color),
                background: 'transparent',
            }, (err, svg) => {
                if (err) return reject(err);
                resolve(svg);
            });
        });

        // Extract just the <path> elements from the SVG
        const pathMatch = svgLayer.match(/<path[^]*?\/>/gi);
        if (pathMatch) pathsSvg.push(...pathMatch);
    }

    // The first layer (background) is rendered as a full rect to prevent gaps
    const bgColor = rgbToHex(palette[bgIndex]);
    const bgRect = `<rect width="${width}" height="${height}" fill="${bgColor}"/>`;

    // Compose final SVG
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n${bgRect}\n${pathsSvg.join('\n')}\n</svg>`;
}

// ─── Colour helpers ─────────────────────────────────────────────

function nearestColorIndex(r, g, b, palette) {
    let minDist = Infinity;
    let bestIdx = 0;
    for (let i = 0; i < palette.length; i++) {
        const c = palette[i];
        const dr = r - c[0], dg = g - c[1], db = b - c[2];
        const d = dr * dr + dg * dg + db * db;
        if (d < minDist) { minDist = d; bestIdx = i; }
    }
    return bestIdx;
}

function nearestColor(r, g, b, palette) {
    return palette[nearestColorIndex(r, g, b, palette)];
}

function rgbToHex([r, g, b]) {
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// ─── Improved k-means colour quantization ───────────────────────

function quantize(buffer, channels, k) {
    const totalPixels = buffer.length / channels;
    // Sample up to 80,000 pixels for much better colour accuracy
    const sampleSize = Math.min(totalPixels, 80000);
    const samples = [];

    // Use stratified sampling for better coverage
    const step = Math.max(1, Math.floor(totalPixels / sampleSize));
    for (let i = 0; i < totalPixels; i += step) {
        const idx = i * channels;
        const a = channels === 4 ? buffer[idx + 3] : 255;
        if (a < 128) continue; // skip transparent
        samples.push([buffer[idx], buffer[idx + 1], buffer[idx + 2]]);
        if (samples.length >= sampleSize) break;
    }
    if (samples.length === 0) return [[0, 0, 0]];

    // Initialise centroids with k-means++
    let centroids = [samples[Math.floor(Math.random() * samples.length)]];
    while (centroids.length < k) {
        const dists = samples.map((s) => {
            let min = Infinity;
            for (const c of centroids) {
                const d = (s[0] - c[0]) ** 2 + (s[1] - c[1]) ** 2 + (s[2] - c[2]) ** 2;
                if (d < min) min = d;
            }
            return min;
        });
        const totalDist = dists.reduce((a, b) => a + b, 0);
        let r = Math.random() * totalDist;
        for (let i = 0; i < dists.length; i++) {
            r -= dists[i];
            if (r <= 0) { centroids.push([...samples[i]]); break; }
        }
    }

    // Iterate more for better convergence
    for (let iter = 0; iter < 30; iter++) {
        const clusters = centroids.map(() => []);
        for (const s of samples) {
            let minD = Infinity, best = 0;
            for (let c = 0; c < centroids.length; c++) {
                const d = (s[0] - centroids[c][0]) ** 2 + (s[1] - centroids[c][1]) ** 2 + (s[2] - centroids[c][2]) ** 2;
                if (d < minD) { minD = d; best = c; }
            }
            clusters[best].push(s);
        }

        let changed = false;
        for (let c = 0; c < centroids.length; c++) {
            if (clusters[c].length === 0) continue;
            const newC = clusters[c]
                .reduce((acc, v) => [acc[0] + v[0], acc[1] + v[1], acc[2] + v[2]], [0, 0, 0])
                .map((v) => Math.round(v / clusters[c].length));
            if (newC[0] !== centroids[c][0] || newC[1] !== centroids[c][1] || newC[2] !== centroids[c][2]) {
                changed = true;
                centroids[c] = newC;
            }
        }
        if (!changed) break; // Converged early
    }

    return centroids;
}

module.exports = { convertImageToSvg };
