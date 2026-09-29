import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  ipcMain,
  Menu,
  screen,
  session,
  shell,
  Tray,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
  type Rectangle
} from 'electron'
import { dirname, join } from 'path'
import { homedir, tmpdir } from 'os'
import { createHash } from 'crypto'
import { spawn, ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as https from 'https'
import * as http from 'http'
import {
  closeLocalDatabase,
  getLocalDatabase,
  initLocalDatabase,
  registerDatabaseIpcHandlers,
  type LocalDatabaseLogger
} from './database/index'
import { BackendIdentityMismatchError, createBackendInstanceId, fetchBackendIdentity, waitForBackend } from './backendStartup'
import { getTrayMenuEntries, getWindowCloseAction, getWindowMinimizeAction, type TrayMenuAction } from './trayBehavior'
import { diagnoseLcuReader, getLcuAuthInfo, isLcuReaderAvailable, type LcuAuthInfo } from './lcuReader'
import { startHextechGameWatcher } from './hextechGameWatcher'
import { findLeagueClientBounds, leagueWindowDiagnostics } from './leagueWindow'
import {
  applyHextechOverlayMode,
  closeHextechOverlay,
  closeHextechOverlayMode,
  isHextechOverlayOpen,
  hextechOverlayWindow,
  isInGameOverlayOpen,
  openHextechOverlay,
  openHextechOverlayInactive,
  setInGameStripActive,
  toggleHextechOverlay,
  type HextechOverlayMode
} from './hextechOverlay'
import { captureAugmentTitleImages } from './hextechCapture'
import { recognizeAugmentTitles } from './hextechOcr'

/**
 * 透明贴片盖在游戏窗口上时，Chromium 的「原生窗口遮挡计算」会把它判定成被遮住，
 * 于是不再出帧 —— 表现就是窗口 IsWindowVisible=true 但屏幕上什么都没有。
 * 顺手把后台节流也关掉，贴片/OCR 才不会因为"看不见"被降频。
 */
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
app.commandLine.appendSwitch('disable-renderer-backgrounding')

let mainWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null
let opggWindow: BrowserWindow | null = null
let backendProcess: ChildProcess | null = null
let appTray: Tray | null = null
let isQuitting = false
let startupFallbackTimer: ReturnType<typeof setTimeout> | null = null
let startupCheckInterval: ReturnType<typeof setInterval> | null = null
let noLcuTimeout: ReturnType<typeof setTimeout> | null = null
let minimumSplashTimer: ReturnType<typeof setTimeout> | null = null
let startupExitStarted = false
let startupStartedAt = 0
let backendShutdownInProgress = false
let backendShutdownCompleted = false
let backendInstanceId: string | null = null
let lcuAuthPushInterval: ReturnType<typeof setInterval> | null = null
let lastPushedAuth: LcuAuthInfo | null = null
let lastPushedBackendInstanceId: string | null = null
let lastBackendIdentityCheckAt = 0

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
const API_BASE_URL = 'http://127.0.0.1:8080/api/v1'
const STARTUP_CHECK_INTERVAL_MS = 500
const NO_LCU_TIMEOUT_MS = 6000
const STARTUP_FORCE_TIMEOUT_MS = 10000
const MIN_SPLASH_VISIBLE_MS = 3600
const BACKEND_SHUTDOWN_REQUEST_TIMEOUT_MS = 2000
const BACKEND_GRACEFUL_EXIT_TIMEOUT_MS = 5000
const OPGG_WINDOW_TITLE = 'RP-OPGG'
const LOG_ROTATION_MAX_BYTES = 10 * 1024 * 1024
const LOG_ROTATION_KEEP_COUNT = 5
const CORRUPT_BACKUP_KEEP_COUNT = 3

type StartupExitMode = 'smooth' | 'quick'

/**
 * 实测一个目录能不能写：建目录 + 写探针文件 + 删掉。
 *
 * 为什么不能直接信默认目录：有些机器（企业策略、安全软件、或刚编译出来的未签名 exe）
 * 会拒绝对 %APPDATA% 和 %TEMP% 的写入。那种情况下 Electron 在创建日志写流时会抛
 * 未捕获异常直接退出，用户看到的就是"双击没反应"—— 报错还被吞掉了，极难排查。
 */
function isDirWritable(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true })
    const probe = join(dir, '.rankpeek-write-probe')
    fs.writeFileSync(probe, 'ok')
    fs.rmSync(probe, { force: true })
    return true
  } catch {
    return false
  }
}

/** 按顺序挑第一个实测能写的目录。 */
function pickWritableDir(candidates: (string | undefined | null)[]): string | null {
  for (const candidate of candidates) {
    if (candidate && isDirWritable(candidate)) {
      return candidate
    }
  }
  return null
}

// 默认用户数据目录写不进去就退到安装目录下的 data，再不行退到系统临时目录下的 RankPeek。
const defaultUserDataDir = app.getPath('userData')
const fallbackUserDataDir = pickWritableDir([
  defaultUserDataDir,
  join(dirname(app.getPath('exe')), 'data'),
  join(tmpdir(), 'RankPeek')
])
const userDataDir = fallbackUserDataDir ?? defaultUserDataDir
if (userDataDir !== defaultUserDataDir) {
  app.setPath('userData', userDataDir)
  app.setPath('logs', join(userDataDir, 'logs'))
}

const logDir = app.getPath('logs')
const logFile = join(logDir, 'rankpeek.log')

// 日志写不进去也不能把应用弄死：降级成只写控制台
let logStream: fs.WriteStream | null = null
try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }
  rotateLogFile(logFile)
  logStream = fs.createWriteStream(logFile, { flags: 'a' })
  logStream.on('error', () => {
    logStream = null
  })
} catch (error) {
  logStream = null
  console.warn(`RankPeek log file unavailable, continuing without it: ${String(error)}`)
}

const boundsFile = join(userDataDir, 'window-bounds.json')
const opggBoundsFile = join(userDataDir, 'opgg-window-bounds.json')

/**
 * 后端的数据根目录。
 *
 * 默认是 %USERPROFILE%\.rankpeek，但有些机器上连这个目录都建不出来
 * （实测 AccessDeniedException 直接让后端起不来），所以这里挑一个实测能写的。
 * 已经存在旧目录的话优先沿用，不让老用户的数据"搬家"。
 */
const legacyDataRoot = join(homedir(), '.rankpeek')
const localDataRoot = pickWritableDir([
  process.env.RANKPEEK_LOCAL_DATA_ROOT,
  fs.existsSync(legacyDataRoot) ? legacyDataRoot : null,
  join(userDataDir, 'local-data'),
  join(dirname(app.getPath('exe')), 'data-root')
]) ?? join(userDataDir, 'local-data')
let storageRetentionTimer: NodeJS.Immediate | null = null

interface OpggChampionQuery {
  enabled?: boolean
  reason?: string
  championId?: number | null
  mode?: string
  region?: 'kr' | string
  tier?: string
  position?: string
  filterLabel?: string
}

interface OpggWindowBoundsState {
  bounds: Rectangle
  userMoved: boolean
}

