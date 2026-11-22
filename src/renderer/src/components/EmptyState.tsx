import { BookIcon, FolderOpenIcon } from './icons'

interface EmptyStateProps {
  variant: 'no-folder' | 'no-file'
  onOpenFolder: () => void
}

export default function EmptyState({ variant, onOpenFolder }: EmptyStateProps) {
  if (variant === 'no-folder') {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <BookIcon size={30} />
        </div>
        <h1>MD Browser</h1>
        <p>选择一个包含 Markdown 文件的文件夹开始浏览</p>
        <button className="btn big filled" onClick={onOpenFolder}>
          <FolderOpenIcon size={17} />
          <span>打开文件夹</span>
        </button>
        <p className="empty-hint">快捷键 Ctrl+O · 目录会被自动监听，文件增改实时刷新</p>
      </div>
    )
  }
  return (
    <div className="empty-state compact">
      <div className="empty-icon">
        <BookIcon size={22} />
      </div>
      <p>从左侧文件树选择一个 Markdown 文件</p>
    </div>
  )
}
