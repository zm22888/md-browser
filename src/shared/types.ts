export interface TreeNode {
  name: string
  path: string
  type: 'dir' | 'file'
  children?: TreeNode[]
}

export interface OutlineItem {
  level: number
  id: string
  text: string
}

export interface SearchMatch {
  line: number
  text: string
}

export interface SearchResult {
  path: string
  name: string
  matches: SearchMatch[]
}

export interface ExportPayload {
  kind: 'html' | 'pdf'
  bodyHtml: string
  katexCss: string
  title: string
  theme: 'light' | 'dark'
}
