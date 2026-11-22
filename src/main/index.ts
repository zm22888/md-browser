import { app, BrowserWindow, dialog, ipcMain, nativeTheme, net, protocol, shell } from 'electron'
import path, { resolve } from 'node:path'
import fsp from 'node:fs/promises'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import { pathToFileURL } from 'node:url'
import chokidar from 'chokidar'
import type { ExportPayload, SearchResult, TreeNode } from '../shared/types'

const MD_EXTS = new Set(['.md', '.markdown'])
const IGNORED_DIRS = new Set([
  'node_modules', 'dist', 'out', 'build', 'coverage',
  '.git', '.svn', '.idea', '.vscode', '.trash'
])
const WATCH_IGNORED = [/(^|[/\\])\./, /node_modules/]

let mainWindow: BrowserWindow | null = null
let watcher: chokidar.FSWatcher | null = null
let currentRoot: string | null = null
let notifyTimer: NodeJS.Timeout | null = null
let pendingOpenFiles: string[] | null = null

// ---------- 系统文件关联：从资源管理器打开 .md 文件 ----------
let rendererReady = false

function extractMdFiles(argv: string[]): string[] {
  return argv.filter((a) => /\.(md|markdown)$/i.test(a) && existsSync(a))
}

function requestOpenFiles(files: string[]): void {
  if (!files.length) return
  // renderer 未就绪时暂存，app:ready 后统一 flush（过早 send 会丢在空白页面上）
  if (rendererReady && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.webContents.send('app:open-files', { root: path.dirname(files[0]), files })
  } else {
    pendingOpenFiles = files
  }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  // 已有实例在运行：把文件路径转发给它，然后退出本实例
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const files = extractMdFiles(argv)
    if (!files.length) return
    if (rendererReady) requestOpenFiles(files)
    else pendingOpenFiles = files
  })
}

// ---------- 设置持久化（记住上次打开的文件夹 / 主题） ----------
function settingsFile(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

async function readSettings(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fsp.readFile(settingsFile(), 'utf-8'))
  } catch {
    return {}
  }
}

async function writeSettings(patch: Record<string, unknown>): Promise<void> {
  const merged = { ...(await readSettings()), ...patch }
  await fsp.mkdir(path.dirname(settingsFile()), { recursive: true })
  await fsp.writeFile(settingsFile(), JSON.stringify(merged, null, 2), 'utf-8')
}

// ---------- 目录树扫描（只保留文件夹与 .md 文件） ----------
async function scanTree(dir: string, depth: number): Promise<TreeNode[]> {
  if (depth > 12) return []
  let entries: Dirent[]
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const nodes: TreeNode[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue
      nodes.push({ name: entry.name, path: full, type: 'dir', children: await scanTree(full, depth + 1) })
    } else if (entry.isFile() && MD_EXTS.has(path.extname(entry.name).toLowerCase())) {
      nodes.push({ name: entry.name, path: full, type: 'file' })
    }
  }
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name, 'zh-CN')
  })
  return nodes
}

// ---------- 文件监听：目录变化实时通知渲染进程 ----------
function startWatcher(root: string): void {
  if (watcher) {
    watcher.close().catch(() => {})
    watcher = null
  }
  watcher = chokidar.watch(root, { ignoreInitial: true, ignored: WATCH_IGNORED })
  const notify = (changedPath: string, event: string): void => {
    if (notifyTimer) clearTimeout(notifyTimer)
    notifyTimer = setTimeout(() => {
      mainWindow?.webContents.send('fs:changed', { path: changedPath, event })
    }, 300)
  }
  watcher.on('all', (event, changedPath) => notify(changedPath, event))
  watcher.on('error', (err) => console.error('[watcher]', err))
}

// ---------- mdres:// 自定义协议：安全加载工作区内的本地图片等资源 ----------
protocol.registerSchemesAsPrivileged([
  { scheme: 'mdres', privileges: { standard: true, stream: true, supportFetchAPI: true } }
])

