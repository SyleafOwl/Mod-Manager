import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import https from "node:https";
import { spawn } from "node:child_process";
const require2 = createRequire(import.meta.url);
const extractZip = require2("extract-zip");
const sevenBin = require2("7zip-bin");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs")
    }
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(createWindow);
const userDataDir = () => app.getPath("userData");
const settingsPath = () => path.join(userDataDir(), "settings.json");
async function readSettings() {
  try {
    const buf = await fsp.readFile(settingsPath(), "utf-8");
    return JSON.parse(buf);
  } catch {
    return {};
  }
}
async function writeSettings(s) {
  await fsp.mkdir(userDataDir(), { recursive: true });
  await fsp.writeFile(settingsPath(), JSON.stringify(s, null, 2), "utf-8");
}
function ensureDirSync(p) {
  fs.mkdirSync(p, { recursive: true });
}
function isDirectory(full) {
  try {
    return fs.statSync(full).isDirectory();
  } catch {
    return false;
  }
}
async function extractArchive(archivePath, destDir) {
  await fsp.mkdir(destDir, { recursive: true });
  const ext = path.extname(archivePath).toLowerCase();
  if (ext === ".zip") {
    await extractZip(archivePath, { dir: destDir });
    return;
  }
  const sevenPath = sevenBin.path7za;
  await new Promise((resolve, reject) => {
    const child = spawn(sevenPath, ["x", archivePath, `-o${destDir}`, "-y"]);
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error("7zip exit " + code)));
  });
}
async function downloadToTemp(url) {
  const tmp = path.join(os.tmpdir(), `zzzmm_${Date.now()}`);
  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tmp);
    https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, (res2) => res2.pipe(file)).on("error", reject);
        file.on("finish", () => file.close(() => resolve()));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
    }).on("error", reject);
  });
  return tmp;
}
function characterDir(root, character) {
  return path.join(root, character);
}
function modDir(root, character, modName) {
  return path.join(characterDir(root, character), modName);
}
async function readModMeta(dir) {
  const metaPath = path.join(dir, "mod.json");
  try {
    const raw = await fsp.readFile(metaPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { name: path.basename(dir), enabled: true };
  }
}
async function writeModMeta(dir, meta) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const existing = await readModMeta(dir).catch(() => void 0);
  const merged = {
    createdAt: (existing == null ? void 0 : existing.createdAt) ?? now,
    updatedAt: now,
    enabled: true,
    ...existing,
    ...meta
  };
  await fsp.writeFile(path.join(dir, "mod.json"), JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}
ipcMain.handle("settings:get", async () => {
  return readSettings();
});
ipcMain.handle("settings:setModsRoot", async (_e, root) => {
  const s = await readSettings();
  s.modsRoot = root;
  await writeSettings(s);
  return s;
});
ipcMain.handle("dialog:selectFolder", async () => {
  const res = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
  if (res.canceled || res.filePaths.length === 0) return null;
  return res.filePaths[0];
});
ipcMain.handle("dialog:selectArchive", async () => {
  const res = await dialog.showOpenDialog({ properties: ["openFile"], filters: [
    { name: "Archives", extensions: ["zip", "7z", "rar"] }
  ] });
  if (res.canceled || res.filePaths.length === 0) return null;
  return res.filePaths[0];
});
ipcMain.handle("characters:list", async () => {
  const { modsRoot } = await readSettings();
  if (!modsRoot) return [];
  try {
    const entries = await fsp.readdir(modsRoot);
    return entries.filter((n) => isDirectory(path.join(modsRoot, n)));
  } catch {
    return [];
  }
});
ipcMain.handle("characters:add", async (_e, name) => {
  const { modsRoot } = await readSettings();
  if (!modsRoot) throw new Error("Mods root not set");
  const dir = characterDir(modsRoot, name);
  await fsp.mkdir(dir, { recursive: true });
  return name;
});
ipcMain.handle("mods:list", async (_e, character) => {
  const { modsRoot } = await readSettings();
  if (!modsRoot) return [];
  const cdir = characterDir(modsRoot, character);
  try {
    const entries = await fsp.readdir(cdir);
    const mods = [];
    for (const m of entries) {
      const mdir = path.join(cdir, m);
      if (!isDirectory(mdir)) continue;
      const meta = await readModMeta(mdir);
      const imgCandidates = ["preview.png", "preview.jpg", "cover.png", "cover.jpg"];
      const img = meta.image && fs.existsSync(path.join(mdir, meta.image)) ? meta.image : imgCandidates.find((f) => fs.existsSync(path.join(mdir, f)));
      mods.push({
        folder: m,
        dir: mdir,
        meta: { ...meta, image: img }
      });
    }
    return mods;
  } catch {
    return [];
  }
});
ipcMain.handle("mods:addFromArchive", async (_e, character, archivePath, modName, meta = {}) => {
  const { modsRoot } = await readSettings();
  if (!modsRoot) throw new Error("Mods root not set");
  const mdir = modDir(modsRoot, character, modName);
  ensureDirSync(mdir);
  await extractArchive(archivePath, mdir);
  await writeModMeta(mdir, { name: modName, ...meta });
  return true;
});
ipcMain.handle("mods:saveMetadata", async (_e, character, modName, meta) => {
  const { modsRoot } = await readSettings();
  if (!modsRoot) throw new Error("Mods root not set");
  const mdir = modDir(modsRoot, character, modName);
  const saved = await writeModMeta(mdir, { name: modName, ...meta });
  return saved;
});
ipcMain.handle("mods:delete", async (_e, character, modName) => {
  const { modsRoot } = await readSettings();
  if (!modsRoot) throw new Error("Mods root not set");
  const mdir = modDir(modsRoot, character, modName);
  await fsp.rm(mdir, { recursive: true, force: true });
  return true;
});
ipcMain.handle("mods:openPage", async (_e, character, modName) => {
  const { modsRoot } = await readSettings();
  if (!modsRoot) return false;
  const mdir = modDir(modsRoot, character, modName);
  const meta = await readModMeta(mdir);
  if (meta.pageUrl) {
    await shell.openExternal(meta.pageUrl);
    return true;
  }
  return false;
});
ipcMain.handle("mods:openFolder", async (_e, character, modName) => {
  const { modsRoot } = await readSettings();
  if (!modsRoot) return false;
  let target = modsRoot;
  if (character) target = characterDir(modsRoot, character);
  if (modName) target = modDir(modsRoot, character, modName);
  await shell.openPath(target);
  return true;
});
ipcMain.handle("mods:updateFromUrl", async (_e, character, modName) => {
  const { modsRoot } = await readSettings();
  if (!modsRoot) throw new Error("Mods root not set");
  const mdir = modDir(modsRoot, character, modName);
  const meta = await readModMeta(mdir);
  if (!meta.updateUrl) throw new Error("No updateUrl in mod.json");
  const tmp = await downloadToTemp(meta.updateUrl);
  await extractArchive(tmp, mdir);
  await writeModMeta(mdir, { ...meta, name: modName });
  try {
    await fsp.unlink(tmp);
  } catch {
  }
  return true;
});
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
