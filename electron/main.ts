import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import https from 'node:https'
import http from 'node:http'
import { spawn } from 'node:child_process'

const require = createRequire(import.meta.url)
// Lazy require for CJS packages (after createRequire defined)
const extractZip = require('extract-zip') as (src: string, opts: { dir: string }) => Promise<void>
const sevenBin = require('7zip-bin')
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let watcher: fs.FSWatcher | null = null

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    width: 1400,
    height: 800,
    minWidth: 1100,
    minHeight: 700,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  // Remove the application menu and hide the menu bar entirely
  try { Menu.setApplicationMenu(null) } catch {}
  try { win.setMenuBarVisibility(false) } catch {}

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(createWindow)

// Start FS watcher when modsRoot exists
app.whenReady().then(async () => {
  const { modsRoot } = await readSettings()
  if (modsRoot) setupWatcher(modsRoot)
})

// --------------------------- Helpers ---------------------------
const userDataDir = () => app.getPath('userData')
const settingsPath = () => path.join(userDataDir(), 'settings.json')

type Settings = {
  modsRoot?: string
  imagesRoot?: string
}

async function readSettings(): Promise<Settings> {
  try {
    const buf = await fsp.readFile(settingsPath(), 'utf-8')
    return JSON.parse(buf)
  } catch {
    return {}
  }
}

async function writeSettings(s: Settings) {
  await fsp.mkdir(userDataDir(), { recursive: true })
  await fsp.writeFile(settingsPath(), JSON.stringify(s, null, 2), 'utf-8')
}

function ensureDirSync(p: string) {
  fs.mkdirSync(p, { recursive: true })
}

function isDirectory(full: string) {
  try {
    return fs.statSync(full).isDirectory()
  } catch {
    return false
  }
}

function isFile(full: string) {
  try {
    return fs.statSync(full).isFile()
  } catch {
    return false
  }
}

// Archive extraction supporting zip and 7z/rar via 7zip
async function extractArchive(archivePath: string, destDir: string) {
  await fsp.mkdir(destDir, { recursive: true })
  const ext = path.extname(archivePath).toLowerCase()
  if (ext === '.zip') {
    await extractZip(archivePath, { dir: destDir })
    return
  }
  // Use 7zip for other formats
  const sevenPath = sevenBin.path7za as string
  await new Promise<void>((resolve, reject) => {
    const child = spawn(sevenPath, ['x', archivePath, `-o${destDir}`, '-y'])
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error('7zip exit ' + code))))
  })
}

function setupWatcher(root: string) {
  try { watcher?.close() } catch {}
  try {
    watcher = fs.watch(root, { recursive: true }, (() => {
      let t: NodeJS.Timeout | null = null
      return (_event, _file) => {
        if (t) clearTimeout(t)
        t = setTimeout(() => {
          win?.webContents.send('fs-changed', { root })
        }, 500)
      }
    })())
  } catch (e) {
    // ignore watch errors (e.g., unavailable recursive on some fs)
  }
}

// Download a file to a temp path
async function downloadToTemp(url: string): Promise<string> {
  const tmp = path.join(os.tmpdir(), `zzzmm_${Date.now()}`)
  await new Promise<void>((resolve, reject) => {
    const file = fs.createWriteStream(tmp)
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Handle redirects
        https.get(res.headers.location, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res2) => res2.pipe(file))
          .on('error', reject)
        file.on('finish', () => file.close(() => resolve()))
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve()))
    }).on('error', reject)
  })
  return tmp
}

// --------------------------- Images (data URL helper) ---------------------------
function guessMimeFromPath(p: string): string {
  const ext = path.extname(p).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  return 'application/octet-stream'
}

ipcMain.handle('images:readDataUrl', async (_e, absPath: string) => {
  try {
    const buf = await fsp.readFile(absPath)
    const mime = guessMimeFromPath(absPath)
    const base64 = buf.toString('base64')
    return `data:${mime};base64,${base64}`
  } catch {
    return null
  }
})

