import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { initHighlighter, renderMarkdown } from '../lib/markdown'
import { dirname, safeDecode, scrollToId } from '../lib/utils'
import type { OutlineItem } from '../lib/types'

interface ContentProps {
  filePath: string
  theme: 'light' | 'dark'
  /** 外部修改导致的重载信号 */
  bumpKey: number
  /** 跨文件锚点跳转目标 */
  scrollTarget: { anchor: string; seq: number } | null
  /** 全文搜索关键词：命中处高亮并滚动到第一处 */
  searchHighlight?: string | null
  /** App 通过它拿当前渲染完成的 html（导出用） */
  renderedRef: { current: string }
  onOutline: (items: OutlineItem[]) => void
  onActiveChange: (id: string) => void
  onOpenFile: (path: string, anchor?: string) => void
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export default function Content(props: ContentProps) {
  const {
    filePath, theme, bumpKey, scrollTarget, searchHighlight, renderedRef,
    onOutline, onActiveChange, onOpenFile
  } = props
  const [content, setContent] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [fileDir, setFileDir] = useState('')
  const [chartTick, setChartTick] = useState(0)
  const bodyRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const chartCacheRef = useRef(new Map<string, string>())
  const chartSeqRef = useRef(0)
  const lastSeqRef = useRef(-1)

  const themeKey = theme === 'dark' ? 'dark' : 'light'

  useEffect(() => { setFileDir(dirname(filePath)) }, [filePath])

  // 读取文件（内容相同则 React 自动 bail，不重置 DOM，保住已渲染的图表和阅读位置）
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        await initHighlighter()
        const text = await window.mdApi.readFile(filePath)
        if (cancelled) return
        setContent(text)
        setError('')
      } catch (err) {
        if (!cancelled) {
          setContent('')
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, bumpKey])

  // markdown → html（mermaid 命中缓存的块直接内联 SVG）
  const charts = useMemo(() => {
    const m = new Map<string, string>()
    for (const [key, svg] of chartCacheRef.current) {
      if (key.startsWith(`${themeKey}:`)) m.set(key.slice(themeKey.length + 1), svg)
    }
    return m
    // chartTick 变化代表缓存新增了图表
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, chartTick, themeKey])

  const { html, outline } = useMemo(() => renderMarkdown(content, charts), [content, charts])

  useEffect(() => { onOutline(outline) }, [outline, onOutline])

  // 图片相对路径 → mdres:// 协议加载
  useEffect(() => {
    const rootEl = bodyRef.current
    if (!rootEl || !html || !fileDir) return
    rootEl.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') ?? ''
      if (!src || /^(https?:|data:|blob:|mdres:|#)/i.test(src)) return
      window.mdApi.resolvePath(fileDir, safeDecode(src))
        .then((abs) => { img.src = `mdres://img/${encodeURIComponent(abs)}` })
        .catch(() => {})
    })
  }, [html, fileDir])

  // 未缓存的 mermaid 块 → 异步渲染进缓存 → 触发重渲染内联 SVG
  useEffect(() => {
    const rootEl = bodyRef.current
    if (!rootEl || !html) return
    const blocks = Array.from(rootEl.querySelectorAll('pre.mermaid-raw > code'))
    const pending = blocks.filter((el) => !chartCacheRef.current.has(`${themeKey}:${el.textContent ?? ''}`))
    if (!pending.length) return
    let cancelled = false
    ;(async () => {
      const mermaid = (await import('mermaid')).default
      mermaid.initialize({ startOnLoad: false, theme: theme === 'dark' ? 'dark' : 'default' })
      for (const el of pending) {
        const code = el.textContent ?? ''
        try {
          const { svg } = await mermaid.render(`mmd-${chartSeqRef.current++}`, code)
          if (cancelled) return
          chartCacheRef.current.set(`${themeKey}:${code}`, svg)
        } catch (err) {
          if (cancelled) return
          const msg = escapeHtml(String(err))
          chartCacheRef.current.set(`${themeKey}:${code}`, `<div class="mermaid-error">Mermaid 渲染失败：${msg}</div>`)
        }
      }
      if (!cancelled) setChartTick((t) => t + 1)
    })()
    return () => { cancelled = true }
  }, [html, theme, themeKey])

