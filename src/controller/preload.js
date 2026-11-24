'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('walledguard', {
  open: site => ipcRenderer.invoke('walledguard:open', site),
  restart: () => ipcRenderer.invoke('walledguard:restart'),
  signin: () => ipcRenderer.invoke('walledguard:signin'),
  resume: () => ipcRenderer.invoke('walledguard:resume'),
  refreshColors: () => ipcRenderer.invoke('walledguard:colors'),
  history: () => ipcRenderer.invoke('walledguard:state'),
  onStatus: callback => ipcRenderer.on('walledguard:status', (_e, value) => callback(value)),
  onLog: callback => ipcRenderer.on('walledguard:log', (_e, value) => callback(value))
});
