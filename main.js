const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { convertImageToSvg } = require('./converter/tracer');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0a0f',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'build', 'icon.png'),
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ─── IPC Handlers ───────────────────────────────────────────

// Open file dialog — accepts images AND SVG files
ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select an Image or SVG',
    filters: [
      { name: 'All Supported', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'webp', 'tiff', 'gif', 'svg'] },
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'webp', 'tiff', 'gif'] },
      { name: 'SVG Files', extensions: ['svg'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// Convert raster image to SVG
ipcMain.handle('convert-image', async (_event, { filePath, options }) => {
  try {
    const svgString = await convertImageToSvg(filePath, options);
    return { success: true, svg: svgString };
  } catch (err) {
    console.error('Conversion error:', err);
    return { success: false, error: err.message };
  }
});

// Save SVG to file
ipcMain.handle('save-svg', async (_event, { svgString, defaultName }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save SVG',
    defaultPath: defaultName || 'output.svg',
    filters: [{ name: 'SVG Files', extensions: ['svg'] }],
  });
  if (result.canceled || !result.filePath) return { success: false };
  try {
    fs.writeFileSync(result.filePath, svgString, 'utf-8');
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Read image as data URL for preview
ipcMain.handle('get-image-data-url', async (_event, filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch (err) {
    return null;
  }
});

// Read SVG file contents
ipcMain.handle('read-svg-file', async (_event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { success: true, svg: content };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