function rotateLogFile(filePath: string) {
  try {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size < LOG_ROTATION_MAX_BYTES) {
      return
    }

    for (let index = LOG_ROTATION_KEEP_COUNT - 1; index >= 1; index -= 1) {
      const source = `${filePath}.${index}`
      const target = `${filePath}.${index + 1}`
      if (fs.existsSync(source)) {
        fs.renameSync(source, target)
      }
    }

    fs.renameSync(filePath, `${filePath}.1`)
  } catch (error) {
    console.warn(`Failed to rotate RankPeek log: ${String(error)}`)
  }
}

function log(level: string, message: string) {
  const timestamp = new Date().toISOString()
  const logLine = `[${timestamp}] [${level}] ${message}\n`
  logStream?.write(logLine)
  console.log(logLine.trim())
}

const databaseLogger: LocalDatabaseLogger = {
  info: (message) => log('INFO', message),
  warn: (message) => log('WARN', message),
  error: (message) => log('ERROR', message)
}

function getMainIconPath() {
  return getPublicAssetPath('icon.ico')
}

function getTrayIconPath() {
  return getPublicAssetPath('tray-icon.ico')
}

function getPublicAssetPath(fileName: string) {
  return isDev
    ? join(__dirname, '../../public', fileName)
    : join(process.resourcesPath, 'public', fileName)
}

function scheduleLocalStorageRetention() {
  if (storageRetentionTimer) {
    return
  }

  storageRetentionTimer = setImmediate(() => {
    storageRetentionTimer = null
    try {
      const result = getLocalDatabase().runStorageRetention()
      if (result.matchRecordsDeleted > 0 || result.matchDetailsDeleted > 0) {
        log(
          'INFO',
          `Local database retention applied: matchRecordsDeleted=${result.matchRecordsDeleted}, `
            + `matchDetailsDeleted=${result.matchDetailsDeleted}`
        )
      }
    } catch (error) {
      log('WARN', `Local database retention failed: ${String(error)}`)
    }
  })
}

async function saveAiMemoryExport({ payload }: Parameters<NonNullable<Parameters<typeof registerDatabaseIpcHandlers>[3]>['exportAiMemory']>[0]) {
  const defaultFileName = `rankpeek-ai-memory-${sanitizeFileToken(payload.accountPuuid)}-${Date.now()}.json`
  const saveResult = await dialog.showSaveDialog(mainWindow ?? undefined, {
    title: '导出 AI 记忆',
    defaultPath: join(app.getPath('documents'), defaultFileName),
    filters: [
      { name: 'JSON', extensions: ['json'] }
    ]
  })

  if (saveResult.canceled || !saveResult.filePath) {
    return {
      filePath: null,
      exportedCount: 0,
      canceled: true
    }
  }

  await fs.promises.writeFile(saveResult.filePath, JSON.stringify(payload, null, 2), 'utf8')
  return {
    filePath: saveResult.filePath,
    exportedCount: payload.records.length,
    canceled: false
  }
}

function sanitizeFileToken(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 32) || 'account'
}

async function clearElectronCacheArtifacts() {
  const userDataPath = app.getPath('userData')
  const deletedPaths: string[] = []
  const failedPaths: Array<{ path: string; error: string }> = []

  try {
    await session.defaultSession.clearCache()
  } catch (error) {
    failedPaths.push({ path: 'electron-session-cache', error: String(error) })
  }

  for (const directoryName of ['Cache', 'Code Cache', 'GPUCache']) {
    const directoryPath = join(userDataPath, directoryName)
    try {
      await fs.promises.rm(directoryPath, { recursive: true, force: true })
      deletedPaths.push(directoryPath)
    } catch (error) {
      failedPaths.push({ path: directoryPath, error: String(error) })
    }
  }

  for (const directoryPath of [userDataPath, join(userDataPath, 'user-store')]) {
    const deleted = await pruneCorruptUserStoreBackups(directoryPath)
    deletedPaths.push(...deleted)
  }

  return {
    deletedPaths,
    failedPaths
  }
}

async function pruneCorruptUserStoreBackups(directoryPath: string) {
  try {
    const entries = await fs.promises.readdir(directoryPath, { withFileTypes: true })
    const backups = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && /^rankpeek-user-store\.corrupt-.*\.json$/.test(entry.name))
        .map(async (entry) => {
          const filePath = join(directoryPath, entry.name)
          const stat = await fs.promises.stat(filePath)
          return { filePath, mtimeMs: stat.mtimeMs }
        })
    )

    backups.sort((left, right) => left.mtimeMs - right.mtimeMs || left.filePath.localeCompare(right.filePath))
    const deleted: string[] = []
    for (const backup of backups.slice(0, Math.max(0, backups.length - CORRUPT_BACKUP_KEEP_COUNT))) {
      await fs.promises.rm(backup.filePath, { force: true })
      deleted.push(backup.filePath)
    }
    return deleted
  } catch {
    return []
  }
}

function loadWindowBounds(): { width: number; height: number; x: number; y: number } | null {
  try {
    if (fs.existsSync(boundsFile)) {
      return JSON.parse(fs.readFileSync(boundsFile, 'utf-8'))
    }
  } catch {
    log('WARN', 'Failed to load window bounds')
  }

  return null
}

function saveWindowBounds() {
  if (!mainWindow) {
    return
  }

  try {
    fs.writeFileSync(boundsFile, JSON.stringify(mainWindow.getBounds()))
  } catch {
    log('WARN', 'Failed to save window bounds')
  }
}

function loadOpggWindowBounds(): OpggWindowBoundsState | null {
  try {
    if (!fs.existsSync(opggBoundsFile)) {
      return null
    }

    const parsed = JSON.parse(fs.readFileSync(opggBoundsFile, 'utf-8'))
    const bounds = isWindowBounds(parsed?.bounds) ? parsed.bounds : parsed
    if (!isWindowBounds(bounds)) {
      return null
    }

    return {
      bounds,
      userMoved: parsed?.userMoved !== false
    }
  } catch {
    log('WARN', 'Failed to load OP.GG window bounds')
    return null
  }
}

function saveOpggWindowBounds(bounds: Rectangle, userMoved = true) {
  try {
    fs.writeFileSync(opggBoundsFile, JSON.stringify({ bounds, userMoved }))
  } catch {
    log('WARN', 'Failed to save OP.GG window bounds')
  }
}

function isWindowBounds(value: unknown): value is Rectangle {
  if (!isRecord(value)) {
    return false
  }

  return ['x', 'y', 'width', 'height'].every(key => {
    const numberValue = value[key]
    return typeof numberValue === 'number' && Number.isFinite(numberValue)
  })
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow()
    return
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show()
  }

  mainWindow.focus()
}

function hideWindowToTray() {
  if (!mainWindow) {
    return
  }

  saveWindowBounds()
  mainWindow.hide()
  log('INFO', 'Window hidden to tray')
}

function navigateRenderer(path: string) {
  if (!mainWindow) {
    return
  }

  showMainWindow()
  if (mainWindow.webContents.isLoadingMainFrame()) {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow?.webContents.send('tray:navigate', path)
    })
    return
  }

  mainWindow.webContents.send('tray:navigate', path)
}

function toggleDevTools() {
  if (!mainWindow) {
    return
  }

  if (mainWindow.webContents.isDevToolsOpened()) {
    mainWindow.webContents.closeDevTools()
    return
  }

  mainWindow.webContents.openDevTools({ mode: 'detach' })
}

