const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getData: () => ipcRenderer.invoke('data:get'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  openFolder: () => ipcRenderer.invoke('data:openFolder'),
  exportData: () => ipcRenderer.invoke('data:export'),
  importData: () => ipcRenderer.invoke('data:import'),
  hideWindow: () => ipcRenderer.invoke('window:hide'),
  quit: () => ipcRenderer.invoke('app:quit'),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('app:setAutoLaunch', enabled),
  analyzeMeal: (apiKey, text) => ipcRenderer.invoke('gemini:analyzeMeal', { apiKey, text }),
  getRecommendation: (apiKey, context) => ipcRenderer.invoke('gemini:recommendation', { apiKey, context })
});
