import { useState } from 'react'
import { basename } from '../lib/utils'
import {
  LogoIcon, FolderOpenIcon, SearchIcon, ExportIcon, EditIcon, EyeIcon,
  ListIcon, SunIcon, MoonIcon, PanelLeftIcon, MaximizeIcon, MinimizeIcon
} from './icons'

interface TopBarProps {
  root: string | null
  currentFile: string | null
  showOutline: boolean
  theme: 'light' | 'dark'
  mode: 'view' | 'edit'
  dirty: boolean
  savedAt: string | null
  saveError: string | null
  searchOpen: boolean
  leftOpen: boolean
  focusMode: boolean
  onOpenFolder: () => void
  onToggleSearch: () => void
  onToggleLeft: () => void
  onToggleOutline: () => void
  onToggleTheme: () => void
  onToggleMode: () => void
  onToggleFocus: () => void
  onExport: (kind: 'html' | 'pdf') => void
}

export default function TopBar(props: TopBarProps) {
  const [exportOpen, setExportOpen] = useState(false)
  const rel = props.currentFile && props.root && props.currentFile.startsWith(props.root)
    ? props.currentFile.slice(props.root.length).replace(/^[\\/]/, '')
    : props.currentFile
  const canExport = !!props.currentFile && props.mode === 'view'
  return (
    <div className="topbar">
      <div className="brand" title="MD Browser">
        <LogoIcon />
      </div>
      <button className="btn" onClick={props.onOpenFolder}>
        <FolderOpenIcon />
        <span>打开文件夹</span>
      </button>
      {props.root && <span className="topbar-root" title={props.root}>{basename(props.root)}</span>}
      {rel && <span className="topbar-crumb" title={props.currentFile ?? ''}>{rel}</span>}
      <div className="flex-spacer" />
      {props.saveError && (
        <span className="save-error" title={props.saveError}>⚠ 保存失败：{props.saveError.slice(0, 40)}</span>
      )}
      {!props.saveError && props.dirty && <span className="dirty-dot">● 未保存</span>}
      {!props.saveError && !props.dirty && props.savedAt && (
        <span className="saved-at">已保存 {props.savedAt}</span>
      )}
      <button
        className={`btn icon${props.leftOpen ? ' primary' : ''}`}
        title="左侧面板（文件树 / 搜索）"
        onClick={props.onToggleLeft}
      >
        <PanelLeftIcon size={17} />
      </button>
      <button
        className={`btn icon${props.searchOpen && props.leftOpen ? ' primary' : ''}`}
        title="搜索全部笔记 (Ctrl+Shift+F)"
        onClick={props.onToggleSearch}
      >
        <SearchIcon size={17} />
      </button>
      <div className="export-wrap">
        <button
          className="btn"
          disabled={!canExport}
          title={canExport ? '导出当前文件' : '预览模式下可用'}
          onClick={() => setExportOpen((v) => !v)}
        >
          <ExportIcon />
          <span>导出</span>
        </button>
        {exportOpen && canExport && (
          <>
            <div className="export-mask" onClick={() => setExportOpen(false)} />
            <div className="export-menu">
              <div className="export-item" onClick={() => { setExportOpen(false); props.onExport('html') }}>
                导出 HTML
              </div>
              <div className="export-item" onClick={() => { setExportOpen(false); props.onExport('pdf') }}>
                导出 PDF
              </div>
            </div>
          </>
        )}
      </div>
      <button
        className={`btn${props.mode === 'edit' ? ' primary' : ''}`}
        title="Ctrl+E 切换编辑/预览，Ctrl+S 保存"
        onClick={props.onToggleMode}
      >
        {props.mode === 'edit' ? <EyeIcon /> : <EditIcon />}
        <span>{props.mode === 'edit' ? '预览' : '编辑'}</span>
      </button>
      <button
        className={`btn icon${props.showOutline ? ' primary' : ''}`}
        title="大纲面板"
        onClick={props.onToggleOutline}
      >
        <ListIcon size={17} />
      </button>
      <button
        className={`btn icon${props.focusMode ? ' primary' : ''}`}
        title={props.focusMode ? '退出专注模式 (Esc)' : '专注模式：收起两侧面板'}
        onClick={props.onToggleFocus}
      >
        {props.focusMode ? <MinimizeIcon size={17} /> : <MaximizeIcon size={17} />}
      </button>
      <button className="btn icon" title="切换主题" onClick={props.onToggleTheme}>
        {props.theme === 'light' ? <MoonIcon size={17} /> : <SunIcon size={17} />}
      </button>
    </div>
  )
}