function handleTrayAction(action: TrayMenuAction) {
  switch (action) {
    case 'show-window':
      showMainWindow()
      return
    case 'hide-window':
      hideWindowToTray()
      return
    case 'navigate-home':
      navigateRenderer('/')
      return
    case 'navigate-summoner':
      navigateRenderer('/summoner')
      return
    case 'navigate-match-history':
      navigateRenderer('/match-history')
      return
    case 'toggle-devtools':
      toggleDevTools()
      return
    case 'quit':
      isQuitting = true
      app.quit()
      return
    default:
      return
  }
}

function createTray() {
  if (appTray) {
    return
  }

  appTray = new Tray(getTrayIconPath())
  appTray.setToolTip('RankPeek')

  const menuEntries: MenuItemConstructorOptions[] = getTrayMenuEntries().map((entry) => (
    entry.action === 'separator'
      ? { type: 'separator' }
      : {
          label: entry.label,
          click: () => handleTrayAction(entry.action)
        }
  ))

  appTray.setContextMenu(Menu.buildFromTemplate(menuEntries))

  appTray.on('click', () => {
    if (mainWindow?.isVisible()) {
      hideWindowToTray()
      return
    }

    showMainWindow()
  })
}

function createSplashWindow() {
  if (splashWindow) {
    return
  }

  splashWindow = new BrowserWindow({
    width: 480,
    height: 520,
    frame: false,
    transparent: false,
    backgroundColor: '#000000',
    resizable: false,
    show: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    center: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  splashWindow.removeMenu()
  void splashWindow.loadFile(getPublicAssetPath('loading.html')).catch((error) => {
    log('WARN', `Failed to load splash screen: ${String(error)}`)
  })

  splashWindow.once('ready-to-show', () => {
    if (splashWindow) {
      showSplashWindowOnceOnTop(splashWindow)
    }
  })

  splashWindow.on('closed', () => {
    splashWindow = null
  })
}

function showSplashWindowOnceOnTop(window: BrowserWindow) {
  if (window.isDestroyed()) {
    return
  }

  window.setAlwaysOnTop(true)
  window.show()
  window.focus()
  window.setAlwaysOnTop(false)
}

function closeSplashWindow() {
  if (!splashWindow) {
    return
  }

  if (!splashWindow.isDestroyed()) {
    splashWindow.close()
  }
  splashWindow = null
}

function getOpggWindowUrl() {
  return isDev
    ? 'http://localhost:5173/#/opgg'
    : join(__dirname, '../renderer/index.html')
}

async function openOpggWindow(query?: OpggChampionQuery) {
  try {
    const opened = await focusOrCreateOpggWindow(query)
    return {
      success: true,
      data: { opened }
    }
  } catch (error) {
    log('WARN', `Failed to open OP.GG window: ${String(error)}`)
    return {
      success: false,
      error: String(error)
    }
  }
}

async function focusOrCreateOpggWindow(query?: OpggChampionQuery): Promise<boolean> {
  if (opggWindow && !opggWindow.isDestroyed()) {
    if (opggWindow.isMinimized()) {
      opggWindow.restore()
    }
    if (!opggWindow.isVisible()) {
      opggWindow.show()
    }
    opggWindow.focus()
    sendOpggInitialQuery(query)
    return false
  }

  await createOpggWindow(query)
  return true
}

async function createOpggWindow(query?: OpggChampionQuery) {
  const storedBounds = loadOpggWindowBounds()
  const initialBounds = storedBounds?.userMoved
    ? storedBounds.bounds
    : await resolveInitialOpggWindowBounds()
  let trackingUserBounds = false

  opggWindow = new BrowserWindow({
    width: initialBounds.width,
    height: initialBounds.height,
    x: initialBounds.x,
    y: initialBounds.y,
    minWidth: 720,
    minHeight: 560,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: '#111827',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, '../preload/preload.js'),
      webSecurity: true,
      spellcheck: false
    },
    icon: getMainIconPath(),
    title: OPGG_WINDOW_TITLE,
    titleBarStyle: 'hidden',
    thickFrame: true
  })

  const createdWindow = opggWindow
  const saveMovedBounds = () => {
    if (!trackingUserBounds || createdWindow.isDestroyed()) {
      return
    }
    saveOpggWindowBounds(createdWindow.getBounds(), true)
  }

  createdWindow.removeMenu()
  createdWindow.setTitle(OPGG_WINDOW_TITLE)
  createdWindow.on('page-title-updated', (event) => {
    event.preventDefault()
    createdWindow.setTitle(OPGG_WINDOW_TITLE)
  })
  createdWindow.on('closed', () => {
    if (opggWindow === createdWindow) {
      opggWindow = null
    }
  })
  createdWindow.on('move', saveMovedBounds)
  createdWindow.on('resize', saveMovedBounds)
  createdWindow.once('ready-to-show', () => {
    createdWindow.show()
    createdWindow.focus()
    setTimeout(() => {
      trackingUserBounds = true
    }, 300)
  })
  createdWindow.webContents.once('did-finish-load', () => {
    sendOpggInitialQuery(query)
  })
  createdWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  if (isDev) {
    void createdWindow.loadURL(getOpggWindowUrl())
  } else {
    void createdWindow.loadFile(getOpggWindowUrl(), { hash: '/opgg' })
  }
}

function sendOpggInitialQuery(query?: OpggChampionQuery) {
  if (!opggWindow || opggWindow.isDestroyed() || !query) {
    return
  }

  if (opggWindow.webContents.isLoadingMainFrame()) {
    opggWindow.webContents.once('did-finish-load', () => {
      opggWindow?.webContents.send('opgg:initialQuery', query)
    })
    return
  }

  opggWindow.webContents.send('opgg:initialQuery', query)
}

async function resolveInitialOpggWindowBounds(): Promise<Rectangle> {
  const defaultSize = { width: 980, height: 720 }
  const workArea = screen.getPrimaryDisplay().workArea
  return clampBoundsToWorkArea({
    x: Math.round(workArea.x + (workArea.width - defaultSize.width) / 2),
    y: Math.round(workArea.y + (workArea.height - defaultSize.height) / 2),
    ...defaultSize
  }, workArea)
}

function clampBoundsToWorkArea(bounds: Rectangle, workArea: Rectangle): Rectangle {
  const width = Math.min(bounds.width, workArea.width)
  const height = Math.min(bounds.height, workArea.height)
  return {
    width,
    height,
    x: Math.min(Math.max(bounds.x, workArea.x), workArea.x + workArea.width - width),
    y: Math.min(Math.max(bounds.y, workArea.y), workArea.y + workArea.height - height)
  }
}

function clearStartupTimers() {
  if (!startupFallbackTimer) {
    // Continue clearing the other startup timers below.
  } else {
    clearTimeout(startupFallbackTimer)
    startupFallbackTimer = null
  }

  if (startupCheckInterval) {
    clearInterval(startupCheckInterval)
    startupCheckInterval = null
  }

  if (noLcuTimeout) {
    clearTimeout(noLcuTimeout)
    noLcuTimeout = null
  }

  if (minimumSplashTimer) {
    clearTimeout(minimumSplashTimer)
    minimumSplashTimer = null
  }
}

