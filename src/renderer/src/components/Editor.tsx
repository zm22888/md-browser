import { useEffect, useRef } from 'react'
import Vditor from 'vditor'
import 'vditor/dist/index.css'
import { dirname } from '../lib/utils'

interface EditorProps {
  filePath: string
  theme: 'light' | 'dark'
  onDirtyChange: (dirty: boolean) => void
  onSaved: () => void
  /** App 通过它触发"保存"（Ctrl+S / 切换模式 / 切换文件时），由 Editor 注册实现 */
  saveRef: { current: (() => Promise<void>) | null }
}

export default function Editor({ filePath, theme, onDirtyChange, onSaved, saveRef }: EditorProps) {
  const elRef = useRef<HTMLDivElement>(null)
  const vditorRef = useRef<Vditor | null>(null)
  const filePathRef = useRef(filePath)
  filePathRef.current = filePath

  useEffect(() => {
    let disposed = false
    let instance: Vditor | null = null
    let dirty = false
    const dir = dirname(filePath)

    const markDirty = () => {
      if (!dirty) {
        dirty = true
        onDirtyChange(true)
      }
    }

    void (async () => {
      let content = ''
      try {
        content = await window.mdApi.readFile(filePath)
      } catch {
        return
      }
      if (disposed) return

      instance = new Vditor(elRef.current!, {
        mode: 'ir',
        lang: 'zh_CN',
        theme: theme === 'dark' ? 'dark' : 'classic',
        value: content,
        cache: { enable: false },
        cdn: './vditor',
        height: '100%',
        toolbar: [
          'headings', 'bold', 'italic', 'strike', '|',
          'list', 'ordered-list', 'check', 'quote', '|',
          'code', 'inline-code', 'table', 'link', '|',
          'undo', 'redo'
        ],
        upload: {
          accept: 'image/*',
          // 粘贴/选择图片 → 落盘到文档同目录 assets/ → 插入相对路径引用
          handler: async (files: File[]): Promise<string> => {
            const file = files?.[0]
            if (!file) return ''
            const data = new Uint8Array(await file.arrayBuffer())
            const rel = await window.mdApi.saveImage(dir, file.name || 'image.png', data)
            markDirty()
            return `![](${rel})`
          }
        },
        input: markDirty,
        after: () => {
          if (disposed) {
            instance?.destroy()
            return
          }
          // codeTheme 不在 IOptions 类型中，初始化后用 setTheme 设置
          const dark = theme === 'dark'
          instance?.setTheme(dark ? 'dark' : 'classic', undefined, dark ? 'github-dark' : 'github')
          vditorRef.current = instance
          saveRef.current = async () => {
            const v = vditorRef.current
            if (!v) return
            await window.mdApi.writeFile(filePathRef.current, v.getValue())
            dirty = false
            onDirtyChange(false)
            onSaved()
          }
        }
      })
    })()

    return () => {
      disposed = true
      saveRef.current = null
      vditorRef.current = null
      try {
        instance?.destroy()
      } catch {
        // 初始化未完成时 destroy 可能抛错，忽略
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath])

  // 跟随全局主题切换
  useEffect(() => {
    try {
      const dark = theme === 'dark'
      vditorRef.current?.setTheme(dark ? 'dark' : 'classic', undefined, dark ? 'github-dark' : 'github')
    } catch {
      // 初始化完成前忽略
    }
  }, [theme])

  return (
    <div className="editor-host">
      <div ref={elRef} />
    </div>
  )
}
