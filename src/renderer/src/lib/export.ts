/** 从当前页面样式表中收集 KaTeX 相关 CSS（导出用） */
export function collectKatexCss(): string {
  let out = ''
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue // 跨域样式表不可读
    }
    for (const rule of Array.from(rules)) {
      const text = rule.cssText
      if (text.includes('katex')) out += text + '\n'
    }
  }
  return out
}