function requestStartupExit(mode: StartupExitMode) {
  if (startupExitStarted) {
    return
  }

  if (mode === 'smooth') {
    const remainingVisibleTime = MIN_SPLASH_VISIBLE_MS - (Date.now() - startupStartedAt)
    if (remainingVisibleTime > 0) {
      if (!minimumSplashTimer) {
        minimumSplashTimer = setTimeout(() => {
          minimumSplashTimer = null
          requestStartupExit(mode)
        }, remainingVisibleTime)
      }
      return
    }
  }

  runStartupExit(mode)
}

function runStartupExit(mode: StartupExitMode) {
  if (startupExitStarted || !mainWindow || mainWindow.isDestroyed()) {
    return
  }

  startupExitStarted = true
  clearStartupTimers()

  const showMainWindowAfterSplash = () => {
    closeSplashWindow()
    if (!mainWindow || mainWindow.isDestroyed()) {
      return
    }

    mainWindow.show()
    mainWindow.focus()
  }

  if (splashWindow && !splashWindow.isDestroyed()) {
    const exitScript = mode === 'smooth'
      ? 'typeof window.finishWithLCU === "function" && window.finishWithLCU()'
      : 'typeof window.finishWithoutLCU === "function" && window.finishWithoutLCU()'

    void splashWindow.webContents
      .executeJavaScript(exitScript)
      .catch((error) => {
        log('WARN', `Failed to finish splash animation: ${String(error)}`)
      })

    setTimeout(showMainWindowAfterSplash, mode === 'smooth' ? 2500 : 1700)
    return
  }

  showMainWindowAfterSplash()
}

function startStartupReadinessChecks() {
  clearStartupTimers()
  startupStartedAt = Date.now()

  let lcuReady = false
  let dataReady = false
  let isChecking = false

  const checkReadiness = async () => {
    if (startupExitStarted || dataReady || isChecking) {
      return
    }

    isChecking = true
    try {
      lcuReady = await checkLcuReady()
      if (!lcuReady) {
        return
      }

      dataReady = await checkHomeDataReady()
      if (dataReady) {
        requestStartupExit('smooth')
      }
    } finally {
      isChecking = false
    }
  }

  startupCheckInterval = setInterval(() => {
    void checkReadiness()
  }, STARTUP_CHECK_INTERVAL_MS)

  void checkReadiness()

  noLcuTimeout = setTimeout(() => {
    if (!dataReady && !lcuReady) {
      requestStartupExit('quick')
    }
  }, NO_LCU_TIMEOUT_MS)

  startupFallbackTimer = setTimeout(() => {
    requestStartupExit('quick')
  }, STARTUP_FORCE_TIMEOUT_MS)
}

async function checkLcuReady() {
  const gameStatePayload = await fetchStartupJson(`${API_BASE_URL}/session/game-state`)
  const gameState = unwrapApiResponse(gameStatePayload)
  if (isConnectedPayload(gameState)) {
    return true
  }

  const connectedPayload = await fetchStartupJson(`${API_BASE_URL}/session/connected`)
  const connected = unwrapApiResponse(connectedPayload)
  if (connected === true || isConnectedPayload(connected)) {
    return true
  }

  return false
}

async function checkHomeDataReady() {
  const gameStatePayload = await fetchStartupJson(`${API_BASE_URL}/session/game-state`)
  const gameState = unwrapApiResponse(gameStatePayload)
  const gameStatePuuid = getSummonerPuuid(gameState)

  const summonerPayload = await fetchStartupJson(`${API_BASE_URL}/summoner/me`)
  const summoner = unwrapApiResponse(summonerPayload)
  const puuid = getSummonerPuuid(summoner) ?? gameStatePuuid

  if (!puuid) {
    return false
  }

  const [rankPayload, rankedWinRatesPayload, matchesReady] = await Promise.all([
    fetchStartupJson(`${API_BASE_URL}/summoner/rank/${encodeURIComponent(puuid)}`),
    fetchStartupJson(`${API_BASE_URL}/summoner/ranked-win-rates/${encodeURIComponent(puuid)}`),
    hasAnalyzableMatches(puuid)
  ])
  const rank = unwrapApiResponse(rankPayload)
  const rankedWinRates = unwrapApiResponse(rankedWinRatesPayload)

  return rank !== null && rankedWinRates !== null && matchesReady
}

async function hasAnalyzableMatches(puuid: string) {
  const matchesPayload = await fetchStartupJson(
    `${API_BASE_URL}/summoner/matches/${encodeURIComponent(puuid)}?begIndex=0&endIndex=9`
  )
  const matches = unwrapApiResponse(matchesPayload)

  return Array.isArray(matches) && matches.length > 0
}

async function fetchStartupJson(url: string): Promise<unknown> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      return null
    }

    return await response.json()
  } catch {
    return null
  }
}

function unwrapApiResponse(payload: unknown): unknown {
  if (!isRecord(payload) || !('data' in payload)) {
    return payload
  }

  return payload.data
}

function isConnectedPayload(payload: unknown): boolean {
  if (payload === true) {
    return true
  }

  if (!isRecord(payload)) {
    return false
  }

  return payload.connected === true
}

function getSummonerPuuid(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null
  }

  if (typeof payload.puuid === 'string' && payload.puuid.length > 0) {
    return payload.puuid
  }

  return getSummonerPuuid(payload.summoner)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** 悬浮窗的加载参数（dev 走 Vite，打包后走 renderer/index.html）。 */
function hextechOverlayOptions() {
  return {
    isDev,
    devUrl: 'http://localhost:5173',
    rendererFile: join(__dirname, '../renderer/index.html'),
    preloadPath: join(__dirname, '../preload/preload.js'),
    iconPath: getMainIconPath(),
    // 跟 OP.GG 窗口一样：玩家拖过/拉过的大小记在 userData 里
    boundsFile: join(app.getPath('userData'), 'hextech-overlay-bounds.json')
  }
}

function asOverlayMode(value: unknown): HextechOverlayMode {
  return value === 'in-game' ? 'in-game' : 'champ-select'
}

/** 悬浮窗设置：只存「海斗对局中自动弹出」这一个开关。 */
interface HextechOverlaySettings {
  autoOpen: boolean
}

function loadHextechOverlaySettings(): HextechOverlaySettings {
  for (const file of [join(app.getPath('userData'), 'hextech-overlay.json'), join(app.getAppPath(), 'hextech-overlay.json')]) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'))
      return { autoOpen: parsed?.autoOpen === true }
    } catch {
      // 换下一个位置
    }
  }
  return { autoOpen: false }
}

let hextechOverlayAutoOpen = loadHextechOverlaySettings().autoOpen

/**
 * 设置文件写在 userData；写不进去（受限环境/权限）就退到应用目录，
 * 免得开关每次重启都丢。
 */
function hextechSettingsFilePath(): string {
  const primary = join(app.getPath('userData'), 'hextech-overlay.json')
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true })
    fs.accessSync(app.getPath('userData'), fs.constants.W_OK)
    return primary
  } catch {
    return join(app.getAppPath(), 'hextech-overlay.json')
  }
}

function hextechOverlayState(): { open: boolean; inGameOpen: boolean; autoOpen: boolean } {
  return {
    open: isHextechOverlayOpen(),
    inGameOpen: isInGameOverlayOpen(),
    autoOpen: hextechOverlayAutoOpen
  }
}