// Fetch an image from URL and return a data URL (avoids renderer CORS issues)
ipcMain.handle('images:fetchAsDataUrl', async (_e, imageUrl: string) => {
  async function fetchBuffer(u: string, redirectDepth = 3): Promise<{ buf: Buffer; mime: string }> {
    return await new Promise((resolve, reject) => {
      let client: typeof https | typeof http = https
      try { const proto = new URL(u).protocol; client = proto === 'http:' ? http : https } catch {}
      client.get(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
        const status = res.statusCode || 0
        if (status >= 300 && status < 400 && res.headers.location) {
          if (redirectDepth <= 0) return reject(new Error('Too many redirects'))
          fetchBuffer(res.headers.location, redirectDepth - 1).then(resolve, reject)
          return
        }
        if (status !== 200) return reject(new Error(`HTTP ${status}`))
        const mime = (res.headers['content-type'] || 'application/octet-stream').split(';')[0]
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
        res.on('end', () => resolve({ buf: Buffer.concat(chunks), mime }))
        res.on('error', reject)
      }).on('error', reject)
    })
  }

  const { buf, mime } = await fetchBuffer(imageUrl)
  const safeMime = /^image\//.test(mime) ? mime : 'image/png'
  const base64 = buf.toString('base64')
  return `data:${safeMime};base64,${base64}`
})

// Save an image from URL into imagesRoot/<character>/icon.ext
ipcMain.handle('images:saveFromUrl', async (_e, character: string, imageUrl: string, crop?: any) => {
  const { imagesRoot } = await readSettings()
  if (!imagesRoot) throw new Error('Images root not set')
  if (!character?.trim()) throw new Error('Character name required')
  if (!imageUrl?.trim()) throw new Error('Image URL required')
  const dir = path.join(imagesRoot, character)
  ensureDirSync(dir)

  let urlExt = '.png'
  try {
    const u = new URL(imageUrl)
    const e = path.extname(u.pathname).toLowerCase()
    if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(e)) urlExt = e
  } catch {
    // ignore URL parse errors; keep default
  }
  // Save with same name as the character folder (requested behavior)
  const safeName = character
  const finalPath = path.join(dir, `${safeName}${urlExt}`)

  const tmp = await downloadToTemp(imageUrl)
  try {
    await fsp.copyFile(tmp, finalPath)
  } finally {
    try { await fsp.unlink(tmp) } catch {}
  }
  // Also persist the source URL and optional crop as JSON in <Character>.txt for editing reference
  const urlTxt = path.join(dir, `${safeName}.txt`)
  const payload: any = { url: imageUrl }
  if (crop) payload.crop = crop
  try { await fsp.writeFile(urlTxt, JSON.stringify(payload, null, 2), 'utf-8') } catch {}
  return finalPath
})

// Save an image provided as a data URL (PNG/JPEG/WebP) to DataBase and optionally persist the source URL in a .txt
ipcMain.handle('images:saveFromDataUrl', async (_e, character: string, dataUrl: string, sourceUrl?: string, crop?: any) => {
  const { imagesRoot } = await readSettings()
  if (!imagesRoot) throw new Error('Images root not set')
  if (!character?.trim()) throw new Error('Character name required')
  if (!dataUrl?.startsWith('data:')) throw new Error('Invalid data URL')

  const dir = path.join(imagesRoot, character)
  ensureDirSync(dir)

  const m = /^data:(.+?);base64,(.*)$/.exec(dataUrl)
  if (!m) throw new Error('Unsupported data URL')
  const mime = m[1]
  const b64 = m[2]
  const buf = Buffer.from(b64, 'base64')

  let ext = '.png'
  if (mime.includes('jpeg')) ext = '.jpg'
  else if (mime.includes('webp')) ext = '.webp'
  else if (mime.includes('gif')) ext = '.gif'

  const finalPath = path.join(dir, `${character}${ext}`)
  await fsp.writeFile(finalPath, buf)
  if (sourceUrl || crop) {
    const payload: any = {}
    if (sourceUrl) payload.url = sourceUrl
    if (crop) payload.crop = crop
    try { await fsp.writeFile(path.join(dir, `${character}.txt`), JSON.stringify(payload, null, 2), 'utf-8') } catch {}
  }
  return finalPath
})

