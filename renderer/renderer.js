/* ═════════════════════════════════════════════════════════════
   VectorForge – Renderer
   Supports: raster→SVG conversion AND direct SVG editing
   ════════════════════════════════════════════════════════════ */

// ─── DOM refs ──────────────────────────────────────────────
const dropzone = document.getElementById('dropzone');
const editor = document.getElementById('editor');
const imgOriginal = document.getElementById('img-original');
const svgPreview = document.getElementById('svg-preview');
const svgLoading = document.getElementById('svg-loading');
const btnBrowse = document.getElementById('btn-browse');
const btnConvert = document.getElementById('btn-convert');
const btnCrop = document.getElementById('btn-crop');
const btnExport = document.getElementById('btn-export');
const btnNew = document.getElementById('btn-new');
const toast = document.getElementById('toast');
const paneOriginal = document.getElementById('pane-original');

const cropOverlay = document.getElementById('crop-overlay');
const cropRect = document.getElementById('crop-rect');
const cropToolbar = document.getElementById('crop-toolbar');
const btnCropApply = document.getElementById('btn-crop-apply');
const btnCropCancel = document.getElementById('btn-crop-cancel');

const sliderColors = document.getElementById('slider-colors');
const sliderThreshold = document.getElementById('slider-threshold');
const sliderDetail = document.getElementById('slider-detail');
const sliderSmooth = document.getElementById('slider-smooth');
const sliderResolution = document.getElementById('slider-resolution');
const chkInvert = document.getElementById('chk-invert');
const chkRemoveBg = document.getElementById('chk-remove-bg');

const valColors = document.getElementById('val-colors');
const valThreshold = document.getElementById('val-threshold');
const valDetail = document.getElementById('val-detail');
const valSmooth = document.getElementById('val-smooth');
const valResolution = document.getElementById('val-resolution');

const sectionColors = document.getElementById('section-colors');
const sectionThreshold = document.getElementById('section-threshold');
const sectionColorEditor = document.getElementById('section-color-editor');
const colorSwatchesContainer = document.getElementById('color-swatches');
const modeBtns = document.querySelectorAll('.mode-btn');
const sidebar = document.getElementById('sidebar');

// ─── State ─────────────────────────────────────────────────
let currentFilePath = null;
let currentSvgString = null;
let currentMode = 'color';
let isSvgMode = false;   // true when user imported an SVG directly
let cropStart = null;

// ─── Slider value display ──────────────────────────────────
sliderColors.addEventListener('input', () => { valColors.textContent = sliderColors.value; });
sliderThreshold.addEventListener('input', () => { valThreshold.textContent = sliderThreshold.value; });
sliderDetail.addEventListener('input', () => { valDetail.textContent = sliderDetail.value; });
sliderSmooth.addEventListener('input', () => { valSmooth.textContent = sliderSmooth.value; });
sliderResolution.addEventListener('input', () => { valResolution.textContent = sliderResolution.value; });

// ─── Mode toggle ───────────────────────────────────────────
modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
        modeBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentMode = btn.dataset.mode;
        updateModeVisibility();
    });
});

function updateModeVisibility() {
    sectionColors.style.display = (currentMode === 'bw') ? 'none' : '';
    sectionThreshold.style.display = (currentMode === 'bw') ? '' : 'none';
}
updateModeVisibility();

// ─── Drag & Drop ───────────────────────────────────────────
document.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
document.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); });

dropzone.addEventListener('dragenter', () => dropzone.classList.add('drag-over'));
dropzone.addEventListener('dragleave', (e) => {
    if (!dropzone.contains(e.relatedTarget)) dropzone.classList.remove('drag-over');
});

dropzone.addEventListener('drop', async (e) => {
    dropzone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const filePath = file.path;
    if (!filePath) {
        showToast('Could not read file path', 'error');
        return;
    }
    await handleFile(filePath);
});

// ─── Browse button ─────────────────────────────────────────
btnBrowse.addEventListener('click', async () => {
    const filePath = await window.api.openFileDialog();
    if (filePath) await handleFile(filePath);
});

