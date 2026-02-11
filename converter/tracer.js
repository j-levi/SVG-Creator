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
 * @param {number}  opts.resolution    – max dimension to process (default 2048)
 * @returns {Promise<string>} SVG markup
 */
async function convertImageToSvg(filePath, opts = {}) {
    const {
        mode = 'color',
        numColors = 8,
        threshold = 128,
        turnPolicy = potrace.Potrace.TURNPOLICY_MINORITY,
        turdSize = 2,
        optTolerance = 0.2,
        invert = false,
        resolution = 2048,
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

    // Sharpen for crisper edges (important for logo tracing)
    pipeline = pipeline.sharpen({ sigma: 1.2 });

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

    // Quantize colours using k-means
    const palette = quantize(rawBuf, channels, numColors);

    // Build layers: one greyscale bitmap per colour
    const layers = palette.map((color) => {
        const bitmapBuf = Buffer.alloc(width * height);
        for (let i = 0; i < width * height; i++) {
            const off = i * channels;
            const r = rawBuf[off], g = rawBuf[off + 1], b = rawBuf[off + 2];
            const a = channels === 4 ? rawBuf[off + 3] : 255;
            // Assign pixel to nearest palette colour
            const nearest = nearestColor(r, g, b, palette);
            bitmapBuf[i] = (nearest === color && a > 128) ? 0 : 255; // 0 = foreground
        }
        return { color, bitmap: bitmapBuf };
    });

    // Trace each layer
    const pathsSvg = [];
    for (const layer of layers) {
        const greyPng = await sharp(layer.bitmap, { raw: { width, height, channels: 1 } })
            .png()
            .toBuffer();

        const svgLayer = await new Promise((resolve, reject) => {
            potrace.trace(greyPng, {
                threshold: 128,
                turnPolicy,
                turdSize,
                optTolerance,
                color: rgbToHex(layer.color),
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

    // Compose final SVG
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n${pathsSvg.join('\n')}\n</svg>`;
}

// ─── Colour helpers ─────────────────────────────────────────────

function nearestColor(r, g, b, palette) {
    let minDist = Infinity;
    let best = palette[0];
    for (const c of palette) {
        const dr = r - c[0], dg = g - c[1], db = b - c[2];
        const d = dr * dr + dg * dg + db * db;
        if (d < minDist) { minDist = d; best = c; }
    }
    return best;
}

function rgbToHex([r, g, b]) {
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// ─── Simple k-means colour quantization ─────────────────────────

function quantize(buffer, channels, k) {
    // Sample up to 20 000 random pixels for speed
    const totalPixels = buffer.length / channels;
    const sampleSize = Math.min(totalPixels, 20000);
    const samples = [];
    for (let i = 0; i < sampleSize; i++) {
        const idx = Math.floor(Math.random() * totalPixels) * channels;
        const a = channels === 4 ? buffer[idx + 3] : 255;
        if (a < 128) continue; // skip transparent
        samples.push([buffer[idx], buffer[idx + 1], buffer[idx + 2]]);
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

    // Iterate
    for (let iter = 0; iter < 15; iter++) {
        const clusters = centroids.map(() => []);
        for (const s of samples) {
            let minD = Infinity, best = 0;
            for (let c = 0; c < centroids.length; c++) {
                const d = (s[0] - centroids[c][0]) ** 2 + (s[1] - centroids[c][1]) ** 2 + (s[2] - centroids[c][2]) ** 2;
                if (d < minD) { minD = d; best = c; }
            }
            clusters[best].push(s);
        }
        for (let c = 0; c < centroids.length; c++) {
            if (clusters[c].length === 0) continue;
            centroids[c] = clusters[c]
                .reduce((acc, v) => [acc[0] + v[0], acc[1] + v[1], acc[2] + v[2]], [0, 0, 0])
                .map((v) => Math.round(v / clusters[c].length));
        }
    }

    return centroids;
}

module.exports = { convertImageToSvg };
