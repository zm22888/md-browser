import type { MdApi } from '../../preload/index'

declare global {
  interface Window {
    mdApi: MdApi
  }
}
