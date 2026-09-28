import type { LocalDatabaseAPI } from './localDatabase'
import type { OpggChampionQuery } from '@/services/opggChampionQuery'

export interface OpenExternalResult {
  success: boolean
  error?: string
}

export interface ElectronCacheClearResult {
  deletedPaths: string[]
  failedPaths: Array<{ path: string; error: string }>
}

export type ElectronOperationResult<T> = {
  success: true
  data: T
} | {
  success: false
  error: string
}

export interface ElectronAPI {
  minimizeWindow: () => Promise<void>
  maximizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>
  openOpggWindow: (query?: OpggChampionQuery) => Promise<ElectronOperationResult<{ opened: boolean }>>
  openExternal: (url: string) => Promise<OpenExternalResult>
  getVersion: () => Promise<string>
  checkUpdate: () => Promise<{ version: string; url: string } | null>
  downloadUpdate: (url: string) => Promise<string>
  installUpdate: (filePath: string) => Promise<void>
  onDownloadProgress: (cb: (p: { downloaded: number; total: number; percent: number }) => void) => () => void
  getLogs: () => Promise<Record<string, string>>
  clearChromiumCache: () => Promise<ElectronOperationResult<ElectronCacheClearResult>>
  platform: string
  onBackendReady: (callback: () => void) => () => void
  onTrayNavigate: (callback: (path: string) => void) => () => void
  onOpggInitialQuery: (callback: (query: OpggChampionQuery) => void) => () => void
  /** 悬浮窗：open = 有没有开着，inGameOpen = 局内贴片开着没，autoOpen = 是否「海斗对局中自动弹出」 */
  getHextechOverlayState: () => Promise<HextechOverlaySwitchState>
  openHextechOverlay: (mode: HextechOverlayMode) => Promise<HextechOverlaySwitchState>
  toggleHextechOverlay: (mode: HextechOverlayMode) => Promise<HextechOverlaySwitchState>
  setHextechOverlayAutoOpen: (enabled: boolean) => Promise<HextechOverlaySwitchState>
  setHextechOverlayStripActive: (active: boolean) => Promise<boolean>
  hextechOverlayDebugLog: (message: string) => Promise<boolean>
  captureOverlayProof: () => Promise<boolean>
  getHextechCaptureSource: () => Promise<{ id: string; screenWidth: number; screenHeight: number } | null>
  recognizeAugmentCrops: (payload: {
    crops: Array<{ width: number; height: number; data: Uint8Array }>
    screenWidth: number
    screenHeight: number
  }) => Promise<{
    available: boolean
    texts: string[]
    textsBySlot?: string[][]
    message?: string
    elapsedMs: number
    timing?: { captureMs: number; ocrMs: number; cached: boolean }
  }>
  database: LocalDatabaseAPI
}

export type HextechOverlayMode = 'champ-select' | 'in-game'

export interface HextechOverlaySwitchState {
  open: boolean
  inGameOpen: boolean
  autoOpen: boolean
}