function setHextechOverlayAutoOpen(enabled: boolean): { open: boolean; inGameOpen: boolean; autoOpen: boolean } {
  hextechOverlayAutoOpen = enabled
  try {
    fs.writeFileSync(hextechSettingsFilePath(), JSON.stringify({ autoOpen: enabled }))
  } catch (error) {
    log('WARN', 'hextech overlay settings not saved: ' + String(error))
  }
  return hextechOverlayState()
}

function createWindow() {
  const storedBounds = loadWindowBounds()

  mainWindow = new BrowserWindow({
    width: storedBounds?.width ?? 1200,
    height: storedBounds?.height ?? 800,
    x: storedBounds?.x,
    y: storedBounds?.y,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, '../preload/preload.js'),
      webSecurity: true,
      spellcheck: false
    },
    icon: getMainIconPath(),
    titleBarStyle: 'hidden',
    thickFrame: true
  })


  mainWindow.on('close', (event) => {
    const action = getWindowCloseAction({
      isTrayEnabled: Boolean(appTray),
      isQuitting
    })

    if (action === 'hide-to-tray') {
      event.preventDefault()
      hideWindowToTray()
      return
    }

    saveWindowBounds()
  })

  mainWindow.on('minimize', () => {
    const action = getWindowMinimizeAction({
      isTrayEnabled: Boolean(appTray),
      isQuitting
    })

    if (action === 'keep-minimized') {
      saveWindowBounds()
    }
  })

  mainWindow.on('closed', () => {
    clearStartupTimers()
    startupExitStarted = false
    mainWindow = null
  })

  mainWindow.on('resize', () => {
    saveWindowBounds()
  })

  mainWindow.on('move', () => {
    saveWindowBounds()
  })

  startStartupReadinessChecks()

  if (isDev) {
    void mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      void shell.openExternal(url)
    }

    return { action: 'deny' }
  })
}

const LCU_AUTH_PUSH_INTERVAL_MS = 3000
const BACKEND_IDENTITY_CHECK_INTERVAL_MS = 15000

async function resolveBackendInstanceId(): Promise<string | null> {
  const now = Date.now()
  if (now - lastBackendIdentityCheckAt < BACKEND_IDENTITY_CHECK_INTERVAL_MS) {
    return lastPushedBackendInstanceId
  }
  lastBackendIdentityCheckAt = now
  try {
    const identity = await fetchBackendIdentity()
    return identity.instanceId
  } catch {
    return null
  }
}

let lcuPushDiagnosticAt = 0

/** 限频诊断：只在状态变化或每分钟一次时写日志，避免刷屏。 */
function logLcuPushSkip(reason: string): void {
  const now = Date.now()
  if (now - lcuPushDiagnosticAt < 60000) {
    return
  }
  lcuPushDiagnosticAt = now
  log('WARN', `LCU auth push skipped: ${reason}`)
}

async function pushLcuAuthToBackend(): Promise<void> {
  try {
    if (!isLcuReaderAvailable()) {
      logLcuPushSkip('koffi/LCU reader unavailable')
      return
    }
    const auth = getLcuAuthInfo()
    if (!auth) {
      logLcuPushSkip('LCU process not found or command line unreadable ' + JSON.stringify(diagnoseLcuReader()))
      return
    }

    // The backend holds LCU credentials in memory only, so a restarted backend needs them again
    // even when the credentials themselves did not change.
    const backendInstanceId = await resolveBackendInstanceId()
    const authUnchanged = lastPushedAuth
      && lastPushedAuth.port === auth.port
      && lastPushedAuth.token === auth.token
    if (authUnchanged && backendInstanceId === lastPushedBackendInstanceId) {
      return
    }

    const response = await fetch(`${API_BASE_URL}/system/lcu-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(auth)
    })

    if (response.ok) {
      lastPushedAuth = auth
      lastPushedBackendInstanceId = backendInstanceId
      log('INFO', `LCU auth pushed to backend: port=${auth.port}`)
    } else {
      logLcuPushSkip(`backend responded ${response.status}`)
    }
  } catch (e) {
    // 后端可能还没启动；限频记录一次原因，方便排查
    logLcuPushSkip(`request failed: ${String(e)}`)
  }
}

function startLcuAuthPusher(): void {
  if (lcuAuthPushInterval) return
  void pushLcuAuthToBackend()
  lcuAuthPushInterval = setInterval(() => { void pushLcuAuthToBackend() }, LCU_AUTH_PUSH_INTERVAL_MS)
}

function stopLcuAuthPusher(): void {
  if (lcuAuthPushInterval) {
    clearInterval(lcuAuthPushInterval)
    lcuAuthPushInterval = null
  }
}

async function startBackend(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isDev) {
      log('INFO', 'Development mode: backend is expected on port 8080')
      resolve()
      return
    }

    const exePath = join(process.resourcesPath, 'backend', 'rankpeek-backend.exe')
    const spawnedBackendInstanceId = createBackendInstanceId()
    backendInstanceId = spawnedBackendInstanceId
    log('INFO', `Starting backend from ${exePath}`)

    // 后端（Tomcat）要在临时目录里建工作目录。挑一个**实测能写**的，而不是直接信 %TEMP%：
    // 一是有些机器上 %TEMP% 权限受限，实测过 AccessDeniedException 让后端直接起不来；
    // 二是别在用户 %TEMP% 里堆几百个 tomcat.8080.* 残留。
    const backendTmpDir = pickWritableDir([
      join(userDataDir, 'backend-tmp'),
      join(dirname(app.getPath('exe')), 'backend-tmp'),
      process.env.TEMP,
      process.env.TMP
    ])
    if (backendTmpDir) {
      log('INFO', `Backend temp dir: ${backendTmpDir}`)
    } else {
      log('WARN', 'No writable temp dir found for the backend; leaving it to the system default')
    }

    backendProcess = spawn(exePath, backendTmpDir ? [`-Djava.io.tmpdir=${backendTmpDir}`] : [], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        ...(backendTmpDir ? { TEMP: backendTmpDir, TMP: backendTmpDir } : {}),
        RANKPEEK_LOCAL_DATA_ROOT: localDataRoot,
        RANKPEEK_BACKEND_INSTANCE_ID: spawnedBackendInstanceId
      }
    })
    backendShutdownCompleted = false

    const spawnedBackendProcess = backendProcess

    backendProcess.stdout?.on('data', (data) => {
      writeBackendOutput('stdout', data)
    })

    backendProcess.stderr?.on('data', (data) => {
      writeBackendOutput('stderr', data)
    })

    backendProcess.on('error', (error) => {
      log('ERROR', `Failed to start backend process: ${String(error)}`)
      reject(error)
    })

    backendProcess.on('exit', (code, signal) => {
      log('INFO', `Backend process exited: code=${String(code)}, signal=${String(signal)}`)
      if (backendProcess === spawnedBackendProcess) {
        backendProcess = null
        backendInstanceId = null
      }
    })

    void waitForBackend({
      expectedInstanceId: spawnedBackendInstanceId,
      log: (message) => log('INFO', message)
    }).then(resolve).catch((error) => {
      if (error instanceof BackendIdentityMismatchError) {
        log('ERROR', error.message)
      }
      reject(error)
    })
  })
}

function writeBackendOutput(streamName: 'stdout' | 'stderr', data: Buffer | string) {
  const text = data.toString()
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().length === 0) {
      continue
    }

    log(streamName === 'stderr' ? 'ERROR' : 'INFO', `Backend ${streamName}: ${line}`)
  }
}

async function stopBackend(): Promise<void> {
  if (isDev) {
    log('INFO', 'Development mode: leaving manually started backend running')
    return
  }

  const processToStop = backendProcess
  if (!processToStop) {
    return
  }

  log('INFO', 'Requesting backend graceful shutdown')
  const shutdownRequested = await requestBackendShutdown(backendInstanceId)

  const exited = await waitForBackendExit(processToStop, BACKEND_GRACEFUL_EXIT_TIMEOUT_MS)
  if (exited) {
    log('INFO', 'Backend exited after graceful shutdown request')
    if (backendProcess === processToStop) {
      backendProcess = null
      backendInstanceId = null
    }
    return
  }

  log('WARN', shutdownRequested
    ? 'Backend did not exit before timeout; falling back to process kill'
    : 'Backend shutdown request was skipped because port 8080 belongs to another backend; killing spawned process'
  )
  processToStop.kill()
  await waitForBackendExit(processToStop, 2000)
  if (backendProcess === processToStop) {
    backendProcess = null
    backendInstanceId = null
  }
}

async function requestBackendShutdown(expectedInstanceId: string | null): Promise<boolean> {
  if (expectedInstanceId) {
    try {
      const identity = await fetchBackendIdentity()
      if (identity.instanceId !== expectedInstanceId) {
        log('WARN', 'Skipping backend graceful shutdown because port 8080 does not belong to the spawned backend')
        return false
      }
    } catch (error) {
      log('WARN', `Could not verify backend identity before shutdown request: ${String(error)}`)
      return false
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, BACKEND_SHUTDOWN_REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${API_BASE_URL}/system/shutdown`, {
      method: 'POST',
      signal: controller.signal
    })
    log('INFO', `Backend shutdown request completed: status=${response.status}`)
    return true
  } catch (error) {
    log('WARN', `Backend shutdown request failed; will wait before fallback kill: ${String(error)}`)
    return false
  } finally {
    clearTimeout(timeout)
  }
}

