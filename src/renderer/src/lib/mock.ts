/**
 * 浏览器 Mock 模式：在非 Electron 环境（vite dev 的普通浏览器标签）里
 * 注入一个内存版的 mdApi，让 UI 设计与调试可以脱离 Electron 进行。
 * Electron 下 preload 已注入真实的 window.mdApi，本模块直接跳过。
 */
import type { SearchResult } from './types'

const ROOT = 'D:\\Notes'

const k2 = (k: string): string => k.replace(/\//g, '\\')


const FILES: Record<string, string> = {
  'README.md': `# MD Browser 设计稿

这是浏览器 Mock 模式下的演示内容，用于 UI 设计迭代。

## 亮点

- 独立浏览管线：markdown-it + shiki 双主题
- 编辑复用 Vditor IR 内核
- Mermaid 缓存内联，任何 DOM 重置都不会抹掉图表

## 导航

- [代码与图表](代码与图表.md)
- [数学公式](数学公式.md)
- [嵌套的深层文档](嵌套/深层文档.md)

## 任务清单

- [x] 文件树浏览
- [x] 全文搜索
- [ ] 更多打磨
`,
  '代码与图表.md': `# 代码与图表

## 代码高亮

\`\`\`ts
interface TreeNode {
  name: string
  path: string
  type: 'dir' | 'file'
}

export function findNode(tree: TreeNode[], target: string): TreeNode | null {
  for (const node of tree) {
    if (node.path === target) return node
    if (node.children) {
      const found = findNode(node.children, target)
      if (found) return found
    }
  }
  return null
}
\`\`\`

\`\`\`python
def fib(n: int) -> int:
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)
\`\`\`

## Mermaid 图表

### 流程图

\`\`\`mermaid
graph TD
    A[打开文件夹] --> B{是 Markdown?}
    B -- 是 --> C[渲染预览]
    B -- 否 --> D[忽略]
    C --> E[大纲导航]
    C --> F[编辑模式]
\`\`\`

### 时序图

\`\`\`mermaid
sequenceDiagram
    participant R as 渲染进程
    participant M as 主进程
    R->>M: readFile(path)
    M-->>R: markdown 源码
    R->>M: mdres:// 加载图片
\`\`\`
`,
  '数学公式.md': `# 数学公式

## 行内公式

质能方程 $E = mc^2$，欧拉公式 $e^{i\\pi} + 1 = 0$。

## 块级公式

$$
\\int_{-\\infty}^{\\infty} e^{-x^2} \\, dx = \\sqrt{\\pi}
$$

$$
x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
$$
`,
  '功能演示.md': `# 功能演示

## 排版元素

这是一个段落，包含 **加粗**、*斜体*、\`行内代码\` 和 [外部链接](https://github.com)。

> 这是一段引用。阅读往往比编辑更常见。

### 表格

| 功能 | 状态 | 说明 |
| --- | :---: | --- |
| 文件树 | ✅ | chokidar 实时监听 |
| 渲染 | ✅ | markdown-it + DOMPurify |

### 行内 HTML

<div style="border:1px dashed #4f46e5;border-radius:8px;padding:10px 14px;color:#4f46e5;">行内 HTML（经过 DOMPurify 消毒）</div>
`,
  '嵌套/深层文档.md': `# 深层文档

多级文件树与相对路径的验证文档。

- [返回上级 README](../README.md)
`,
}

function normalizeKey(p: string): string {
  return p.replace(/\\\\/g, '\\').replace(/^D:\\Notes\\?/, '')
}

interface MockTreeNode {
  name: string
  path: string
  type: 'dir' | 'file'
  children?: MockTreeNode[]
}

function buildTree(): MockTreeNode[] {
  const root: MockTreeNode[] = []
  const dirs = new Map<string, MockTreeNode[]>()
  dirs.set('', root)
  const ensureDir = (segments: string[]): MockTreeNode[] => {
    let list = root
    let acc = ''
    for (const seg of segments) {
      acc = acc ? `${acc}\\${seg}` : seg
      let found = list.find((n) => n.type === 'dir' && n.name === seg)
      if (!found) {
        found = { name: seg, path: `${ROOT}\\${acc}`, type: 'dir', children: [] }
        list.push(found)
      }
      if (!found.children) found.children = []
      list = found.children
      dirs.set(acc, list)
    }
    return list
  }
  for (const key of Object.keys(FILES).sort()) {
    const segments = key.split('/')
    const name = segments.pop() as string
    const list = ensureDir(segments)
    list.push({ name, path: `${ROOT}\\${key.replace(/\//g, '\\')}`, type: 'file' })
  }
  const sortRec = (nodes: MockTreeNode[]): void => {
    nodes.sort((x, y) => (x.type === y.type ? x.name.localeCompare(y.name) : x.type === 'dir' ? -1 : 1))
    nodes.forEach((n) => n.children && sortRec(n.children))
  }
  sortRec(root)
  return root
}

/** 非 Electron 环境下安装 mock；返回是否安装了 mock */
export function installMock(): boolean {
  if ((window as unknown as { mdApi?: unknown }).mdApi) return false
  const tree = buildTree()
  void tree
  const fake = {
    openFolder: async () => ROOT,
    getSettings: async () => ({
      rootPath: ROOT,
      lastFile: `${ROOT}\\代码与图表.md`,
      theme: 'light'
    }),
    setSettings: async () => undefined,
    readTree: async () => tree,
    readFile: async (p: string) => {
      const key = normalizeKey(p)
      const hit = Object.keys(FILES).find((k) => key === k2(k))
      if (!hit) throw new Error(`mock: 找不到文件 ${p}`)
      return FILES[hit]
    },
    writeFile: async (p: string, c: string) => {
      FILES[normalizeKey(p)] = c
    },
    saveImage: async () => 'assets/mock-image.png',
    exists: async (p: string) => Object.keys(FILES).some((k) => normalizeKey(p) === k2(k)),
    resolvePath: (base: string, rel: string) => {
      const parts = (base + '\\' + rel.replace(/\//g, '\\')).split('\\')
      const stack: string[] = []
      for (const seg of parts) {
        if (!seg || seg === '.') continue
        if (seg === '..') stack.pop()
        else stack.push(seg)
      }
      return stack.join('\\')
    },
    openExternal: async () => undefined,
    showItemInFolder: async () => undefined,
    searchQuery: async (_root: string, q: string): Promise<SearchResult[]> => {
      const needle = q.trim().toLowerCase()
      if (!needle) return []
      const out: SearchResult[] = []
      for (const [key, text] of Object.entries(FILES)) {
        const matches = text
          .split(/\r?\n/)
          .map((line, i) => ({ line: i + 1, text: line }))
          .filter((m) => m.text.toLowerCase().includes(needle))
          .slice(0, 10)
        if (matches.length) {
          out.push({ path: `${ROOT}\\${key.replace(/\//g, '\\')}`, name: key.split('/').pop() as string, matches })
        }
      }
      return out
    },
    exportDoc: async () => null,
    onFsChanged: () => () => undefined
  }
  ;(window as unknown as { mdApi: unknown }).mdApi = fake
  return true
}