// ─── Handle file (detect SVG vs raster) ────────────────────
async function handleFile(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();

    if (ext === 'svg') {
        await loadSvg(filePath);
    } else {
        await loadImage(filePath);
    }
}

// ─── Load SVG directly (edit mode) ─────────────────────────
async function loadSvg(filePath) {
    currentFilePath = filePath;
    isSvgMode = true;
    currentSvgString = null;

    const result = await window.api.readSvgFile(filePath);
    if (!result.success) {
        showToast('Failed to read SVG: ' + result.error, 'error');
        return;
    }

    currentSvgString = result.svg;

    // Hide original pane — not needed for SVG editing
    paneOriginal.style.display = 'none';
    document.querySelector('.preview-divider').style.display = 'none';

    // Hide conversion sidebar sections (no need when editing SVG)
    sidebar.querySelectorAll('.sidebar-section').forEach(s => s.style.display = 'none');

    // Show SVG in preview
    svgPreview.innerHTML = currentSvgString;

    // Enable buttons
    btnExport.disabled = false;
    btnCrop.disabled = false;
    btnConvert.style.display = 'none'; // no conversion for SVG

    // Build color editor for SVG editing
    buildColorSwatches();

    // Show editor
    dropzone.classList.add('hidden');
    dropzone.classList.remove('active');
    editor.classList.remove('hidden');

    showToast('SVG loaded — use Crop or Export', 'success');
}

// ─── Load raster image ─────────────────────────────────────
async function loadImage(filePath) {
    currentFilePath = filePath;
    isSvgMode = false;
    currentSvgString = null;
    btnExport.disabled = true;
    btnCrop.disabled = true;

    // Show original pane
    paneOriginal.style.display = '';
    document.querySelector('.preview-divider').style.display = '';

    // Show conversion sidebar sections
    sidebar.querySelectorAll('.sidebar-section').forEach(s => s.style.display = '');
    updateModeVisibility();
    btnConvert.style.display = '';

    const dataUrl = await window.api.getImageDataUrl(filePath);
    if (!dataUrl) {
        showToast('Failed to read image file', 'error');
        return;
    }
    imgOriginal.src = dataUrl;
    svgPreview.innerHTML = '<p style="color:var(--text-dim);font-size:12px;">Click Apply Settings to generate SVG</p>';

    dropzone.classList.add('hidden');
    dropzone.classList.remove('active');
    editor.classList.remove('hidden');

    await convertImage();
}

// ─── Convert (Apply Settings) ──────────────────────────────
btnConvert.addEventListener('click', convertImage);

async function convertImage() {
    if (!currentFilePath || isSvgMode) return;

    svgLoading.classList.remove('hidden');
    btnConvert.disabled = true;
    btnExport.disabled = true;
    btnCrop.disabled = true;

    const options = {
        mode: currentMode,
        numColors: parseInt(sliderColors.value, 10),
        threshold: parseInt(sliderThreshold.value, 10),
        turdSize: parseInt(sliderDetail.value, 10),
        optTolerance: parseFloat(sliderSmooth.value),
        resolution: parseInt(sliderResolution.value, 10),
        invert: chkInvert.checked,
        removeBackground: chkRemoveBg.checked,
    };

    const result = await window.api.convertImage(currentFilePath, options);

    svgLoading.classList.add('hidden');
    btnConvert.disabled = false;

    if (result.success) {
        currentSvgString = result.svg;
        svgPreview.innerHTML = result.svg;
        btnExport.disabled = false;
        btnCrop.disabled = false;
        buildColorSwatches();
        showToast('SVG updated ✓', 'success');
    } else {
        svgPreview.innerHTML = `<p style="color:var(--error);font-size:12px;padding:20px;">${result.error}</p>`;
        showToast('Conversion failed', 'error');
    }
}

