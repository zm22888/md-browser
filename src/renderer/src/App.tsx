import { useCallback, useEffect, useRef, useState } from 'react'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import SearchPanel from './components/SearchPanel'
import TabBar from './components/TabBar'
import Content from './components/Content'
import Editor from './components/Editor'
import Outline from './components/Outline'
import EmptyState from './components/EmptyState'
import { basename, scrollToId } from './lib/utils'
import { collectKatexCss } from './lib/export'
import type { OutlineItem, SearchResult, TreeNode } from './lib/types'

type Theme = 'light' | 'dark'
type Mode = 'view' | 'edit'

const normPath = (p: string): string => p.replace(/[\\/]+/g, '\\').toLowerCase()

export default function App() {
  const [root, setRoot] = useState<string | null>(null)
  const [tree, setTree] = useState<TreeNode[]>([])
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>('light')
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [activeId, setActiveId] = useState('')
  const [showOutline, setShowOutline] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [bumpKey, setBumpKey] = useState(0)
  const [scrollTarget, setScrollTarget] = useState<{ anchor: string; seq: number } | null>(null)
  const [mode, setMode] = useState<Mode>('view')
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [tabs, setTabs] = useState<string[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchHighlight, setSearchHighlight] = useState<string | null>(null)
  const [leftOpen, setLeftOpen] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const seqRef = useRef(0)
  const editorSaveRef = useRef<(() => Promise<void>) | null>(null)
  const renderedHtmlRef = useRef('')
  const searchTimerRef = useRef<number | null>(null)
  const toastTimerRef = useRef<number | null>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3500)
  }, [])

  // 主题应用到 <html data-theme>
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('md-theme', theme)
  }, [theme])

  const loadFolder = useCallback(async (folder: string) => {
    const nodes = await window.mdApi.readTree(folder)
    let nextExpanded = new Set(nodes.filter((n) => n.type === 'dir').map((n) => n.path))
    const saved = localStorage.getItem(`expanded:${folder}`)
    if (saved) {
      try {
        nextExpanded = new Set<string>(JSON.parse(saved) as string[])
      } catch { /* 使用默认展开 */ }
    }
    // 根目录 / 目录树 / 展开状态一次性提交，避免瞬时状态污染持久化
    setRoot(folder)
    setTree(nodes)
    setExpanded(nextExpanded)
  }, [])

  // 初始化：恢复上次打开的文件夹、文件、标签页与主题
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const settings = await window.mdApi.getSettings()
      const savedTheme = (settings.theme as Theme) || (localStorage.getItem('md-theme') as Theme) || 'light'
      const savedRoot = settings.rootPath as string | undefined
      let lastFile: string | undefined
      if (savedRoot) {
        const last =
          (settings.lastFile as string | undefined) || localStorage.getItem(`lastFile:${savedRoot}`)
        if (last && last.startsWith(savedRoot) && (await window.mdApi.exists(last))) {
          lastFile = last
        }
      }
      // 恢复标签页（校验文件仍然存在；当前文件自动加入）
      const savedTabs = ((settings.openTabs as string[] | undefined) ?? []).filter((p) =>
        p.startsWith(savedRoot ?? '')
      )
      const validTabs: string[] = []
      for (const p of savedTabs) {
        if (await window.mdApi.exists(p)) validTabs.push(p)
      }
      if (lastFile && !validTabs.includes(lastFile)) validTabs.unshift(lastFile)
      if (cancelled) return // 页面卸载或用户已先操作时，放弃用旧状态覆盖
      const dark = savedTheme === 'dark'
      setTheme(dark ? 'dark' : 'light')
      window.mdApi.applyThemeSource(dark) // 原生标题栏跟随
      if (savedRoot) {
        await loadFolder(savedRoot)
        if (cancelled) return
        if (lastFile) setCurrentFile(lastFile)
        setTabs(validTabs)
      }
      // 初始化全部完成：通知主进程可以接收"打开文件"请求
      window.mdApi.signalReady()
    })()
    return () => { cancelled = true }
  }, [loadFolder])

  const toggleDir = useCallback((dirPath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(dirPath)) next.delete(dirPath)
      else next.add(dirPath)
      return next
    })
  }, [])

  // 展开状态持久化
  useEffect(() => {
    if (root) localStorage.setItem(`expanded:${root}`, JSON.stringify([...expanded]))
  }, [expanded, root])

  // 监听文件系统变化：刷新目录树；当前文件被外部修改时重新加载
  useEffect(() => {
    const off = window.mdApi.onFsChanged(({ path: changedPath }) => {
      if (root) window.mdApi.readTree(root).then(setTree)
      if (changedPath && currentFile && normPath(changedPath) === normPath(currentFile)) {
        setBumpKey((k) => k + 1)
      }
    })
    return off
  }, [root, currentFile])

  const [saveError, setSaveError] = useState<string | null>(null)

  /** 编辑模式下保存；失败时返回 false 并把错误显示到顶栏，调用方据此决定是否继续（防止丢改动） */
  const saveIfEditing = useCallback(async (): Promise<boolean> => {
    if (!editorSaveRef.current) return true
    try {
      await editorSaveRef.current()
      setSaveError(null)
      return true
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
      return false
    }
  }, [])

  const handleOpenFolder = useCallback(async () => {
    if (!(await saveIfEditing())) return
    const folder = await window.mdApi.openFolder()
    if (!folder) return
    setCurrentFile(null)
    setOutline([])
    setDirty(false)
    await loadFolder(folder)
  }, [loadFolder, saveIfEditing])

  const openFile = useCallback(
    async (filePath: string, anchor?: string) => {
      if (!(await saveIfEditing())) return // 保存失败时不切换，避免丢改动
      setCurrentFile(filePath)
      setTabs((prev) => {
        const next = prev.includes(filePath) ? prev : [...prev, filePath]
        window.mdApi.setSettings({ openTabs: next, lastFile: filePath })
        return next
      })
      window.mdApi.setSettings({ lastFile: filePath })
      if (anchor) {
        seqRef.current += 1
        setScrollTarget({ anchor, seq: seqRef.current })
      }
    },
    [saveIfEditing]
  )

  const closeTab = useCallback(
    async (p: string) => {
      const isActive = currentFile && normPath(p) === normPath(currentFile)
      if (isActive && !(await saveIfEditing())) return // 保存失败：不关闭
      const idx = tabs.indexOf(p)
      const next = tabs.filter((t) => t !== p)
      setTabs(next)
      window.mdApi.setSettings({ openTabs: next })
      if (isActive) {
        const nextActive = next[Math.min(idx, next.length - 1)] ?? null
        setCurrentFile(nextActive)
        setDirty(false)
        setOutline([])
        if (nextActive) window.mdApi.setSettings({ lastFile: nextActive })
      }
    },
    [tabs, currentFile, saveIfEditing]
  )

  // 全文搜索（防抖）
  useEffect(() => {
    if (!searchOpen || !root) return
    const q = searchQuery.trim()
    if (!q) {
      setSearching(false)
      setSearchResults([])
      return
    }
    setSearching(true)
    const timer = window.setTimeout(() => {
      window.mdApi
        .searchQuery(root, q)
        .then((r) => {
          setSearchResults(r)
          setSearching(false)
        })
        .catch(() => setSearching(false))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [searchQuery, searchOpen, root])

  const openFromTree = useCallback(
    (p: string) => {
      setSearchHighlight(null)
      void openFile(p)
    },
    [openFile]
  )

  const openFromSearch = useCallback(
    (p: string) => {
      setSearchHighlight(searchQuery.trim() || null)
      void openFile(p)
    },
    [openFile, searchQuery]
  )

  const handleExport = useCallback(
    async (kind: 'html' | 'pdf') => {
      if (!currentFile) return
      const bodyHtml = renderedHtmlRef.current
      if (!bodyHtml) {
        showToast('当前没有可导出的渲染结果')
        return
      }
      try {
        const saved = await window.mdApi.exportDoc({
          kind,
          bodyHtml,
          katexCss: collectKatexCss(),
          title: basename(currentFile),
          theme
        })
        if (saved) showToast(`已导出：${saved}`)
      } catch (err) {
        showToast(`导出失败：${err instanceof Error ? err.message : String(err)}`)
      }
    },
    [currentFile, theme, showToast]
  )

  // 系统文件关联：资源管理器双击/右键打开 .md → 以该文件所在目录为根并打开
  useEffect(() => {
    const off = window.mdApi.onOpenFileRequest(async ({ root, files }) => {
      if (!(await saveIfEditing())) return
      setSearchHighlight(null)
      window.mdApi.setSettings({ rootPath: root, lastFile: files[0] })
      const next = [...files, ...tabs.filter((t) => !files.includes(t))]
      setTabs(next)
      window.mdApi.setSettings({ openTabs: next })
      await loadFolder(root)
      setCurrentFile(files[0])
      setDirty(false)
    })
    return off
  }, [loadFolder, saveIfEditing, tabs])

  const toggleMode = useCallback(async () => {
    if (mode === 'edit') {
      if (!(await saveIfEditing())) return // 保存失败：留在编辑模式并显示错误
      setMode('view')
    } else {
      setMode('edit')
    }
  }, [mode, saveIfEditing])

  const focusMode = !leftOpen && !showOutline

  const toggleFocus = useCallback(() => {
    if (!leftOpen || !showOutline) {
      setLeftOpen(true)
      setShowOutline(true)
    } else {
      setLeftOpen(false)
      setShowOutline(false)
    }
  }, [leftOpen, showOutline])

  const handleOutlineClick = useCallback((id: string) => {
    scrollToId(id)
  }, [])

  const handleToggleTheme = useCallback(() => {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    window.mdApi.setSettings({ theme: next })
    window.mdApi.applyThemeSource(next === 'dark')
  }, [theme])

  // Ctrl+O 打开文件夹；Ctrl+S 保存；Ctrl+E 切换编辑/预览；Ctrl+Shift+F 搜索；Ctrl+W 关闭标签；Esc 退出专注模式
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && focusMode) {
        setLeftOpen(true)
        setShowOutline(true)
        return
      }
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key === 'o') {
        e.preventDefault()
        void handleOpenFolder()
      } else if (key === 's') {
        e.preventDefault()
        void saveIfEditing()
      } else if (key === 'e') {
        e.preventDefault()
        void toggleMode()
      } else if (key === 'f' && e.shiftKey) {
        e.preventDefault()
        setSearchOpen((v) => !v)
      } else if (key === 'w') {
        e.preventDefault()
        if (currentFile) void closeTab(currentFile)
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [handleOpenFolder, saveIfEditing, toggleMode, closeTab, currentFile, focusMode])

  useEffect(() => {
    document.title = currentFile ? `${basename(currentFile)} - MD Browser` : 'MD Browser'
  }, [currentFile])

  if (!root) return <EmptyState variant="no-folder" onOpenFolder={handleOpenFolder} />

  return (
    <div className="app">
      <TopBar
        root={root}
        currentFile={currentFile}
        showOutline={showOutline}
        theme={theme}
        mode={mode}
        dirty={dirty}
        savedAt={savedAt}
        saveError={saveError}
        searchOpen={searchOpen}
        leftOpen={leftOpen}
        focusMode={focusMode}
        onOpenFolder={handleOpenFolder}
        onToggleSearch={() => { setLeftOpen(true); setSearchOpen((v) => !v) }}
        onToggleLeft={() => setLeftOpen((v) => !v)}
        onToggleOutline={() => setShowOutline((v) => !v)}
        onToggleTheme={handleToggleTheme}
        onToggleMode={() => void toggleMode()}
        onToggleFocus={toggleFocus}
        onExport={(kind) => void handleExport(kind)}
      />
      <TabBar
        tabs={tabs}
        activeFile={currentFile}
        onSelect={(p) => void openFile(p)}
        onClose={(p) => void closeTab(p)}
      />
      <div className="main">
        {leftOpen ? (
          searchOpen ? (
            <SearchPanel
              query={searchQuery}
              results={searchResults}
              searching={searching}
              onQueryChange={setSearchQuery}
              onOpenResult={openFromSearch}
              onClose={() => setSearchOpen(false)}
            />
          ) : (
            <Sidebar
              root={root}
              tree={tree}
              currentFile={currentFile}
              expanded={expanded}
              onToggleDir={toggleDir}
              onOpenFile={openFromTree}
              onOpenFolder={handleOpenFolder}
              onRefresh={() => { window.mdApi.readTree(root).then(setTree) }}
            />
          )
        ) : null}
        <div className="content-area">
          {currentFile ? (
            mode === 'edit' ? (
              <Editor
                filePath={currentFile}
                theme={theme}
                onDirtyChange={setDirty}
                onSaved={() => setSavedAt(new Date().toLocaleTimeString())}
                saveRef={editorSaveRef}
              />
            ) : (
              <Content
                filePath={currentFile}
                theme={theme}
                bumpKey={bumpKey}
                scrollTarget={scrollTarget}
                searchHighlight={searchHighlight}
                renderedRef={renderedHtmlRef}
                onOutline={setOutline}
                onActiveChange={setActiveId}
                onOpenFile={openFile}
              />
            )
          ) : (
            <EmptyState variant="no-file" onOpenFolder={handleOpenFolder} />
          )}
        </div>
        {showOutline && (
          <Outline items={outline} activeId={activeId} onItemClick={handleOutlineClick} />
        )}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
