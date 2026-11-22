import { useEffect, useRef } from 'react'
import type { SearchResult } from '../../../shared/types'
import { SearchIcon, CloseIcon, FileTextIcon } from './icons'

interface SearchPanelProps {
  query: string
  results: SearchResult[]
  searching: boolean
  onQueryChange: (q: string) => void
  onOpenResult: (path: string) => void
  onClose: () => void
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function highlightMatches(text: string, query: string): string {
  const q = query.toLowerCase()
  const lower = text.toLowerCase()
  const parts: string[] = []
  let pos = 0
  let idx = lower.indexOf(q)
  while (idx !== -1 && q) {
    if (idx > pos) parts.push(escapeHtml(text.slice(pos, idx)))
    parts.push(`<mark>${escapeHtml(text.slice(idx, idx + q.length))}</mark>`)
    pos = idx + q.length
    idx = lower.indexOf(q, pos)
  }
  parts.push(escapeHtml(text.slice(pos)))
  return parts.join('')
}

export default function SearchPanel(props: SearchPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="search-panel">
      <div className="search-head">
        <div className="search-input-wrap">
          <SearchIcon size={14} className="search-input-icon" />
          <input
            ref={inputRef}
            className="search-input"
            value={props.query}
            placeholder="搜索全部笔记…"
            onChange={(e) => props.onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') props.onClose()
              if (e.key === 'Enter' && props.results.length > 0) props.onOpenResult(props.results[0].path)
            }}
          />
        </div>
        <button className="icon-btn" title="关闭搜索 (Ctrl+Shift+F)" onClick={props.onClose}>
          <CloseIcon size={14} />
        </button>
      </div>
      <div className="search-results">
        {props.query.trim() === '' && (
          <div className="panel-empty">输入关键词，搜索当前目录下所有 Markdown 文件</div>
        )}
        {props.searching && <div className="panel-empty">搜索中…</div>}
        {!props.searching && props.query.trim() !== '' && props.results.length === 0 && (
          <div className="panel-empty">没有匹配的结果</div>
        )}
        {props.results.map((r) => (
          <div key={r.path} className="search-file">
            <div className="search-file-name" title={r.path} onClick={() => props.onOpenResult(r.path)}>
              <FileTextIcon size={13} />
              <span>{r.name}</span>
            </div>
            {r.matches.map((m) => (
              <div
                key={m.line}
                className="search-line"
                title={`第 ${m.line} 行`}
                onClick={() => props.onOpenResult(r.path)}
              >
                <span dangerouslySetInnerHTML={{ __html: highlightMatches(m.text, props.query) }} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