// Fetch DataBase info for a character: image path and saved URL
ipcMain.handle('database:getCharacterInfo', async (_e, character: string) => {
  const { imagesRoot } = await readSettings()
  if (!imagesRoot) return { imagePath: null, url: null }
  const dir = path.join(imagesRoot, character)
  const imagePath = pickFirstImageFile(dir, character)
  let url: string | null = null
  let crop: any = null
  try {
    const raw = await fsp.readFile(path.join(dir, `${character}.txt`), 'utf-8')
    try {
      const j = JSON.parse(raw)
      if (j && typeof j === 'object') {
        url = (j.url || '').trim() || null
        if (j.crop && typeof j.crop === 'object') crop = j.crop
      } else {
        url = String(raw).trim()
      }
    } catch {
      url = String(raw).trim()
    }
  } catch {}
  return { imagePath, url, crop }
})

// --------------------------- Data Model ---------------------------
type ModMeta = {
  name: string
  version?: string
  author?: string
  description?: string
  pageUrl?: string
  updateUrl?: string
  image?: string // relative file name inside the mod folder
  enabled?: boolean
  updatedAt?: string
  createdAt?: string
}

function characterDir(root: string, character: string) {
  return path.join(root, character)
}

function modDir(root: string, character: string, modName: string) {
  return path.join(characterDir(root, character), modName)
}