  // 跨文件锚点跳转
  useEffect(() => {
    if (!html || !scrollTarget || scrollTarget.seq === lastSeqRef.current) return
    const el = document.getElementById(scrollTarget.anchor)
    if (!el) return // 目标内容尚未渲染，等 html 变化后本 effect 会再次执行
    lastSeqRef.current = scrollTarget.seq
    // 新内容首次布局时 KaTeX 等字体、Mermaid 图表可能尚未加载完成，容器高度会变化，
    // 因此立即滚一次，等字体就绪后再校准一次，并留一次兜底
    const doScroll = () => {
      const cur = document.getElementById(scrollTarget.anchor)
      const w = wrapRef.current
      if (!cur || !w) return
      const target = cur.getBoundingClientRect().top - w.getBoundingClientRect().top + w.scrollTop - 16
      w.scrollTo({ top: Math.max(target, 0), behavior: 'auto' })
    }
    doScroll()
    document.fonts?.ready.then(() => doScroll())
    const fallbackTimer = setTimeout(doScroll, 300)
    return () => clearTimeout(fallbackTimer)
  }, [html, scrollTarget])

  // 全文搜索关键词高亮：给文本节点包 <mark>，并滚动到第一处命中
  useEffect(() => {
    const rootEl = bodyRef.current
    if (!rootEl || !html) return
    rootEl.querySelectorAll('mark.search-hit').forEach((m) => {
      m.replaceWith(...Array.from(m.childNodes))
      m.parentNode?.normalize()
    })
    const query = (searchHighlight ?? '').trim().toLowerCase()
    if (!query) return
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    while (walker.nextNode()) {
      const node = walker.currentNode as Text
      const tag = node.parentElement?.tagName
      if (node.parentElement?.closest('pre, code, .mermaid-chart, .mermaid-error, script, style')) continue
      if (tag === 'SCRIPT' || tag === 'STYLE') continue
      nodes.push(node)
    }
    let first: HTMLElement | null = null
    for (const node of nodes) {
      const text = node.nodeValue ?? ''
      const lower = text.toLowerCase()
      if (!lower.includes(query)) continue
      const frag = document.createDocumentFragment()
      let pos = 0
      let idx = lower.indexOf(query)
      while (idx !== -1) {
        if (idx > pos) frag.appendChild(document.createTextNode(text.slice(pos, idx)))
        const mark = document.createElement('mark')
        mark.className = 'search-hit'
        mark.textContent = text.slice(idx, idx + query.length)
        frag.appendChild(mark)
        first ??= mark
        pos = idx + query.length
        idx = lower.indexOf(query, pos)
      }
      if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)))
      node.parentNode?.replaceChild(frag, node)
    }
    first?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, searchHighlight, chartTick])

  // 把渲染完成的 html 交给 App（导出用）
  useEffect(() => {
    renderedRef.current = html
  }, [html, renderedRef])

  // 切换文件时回到顶部
  useEffect(() => { wrapRef.current?.scrollTo({ top: 0 }) }, [filePath])

  // 大纲 scrollspy：滚动时联动高亮当前标题
  useEffect(() => {
    if (!html) return
    const rootEl = bodyRef.current
    const headings = Array.from(rootEl?.querySelectorAll('h1[id], h2[id], h3[id]') ?? [])
    if (!headings.length) {
      onActiveChange('')
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) onActiveChange(visible[0].target.id)
      },
      { rootMargin: '-64px 0px -72% 0px' }
    )
    headings.forEach((h) => observer.observe(h))
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html])

  // 链接拦截：#锚点 / .md 文件跳转 / 外部链接
  const handleClick = async (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest('a')
    if (!a) return
    e.preventDefault()
    const href = a.getAttribute('href') ?? ''
    if (!href) return
    if (href.startsWith('#')) {
      scrollToId(safeDecode(href.slice(1)))
      return
    }
    if (/^https?:\/\//i.test(href)) {
      window.mdApi.openExternal(href)
      return
    }
    if (!fileDir) return
    const hashIndex = href.indexOf('#')
    const rel = hashIndex >= 0 ? href.slice(0, hashIndex) : href
    const anchor = hashIndex >= 0 ? safeDecode(href.slice(hashIndex + 1)) : undefined
    if (!rel && anchor) {
      scrollToId(anchor)
      return
    }
    try {
      const abs = await window.mdApi.resolvePath(fileDir, safeDecode(rel))
      if (/\.(md|markdown)$/i.test(abs)) {
        onOpenFile(abs, anchor)
      } else {
        window.mdApi.showItemInFolder(abs)
      }
    } catch { /* 忽略无法解析的链接 */ }
  }

  return (
    <div className="content-wrap" ref={wrapRef}>
      {loading && (
        <div className="content-hint">
          <span className="spinner" />
          加载中…
        </div>
      )}
      {!loading && error && <div className="content-error">{error}</div>}
      {!loading && !error && (
        <div
          ref={bodyRef}
          className="markdown-body"
          onClick={handleClick}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  )
}
