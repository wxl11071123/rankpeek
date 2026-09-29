import { contextBridge, ipcRenderer } from 'electron'
import type {
  AiAnalysisDeleteOptions,
  AiAnalysisDeleteResult,
  AiAnalysisListOptions,
  AiMemoryExportResult,
  AiMemoryStats,
  AiAnalysisResult,
  AiAnalysisResultInput,
  DatabaseResult,
  LocalDatabaseAPI,
  MatchDetail,
  MatchDetailInput,
  MatchRecord,
  MatchRecordInput,
  MatchRecordListOptions,
  LocalStorageHealthStats,
  LocalStorageRetentionResult,
  SummonerAccount,
  SummonerAccountInput
} from '../renderer/types/localDatabase'
import type { HextechOverlayMode, HextechOverlaySwitchState } from '../renderer/types/electron'

contextBridge.exposeInMainWorld('electronAPI', {
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  /** 悬浮窗开关状态：open = 有没有开着，inGameOpen = 局内贴片开着没，autoOpen = 是否「海斗对局中自动弹出」 */
  getHextechOverlayState: () =>
    ipcRenderer.invoke('hextech-overlay:state') as Promise<HextechOverlaySwitchState>,
  /** 手动开关悬浮窗（幂等打开 / 开关切换）；mode 决定操作哪个形态 */
  openHextechOverlay: (mode: HextechOverlayMode) =>
    ipcRenderer.invoke('hextech-overlay:open', mode) as Promise<HextechOverlaySwitchState>,
  toggleHextechOverlay: (mode: HextechOverlayMode) =>
    ipcRenderer.invoke('hextech-overlay:toggle', mode) as Promise<HextechOverlaySwitchState>,
  /** 把贴片的检测过程写进主进程日志（排查用） */
  hextechOverlayDebugLog: (message: string) =>
    ipcRenderer.invoke('hextech-overlay:debugLog', message) as Promise<boolean>,
  /** 局内贴片有没有内容：false = 透明 + 鼠标穿透（不挡游戏操作） */
  setHextechOverlayStripActive: (active: boolean) =>
    ipcRenderer.invoke('hextech-overlay:stripActive', active) as Promise<boolean>,
  /** 「海斗对局中自动弹出」开关 */
  setHextechOverlayAutoOpen: (enabled: boolean) =>
    ipcRenderer.invoke('hextech-overlay:autoOpen', enabled) as Promise<HextechOverlaySwitchState>,
  /** 悬浮窗形态：选人阶段不置顶，局内置顶贴在三张强化卡上方 */
  setHextechOverlayMode: (mode: 'champ-select' | 'in-game') =>
    ipcRenderer.invoke('hextech-overlay:setMode', mode) as Promise<boolean>,
  /** 局内悬浮窗：截取三个强化标题区域并做 OCR（引擎不可用时 available=false，前端回退手动点选） */
  recognizeAugmentTitles: () => ipcRenderer.invoke('hextech-ocr:recognize') as Promise<{
    available: boolean
    texts: string[]
    message?: string
    elapsedMs: number
  }>,
  /** 贴片亮起来之后补一张整屏截图，用来验证"面板到底画上去了没有" */
  captureOverlayProof: () => ipcRenderer.invoke('hextech-ocr:proof') as Promise<boolean>,
  /** 常驻抓屏流要的源信息（开一次流，之后每帧只 drawImage 一小块） */
  getHextechCaptureSource: () =>
    ipcRenderer.invoke('hextech-capture:source') as Promise<{
      id: string
      screenWidth: number
      screenHeight: number
    } | null>,
  /** 用渲染进程裁好的三块图做识别（常驻流的快路径） */
  recognizeAugmentCrops: (payload: {
    crops: Array<{ width: number; height: number; data: Uint8Array }>
    screenWidth: number
    screenHeight: number
  }) => ipcRenderer.invoke('hextech-ocr:crops', payload) as Promise<{
    available: boolean
    texts: string[]
    textsBySlot?: string[][]
    message?: string
    elapsedMs: number
    timing?: { captureMs: number; ocrMs: number; cached: boolean }
  }>,
  openOpggWindow: (query?: unknown) => ipcRenderer.invoke('opgg:openWindow', query),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url) as Promise<{ success: boolean; error?: string }>,
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  checkUpdate: () => ipcRenderer.invoke('app:checkUpdate'),
  downloadUpdate: (url: string) => ipcRenderer.invoke('app:downloadUpdate', url) as Promise<string>,
  installUpdate: (filePath: string) => ipcRenderer.invoke('app:installUpdate', filePath) as Promise<void>,
  onDownloadProgress: (cb: (p: { downloaded: number; total: number; percent: number }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, p: { downloaded: number; total: number; percent: number }) => cb(p)
    ipcRenderer.on('app:downloadProgress', handler)
    return () => { ipcRenderer.removeListener('app:downloadProgress', handler) }
  },
  getLogs: () => ipcRenderer.invoke('app:getLogs') as Promise<Record<string, string>>,
  clearChromiumCache: () => ipcRenderer.invoke('app:clearChromiumCache'),
  platform: process.platform,
  onBackendReady: (callback: () => void) => {
    ipcRenderer.on('backend:ready', callback)
    return () => ipcRenderer.removeListener('backend:ready', callback)
  },
  onTrayNavigate: (callback: (path: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, path: string) => callback(path)
    ipcRenderer.on('tray:navigate', listener)
    return () => ipcRenderer.removeListener('tray:navigate', listener)
  },
  onOpggInitialQuery: (callback: (query: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, query: unknown) => callback(query)
    ipcRenderer.on('opgg:initialQuery', listener)
    return () => ipcRenderer.removeListener('opgg:initialQuery', listener)
  },
  database: {
    upsertAccount: (account: SummonerAccountInput) => (
      ipcRenderer.invoke('db:account:upsert', account) as Promise<DatabaseResult<SummonerAccount>>
    ),
    listAccounts: () => (
      ipcRenderer.invoke('db:account:list') as Promise<DatabaseResult<SummonerAccount[]>>
    ),
    getLastSelectedAccount: () => (
      ipcRenderer.invoke('db:account:getLastSelected') as Promise<DatabaseResult<SummonerAccount | null>>
    ),
    setLastSelectedAccount: (region: string, puuid: string) => (
      ipcRenderer.invoke('db:account:setLastSelected', { region, puuid }) as Promise<DatabaseResult<SummonerAccount>>
    ),
    upsertMatchRecords: (records: MatchRecordInput[]) => (
      ipcRenderer.invoke('db:match:upsertRecords', records) as Promise<DatabaseResult<MatchRecord[]>>
    ),
    listMatchRecordsByAccount: (accountPuuid: string, options?: MatchRecordListOptions) => (
      ipcRenderer.invoke('db:match:listByAccount', { accountPuuid, options }) as Promise<DatabaseResult<MatchRecord[]>>
    ),
    getMatchDetail: (region: string, matchId: string) => (
      ipcRenderer.invoke('db:match:getDetail', { region, matchId }) as Promise<DatabaseResult<MatchDetail | null>>
    ),
    upsertMatchDetail: (detail: MatchDetailInput) => (
      ipcRenderer.invoke('db:match:upsertDetail', detail) as Promise<DatabaseResult<MatchDetail>>
    ),
    saveAnalysisResult: (result: AiAnalysisResultInput) => (
      ipcRenderer.invoke('db:ai:saveResult', result) as Promise<DatabaseResult<AiAnalysisResult>>
    ),
    listAnalysisResultsByAccount: (accountPuuid: string, options?: AiAnalysisListOptions) => (
      ipcRenderer.invoke('db:ai:listByAccount', { accountPuuid, options }) as Promise<DatabaseResult<AiAnalysisResult[]>>
    ),
    getAnalysisResultById: (id: number) => (
      ipcRenderer.invoke('db:ai:getById', id) as Promise<DatabaseResult<AiAnalysisResult | null>>
    ),
    findAnalysisByInputHash: (inputHash: string) => (
      ipcRenderer.invoke('db:ai:findByInputHash', inputHash) as Promise<DatabaseResult<AiAnalysisResult | null>>
    ),
    deleteAnalysisResultsByAccount: (accountPuuid: string, options?: AiAnalysisDeleteOptions) => (
      ipcRenderer.invoke('db:ai:deleteByAccount', { accountPuuid, options }) as Promise<DatabaseResult<AiAnalysisDeleteResult>>
    ),
    getAiMemoryStats: (accountPuuid: string) => (
      ipcRenderer.invoke('db:ai:getMemoryStats', accountPuuid) as Promise<DatabaseResult<AiMemoryStats>>
    ),
    exportAiMemory: (accountPuuid: string) => (
      ipcRenderer.invoke('db:ai:exportMemory', accountPuuid) as Promise<DatabaseResult<AiMemoryExportResult>>
    ),
    runStorageRetention: () => (
      ipcRenderer.invoke('db:storage:runRetention') as Promise<DatabaseResult<LocalStorageRetentionResult>>
    ),
    getStorageHealthStats: () => (
      ipcRenderer.invoke('db:storage:getHealthStats') as Promise<DatabaseResult<LocalStorageHealthStats>>
    )
  }
} satisfies { database: LocalDatabaseAPI } & Record<string, unknown>)
