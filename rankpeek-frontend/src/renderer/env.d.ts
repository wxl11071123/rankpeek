import { ElectronAPI } from './types/electron'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

// 图片模块类型声明
declare module '*.png' {
  const value: string
  export default value
}

declare module '*.jpg' {
  const value: string
  export default value
}

declare module '*.jpeg' {
  const value: string
  export default value
}

declare module '*.svg' {
  const value: string
  export default value
}

declare module '*.gif' {
  const value: string
  export default value
}

export {}
