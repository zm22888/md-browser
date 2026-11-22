# MD Browser

本地 Markdown 浏览器 + 编辑器（Electron + React + TypeScript）。

## 运行

```bash
npm install
npm run dev      # 开发模式
npm run pack     # 本地构建安装包
```

## 下载安装包

前往 [GitHub Releases](https://github.com/zm22888/md-browser/releases) 下载对应平台版本：

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| Windows | `MD Browser Setup x.y.z.exe` | NSIS 安装器，安装后自动注册 `.md` 文件关联 |
| macOS | `.dmg` / `.zip`（Intel 与 Apple Silicon） | 未签名，首次打开需右键 → 打开 |
| Linux | `.AppImage` / `.deb` | AppImage 赋予执行权限后直接运行 |

推送 `v*` 标签时，GitHub Actions 会在三个平台的云机器上自动构建并上传安装包到 Release。

## 已实现

### 阶段 1：浏览

- **技术栈**：Electron + electron-vite + Vite + React 19 + TypeScript
- **文件树**：目录浏览，chokidar 实时监听增删改，展开状态持久化
- **浏览渲染**：markdown-it + DOMPurify 消毒；shiki 代码高亮（亮/暗双主题同步切换）、KaTeX 数学公式、Mermaid 图表、GFM 任务清单、行内 HTML
- **资源与链接**：相对路径图片走自定义 `mdres://` 协议；`.md` 相对链接直接跳转（支持 `文件#锚点`，跨文件锚点带 Mermaid/字体延迟重校准）；外部链接交给系统浏览器
- **Mermaid 缓存内联架构**：图表 SVG 渲染后按 `主题:源码` 键入缓存，并直接内联进 React 管理的 html——编辑保存触发的内容重载、DOM 重置都不会抹掉图表（浏览位置也随之保留）
- **大纲**：h1~h3 大纲面板，点击跳转 + 滚动联动（scrollspy）
- **其他**：亮/暗主题、记住上次打开的文件夹与文件、`Ctrl+O` 打开文件夹

### 阶段 2：编辑

- **编辑器内核**：[Vditor](https://github.com/Vanessa219/vditor) IR（即时渲染）模式——开源界唯一贴近 Typora 手感的方案，浏览/编辑双态分工：浏览走自研 markdown-it 管线，编辑复用 Vditor 内核
- **双态切换**：顶栏 ✏️ 编辑 / 👁 预览按钮，或 `Ctrl+E`
- **保存**：`Ctrl+S`；退出编辑、切换文件、切换目录时自动保存；保存成功显示时间戳
- **健壮性**：保存失败（如文件被杀毒软件/同步盘短暂锁定 EBUSY）时**留在编辑模式**并在顶栏显示错误，不会静默丢失改动
- **图片粘贴**：粘贴图片自动落盘到文档同目录 `assets/`（自动建目录、时间戳防重名），插入相对路径引用
- **资源离线**：vditor 的 lute wasm / 图标 / i18n 通过 dev 中间件 + 构建期静态拷贝本地化，不依赖 CDN

### 阶段 3：搜索 / 标签页 / 导出 / 打包

- **全文搜索**：`Ctrl+Shift+F` 或 🔍 按钮打开搜索面板；主进程递归扫描目录（跳过 dot/依赖目录、2MB 上限、单文件 10 条/总 100 条限制），结果按文件分组、行片段 `<mark>` 高亮；点击结果打开文件并滚动到命中处，正文高亮所有关键词
- **多标签页**：文件树/搜索/链接打开的文件都进标签栏；`Ctrl+W` 或 × 关闭（活跃标签先自动保存）；标签列表持久化，重启恢复
- **导出 HTML/PDF**：顶栏"导出 ▾"；导出使用与浏览一致的渲染结果（shiki 高亮、Mermaid SVG、任务清单）；KaTeX 字体 base64 内联（60 个字体文件，离线可用）；PDF 走隐藏窗口 `printToPDF`（printBackground）；保存对话框默认文件名为当前文档名
- **打包**：electron-builder 26 + NSIS 安装包（`release/MD Browser Setup 0.1.0.exe`，125MB）+ 免安装版（`release/win-unpacked/`）；asar 打包、国内镜像加速（`.npmrc`）
- **系统文件关联**：安装后 `.md` 文件出现在"打开方式"列表中，可选择用 MD Browser 打开；双击（设为默认打开方式后）直接启动应用并打开该文件——单实例锁 + `second-instance` 转发 + 渲染端 `signalReady` 后再 flush，避免启动竞态丢文件

## 快捷键

| 键 | 功能 |
| --- | --- |
| Ctrl+O | 打开文件夹 |
| Ctrl+S | 保存（编辑模式） |
| Ctrl+E | 编辑 / 预览切换 |
| Ctrl+W | 关闭当前标签页 |
| Ctrl+Shift+F | 全文搜索 |

## 结构

```
src/
├── main/          # 主进程：文件树扫描、chokidar 监听、mdres:// 协议、搜索、导出、读写/存图 IPC
├── preload/       # contextBridge 暴露 window.mdApi
├── renderer/
│   └── src/
│       ├── components/  # TopBar / TabBar / Sidebar / SearchPanel / Content(浏览) / Editor(Vditor IR) / Outline
│       └── lib/         # markdown-it 管线（含 mermaid 缓存内联）、shiki、导出 CSS 收集
└── shared/        # 主进程与渲染进程共享类型
demo-docs/         # 演示文档（表格、代码、Mermaid、公式、嵌套目录、图片）
scripts/           # 开发辅助：截图 / 点击模拟 / 按键注入（UI 自动化验证用）
release/           # 打包产物（MD Browser Setup 0.1.0.exe / win-unpacked）
```

## 已知待办

- 图片粘贴的自动化验证未跑通（合成键鼠对剪贴板位图 + IME 的兼容问题），功能代码已就绪，建议手动 `Ctrl+V` 验证
- 编辑模式下外部修改文件的冲突检测（当前策略：保存以编辑器内容为准）
- 全文搜索为实时扫描（百文件级毫秒响应）；万文件级仓库可升级 MiniSearch 倒排索引
- 应用图标未定制（electron-builder 使用默认图标）

## 路线图

- ~~阶段 1：浏览~~ ✓
- ~~阶段 2：编辑~~ ✓
- ~~阶段 3：搜索 / 标签页 / 导出 / 打包~~ ✓
