/* ═════════════════════════════════════════════════════════════
   VectorForge – Renderer
   ════════════════════════════════════════════════════════════ */

// ─── DOM refs ──────────────────────────────────────────────
const dropzone = document.getElementById('dropzone');
const editor = document.getElementById('editor');
const imgOriginal = document.getElementById('img-original');
const svgPreview = document.getElementById('svg-preview');
const svgLoading = document.getElementById('svg-loading');
const btnBrowse = document.getElementById('btn-browse');
const btnConvert = document.getElementById('btn-convert');
const btnExport = document.getElementById('btn-export');
const btnNew = document.getElementById('btn-new');
const toast = document.getElementById('toast');

const sliderColors = document.getElementById('slider-colors');
const sliderThreshold = document.getElementById('slider-threshold');
const sliderDetail = document.getElementById('slider-detail');
const sliderSmooth = document.getElementById('slider-smooth');
const sliderResolution = document.getElementById('slider-resolution');
const chkInvert = document.getElementById('chk-invert');

const valColors = document.getElementById('val-colors');
const valThreshold = document.getElementById('val-threshold');
const valDetail = document.getElementById('val-detail');
const valSmooth = document.getElementById('val-smooth');
const valResolution = document.getElementById('val-resolution');

const sectionColors = document.getElementById('section-colors');
const sectionThreshold = document.getElementById('section-threshold');
const modeBtns = document.querySelectorAll('.mode-btn');

// ─── State ─────────────────────────────────────────────────
let currentFilePath = null;
let currentSvgString = null;
let currentMode = 'color';

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

    // Electron gives us the path via the File object
    const filePath = file.path;
    if (!filePath) {
        showToast('Could not read file path', 'error');
        return;
    }
    await loadImage(filePath);
});

// ─── Browse button ─────────────────────────────────────────
btnBrowse.addEventListener('click', async () => {
    const filePath = await window.api.openFileDialog();
    if (filePath) await loadImage(filePath);
});

// ─── Load image ────────────────────────────────────────────
async function loadImage(filePath) {
    currentFilePath = filePath;
    currentSvgString = null;
    btnExport.disabled = true;

    // Show original image
    const dataUrl = await window.api.getImageDataUrl(filePath);
    if (!dataUrl) {
        showToast('Failed to read image file', 'error');
        return;
    }
    imgOriginal.src = dataUrl;
    svgPreview.innerHTML = '<p style="color:var(--text-dim);font-size:12px;">Click "Convert" to generate SVG</p>';

    // Switch to editor view
    dropzone.classList.add('hidden');
    dropzone.classList.remove('active');
    editor.classList.remove('hidden');

    // Auto-convert
    await convertImage();
}

// ─── Convert ───────────────────────────────────────────────
btnConvert.addEventListener('click', convertImage);

async function convertImage() {
    if (!currentFilePath) return;

    svgLoading.classList.remove('hidden');
    btnConvert.disabled = true;
    btnExport.disabled = true;

    const options = {
        mode: currentMode,
        numColors: parseInt(sliderColors.value, 10),
        threshold: parseInt(sliderThreshold.value, 10),
        turdSize: parseInt(sliderDetail.value, 10),
        optTolerance: parseFloat(sliderSmooth.value),
        resolution: parseInt(sliderResolution.value, 10),
        invert: chkInvert.checked,
    };

    const result = await window.api.convertImage(currentFilePath, options);

    svgLoading.classList.add('hidden');
    btnConvert.disabled = false;

    if (result.success) {
        currentSvgString = result.svg;
        svgPreview.innerHTML = result.svg;
        btnExport.disabled = false;
        showToast('Conversion complete ✓', 'success');
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
    imgOriginal.src = '';
    svgPreview.innerHTML = '';
    btnExport.disabled = true;

    editor.classList.add('hidden');
    dropzone.classList.remove('hidden');
    dropzone.classList.add('active');
});

// ─── Toast ─────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = '') {
    clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.className = 'show';
    if (type) toast.classList.add(type);
    toastTimer = setTimeout(() => { toast.className = 'hidden'; }, 3000);
}