async function readModMeta(dir: string): Promise<ModMeta> {
  const metaPath = path.join(dir, 'mod.json')
  try {
    const raw = await fsp.readFile(metaPath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    // derive from folder name
    return { name: path.basename(dir), enabled: true }
  }
}

async function writeModMeta(dir: string, meta: ModMeta) {
  const now = new Date().toISOString()
  const existing = await readModMeta(dir).catch(() => undefined)
  const merged: ModMeta = {
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    enabled: true,
    ...existing,
    ...meta,
  }
  await fsp.writeFile(path.join(dir, 'mod.json'), JSON.stringify(merged, null, 2), 'utf-8')
  return merged
}

function pickFirstImageFile(dir: string, preferredBaseName?: string): string | null {
  try {
    const files = fs.readdirSync(dir)
    if (preferredBaseName) {
      const preferred = files.find((f) => new RegExp(`^${preferredBaseName}\\.(png|jpe?g|webp)$`, 'i').test(f))
      if (preferred && isFile(path.join(dir, preferred))) return path.join(dir, preferred)
    }
    const img = files.find((f) => /\.(png|jpe?g|webp)$/i.test(f) && isFile(path.join(dir, f)))
    return img ? path.join(dir, img) : null
  } catch {
    return null
  }
}

// --------------------------- IPC ---------------------------

ipcMain.handle('settings:get', async () => {
  return readSettings()
})

ipcMain.handle('settings:setModsRoot', async (_e, root: string) => {
  const s = await readSettings()
  s.modsRoot = root
  await writeSettings(s)
  setupWatcher(root)
  return s
})

ipcMain.handle('settings:setImagesRoot', async (_e, root: string) => {
  const s = await readSettings()
  s.imagesRoot = root
  await writeSettings(s)
  return s
})

ipcMain.handle('dialog:selectFolder', async () => {
  const res = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
  if (res.canceled || res.filePaths.length === 0) return null
  return res.filePaths[0]
})

ipcMain.handle('dialog:selectArchive', async () => {
  const res = await dialog.showOpenDialog({ properties: ['openFile'], filters: [
    { name: 'Archives', extensions: ['zip', '7z', 'rar'] },
  ] })
  if (res.canceled || res.filePaths.length === 0) return null
  return res.filePaths[0]
})

ipcMain.handle('characters:list', async () => {
  const { modsRoot } = await readSettings()
  if (!modsRoot) return []
  try {
    const entries = await fsp.readdir(modsRoot)
    return entries.filter((n) => isDirectory(path.join(modsRoot, n)))
  } catch {
    return []
  }
})

ipcMain.handle('characters:listWithImages', async () => {
  const { modsRoot, imagesRoot } = await readSettings()
  if (!modsRoot) return []
  let names: string[] = []
  try {
    const entries = await fsp.readdir(modsRoot)
    names = entries.filter((n) => isDirectory(path.join(modsRoot, n)))
  } catch {
    names = []
  }
  const items = names.map((name) => {
    const idir = imagesRoot ? path.join(imagesRoot, name) : null
    const imgPath = idir ? pickFirstImageFile(idir, name) : null
    return { name, imagePath: imgPath || undefined }
  })
  return items
})

ipcMain.handle('characters:add', async (_e, name: string) => {
  const { modsRoot } = await readSettings()
  if (!modsRoot) throw new Error('Mods root not set')
  const dir = characterDir(modsRoot, name)
  await fsp.mkdir(dir, { recursive: true })
  return name
})

ipcMain.handle('characters:rename', async (_e, oldName: string, newName: string) => {
  const { modsRoot } = await readSettings()
  if (!modsRoot) throw new Error('Mods root not set')
  const from = characterDir(modsRoot, oldName)
  const to = characterDir(modsRoot, newName)
  if (!isDirectory(from)) throw new Error('Source character does not exist')
  if (from === to) return { changed: false }
  try {
    // Windows case-only rename workaround
    const caseOnly = oldName.toLowerCase() === newName.toLowerCase()
    if (caseOnly) {
      const temp = path.join(modsRoot, `${oldName}__tmp__${Date.now()}`)
      await fsp.rename(from, temp)
      await fsp.rename(temp, to)
    } else {
      // if target exists, error
      try { await fsp.access(to); throw new Error('Target already exists') } catch {}
      await fsp.rename(from, to)
    }
    // Notify renderer to refresh
    win?.webContents.send('fs-changed', { root: modsRoot })
    return { changed: true }
  } catch (e) {
    throw e
  }
})

ipcMain.handle('characters:normalizeNames', async () => {
  const { modsRoot } = await readSettings()
  if (!modsRoot) throw new Error('Mods root not set')
  const entries = await fsp.readdir(modsRoot)
  const result: { changed: Array<{ from: string, to: string }>, skipped: string[] } = { changed: [], skipped: [] }

  function normalize(n: string) {
    const trimmed = n.trim()
    if (!trimmed) return n
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()
  }

  for (const name of entries) {
    const full = path.join(modsRoot, name)
    if (!isDirectory(full)) continue
    const targetName = normalize(name)
    if (targetName === name) continue
    const target = path.join(modsRoot, targetName)

    try {
      // Handle case-insensitive rename on Windows by renaming to a temp name first if needed
      const sameCaseOnly = name.toLowerCase() === targetName.toLowerCase()
      if (sameCaseOnly) {
        const temp = path.join(modsRoot, `${name}__tmp__${Date.now()}`)
        await fsp.rename(full, temp)
        await fsp.rename(temp, target)
      } else {
        // If target exists, skip
        try {
          await fsp.access(target)
          result.skipped.push(name)
          continue
        } catch {}
        await fsp.rename(full, target)
      }
      result.changed.push({ from: name, to: targetName })
    } catch {
      result.skipped.push(name)
    }
  }

  // Notify renderer to refresh
  win?.webContents.send('fs-changed', { root: modsRoot })
  return result
})

ipcMain.handle('characters:delete', async (_e, name: string) => {
  const { modsRoot, imagesRoot } = await readSettings()
  if (!modsRoot) throw new Error('Mods root not set')
  if (!name?.trim()) throw new Error('Character name required')
  const cmods = characterDir(modsRoot, name)
  try {
    await fsp.rm(cmods, { recursive: true, force: true })
  } catch {}
  if (imagesRoot) {
    const cimgs = path.join(imagesRoot, name)
    try { await fsp.rm(cimgs, { recursive: true, force: true }) } catch {}
  }
  // Notify renderer to refresh
  try { win?.webContents.send('fs-changed', { root: modsRoot }) } catch {}
  return true
})

ipcMain.handle('mods:list', async (_e, character: string) => {
  const { modsRoot } = await readSettings()
  if (!modsRoot) return []
  const cdir = characterDir(modsRoot, character)
  try {
    const entries = await fsp.readdir(cdir)
    const mods: any[] = []
    for (const m of entries) {
      const mdir = path.join(cdir, m)
      if (!isDirectory(mdir)) continue
      const meta = await readModMeta(mdir)
      // find a preview image if present
      const imgCandidates = ['preview.png', 'preview.jpg', 'cover.png', 'cover.jpg']
      const img = meta.image && fs.existsSync(path.join(mdir, meta.image)) ? meta.image : imgCandidates.find((f) => fs.existsSync(path.join(mdir, f)))
      mods.push({
        folder: m,
        dir: mdir,
        meta: { ...meta, image: img },
      })
    }
    return mods
  } catch {
    return []
  }
})

ipcMain.handle('mods:addFromArchive', async (_e, character: string, archivePath: string, modName: string, meta: Partial<ModMeta> = {}) => {
  const { modsRoot } = await readSettings()
  if (!modsRoot) throw new Error('Mods root not set')
  const mdir = modDir(modsRoot, character, modName)
  ensureDirSync(mdir)
  await extractArchive(archivePath, mdir)
  await writeModMeta(mdir, { name: modName, ...meta })
  return true
})

function uniqueModName(root: string, character: string, base: string) {
  let name = base
  let i = 2
  while (true) {
    const dir = modDir(root, character, name)
    if (!fs.existsSync(dir)) return name
    name = `${base} (${i++})`
  }
}

ipcMain.handle('mods:copyArchiveToModFolder', async (_e, character: string, archivePath: string) => {
  const { modsRoot } = await readSettings()
  if (!modsRoot) throw new Error('Mods root not set')
  if (!character?.trim()) throw new Error('Character required')
  if (!archivePath) throw new Error('Archive required')
  const originalName = path.basename(archivePath)
  const base = originalName.replace(/\.(zip|7z|rar)$/i, '')
  const modName = uniqueModName(modsRoot, character, base)
  const mdir = modDir(modsRoot, character, modName)
  await fsp.mkdir(mdir, { recursive: true })
  const dest = path.join(mdir, originalName)
  await fsp.copyFile(archivePath, dest)
  return { modName, fileName: originalName, dir: mdir }
})

ipcMain.handle('mods:saveImageFromDataUrl', async (_e, character: string, modName: string, dataUrl: string) => {
  const { modsRoot } = await readSettings()
  if (!modsRoot) throw new Error('Mods root not set')
  const mdir = modDir(modsRoot, character, modName)
  await fsp.mkdir(mdir, { recursive: true })
  const m = /^data:(.+?);base64,(.*)$/.exec(dataUrl)
  if (!m) throw new Error('Unsupported data URL')
  const mime = m[1]
  const b64 = m[2]
  const buf = Buffer.from(b64, 'base64')
  let ext = '.png'
  if (mime.includes('jpeg')) ext = '.jpg'
  else if (mime.includes('webp')) ext = '.webp'
  else if (mime.includes('gif')) ext = '.gif'
  const fileName = `preview${ext}`
  await fsp.writeFile(path.join(mdir, fileName), buf)
  return fileName
})

ipcMain.handle('mods:saveImageFromUrl', async (_e, character: string, modName: string, imageUrl: string) => {
  const { modsRoot } = await readSettings()
  if (!modsRoot) throw new Error('Mods root not set')
  const mdir = modDir(modsRoot, character, modName)
  await fsp.mkdir(mdir, { recursive: true })
  // Download buffer
  const tmp = await downloadToTemp(imageUrl)
  let urlExt = '.png'
  try {
    const u = new URL(imageUrl)
    const e = path.extname(u.pathname).toLowerCase()
    if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(e)) urlExt = e
  } catch {}
  const fileName = `preview${urlExt}`
  await fsp.copyFile(tmp, path.join(mdir, fileName))
  try { await fsp.unlink(tmp) } catch {}
  return fileName
})

