import { contextBridge, ipcRenderer } from 'electron'
import type { ExportPayload, SearchResult, TreeNode } from '../shared/types'

const api = {
  openFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFolder'),
  getSettings: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Record<string, unknown>): Promise<void> => ipcRenderer.invoke('settings:set', patch),
  readTree: (root: string): Promise<TreeNode[]> => ipcRenderer.invoke('fs:readTree', root),
  readFile: (filePath: string): Promise<string> => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath: string, content: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:writeFile', filePath, content),
  saveImage: (baseDir: string, fileName: string, data: Uint8Array): Promise<string> =>
    ipcRenderer.invoke('fs:saveImage', baseDir, fileName, data),
  exists: (filePath: string): Promise<boolean> => ipcRenderer.invoke('fs:exists', filePath),
  resolvePath: (base: string, rel: string): Promise<string> => ipcRenderer.invoke('path:resolve', base, rel),
  openExternal: (url: string): Promise<unknown> => ipcRenderer.invoke('shell:openExternal', url),
  showItemInFolder: (filePath: string): Promise<void> => ipcRenderer.invoke('shell:showItemInFolder', filePath),
  searchQuery: (root: string, query: string): Promise<SearchResult[]> =>
    ipcRenderer.invoke('search:query', root, query),
  exportDoc: (payload: ExportPayload): Promise<string | null> => ipcRenderer.invoke(`export:${payload.kind}`, payload),
  applyThemeSource: (dark: boolean): Promise<void> => ipcRenderer.invoke('theme:apply', dark),
  signalReady: (): Promise<void> => ipcRenderer.invoke('app:ready'),
  onOpenFileRequest: (cb: (payload: { root: string; files: string[] }) => void): (() => void) => {
    const listener = (_e: unknown, payload: { root: string; files: string[] }): void => cb(payload)
    ipcRenderer.on('app:open-files', listener)
    return () => { ipcRenderer.removeListener('app:open-files', listener) }
  },
  onFsChanged: (cb: (payload: { path: string; event: string }) => void): (() => void) => {
    const listener = (_e: unknown, payload: { path: string; event: string }): void => cb(payload)
    ipcRenderer.on('fs:changed', listener)
    return () => { ipcRenderer.removeListener('fs:changed', listener) }
  }
}

contextBridge.exposeInMainWorld('mdApi', api)

export type MdApi = typeof api
