import type { TreeNode } from '../lib/types'
import { FolderIcon, FolderOpenIcon, FileTextIcon, ChevronRightIcon } from './icons'

interface TreeViewProps {
  node: TreeNode
  depth: number
  currentFile: string | null
  expanded: Set<string>
  onToggleDir: (path: string) => void
  onOpenFile: (path: string) => void
}

export default function TreeView({ node, depth, currentFile, expanded, onToggleDir, onOpenFile }: TreeViewProps) {
  if (node.type === 'dir') {
    const open = expanded.has(node.path)
    return (
      <>
        <div
          className={`tree-item dir${open ? ' open' : ''}`}
          style={{ paddingLeft: depth * 16 + 10 }}
          onClick={() => onToggleDir(node.path)}
          title={node.path}
        >
          <span className={`tree-chevron${open ? ' rotate' : ''}`}>
            <ChevronRightIcon size={13} />
          </span>
          <span className="tree-icon">
            {open ? <FolderOpenIcon size={15} /> : <FolderIcon size={15} />}
          </span>
          <span className="tree-label">{node.name}</span>
        </div>
        {open && node.children?.map((child) => (
          <TreeView
            key={child.path}
            node={child}
            depth={depth + 1}
            currentFile={currentFile}
            expanded={expanded}
            onToggleDir={onToggleDir}
            onOpenFile={onOpenFile}
          />
        ))}
      </>
    )
  }
  const active = currentFile === node.path
  return (
    <div
      className={`tree-item file${active ? ' active' : ''}`}
      style={{ paddingLeft: depth * 16 + 10 + 21 }}
      onClick={() => onOpenFile(node.path)}
      title={node.path}
    >
      <span className="tree-icon">
        <FileTextIcon size={15} />
      </span>
      <span className="tree-label">{node.name}</span>
    </div>
  )
}