// Add a mod entry into the character's DataBase JSON and optionally save an image as <Character>MOD<N>.* inside the images folder
ipcMain.handle('database:addModEntry', async (_e, character: string, modName: string, payload: { pageUrl?: string; imageUrl?: string; dataUrl?: string }) => {
  const { imagesRoot } = await readSettings()
  if (!imagesRoot) throw new Error('Images root not set')
  if (!character?.trim()) throw new Error('Character required')
  const cdir = path.join(imagesRoot, character)
  ensureDirSync(cdir)

  // Read existing JSON
  const txtPath = path.join(cdir, `${character}.txt`)
  let json: any = {}
  try {
    const raw = await fsp.readFile(txtPath, 'utf-8')
    try { json = JSON.parse(raw) } catch { json = { url: String(raw).trim() || undefined } }
  } catch {}
  if (!json || typeof json !== 'object') json = {}
  if (!Array.isArray(json.mods)) json.mods = []

  // Determine next mod index
  let nextIndex = json.mods.length + 1
  try {
    const files = await fsp.readdir(cdir)
    const re = new RegExp(`^${character}MOD(\\d+)\\.(png|jpe?g|webp|gif)$`, 'i')
    let max = 0
    for (const f of files) {
      const m = re.exec(f)
      if (m) {
        const n = parseInt(m[1], 10)
        if (n > max) max = n
      }
    }
    nextIndex = Math.max(nextIndex, max + 1)
  } catch {}

  // Save image file if provided
  let imageFile: string | undefined
  if (payload?.dataUrl || payload?.imageUrl) {
    let buf: Buffer | null = null
    let ext = '.png'
    if (payload.dataUrl) {
      const m = /^data:(.+?);base64,(.*)$/.exec(payload.dataUrl)
      if (!m) throw new Error('Unsupported data URL')
      const mime = m[1]
      const b64 = m[2]
      buf = Buffer.from(b64, 'base64')
      if (mime.includes('jpeg')) ext = '.jpg'
      else if (mime.includes('webp')) ext = '.webp'
      else if (mime.includes('gif')) ext = '.gif'
    } else if (payload.imageUrl) {
      // download
      const tmp = await downloadToTemp(payload.imageUrl)
      try {
        const u = new URL(payload.imageUrl)
        const e = path.extname(u.pathname).toLowerCase()
        if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(e)) ext = e
      } catch {}
      const dest = path.join(cdir, `__tmp__${Date.now()}${ext}`)
      await fsp.copyFile(tmp, dest)
      try { await fsp.unlink(tmp) } catch {}
      buf = await fsp.readFile(dest)
      try { await fsp.unlink(dest) } catch {}
    }
    if (buf) {
      imageFile = `${character}MOD${nextIndex}${ext}`
      await fsp.writeFile(path.join(cdir, imageFile), buf)
    }
  }

  json.mods.push({ name: modName, pageUrl: payload?.pageUrl || undefined, imageUrl: payload?.imageUrl || undefined, imageFile })
  await fsp.writeFile(txtPath, JSON.stringify(json, null, 2), 'utf-8')
  return { index: nextIndex, imageFile }
})