function waitForBackendExit(processToWait: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (processToWait.exitCode !== null || processToWait.signalCode !== null) {
    return Promise.resolve(true)
  }

  return new Promise((resolve) => {
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) {
        return
      }
      settled = true
      processToWait.off('exit', handleExit)
      resolve(false)
    }, timeoutMs)

    const handleExit = () => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      resolve(true)
    }

    processToWait.once('exit', handleExit)
  })
}

function getIpcSenderWindow(event: IpcMainInvokeEvent) {
  return BrowserWindow.fromWebContents(event.sender) ?? mainWindow
}

ipcMain.handle('window:minimize', (event) => {
  getIpcSenderWindow(event)?.minimize()
})

ipcMain.handle('window:maximize', (event) => {
  const targetWindow = getIpcSenderWindow(event)
  if (targetWindow?.isMaximized()) {
    targetWindow.unmaximize()
    return
  }

  targetWindow?.maximize()
})

// 悬浮窗开关：海斗页里的按钮 + 「对局中自动弹出」选项都走这里
ipcMain.handle('hextech-overlay:toggle', (_event, mode: unknown) => {
  toggleHextechOverlay(hextechOverlayOptions(), asOverlayMode(mode))
  return hextechOverlayState()
})

ipcMain.handle('hextech-overlay:open', (_event, mode: unknown) => {
  openHextechOverlay(hextechOverlayOptions(), asOverlayMode(mode))
  return hextechOverlayState()
})

ipcMain.handle('hextech-overlay:state', () => hextechOverlayState())

// 渲染进程的检测过程写进主进程日志（排查"为什么没弹"用）
ipcMain.handle('hextech-overlay:debugLog', (_event, message: unknown) => {
  if (typeof message === 'string' && message.length <= 400) {
    log('INFO', '[strip] ' + message)
  }
  return true
})

// 局内贴片：识别到强化 -> 亮起来可交互；没识别到 -> 透明 + 鼠标穿透
ipcMain.handle('hextech-overlay:stripActive', (_event, active: unknown) => {
  setInGameStripActive(active === true)
  return true
})

ipcMain.handle('hextech-overlay:autoOpen', (_event, enabled: unknown) =>
  setHextechOverlayAutoOpen(enabled === true)
)

/**
 * 标题区域指纹缓存（照 aramgg 的做法）：
 * 帧没变就直接复用上一轮 OCR 结果，省掉最贵的一步，轮询才敢跑快。
 */
let augmentOcrCache: { fingerprint: string; at: number; outcome: Awaited<ReturnType<typeof recognizeAugmentTitles>> } | null = null
const AUGMENT_OCR_CACHE_MS = 30_000

/** 抓屏和识别各花了多久（限频 10 秒一条，别刷屏）。 */
let lastOcrTimingLogAt = 0
function logOcrTiming(captureMs: number, ocrMs: number, cached: boolean): void {
  const now = Date.now()
  if (now - lastOcrTimingLogAt < 10_000) {
    return
  }
  lastOcrTimingLogAt = now
  log('INFO', '[ocr] capture=' + captureMs + 'ms ocr=' + ocrMs + 'ms cached=' + cached)
}

function fingerprintImages(images: Array<{ width: number; height: number; data: Uint8Array }>): string {
  const hash = createHash('sha1')
  for (const image of images) {
    hash.update(image.width + 'x' + image.height + ':')
    const step = Math.max(1, Math.floor(image.data.length / 2048))
    for (let index = 0; index < image.data.length; index += step) {
      hash.update(String(image.data[index]) + ',')
    }
  }
  return hash.digest('hex')
}

/**
 * OCR 调试留档：识别到文字就把整屏 + 三个裁切图 + 结果写盘。
 *
 * 玩家在游戏里没法自己截图，所以让程序在"识别到东西"的那一刻自动存一份，
 * 之后拿这些图校准区域或复现问题。最多留 40 组，每组间隔至少 3 秒。
 */
const OCR_CAPTURE_DIR = isDev
  ? join(app.getAppPath(), 'ocr-captures')
  : join(app.getPath('userData'), 'ocr-captures')
const OCR_CAPTURE_LIMIT = 60
const OCR_CAPTURE_MIN_GAP_MS = 3000
/** 什么都没识别到时也偶尔留一张，方便排查"为什么没认出来"。 */
const OCR_MISS_CAPTURE_GAP_MS = 60_000
let lastOcrCaptureAt = 0
let lastOcrMissCaptureAt = 0

