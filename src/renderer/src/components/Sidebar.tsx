import { basename } from '../lib/utils'
import TreeView from './TreeView'
import { FolderIcon, RefreshIcon, FolderPlusIcon } from './icons'
import type { TreeNode } from '../lib/types'

interface SidebarProps {
  root: string
  tree: TreeNode[]
  currentFile: string | null
  expanded: Set<string>
  onToggleDir: (path: string) => void
  onOpenFile: (path: string) => void
  onOpenFolder: () => void
  onRefresh: () => void
}

export default function Sidebar(props: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span className="root-name" title={props.root}>
          <FolderIcon size={15} />
          <span>{basename(props.root)}</span>
        </span>
        <div className="sidebar-actions">
          <button className="icon-btn" title="刷新目录树" onClick={props.onRefresh}>
            <RefreshIcon size={14} />
          </button>
          <button className="icon-btn" title="打开其他文件夹 (Ctrl+O)" onClick={props.onOpenFolder}>
            <FolderPlusIcon size={15} />
          </button>
        </div>
      </div>
      <div className="tree">
        {props.tree.length === 0 ? (
          <div className="panel-empty">此文件夹下没有 Markdown 文件</div>
        ) : (
          props.tree.map((node) => (
            <TreeView
              key={node.path}
              node={node}
              depth={0}
              currentFile={props.currentFile}
              expanded={props.expanded}
              onToggleDir={props.onToggleDir}
              onOpenFile={props.onOpenFile}
            />
          ))
        )}
      </div>
    </div>
  )
}