// Read a mod entry from the character's DataBase JSON (<Character>.txt) by mod name
ipcMain.handle('database:getModEntry', async (_e, character: string, modName: string) => {
  const { imagesRoot } = await readSettings()
  if (!imagesRoot) return null
  if (!character?.trim() || !modName?.trim()) return null
  const cdir = path.join(imagesRoot, character)
  try {
    const txtPath = path.join(cdir, `${character}.txt`)
    const raw = await fsp.readFile(txtPath, 'utf-8')
    let json: any
    try { json = JSON.parse(raw) } catch { json = { url: String(raw).trim() || undefined } }
    if (!json || typeof json !== 'object') return null
    const mods = Array.isArray(json.mods) ? json.mods : []
    const found = mods.find((m: any) => m && typeof m === 'object' && m.name === modName)
    if (!found) return null
    return {
      pageUrl: (found.pageUrl || undefined),
      imageUrl: (found.imageUrl || undefined),
      imageFile: (found.imageFile || undefined),
    }
  } catch {
    return null
  }
})

// Update (or insert) a mod entry inside the character's DataBase JSON
ipcMain.handle('database:updateModEntry', async (_e, character: string, modName: string, payload: { pageUrl?: string; imageUrl?: string }) => {
  const { imagesRoot } = await readSettings()
  if (!imagesRoot) throw new Error('Images root not set')
  if (!character?.trim() || !modName?.trim()) throw new Error('Character and modName are required')
  const cdir = path.join(imagesRoot, character)
  ensureDirSync(cdir)

  const txtPath = path.join(cdir, `${character}.txt`)
  let json: any = {}
  try {
    const raw = await fsp.readFile(txtPath, 'utf-8')
    try { json = JSON.parse(raw) } catch { json = { url: String(raw).trim() || undefined } }
  } catch {}
  if (!json || typeof json !== 'object') json = {}
  if (!Array.isArray(json.mods)) json.mods = []

  const mods = json.mods as any[]
  let found = mods.find((m) => m && typeof m === 'object' && m.name === modName)
  if (!found) {
    found = { name: modName }
    mods.push(found)
  }
  if (payload) {
    if ('pageUrl' in payload) found.pageUrl = payload.pageUrl || undefined
    if ('imageUrl' in payload) found.imageUrl = payload.imageUrl || undefined
  }

  await fsp.writeFile(txtPath, JSON.stringify(json, null, 2), 'utf-8')
  return true
})

