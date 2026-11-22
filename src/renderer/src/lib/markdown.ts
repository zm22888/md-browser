import MarkdownIt from 'markdown-it'
import anchor from 'markdown-it-anchor'
import taskLists from 'markdown-it-task-lists'
import { katex } from '@mdit/plugin-katex'
import DOMPurify from 'dompurify'
import { createHighlighter, type Highlighter } from 'shiki'
import type { OutlineItem } from './types'

const SHIKI_LANGS = [
  'typescript', 'tsx', 'javascript', 'json', 'python', 'bash', 'shell',
  'html', 'css', 'scss', 'markdown', 'yaml', 'rust', 'go', 'java',
  'c', 'cpp', 'csharp', 'sql', 'diff'
]

let highlighter: Highlighter | null = null
let highlighterPromise: Promise<void> | null = null

/** 初始化 shiki 高亮器（单例，双主题：github-light / github-dark） */
export function initHighlighter(): Promise<void> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: SHIKI_LANGS
    })
      .then((h) => { highlighter = h })
      .catch((err) => { console.error('shiki 初始化失败:', err) })
  }
  return highlighterPromise
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function highlightCode(str: string, lang: string): string {
  const langLower = (lang || '').trim().toLowerCase()
  // mermaid 块不参与高亮，交给 mermaid 渲染流程处理
  if (langLower === 'mermaid') {
    return `<pre class="mermaid-raw"><code>${escapeHtml(str.trim())}</code></pre>`
  }
  if (highlighter) {
    try {
      const loaded = highlighter.getLoadedLanguages()
      const codeLang = langLower && loaded.includes(langLower) ? langLower : 'text'
      return highlighter.codeToHtml(str, {
        lang: codeLang,
        themes: { light: 'github-light', dark: 'github-dark' }
      })
    } catch (err) {
      console.warn('代码高亮失败:', lang, err)
    }
  }
  return `<pre class="shiki-plain"><code class="language-${langLower}">${escapeHtml(str)}</code></pre>`
}

function slugify(text: string): string {
  const base = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return base || 'section'
}

/** markdown-it 15 的类型为 const+namespace 合并形态，实例类型需这样取 */
export type MarkdownItInstance = ReturnType<typeof MarkdownIt>

export const md: MarkdownItInstance = new MarkdownIt({ html: true, linkify: true, breaks: false })
  .use(anchor, { slugify, uniqueSlugStartIndex: 1 })
  .use(taskLists, { label: true })
  .use(katex)

md.set({ highlight: highlightCode })

function stripMd(text: string): string {
  return text.replace(/[*_`~[\]]/g, '').trim()
}

/** 从 tokens 提取 h1~h3 大纲（id 与 markdown-it-anchor 生成的锚点一致） */
export function buildOutline(tokens: ReturnType<MarkdownItInstance['parse']>): OutlineItem[] {
  const items: OutlineItem[] = []
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token.type === 'heading_open' && /^h[1-3]$/.test(token.tag)) {
      items.push({
        level: Number(token.tag[1]),
        id: String(token.attrGet('id') ?? ''),
        text: stripMd(tokens[i + 1]?.content ?? '')
      })
    }
  }
  return items
}

function unescapeHtml(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

/**
 * 渲染 markdown。charts 为 mermaid 源码 → SVG 的缓存（key 含主题），
 * 命中的块直接内联 SVG——SVG 属于 React 管理的 html 一部分，免疫 DOM 重置。
 */
export function renderMarkdown(
  content: string,
  charts: Map<string, string>
): { html: string; outline: OutlineItem[] } {
  const tokens = md.parse(content, {})
  const outline = buildOutline(tokens)
  let html = md.render(content)
  // SANITIZE_DOM 关闭是为了保留标题 id（如 id="title"）不被去掉，锚点跳转才可用
  html = DOMPurify.sanitize(html, {
    ADD_TAGS: ['foreignObject'],
    ADD_ATTR: ['target'],
    SANITIZE_DOM: false
  })
  html = html.replace(/<pre class="mermaid-raw"><code>([\s\S]*?)<\/code><\/pre>/g, (whole, escaped) => {
    const svg = charts.get(unescapeHtml(escaped))
    return svg ? `<div class="mermaid-chart">${svg}</div>` : whole
  })
  return { html, outline }
}
