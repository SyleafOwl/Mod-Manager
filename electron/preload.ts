import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose a safe API to the Renderer process ---------
contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setModsRoot: (root: string) => ipcRenderer.invoke('settings:setModsRoot', root),
  setImagesRoot: (root: string) => ipcRenderer.invoke('settings:setImagesRoot', root),
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  selectArchive: () => ipcRenderer.invoke('dialog:selectArchive'),

  listCharacters: () => ipcRenderer.invoke('characters:list'),
  listCharactersWithImages: () => ipcRenderer.invoke('characters:listWithImages'),
  addCharacter: (name: string) => ipcRenderer.invoke('characters:add', name),
  renameCharacter: (oldName: string, newName: string) => ipcRenderer.invoke('characters:rename', oldName, newName),
  normalizeCharacterNames: () => ipcRenderer.invoke('characters:normalizeNames'),
  deleteCharacter: (name: string) => ipcRenderer.invoke('characters:delete', name),

  listMods: (character: string) => ipcRenderer.invoke('mods:list', character),
  addModFromArchive: (character: string, archivePath: string, modName: string, meta?: any) => ipcRenderer.invoke('mods:addFromArchive', character, archivePath, modName, meta),
  copyArchiveToModFolder: (character: string, archivePath: string) => ipcRenderer.invoke('mods:copyArchiveToModFolder', character, archivePath),
  createModFromArchive: (character: string, archivePath: string) => ipcRenderer.invoke('mods:copyArchiveToModFolder', character, archivePath),
  saveModMetadata: (character: string, modName: string, meta: any) => ipcRenderer.invoke('mods:saveMetadata', character, modName, meta),
  saveModImageFromDataUrl: (character: string, modName: string, dataUrl: string) => ipcRenderer.invoke('mods:saveImageFromDataUrl', character, modName, dataUrl),
  saveModImageFromUrl: (character: string, modName: string, url: string) => ipcRenderer.invoke('mods:saveImageFromUrl', character, modName, url),
  getModPreviewDataUrl: (character: string, modName: string) => ipcRenderer.invoke('mods:getPreviewDataUrl', character, modName),
  getModData: (character: string, modName: string) => ipcRenderer.invoke('mods:getData', character, modName),
  setModData: (character: string, modName: string, payload: { pageUrl?: string; imageUrl?: string }) => ipcRenderer.invoke('mods:setData', character, modName, payload),
  getPrimaryInternalName: (character: string, modName: string) => ipcRenderer.invoke('mods:getPrimaryInternalName', character, modName),
  renamePrimaryInternal: (character: string, modName: string, newName: string) => ipcRenderer.invoke('mods:renamePrimaryInternal', character, modName, newName),
  peekPrimaryInternalName: (archivePath: string) => ipcRenderer.invoke('mods:peekPrimaryInternalName', archivePath),
  deleteMod: (character: string, modName: string) => ipcRenderer.invoke('mods:delete', character, modName),
  openModPage: (character: string, modName: string) => ipcRenderer.invoke('mods:openPage', character, modName),
  openFolder: (character?: string, modName?: string) => ipcRenderer.invoke('mods:openFolder', character, modName),
  updateFromUrl: (character: string, modName: string) => ipcRenderer.invoke('mods:updateFromUrl', character, modName),
  activateModExclusive: (character: string, modName: string) => ipcRenderer.invoke('mods:activateExclusive', character, modName),
  enableMod: (character: string, modName: string) => ipcRenderer.invoke('mods:enable', character, modName),
  disableMod: (character: string, modName: string) => ipcRenderer.invoke('mods:disable', character, modName),
  readImageAsDataUrl: (absPath: string) => ipcRenderer.invoke('images:readDataUrl', absPath),
  saveImageFromUrl: (character: string, url: string, crop?: any) => ipcRenderer.invoke('images:saveFromUrl', character, url, crop),
  fetchImageDataUrl: (url: string) => ipcRenderer.invoke('images:fetchAsDataUrl', url),
  saveImageFromDataUrl: (character: string, dataUrl: string, sourceUrl?: string, crop?: any) => ipcRenderer.invoke('images:saveFromDataUrl', character, dataUrl, sourceUrl, crop),
  getCharacterInfo: (character: string) => ipcRenderer.invoke('database:getCharacterInfo', character),
  deleteFile: (absPath: string) => ipcRenderer.invoke('fs:deleteFile', absPath),
  // Notify main that the renderer finished initial loading
  notifyReady: () => ipcRenderer.send('renderer:ready'),
  onFsChanged: (cb: (payload: any) => void) => {
    const handler = (_e: any, payload: any) => cb(payload)
    ipcRenderer.on('fs-changed', handler)
    return () => ipcRenderer.off('fs-changed', handler)
  },
})