function registerMdresProtocol(): void {
  protocol.handle('mdres', (request) => {
    try {
      const url = new URL(request.url)
      const filePath = decodeURIComponent(url.pathname.replace(/^\//, ''))
      return net.fetch(pathToFileURL(filePath).toString())
    } catch (err) {
      console.error('[mdres]', request.url, err)
      return new Response('bad mdres url', { status: 400 })
    }
  })
}

let initialDark = false

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 940,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: initialDark ? '#0f1117' : '#f6f8fa',
    title: 'MD Browser',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => { mainWindow = null })
  mainWindow.webContents.on('console-message', (...args: unknown[]) => {
    // Electron 新旧版本事件签名不同，做兼容处理，把渲染进程日志转发到终端
    const levelOrDetails = args[1]
    const message = args[2]
    if (levelOrDetails && typeof levelOrDetails === 'object') {
      console.log('[renderer]', (levelOrDetails as { message?: string }).message)
    } else {
      console.log('[renderer]', message)
    }
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// ---------- IPC ----------
ipcMain.handle('settings:get', () => readSettings())
ipcMain.handle('settings:set', (_e, patch: Record<string, unknown>) => writeSettings(patch))

ipcMain.handle('dialog:openFolder', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
  const root = result.canceled ? null : result.filePaths[0]
  if (root) {
    currentRoot = root
    await writeSettings({ rootPath: root })
    startWatcher(root)
  }
  return root
})

ipcMain.handle('fs:readTree', async (_e, root: string) => {
  if (root !== currentRoot) {
    currentRoot = root
    startWatcher(root)
  }
  return scanTree(root, 0)
})

ipcMain.handle('fs:readFile', async (_e, filePath: string) => {
  if (!MD_EXTS.has(path.extname(filePath).toLowerCase())) {
    throw new Error(`不是 Markdown 文件：${filePath}`)
  }
  return fsp.readFile(filePath, 'utf-8')
})

ipcMain.handle('fs:writeFile', async (_e, filePath: string, content: string) => {
  if (!MD_EXTS.has(path.extname(filePath).toLowerCase())) {
    throw new Error(`不是 Markdown 文件：${filePath}`)
  }
  await fsp.writeFile(filePath, content, 'utf-8')
  return true
})

// 粘贴图片落盘：写入当前文档同目录的 assets/，返回 markdown 相对路径
ipcMain.handle('fs:saveImage', async (_e, baseDir: string, fileName: string, data: Uint8Array) => {
  await fsp.mkdir(path.join(baseDir, 'assets'), { recursive: true })
  const ext = path.extname(fileName).toLowerCase() || '.png'
  const base = path.basename(fileName, path.extname(fileName)).replace(/[^\w\u4e00-\u9fa5.-]/g, '_') || 'image'
  const rel = `assets/${Date.now()}_${base}${ext}`
  await fsp.writeFile(path.join(baseDir, rel), Buffer.from(data))
  return rel
})

ipcMain.handle('fs:exists', async (_e, filePath: string) => {
  try { await fsp.access(filePath); return true } catch { return false }
})

ipcMain.handle('path:resolve', (_e, base: string, rel: string) => path.resolve(base, rel))

ipcMain.handle('shell:openExternal', (_e, url: string) => {
  if (/^https?:\/\//.test(url)) return shell.openExternal(url)
  return false
})

ipcMain.handle('shell:showItemInFolder', (_e, filePath: string) => shell.showItemInFolder(filePath))

// 原生标题栏跟随应用主题（暗色主题下标题栏不再发白）
ipcMain.handle('theme:apply', (_e, dark: boolean) => {
  nativeTheme.themeSource = dark ? 'dark' : 'light'
})

// 渲染端初始化完成：此时才 flush 待打开的文件（避免早于监听器注册、或被 init 恢复流程覆盖）
ipcMain.handle('app:ready', () => {
  rendererReady = true
  if (pendingOpenFiles) {
    requestOpenFiles(pendingOpenFiles)
    pendingOpenFiles = null
  }
})

// ---------- 全文搜索 ----------
async function walkMdFiles(dir: string, depth: number, out: string[]): Promise<void> {
  if (depth > 12 || out.length > 2000) return
  let entries: Dirent[]
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue
      await walkMdFiles(full, depth + 1, out)
    } else if (entry.isFile() && MD_EXTS.has(path.extname(entry.name).toLowerCase())) {
      out.push(full)
    }
  }
}

ipcMain.handle('search:query', async (_e, root: string, query: string): Promise<SearchResult[]> => {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const files: string[] = []
  await walkMdFiles(root, 0, files)
  const results: SearchResult[] = []
  for (const file of files) {
    try {
      const stat = await fsp.stat(file)
      if (stat.size > 2 * 1024 * 1024) continue // 超大文件跳过
      const content = await fsp.readFile(file, 'utf-8')
      const lines = content.split(/\r?\n/)
      const matches: { line: number; text: string }[] = []
      for (let i = 0; i < lines.length && matches.length < 10; i++) {
        if (lines[i].toLowerCase().includes(q)) {
          const raw = lines[i]
          matches.push({ line: i + 1, text: raw.length > 200 ? raw.slice(0, 200) + '…' : raw })
        }
      }
      if (matches.length) results.push({ path: file, name: path.basename(file), matches })
      if (results.length >= 100) break
    } catch {
      // 跳过不可读文件
    }
  }
  return results
})

// ---------- 导出 HTML / PDF ----------
const EXPORT_CSS = `
:root { --code-bg: #f6f8fa; --border: #d9dee4; --text: #1f2328; }
html[data-theme="dark"] { --code-bg: #161b22; --border: #30363d; --text: #e6edf3; }
body { margin: 0; font-family: -apple-system, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', sans-serif; font-size: 15px; line-height: 1.75; color: var(--text); background: #ffffff; }
html[data-theme="dark"] body { background: #0d1117; }
.markdown-body { max-width: 820px; margin: 0 auto; padding: 40px 32px 80px; word-wrap: break-word; }
.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6 { margin: 1.6em 0 0.7em; font-weight: 600; line-height: 1.3; }
.markdown-body h1 { font-size: 1.9em; padding-bottom: 0.35em; border-bottom: 1px solid var(--border); margin-top: 0.4em; }
.markdown-body h2 { font-size: 1.45em; padding-bottom: 0.3em; border-bottom: 1px solid var(--border); }
.markdown-body h3 { font-size: 1.2em; }
.markdown-body p { margin: 0.85em 0; }
.markdown-body a { color: #0969da; text-decoration: none; }
.markdown-body ul, .markdown-body ol { padding-left: 1.6em; margin: 0.7em 0; }
.markdown-body blockquote { margin: 1em 0; padding: 2px 18px; border-left: 4px solid var(--border); color: #59636e; }
.markdown-body hr { height: 1px; border: none; background: var(--border); margin: 2em 0; }
.markdown-body img { max-width: 100%; border-radius: 6px; }
.markdown-body code { font-family: 'Cascadia Code', Consolas, monospace; font-size: 87%; background: var(--code-bg); border-radius: 5px; padding: 0.2em 0.4em; }
.markdown-body pre { margin: 1em 0; border-radius: 8px; overflow: auto; border: 1px solid var(--border); background: var(--code-bg); }
.markdown-body pre.shiki { padding: 16px 18px; }
.markdown-body pre.shiki code { background: none; padding: 0; font-size: 13.5px; line-height: 1.65; }
.markdown-body table { border-collapse: collapse; margin: 1em 0; display: block; overflow-x: auto; max-width: 100%; }
.markdown-body th, .markdown-body td { border: 1px solid var(--border); padding: 7px 14px; }
.markdown-body th { background: var(--code-bg); font-weight: 600; }
.markdown-body li.task-list-item { list-style: none; margin-left: -1.3em; }
.markdown-body .mermaid-chart { display: flex; justify-content: center; padding: 14px 0; overflow-x: auto; }
.markdown-body .mermaid-chart svg { max-width: 100%; }
.markdown-body .mermaid-error { padding: 12px 16px; border-radius: 8px; color: #cf222e; background: var(--code-bg); white-space: pre-wrap; }
.markdown-body .katex-display { display: block; overflow-x: auto; padding: 6px 0; }
.markdown-body mark.search-hit { background: #fff3a3; color: inherit; }
html[data-theme="dark"] .markdown-body mark.search-hit { background: #635315; color: #e6edf3; }
html[data-theme="dark"] .markdown-body pre.shiki span { color: var(--shiki-dark) !important; background-color: var(--shiki-dark-bg) !important; }
@media print { .markdown-body { max-width: none; padding: 0; } }
`

function escapeExportTitle(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildExportDoc(payload: ExportPayload): string {
  const css = EXPORT_CSS + '\n' + embedKatexFonts(payload.katexCss)
  return `<!doctype html>\n<html lang="zh-CN" data-theme="${payload.theme}">\n<head>\n<meta charset="utf-8">\n<title>${escapeExportTitle(payload.title)}</title>\n<style>${css}</style>\n</head>\n<body>\n<article class="markdown-body">${payload.bodyHtml}</article>\n</body>\n</html>`
}

/** 把 katex css 里的字体 url 重写为 base64 内联（node_modules 精确名 / 打包产物哈希名都兼容） */
function embedKatexFonts(css: string): string {
  return css.replace(/url\(([^)]+)\)/g, (whole, rawUrl: string) => {
    const fileName = rawUrl.replace(/^['"]|['"]$/g, '').split(/[\\/]/).pop() ?? ''
    const m = fileName.match(/^(KaTeX_[\w-]+)\.(woff2|woff|ttf)$/i)
    if (!m) return whole
    const buf = readFontFile(fileName, m[1], m[2])
    if (!buf) return whole
    const type = m[2].toLowerCase() === 'woff2' ? 'font/woff2' : m[2].toLowerCase() === 'woff' ? 'font/woff' : 'font/ttf'
    return `url(data:${type};base64,${buf.toString('base64')})`
  })
}

function readFontFile(fileName: string, stem: string, ext: string): Buffer | null {
  try {
    return readFileSync(resolve(process.cwd(), 'node_modules/katex/dist/fonts', fileName))
  } catch { /* 开发环境外再尝试打包产物 */ }
  try {
    const assetsDir = resolve(__dirname, '../renderer/assets')
    const hit = readdirSync(assetsDir).find(
      (f) => f.startsWith(`${stem}.`) && f.toLowerCase().endsWith(`.${ext}`)
    )
    if (hit) return readFileSync(resolve(assetsDir, hit))
  } catch { /* 未打包时忽略 */ }
  return null
}

ipcMain.handle('export:html', async (_e, payload: ExportPayload): Promise<string | null> => {
  if (!mainWindow) return null
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: '导出 HTML',
    defaultPath: payload.title.replace(/\.(md|markdown)$/i, '') + '.html',
    filters: [{ name: 'HTML', extensions: ['html'] }]
  })
  if (canceled || !filePath) return null
  await fsp.writeFile(filePath, buildExportDoc(payload), 'utf-8')
  return filePath
})

ipcMain.handle('export:pdf', async (_e, payload: ExportPayload): Promise<string | null> => {
  if (!mainWindow) return null
  const html = buildExportDoc(payload)
  const tmp = path.join(app.getPath('temp'), `md-browser-export-${Date.now()}.html`)
  await fsp.writeFile(tmp, html, 'utf-8')
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  try {
    await win.loadFile(tmp)
    const pdf = await win.webContents.printToPDF({ printBackground: true })
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: '导出 PDF',
      defaultPath: payload.title.replace(/\.(md|markdown)$/i, '') + '.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (canceled || !filePath) return null
    await fsp.writeFile(filePath, pdf)
    return filePath
  } finally {
    win.destroy()
    await fsp.unlink(tmp).catch(() => {})
  }
})

// ---------- 生命周期 ----------
app.whenReady().then(async () => {
  registerMdresProtocol()
  // 启动时按上次主题设置原生标题栏与窗口底色，避免暗色模式下闪白
  const settings = await readSettings()
  initialDark = settings.theme === 'dark'
  nativeTheme.themeSource = initialDark ? 'dark' : 'light'
  console.log('[md-browser] userData:', app.getPath('userData'))
  createWindow()
  // 启动参数里带 .md 文件（双击/右键打开）
  requestOpenFiles(extractMdFiles(process.argv))
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (watcher) watcher.close().catch(() => {})
  app.quit()
})
