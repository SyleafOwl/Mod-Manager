"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("api", {
  getSettings: () => electron.ipcRenderer.invoke("settings:get"),
  setModsRoot: (root) => electron.ipcRenderer.invoke("settings:setModsRoot", root),
  selectFolder: () => electron.ipcRenderer.invoke("dialog:selectFolder"),
  selectArchive: () => electron.ipcRenderer.invoke("dialog:selectArchive"),
  listCharacters: () => electron.ipcRenderer.invoke("characters:list"),
  addCharacter: (name) => electron.ipcRenderer.invoke("characters:add", name),
  listMods: (character) => electron.ipcRenderer.invoke("mods:list", character),
  addModFromArchive: (character, archivePath, modName, meta) => electron.ipcRenderer.invoke("mods:addFromArchive", character, archivePath, modName, meta),
  saveModMetadata: (character, modName, meta) => electron.ipcRenderer.invoke("mods:saveMetadata", character, modName, meta),
  deleteMod: (character, modName) => electron.ipcRenderer.invoke("mods:delete", character, modName),
  openModPage: (character, modName) => electron.ipcRenderer.invoke("mods:openPage", character, modName),
  openFolder: (character, modName) => electron.ipcRenderer.invoke("mods:openFolder", character, modName),
  updateFromUrl: (character, modName) => electron.ipcRenderer.invoke("mods:updateFromUrl", character, modName)
});
