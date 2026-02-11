# VectorForge — Image to SVG Converter

> Turn any raster image into a high-quality SVG file, optimized for logos.

A desktop application built with Electron that converts JPEG, PNG, WebP, BMP, TIFF, and GIF images into scalable vector graphics using industry-standard Potrace tracing (the same engine behind Inkscape).

---

## ✨ Features

- **3 Conversion Modes** — Color (multi-layer), Posterize, and Black & White
- **Drag & Drop** — Drop any image onto the app or use the file browser
- **Live Preview** — Side-by-side original vs SVG with transparency checkerboard
- **Fine-Tune Controls** — Color count, threshold, detail suppression, curve smoothing, resolution
- **One-Click Export** — Save your SVG with a native file dialog
- **High-Quality Engine** — Sharp preprocessing + Potrace Bézier curve tracing + k-means++ color quantization

## 📋 Requirements

- **Node.js** ≥ 18
- **npm** ≥ 9
- **macOS**, **Windows**, or **Linux**

## 🚀 Setup

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/VectorForge.git
cd VectorForge
```

### 2. Install dependencies

```bash
npm install
```

### 3. Run the app

```bash
npm start
```

The app window will open — drag an image in and start converting.

### 4. Build as a native desktop app (optional)

```bash
# macOS — creates VectorForge.app in dist/mac/
npm run build:mac

# Windows
npm run build:win

# Linux
npm run build:linux
```

On macOS, copy the built app to Applications:

```bash
cp -R dist/mac/VectorForge.app /Applications/
```

---

## 🏗 Project Structure

```
├── main.js                 # Electron main process & IPC handlers
├── preload.js              # Secure context bridge
├── converter/
│   └── tracer.js           # Sharp preprocessing → Potrace tracing engine
├── renderer/
│   ├── index.html          # App UI layout
│   ├── styles.css          # Premium dark theme
│   └── renderer.js         # UI logic, drag-drop, preview, export
├── build/
│   ├── icon.png            # Source app icon
│   └── icon.icns           # macOS icon bundle
├── scripts/
│   └── make-icons.js       # Regenerate icon assets
├── package.json
├── LICENSE                 # MIT
└── .gitignore
```

## ⚙️ How It Works

1. **Preprocessing** — The image is auto-rotated, resized to a configurable max resolution, and sharpened using [Sharp](https://sharp.pixelplumbing.com/).
2. **Tracing** — [Potrace](http://potrace.sourceforge.net/) converts the bitmap into optimized Bézier curve paths.
3. **Color Mode** — For multi-color images, k-means++ quantization extracts a palette, then each color is traced as a separate layer and composited into a single SVG.

## 🛠 Configuration

All settings are adjustable in the sidebar:

| Setting | Range | Description |
|---------|-------|-------------|
| Mode | Color / Poster / B&W | Tracing strategy |
| Colors | 2–32 | Number of color layers (Color & Poster modes) |
| Threshold | 1–254 | Black/white cutoff (B&W mode) |
| Detail | 0–20 | Suppress speckles smaller than N px² |
| Smoothing | 0–2 | Curve optimization tolerance |
| Resolution | 256–4096 | Max processing dimension |
| Invert | On/Off | Invert image before tracing |

## 📄 License

[MIT](LICENSE)
