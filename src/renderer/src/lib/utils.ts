export function basename(p: string): string {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  return i === -1 ? p : p.slice(i + 1)
}

export function dirname(p: string): string {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  return i === -1 ? '' : p.slice(0, i)
}

export function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

export function scrollToId(id: string): void {
  // behavior 用 auto（瞬时）：smooth 在部分 Chromium 环境（如嵌入式浏览器）不生效
  document.getElementById(id)?.scrollIntoView({ behavior: 'auto', block: 'start' })
}