// ─── Export ────────────────────────────────────────────────
btnExport.addEventListener('click', async () => {
    if (!currentSvgString) return;

    const baseName = currentFilePath
        ? currentFilePath.split('/').pop().replace(/\.[^.]+$/, '') + '.svg'
        : 'output.svg';

    const result = await window.api.saveSvg(currentSvgString, baseName);
    if (result.success) {
        showToast(`Saved to ${result.filePath}`, 'success');
    } else if (result.error) {
        showToast(`Save failed: ${result.error}`, 'error');
    }
});

// ─── New Image ─────────────────────────────────────────────
btnNew.addEventListener('click', () => {
    currentFilePath = null;
    currentSvgString = null;
    isSvgMode = false;
    imgOriginal.src = '';
    svgPreview.innerHTML = '';
    btnExport.disabled = true;
    btnCrop.disabled = true;
    exitCropMode();
    clearColorSwatches();

    // Restore full UI
    paneOriginal.style.display = '';
    document.querySelector('.preview-divider').style.display = '';
    sidebar.querySelectorAll('.sidebar-section').forEach(s => s.style.display = '');
    updateModeVisibility();
    btnConvert.style.display = '';

    editor.classList.add('hidden');
    dropzone.classList.remove('hidden');
    dropzone.classList.add('active');
});

// ═══════════════════════════════════════════════════════════
//  Crop Tool
// ═══════════════════════════════════════════════════════════

btnCrop.addEventListener('click', () => {
    if (!currentSvgString) return;
    enterCropMode();
});

btnCropCancel.addEventListener('click', exitCropMode);

btnCropApply.addEventListener('click', () => {
    applyCrop();
    exitCropMode();
});

function enterCropMode() {
    cropOverlay.classList.add('active');
    cropToolbar.classList.add('visible');
    cropRect.style.display = 'none';
    showToast('Click and drag to select crop area', 'success');
}

function exitCropMode() {
    cropOverlay.classList.remove('active');
    cropToolbar.classList.remove('visible');
    cropRect.style.display = 'none';
    cropStart = null;
}

// Mouse events for crop rectangle
cropOverlay.addEventListener('mousedown', (e) => {
    const rect = cropOverlay.getBoundingClientRect();
    cropStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    cropRect.style.left = cropStart.x + 'px';
    cropRect.style.top = cropStart.y + 'px';
    cropRect.style.width = '0';
    cropRect.style.height = '0';
    cropRect.style.display = 'block';
});

cropOverlay.addEventListener('mousemove', (e) => {
    if (!cropStart) return;
    const rect = cropOverlay.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const x = Math.min(cropStart.x, mx);
    const y = Math.min(cropStart.y, my);
    const w = Math.abs(mx - cropStart.x);
    const h = Math.abs(my - cropStart.y);

    cropRect.style.left = x + 'px';
    cropRect.style.top = y + 'px';
    cropRect.style.width = w + 'px';
    cropRect.style.height = h + 'px';
});

cropOverlay.addEventListener('mouseup', () => {
    cropStart = null;
});

