const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
    convertImage: (filePath, options) =>
        ipcRenderer.invoke('convert-image', { filePath, options }),
    saveSvg: (svgString, defaultName) =>
        ipcRenderer.invoke('save-svg', { svgString, defaultName }),
    getImageDataUrl: (filePath) =>
        ipcRenderer.invoke('get-image-data-url', filePath),
    readSvgFile: (filePath) =>
        ipcRenderer.invoke('read-svg-file', filePath),
});