function saveOcrCapture(
  capture: Awaited<ReturnType<typeof captureAugmentTitleImages>>,
  outcome: { texts: string[]; textsBySlot?: string[][]; elapsedMs: number; cached?: boolean },
  options: { force?: boolean } = {}
): void {
  const now = Date.now()
  if (!options.force && now - lastOcrCaptureAt < OCR_CAPTURE_MIN_GAP_MS) {
    return
  }
  lastOcrCaptureAt = now
  try {
    fs.mkdirSync(OCR_CAPTURE_DIR, { recursive: true })
    const stamp = new Date(now).toISOString().replace(/[:.]/g, '-')
    fs.writeFileSync(join(OCR_CAPTURE_DIR, stamp + '-full.png'), capture.encodeFullFramePng())
    capture.encodeSlotPngs().forEach((png, index) => {
      fs.writeFileSync(join(OCR_CAPTURE_DIR, stamp + '-slot' + (index + 1) + '.png'), png)
    })
    fs.writeFileSync(
      join(OCR_CAPTURE_DIR, stamp + '.json'),
      JSON.stringify(
        {
          at: new Date(now).toISOString(),
          screen: [capture.screenWidth, capture.screenHeight],
          texts: outcome.texts,
          textsBySlot: outcome.textsBySlot ?? [],
          elapsedMs: outcome.elapsedMs,
          cached: outcome.cached === true
        },
        null,
        2
      )
    )
    pruneOcrCaptures()
    log('INFO', 'hextech ocr capture saved: ' + stamp + ' texts=' + outcome.texts.join('/'))
  } catch (error) {
    log('WARN', 'hextech ocr capture failed: ' + String(error))
  }
}

/** 只留最近 N 组（按文件修改时间）。 */
function pruneOcrCaptures(): void {
  try {
    const files = fs
      .readdirSync(OCR_CAPTURE_DIR)
      .map((name) => ({ name, at: fs.statSync(join(OCR_CAPTURE_DIR, name)).mtimeMs }))
      .sort((left, right) => right.at - left.at)
    const stamps = new Set<string>()
    for (const file of files) {
      const stamp = file.name.replace(/-(full|slot\d)\.png$/, '').replace(/\.json$/, '')
      stamps.add(stamp)
    }
    const ordered = [...stamps]
    for (const stale of ordered.slice(OCR_CAPTURE_LIMIT)) {
      for (const file of files.filter((entry) => entry.name.startsWith(stale))) {
        fs.rmSync(join(OCR_CAPTURE_DIR, file.name), { force: true })
      }
    }
  } catch (error) {
    log('WARN', 'hextech ocr capture prune failed: ' + String(error))
  }
}

/**
 * 抓屏源信息：渲染进程拿它开一条常驻抓屏流。
 *
 * 为什么不在主进程里每次抓：`desktopCapturer.getSources` 每调一次都要重开一次
 * 桌面抓屏会话，实测 450ms 上下（降到 2/3 分辨率也一样，说明贵在会话本身）。
 * 常驻流之后每帧只要 drawImage 一小块，几毫秒。
 */
ipcMain.handle('hextech-capture:source', async () => {
  try {
    const display = screen.getPrimaryDisplay()
    const scaleFactor = display.scaleFactor || 1
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } })
    const source = sources[0]
    if (!source) {
      return null
    }
    return {
      id: source.id,
      screenWidth: Math.round(display.size.width * scaleFactor),
      screenHeight: Math.round(display.size.height * scaleFactor)
    }
  } catch (error) {
    log('WARN', 'hextech capture source failed: ' + String(error))
    return null
  }
})

/**
 * 识别渲染进程裁好的三块标题区域（常驻抓屏流的快路径）。
 *
 * 调试留档仍然走整屏抓图，但那是"要落盘才做"，而且是后台补的，不挡面板显示。
 */
ipcMain.handle('hextech-ocr:crops', async (_event, payload: unknown) => {
  try {
    const parsed = payload as { crops?: Array<{ width: number; height: number; data: Uint8Array }>; screenWidth?: number; screenHeight?: number }
    const crops = Array.isArray(parsed?.crops) ? parsed.crops : []
    if (crops.length === 0) {
      return { available: false, texts: [], textsBySlot: [], message: '没有裁切图', elapsedMs: 0 }
    }
    const images = crops.map((crop) => ({
      width: crop.width,
      height: crop.height,
      data: crop.data instanceof Uint8Array ? crop.data : new Uint8Array(crop.data as ArrayBufferLike)
    }))
    const fingerprint = fingerprintImages(images)
    const now = Date.now()
    if (augmentOcrCache && augmentOcrCache.fingerprint === fingerprint && now - augmentOcrCache.at < AUGMENT_OCR_CACHE_MS) {
      return {
        ...augmentOcrCache.outcome,
        cached: true,
        timing: { captureMs: 0, ocrMs: 0, cached: true },
        screenWidth: parsed.screenWidth ?? 0,
        screenHeight: parsed.screenHeight ?? 0
      }
    }
    const ocrStartedAt = Date.now()
    const outcome = await recognizeAugmentTitles(images)
    const ocrMs = Date.now() - ocrStartedAt
    augmentOcrCache = { fingerprint, at: now, outcome }
    logOcrTiming(0, ocrMs, false)
    // 留档不再每轮都做：整屏抓图要 450ms + 2.5MB 一张，而屏幕上随便一点文字都会
    // 触发。真正有意思的那一张由渲染进程在「门控打开」时调 proof 抓。
    return {
      ...outcome,
      cached: false,
      timing: { captureMs: 0, ocrMs, cached: false },
      screenWidth: parsed.screenWidth ?? 0,
      screenHeight: parsed.screenHeight ?? 0
    }
  } catch (error) {
    log('WARN', 'hextech ocr (crops) failed: ' + String(error))
    return { available: false, texts: [], textsBySlot: [], message: String(error), elapsedMs: 0 }
  }
})

ipcMain.handle('hextech-ocr:recognize', async () => {
  try {
    const captureStartedAt = Date.now()
    const capture = await captureAugmentTitleImages()
    const captureMs = Date.now() - captureStartedAt
    const fingerprint = fingerprintImages(capture.images)
    const now = Date.now()
    if (augmentOcrCache && augmentOcrCache.fingerprint === fingerprint && now - augmentOcrCache.at < AUGMENT_OCR_CACHE_MS) {
      logOcrTiming(captureMs, 0, true)
      return {
        ...augmentOcrCache.outcome,
        cached: true,
        timing: { captureMs, ocrMs: 0, cached: true },
        screenWidth: capture.screenWidth,
        screenHeight: capture.screenHeight
      }
    }
    const ocrStartedAt = Date.now()
    const outcome = await recognizeAugmentTitles(capture.images)
    const ocrMs = Date.now() - ocrStartedAt
    logOcrTiming(captureMs, ocrMs, false)
    augmentOcrCache = { fingerprint, at: now, outcome }
    if (outcome.texts.length > 0) {
      saveOcrCapture(capture, { ...outcome, cached: false })
    } else if (now - lastOcrMissCaptureAt >= OCR_MISS_CAPTURE_GAP_MS) {
      lastOcrMissCaptureAt = now
      saveOcrCapture(capture, { ...outcome, cached: false }, { force: true })
    }
    return {
      ...outcome,
      cached: false,
      timing: { captureMs, ocrMs, cached: false },
      screenWidth: capture.screenWidth,
      screenHeight: capture.screenHeight
    }
  } catch (error) {
    log('WARN', 'hextech ocr failed: ' + String(error))
    return { available: false, texts: [], textsBySlot: [], message: String(error), elapsedMs: 0 }
  }
})

/**
 * 贴片亮起来之后补一张整屏截图。
 *
 * 走的是系统级抓屏，所以"这张图里有没有我们的面板"就是铁证：
 * 有 -> 窗口画上去了，玩家看不到只能是别的原因；没有 -> 窗口根本没出帧。
 */
