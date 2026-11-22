import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { installMock } from './lib/mock'
import 'katex/dist/katex.min.css'
import './styles/global.css'

// 浏览器（非 Electron）环境下安装 mock，方便 UI 设计迭代
installMock()

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
