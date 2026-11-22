import { basename } from '../lib/utils'
import { FileTextIcon, CloseIcon } from './icons'

interface TabBarProps {
  tabs: string[]
  activeFile: string | null
  onSelect: (path: string) => void
  onClose: (path: string) => void
}

export default function TabBar({ tabs, activeFile, onSelect, onClose }: TabBarProps) {
  if (tabs.length === 0) return null
  return (
    <div className="tabbar">
      {tabs.map((p) => (
        <div
          key={p}
          className={`tab${p === activeFile ? ' active' : ''}`}
          title={p}
          onClick={() => onSelect(p)}
          onAuxClick={(e) => {
            e.preventDefault()
            onClose(p)
          }}
        >
          <span className="tab-icon">
            <FileTextIcon size={13} />
          </span>
          <span className="tab-name">{basename(p)}</span>
          <span
            className="tab-close"
            title="关闭 (Ctrl+W 关闭当前)"
            onClick={(e) => {
              e.stopPropagation()
              onClose(p)
            }}
          >
            <CloseIcon size={11} />
          </span>
        </div>
      ))}
    </div>
  )
}