ipcMain.handle('hextech-ocr:proof', async () => {
  try {
    const capture = await captureAugmentTitleImages()
    fs.mkdirSync(OCR_CAPTURE_DIR, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-') + '-proof'
    fs.writeFileSync(join(OCR_CAPTURE_DIR, stamp + '.png'), capture.encodeFullFramePng())
    const strip = hextechOverlayWindow('in-game')
    log(
      'INFO',
      '[proof] ' + stamp + ' strip=' + JSON.stringify({
        visible: strip?.isVisible() ?? null,
        alwaysOnTop: strip?.isAlwaysOnTop() ?? null,
        bounds: strip?.getBounds() ?? null
      })
    )
    return true
  } catch (error) {
    log('WARN', 'hextech proof capture failed: ' + String(error))
    return false
  }
})

ipcMain.handle('hextech-overlay:close', (_event, mode: unknown) => {
  if (mode === undefined) {
    closeHextechOverlay()
    return false
  }
  return closeHextechOverlayMode(asOverlayMode(mode))
})

// 悬浮窗按游戏阶段切换形态：选人时助手窗口，局内换成贴片
ipcMain.handle('hextech-overlay:setMode', (_event, mode: unknown) => {
  applyHextechOverlayMode(asOverlayMode(mode), hextechOverlayOptions())
  return true
})

ipcMain.handle('window:close', (event) => {
  getIpcSenderWindow(event)?.close()
})

ipcMain.handle('opgg:openWindow', (_event, query?: OpggChampionQuery) => {
  return openOpggWindow(query)
})

ipcMain.handle('shell:openExternal', async (_, url: string) => {
  try {
    if (!url || !url.startsWith('http')) {
      throw new Error('Invalid URL')
    }

    await shell.openExternal(url, { activate: true })
    return { success: true }
  } catch (error) {
    console.error('Failed to open external link:', error)
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('app:getVersion', () => app.getVersion())

ipcMain.handle('app:checkUpdate', async () => {
  try {
    const { checkForUpdate } = await import('./updateChecker')
    return await checkForUpdate()
  } catch {
    return null
  }
})

ipcMain.handle('app:downloadUpdate', async (event, url: string) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const dest = join(app.getPath('temp'), 'RankPeek-Setup.exe')

  return new Promise<string>((resolve, reject) => {
    const mod: any = url.startsWith('https') ? https : http
    mod.get(url, (res: any) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }

      const total = parseInt(res.headers['content-length'] || '0', 10)
      let downloaded = 0
      const file = fs.createWriteStream(dest)

      res.on('data', (chunk: Buffer) => {
        downloaded += chunk.length
        file.write(chunk)
        if (total > 0 && win) {
          win.webContents.send('app:downloadProgress', {
            downloaded, total, percent: Math.round(downloaded / total * 100)
          })
        }
      })

      res.on('end', () => {
        file.end()
        resolve(dest)
      })

      res.on('error', reject)
    }).on('error', reject)
  })
})

ipcMain.handle('app:installUpdate', async (_, filePath: string) => {
  const installDir = join(app.getPath('exe'), '..')
  const newExe = join(installDir, 'RankPeek.exe')

  // 用批处理：等待安装完成 → 启动新版
  const batPath = join(app.getPath('temp'), 'rp-update.bat')
  const batContent = `@echo off\r\n"${filePath}" /S /D="${installDir}"\r\nstart "" "${newExe}"\r\ndel "%~f0"\r\n`
  fs.writeFileSync(batPath, batContent)

  spawn('cmd', ['/c', batPath], { detached: true, stdio: 'ignore' }).unref()
  app.quit()
})

ipcMain.handle('app:getLogs', () => {
  const result: Record<string, string> = {}

  try {
    const frontendLogFile = join(app.getPath('logs'), 'rankpeek.log')
    if (fs.existsSync(frontendLogFile)) {
      const content = fs.readFileSync(frontendLogFile, 'utf-8')
      const maxBytes = 512 * 1024
      result.frontendLog = content.length > maxBytes
        ? content.slice(content.length - maxBytes)
        : content
    }
  } catch {
    result.frontendLog = ''
  }

  try {
    const backendLogFile = join(process.resourcesPath, '..', 'logs', 'rankpeek.log')
    if (fs.existsSync(backendLogFile)) {
      const content = fs.readFileSync(backendLogFile, 'utf-8')
      const maxBytes = 512 * 1024
      result.backendLog = content.length > maxBytes
        ? content.slice(content.length - maxBytes)
        : content
    }
  } catch {
    result.backendLog = ''
  }

  return result
})

ipcMain.handle('app:clearChromiumCache', async () => {
  try {
    return {
      success: true,
      data: await clearElectronCacheArtifacts()
    }
  } catch (error) {
    return {
      success: false,
      error: String(error)
    }
  }
})

app.whenReady().then(async () => {
  try {
    initLocalDatabase({
      userDataPath: app.getPath('userData'),
      logger: databaseLogger,
      runSmokeTest: process.env.RANKPEEK_DB_SMOKE_TEST === '1'
    })
    registerDatabaseIpcHandlers(ipcMain, getLocalDatabase, databaseLogger, {
      exportAiMemory: saveAiMemoryExport,
      onStorageMutation: scheduleLocalStorageRetention
    })
    createSplashWindow()
    createTray()
    await startBackend()
    startLcuAuthPusher()
    createWindow()
    // 侧栏贴靠要用的客户端窗口位置（顺带验证 koffi 这条读窗口的路通不通）
    log(
      'INFO',
      '[dock] koffi=' + leagueWindowDiagnostics() + ' client=' + JSON.stringify(findLeagueClientBounds())
    )
    startHextechGameWatcher({
      backendBaseUrl: 'http://127.0.0.1:8080',
      // 进对局：开关打开就起贴片窗口（跟窗口开没开、页面在不在海斗页都无关）
      onInGame: () => {
        log('INFO', 'hextech: entered game, autoOpen=' + hextechOverlayAutoOpen)
        if (hextechOverlayAutoOpen) {
          openHextechOverlay(hextechOverlayOptions(), 'in-game')
        }
      },
      // 出对局：收掉贴片
      onLeaveGame: () => {
        log('INFO', 'hextech: left game, hiding strip')
        hextechOverlayWindow('in-game')?.hide()
      },
      // 进选人：开关打开就把侧栏弹出来（不抢客户端焦点）
      onChampSelect: () => {
        log('INFO', 'hextech: entered champ select, autoOpen=' + hextechOverlayAutoOpen)
        if (hextechOverlayAutoOpen) {
          openHextechOverlayInactive(hextechOverlayOptions(), 'champ-select')
        }
      }
    })
  } catch (error) {
    log('ERROR', `Failed to start application: ${String(error)}`)
    console.error('Failed to start application:', error)
    closeSplashWindow()
    closeLocalDatabase()
    await stopBackend()
    app.quit()
  }

  app.on('activate', () => {
    showMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (isQuitting && process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', (event) => {
  isQuitting = true
  clearStartupTimers()
  stopLcuAuthPusher()
  closeSplashWindow()
  appTray?.destroy()
  appTray = null
  closeLocalDatabase()

  if (!isDev && backendProcess && !backendShutdownCompleted) {
    event.preventDefault()
    if (backendShutdownInProgress) {
      return
    }

    backendShutdownInProgress = true
    void stopBackend().finally(() => {
      backendShutdownCompleted = true
      backendShutdownInProgress = false
      app.quit()
    })
  }
})

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
})