ipcMain.handle('mods:saveMetadata', async (_e, character: string, modName: string, meta: Partial<ModMeta>) => {
  const { modsRoot } = await readSettings()
  if (!modsRoot) throw new Error('Mods root not set')
  const mdir = modDir(modsRoot, character, modName)
  const saved = await writeModMeta(mdir, { name: modName, ...meta })
  return saved
})

ipcMain.handle('mods:delete', async (_e, character: string, modName: string) => {
  const { modsRoot } = await readSettings()
  if (!modsRoot) throw new Error('Mods root not set')
  const mdir = modDir(modsRoot, character, modName)
  await fsp.rm(mdir, { recursive: true, force: true })
  return true
})

ipcMain.handle('mods:openPage', async (_e, character: string, modName: string) => {
  const { modsRoot } = await readSettings()
  if (!modsRoot) return false
  const mdir = modDir(modsRoot, character, modName)
  const meta = await readModMeta(mdir)
  if (meta.pageUrl) {
    await shell.openExternal(meta.pageUrl)
    return true
  }
  return false
})

ipcMain.handle('mods:openFolder', async (_e, character: string, modName?: string) => {
  const { modsRoot } = await readSettings()
  if (!modsRoot) return false
  let target = modsRoot
  if (character) target = characterDir(modsRoot, character)
  if (modName) target = modDir(modsRoot, character, modName)
  await shell.openPath(target)
  return true
})

ipcMain.handle('mods:updateFromUrl', async (_e, character: string, modName: string) => {
  const { modsRoot } = await readSettings()
  if (!modsRoot) throw new Error('Mods root not set')
  const mdir = modDir(modsRoot, character, modName)
  const meta = await readModMeta(mdir)
  if (!meta.updateUrl) throw new Error('No updateUrl in mod.json')
  const tmp = await downloadToTemp(meta.updateUrl)
  await extractArchive(tmp, mdir)
  await writeModMeta(mdir, { ...meta, name: modName })
  try { await fsp.unlink(tmp) } catch {}
  return true
})

// Note: 'characters:updateImages' feature was removed intentionally.
