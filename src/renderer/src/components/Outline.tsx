import type { OutlineItem } from '../lib/types'

interface OutlineProps {
  items: OutlineItem[]
  activeId: string
  onItemClick: (id: string) => void
}

export default function Outline({ items, activeId, onItemClick }: OutlineProps) {
  return (
    <div className="outline">
      <div className="panel-title">大纲</div>
      {items.length === 0 ? (
        <div className="panel-empty">无大纲</div>
      ) : (
        items.map((item) => (
          <div
            key={`${item.level}-${item.id}`}
            className={`outline-item${activeId === item.id ? ' active' : ''}`}
            style={{ paddingLeft: (item.level - 1) * 14 + 14 }}
            onClick={() => onItemClick(item.id)}
            title={item.text}
          >
            {item.text}
          </div>
        ))
      )}
    </div>
  )
}