function applyCrop() {
    if (!currentSvgString) return;

    const svgEl = svgPreview.querySelector('svg');
    if (!svgEl) return;

    const cropRectBounds = cropRect.getBoundingClientRect();
    const svgBounds = svgEl.getBoundingClientRect();

    // Bail if crop rect is too small
    if (cropRectBounds.width < 5 || cropRectBounds.height < 5) {
        showToast('Crop area too small', 'error');
        return;
    }

    // Get the SVG viewBox or use width/height
    let vbX = 0, vbY = 0, vbW, vbH;
    if (svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.width) {
        const vb = svgEl.viewBox.baseVal;
        vbX = vb.x; vbY = vb.y; vbW = vb.width; vbH = vb.height;
    } else {
        vbW = parseFloat(svgEl.getAttribute('width')) || svgBounds.width;
        vbH = parseFloat(svgEl.getAttribute('height')) || svgBounds.height;
    }

    // Scale from display pixels to viewBox units
    const scaleX = vbW / svgBounds.width;
    const scaleY = vbH / svgBounds.height;

    // Crop rect relative to SVG element
    const cx = (cropRectBounds.left - svgBounds.left) * scaleX + vbX;
    const cy = (cropRectBounds.top - svgBounds.top) * scaleY + vbY;
    const cw = cropRectBounds.width * scaleX;
    const ch = cropRectBounds.height * scaleY;

    // Clamp
    const newX = Math.max(vbX, cx);
    const newY = Math.max(vbY, cy);
    const newW = Math.min(cw, vbW - (newX - vbX));
    const newH = Math.min(ch, vbH - (newY - vbY));

    if (newW < 1 || newH < 1) {
        showToast('Invalid crop area', 'error');
        return;
    }

    const newViewBox = `${newX.toFixed(1)} ${newY.toFixed(1)} ${newW.toFixed(1)} ${newH.toFixed(1)}`;

    // Update viewBox in SVG string
    if (/viewBox="[^"]*"/.test(currentSvgString)) {
        currentSvgString = currentSvgString.replace(/viewBox="[^"]*"/, `viewBox="${newViewBox}"`);
    } else {
        // Insert viewBox if missing
        currentSvgString = currentSvgString.replace(/<svg/, `<svg viewBox="${newViewBox}"`);
    }

    // Update width/height
    if (/\bwidth="[^"]*"/.test(currentSvgString)) {
        currentSvgString = currentSvgString.replace(/\bwidth="[^"]*"/, `width="${Math.round(newW)}"`);
    }
    if (/\bheight="[^"]*"/.test(currentSvgString)) {
        currentSvgString = currentSvgString.replace(/\bheight="[^"]*"/, `height="${Math.round(newH)}"`);
    }

    svgPreview.innerHTML = currentSvgString;
    showToast('SVG cropped ✓', 'success');
}

// ═══════════════════════════════════════════════════════════
//  Color Editor
// ═══════════════════════════════════════════════════════════

function buildColorSwatches() {
    colorSwatchesContainer.innerHTML = '';

    if (!currentSvgString) {
        sectionColorEditor.style.display = 'none';
        return;
    }

    // Extract unique fill/color hex values from the SVG
    const colorRegex = /(?:fill|color)=["'](#[0-9a-fA-F]{3,8})["']/gi;
    const colorsSet = new Set();
    let match;
    while ((match = colorRegex.exec(currentSvgString)) !== null) {
        colorsSet.add(match[1].toLowerCase());
    }

    // Also check for fill in style attributes
    const styleRegex = /fill:\s*(#[0-9a-fA-F]{3,8})/gi;
    while ((match = styleRegex.exec(currentSvgString)) !== null) {
        colorsSet.add(match[1].toLowerCase());
    }

    const colors = [...colorsSet];
    if (colors.length === 0) {
        sectionColorEditor.style.display = 'none';
        return;
    }

    sectionColorEditor.style.display = '';

    colors.forEach((hex) => {
        // Normalize 3-char hex to 6-char for the color picker
        const fullHex = hex.length === 4
            ? '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]
            : hex;

        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = fullHex;
        swatch.title = fullHex;

        const picker = document.createElement('input');
        picker.type = 'color';
        picker.value = fullHex.slice(0, 7); // color input only supports 6-char hex

        picker.addEventListener('input', () => {
            const newColor = picker.value;
            replaceColorInSvg(hex, newColor);
            swatch.style.backgroundColor = newColor;
            swatch.title = newColor;
        });

        swatch.appendChild(picker);
        colorSwatchesContainer.appendChild(swatch);
    });
}

function replaceColorInSvg(oldColor, newColor) {
    if (!currentSvgString) return;

    // Replace all occurrences of the old color (case insensitive)
    const escaped = oldColor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    currentSvgString = currentSvgString.replace(regex, newColor);
    svgPreview.innerHTML = currentSvgString;
}

function clearColorSwatches() {
    colorSwatchesContainer.innerHTML = '';
    sectionColorEditor.style.display = 'none';
}

// ─── Toast ─────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = '') {
    clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.className = 'show';
    if (type) toast.classList.add(type);
    toastTimer = setTimeout(() => { toast.className = 'hidden'; }, 3000);
}
