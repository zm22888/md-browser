import fsp from 'node:fs/promises'
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import type { Plugin } from 'vite'

const VDITOR_DIST = resolve(__dirname, 'node_modules/vditor/dist').replace(/\\/g, '/')
const MIME: Record<string, string> = {
  js: 'text/javascript',
  css: 'text/css',
  json: 'application/json',
  wasm: 'application/wasm',
  png: 'image/png',
  svg: 'image/svg+xml',
  ttf: 'font/ttf',
  woff: 'font/woff',
  woff2: 'font/woff2'
}

/** dev 下直接从 node_modules 服务 vditor 静态资源（vite-plugin-static-copy 只在构建期拷贝） */
function serveVditorDev(): Plugin {
  return {
    name: 'serve-vditor-dist',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0]
        if (!url.startsWith('/vditor/dist/')) return next()
        const rel = decodeURIComponent(url.slice('/vditor/dist/'.length))
        const filePath = `${VDITOR_DIST}/${rel}`
        if (!filePath.startsWith(VDITOR_DIST)) return next()
        fsp.readFile(filePath)
          .then((buf) => {
            const ext = rel.split('.').pop() ?? ''
            res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream')
            res.end(buf)
          })
          .catch(() => next())
      })
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    // 生产环境走 file:// 加载，资源需相对路径
    base: './',
    plugins: [
      serveVditorDev(),
      // 构建期把 vditor 的 lute wasm / 图标 / i18n 等运行时资源拷进产物，
      // vditor 以 `${cdn}/dist/...` 拼接资源 URL，故拷贝为 vditor/dist
      viteStaticCopy({
        targets: [
          {
            src: `${VDITOR_DIST}/*`,
            dest: 'vditor/dist'
          }
        ]
      })
    ]
  }
})
