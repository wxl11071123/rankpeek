import { BrowserWindow, screen, type Rectangle } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { computeDockBounds, findLeagueClientBounds } from './leagueWindow'

/**
 * 海斗助手窗口：两种形态，各自一个窗口。
 *
 * - **选人助手**（champ-select）：**跟 OP.GG 窗口一样的普通窗口** ——
 *   `frame: false` + `transparent: false` + `thickFrame: true`，所以有原生的
 *   边框拖拽调整大小；位置和大小记在 `hextech-overlay-bounds.json` 里，
 *   下次打开还在原地。不置顶（选人时玩家要看客户端）。
 * - **局内贴片**（in-game）：透明置顶的窄窗口，三块面板贴在三张强化卡正上方，
 *   尺寸固定（要对齐卡片），不参与拖拽调整。
 *
 * 注意（Windows）：LOL 若运行在「全屏」独占模式，置顶窗口可能被盖住；
 * 建议玩家在游戏设置里使用「无边框窗口」模式。
 */
export const HEXTECH_OVERLAY_HASH = '/overlay'

export type HextechOverlayMode = 'champ-select' | 'in-game'

const ASSISTANT_WIDTH = 580
const ASSISTANT_HEIGHT = 480
const ASSISTANT_MIN_WIDTH = 240
const ASSISTANT_MIN_HEIGHT = 260
/** 贴客户端旁边的默认宽度（WeGame 侧栏那种窄条，用户说这个宽度最合适）。 */
const DOCK_WIDTH = 265
/** 贴边时和客户端留的缝。 */
const DOCK_GAP = 0
const OVERLAY_MARGIN = 24
const WINDOW_BOUNDS_FILE = 'hextech-overlay-bounds.json'

/**
 * 局内三块数据面板的位置（相对主显示器）。
 *
 * 三张强化卡横向覆盖 x≈0.227~0.768、卡片顶边在 y≈0.167；
 * 面板放在 y≈0.026~0.164（压在卡片上方、不遮卡片本身），
 * 三块面板的中线分别对齐三张卡的中线（0.311 / 0.503 / 0.690）。
 */
const IN_GAME_STRIP = { x: 0.227, y: 0.026, width: 0.546, height: 0.138 }

export interface HextechOverlayOptions {
  isDev: boolean
  devUrl: string
  rendererFile: string
  preloadPath: string
  iconPath?: string
  /** 窗口大小记忆文件（跟 OP.GG 一样存在 userData 下）。 */
  boundsFile?: string
}

let assistantWindow: BrowserWindow | null = null
let inGameWindow: BrowserWindow | null = null
/** 局内贴片弹出前，助手窗口是不是开着的（打完一局再放回来）。 */
let assistantWasVisible = false
/** 贴片置顶保持器：游戏窗口自己也可能是 topmost，被顶下去就再也上不来。 */
let topmostKeeper: ReturnType<typeof setInterval> | null = null
/** 侧栏贴靠：跟着客户端走，客户端一动就重新贴。 */
let dockFollower: ReturnType<typeof setInterval> | null = null
let lastDockTarget = ''
/** 用户拉过宽度就记住（位置仍然跟着客户端）。 */
let preferredDockWidth: number | null = null
/** 用户自己挪过位置就不再贴了（直到下次打开）。 */
let userDetachedAssistant = false
/** 正在执行贴靠 setBounds：这期间触发的 move/resize 不算用户操作。 */
let applyingDockBounds = false

/**
 * 每秒把贴片重新顶到最前。
 *
 * 只调用一次 setAlwaysOnTop 是不够的：LOL 切进对局后会激活自己的窗口，
 * 如果它也是 topmost，Z 序就轮到它在上面，贴片明明"显示着"却看不见。
 * 代价只是每秒一次 SetWindowPos，不抢焦点（moveTop 不激活窗口）。
 */
function startTopmostKeeper(): void {
  if (topmostKeeper) {
    return
  }
  topmostKeeper = setInterval(() => {
    const strip = hextechOverlayWindow('in-game')
    if (!strip || !strip.isVisible()) {
      return
    }
    strip.setAlwaysOnTop(true, 'screen-saver')
    strip.moveTop()
  }, 1000)
}

function stopTopmostKeeper(): void {
  if (topmostKeeper) {
    clearInterval(topmostKeeper)
    topmostKeeper = null
  }
}

/**
 * 把选人侧栏贴到客户端旁边（WeGame 那种窄条）。
 *
 * 客户端在左边就贴左边、没地方就贴右边；高度跟客户端对齐，宽度用记忆值或默认窄条。
 * 只在目标位置变了才 setBounds —— 否则用户手动拉过的大小每秒都会被抢回去。
 */
export function dockAssistantWindow(): void {
  const assistant = hextechOverlayWindow('champ-select')
  if (!assistant || assistant.isDestroyed() || userDetachedAssistant) {
    return
  }
  const client = findLeagueClientBounds()
  if (!client) {
    return
  }
  const workArea = screen.getPrimaryDisplay().workArea
  // 用户自己拉过的宽度优先（不再夹到 DOCK_MAX_WIDTH，免得跟他抢）
  const width = Math.round(
    Math.min(Math.max(preferredDockWidth ?? DOCK_WIDTH, ASSISTANT_MIN_WIDTH), workArea.width)
  )
  const target = computeDockBounds(client, workArea, width, DOCK_GAP)
  const key = [target.x, target.y, target.width, target.height].join(',')
  if (key === lastDockTarget) {
    return
  }
  lastDockTarget = key
  applyingDockBounds = true
  assistant.setBounds(target)
  // setBounds 触发的 move/resize 是异步派发的，过一拍再解除标记
  setTimeout(() => {
    applyingDockBounds = false
  }, 400)
}

function startDockFollower(): void {
  if (dockFollower) {
    return
  }
  dockFollower = setInterval(() => {
    const assistant = hextechOverlayWindow('champ-select')
    if (!assistant || !assistant.isVisible()) {
      return
    }
    dockAssistantWindow()
  }, 1000)
}

function stopDockFollower(): void {
  if (dockFollower) {
    clearInterval(dockFollower)
    dockFollower = null
  }
}

export function hextechOverlayWindow(mode: HextechOverlayMode = 'champ-select'): BrowserWindow | null {
  const target = mode === 'in-game' ? inGameWindow : assistantWindow
  return target && !target.isDestroyed() ? target : null
}

/** 任意一个形态**显示着**，就算悬浮窗开着（窗口建过但藏起来不算）。 */
export function isHextechOverlayOpen(): boolean {
  return Boolean(hextechOverlayWindow('champ-select')?.isVisible() || isInGameOverlayOpen())
}

export function isInGameOverlayOpen(): boolean {
  return Boolean(hextechOverlayWindow('in-game')?.isVisible())
}

/**
 * 局内贴片有没有内容。
 *
 * 没识别到强化时整块透明 + 鼠标穿透，玩家点不到、也看不见；
 * 识别到三选一之后再变成可交互，选完卡片再收回去 —— 跟参考项目的行为一致。
 */
export function setInGameStripActive(active: boolean): void {
  const strip = hextechOverlayWindow('in-game')
  if (!strip) {
    return
  }
  strip.setIgnoreMouseEvents(!active, { forward: true })
  // 贴片平时是「显示但全透明」，这样渲染进程不会被后台节流、OCR 才跑得动
  if (!strip.isVisible()) {
    strip.showInactive()
  }
  if (active) {
    // 卡片出来的这一瞬间就把贴片顶上去，别等保持器的下一拍
    strip.setAlwaysOnTop(true, 'screen-saver')
    strip.moveTop()
    startTopmostKeeper()
    return
  }
  // 没内容时别一直抢 Z 序：独占全屏的游戏被反复顶下去会闪
  stopTopmostKeeper()
}

/** 关掉当前显示的形态（助手窗口的 × 用它）。 */
export function closeHextechOverlay(): void {
  const target = hextechOverlayWindow('champ-select') ?? hextechOverlayWindow('in-game')
  target?.close()
  assistantWindow = null
  inGameWindow = null
}

function loadBounds(file?: string): Rectangle | null {
  if (!file) {
    return null
  }
  try {
    if (!existsSync(file)) {
      return null
    }
    const parsed = JSON.parse(readFileSync(file, 'utf-8'))
    const bounds = parsed?.bounds ?? parsed
    if (!bounds || !['x', 'y', 'width', 'height'].every((key) => typeof bounds[key] === 'number')) {
      return null
    }
    return {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.max(ASSISTANT_MIN_WIDTH, Math.round(bounds.width)),
      height: Math.max(ASSISTANT_MIN_HEIGHT, Math.round(bounds.height))
    }
  } catch {
    return null
  }
}

function saveBounds(file: string | undefined, bounds: Rectangle): void {
  if (!file) {
    return
  }
  try {
    writeFileSync(file, JSON.stringify({ bounds }))
  } catch {
    // 记不住就算了，不影响这次会话
  }
}

function defaultAssistantBounds(): Rectangle {
  const { workArea } = screen.getPrimaryDisplay()
  return {
    x: Math.round(workArea.x + workArea.width - ASSISTANT_WIDTH - OVERLAY_MARGIN),
    y: Math.round(workArea.y + 96),
    width: ASSISTANT_WIDTH,
    height: ASSISTANT_HEIGHT
  }
}

function loadOverlayPage(target: BrowserWindow, options: HextechOverlayOptions, mode: HextechOverlayMode): void {
  const hash = `#${HEXTECH_OVERLAY_HASH}?mode=${mode}`
  if (options.isDev) {
    void target.loadURL(options.devUrl + '/' + hash)
  } else {
    void target.loadFile(options.rendererFile, { hash: `${HEXTECH_OVERLAY_HASH}?mode=${mode}` })
  }
}

/** 选人助手：普通窗口，原生边框调整大小 + 记住位置（跟 OP.GG 窗口一致）。 */
function createAssistantWindow(options: HextechOverlayOptions): BrowserWindow {
  const existing = hextechOverlayWindow('champ-select')
  if (existing) {
    return existing
  }
  const stored = loadBounds(options.boundsFile)
  const bounds = stored ?? defaultAssistantBounds()
  // 用户拉过的宽度优先沿用（位置还是贴客户端）
  if (stored) {
    preferredDockWidth = stored.width
  }
  const created = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: ASSISTANT_MIN_WIDTH,
    minHeight: ASSISTANT_MIN_HEIGHT,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: '#0f1218',
    hasShadow: true,
    resizable: true,
    movable: true,
    skipTaskbar: false,
    alwaysOnTop: false,
    fullscreenable: false,
    titleBarStyle: 'hidden',
    thickFrame: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: options.preloadPath,
      webSecurity: true,
      spellcheck: false
    },
    icon: options.iconPath,
    title: 'RankPeek 海斗助手'
  })

  created.removeMenu()
  created.setAlwaysOnTop(false)
  created.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  created.on('closed', () => {
    stopDockFollower()
    if (assistantWindow === created) {
      assistantWindow = null
    }
  })
  created.on('hide', () => {
    stopDockFollower()
  })
  // 玩家自己拖过/拉过之后，下次打开沿用（跟 OP.GG 窗口一样）
  const remember = () => {
    if (!created.isDestroyed()) {
      saveBounds(options.boundsFile, created.getBounds())
    }
  }
  created.on('resize', () => {
    // 拉宽度：记住宽度，位置继续跟着客户端（不算"挪位置"）
    if (!applyingDockBounds && !created.isDestroyed()) {
      preferredDockWidth = created.getBounds().width
    }
    remember()
  })
  // 玩家自己挪了位置：这次会话就不再贴了，别跟他抢
  created.on('move', () => {
    if (applyingDockBounds) {
      return
    }
    userDetachedAssistant = true
    stopDockFollower()
  })
  created.on('move', remember)
  created.once('ready-to-show', () => {
    created.show()
  })
  loadOverlayPage(created, options, 'champ-select')
  assistantWindow = created
  return created
}

/** 局内贴片：透明置顶、尺寸固定，对齐三张强化卡。 */
function createInGameWindow(options: HextechOverlayOptions): BrowserWindow {
  const existing = hextechOverlayWindow('in-game')
  if (existing) {
    return existing
  }
  const { size } = screen.getPrimaryDisplay()
  const created = new BrowserWindow({
    width: Math.round(size.width * IN_GAME_STRIP.width),
    height: Math.round(size.height * IN_GAME_STRIP.height),
    x: Math.round(size.width * IN_GAME_STRIP.x),
    y: Math.round(size.height * IN_GAME_STRIP.y),
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: options.preloadPath,
      webSecurity: true,
      spellcheck: false,
      // 被游戏窗口盖住时也别把定时器降频，否则 OCR 轮询会卡成 1 分钟一次
      backgroundThrottling: false
    },
    icon: options.iconPath,
    title: 'RankPeek 海斗贴片'
  })

  created.setAlwaysOnTop(true, 'screen-saver')
  created.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  created.removeMenu()
  created.on('closed', () => {
    stopTopmostKeeper()
    if (inGameWindow === created) {
      inGameWindow = null
    }
  })
  created.on('hide', () => {
    stopTopmostKeeper()
  })
  // 平时是「隐形 + 鼠标穿透」状态，识别到强化卡再亮起来
  created.setIgnoreMouseEvents(true, { forward: true })
  const ensureVisible = () => {
    if (!created.isDestroyed() && !created.isVisible()) {
      created.showInactive()
    }
  }
  // 只靠 ready-to-show 不够稳（透明窗口首帧可能迟迟不来），加载完再兜一次
  created.once('ready-to-show', ensureVisible)
  created.webContents.once('did-finish-load', ensureVisible)
  created.once('show', ensureVisible)
  loadOverlayPage(created, options, 'in-game')
  inGameWindow = created
  return created
}

/**
 * 切换形态：局内只留贴片（助手窗口先收起来），回到选人再把助手放回来。
 */
export function applyHextechOverlayMode(mode: HextechOverlayMode, options?: HextechOverlayOptions): void {
  if (mode === 'in-game') {
    const assistant = hextechOverlayWindow('champ-select')
    if (assistant?.isVisible()) {
      assistantWasVisible = true
      assistant.hide()
    }
    if (options) {
      const strip = createInGameWindow(options)
      strip.showInactive()
    } else {
      hextechOverlayWindow('in-game')?.showInactive()
    }
    return
  }

  hextechOverlayWindow('in-game')?.hide()
  const assistant = options ? createAssistantWindow(options) : hextechOverlayWindow('champ-select')
  if (assistant && (assistantWasVisible || !assistant.isVisible())) {
    assistant.show()
    assistantWasVisible = false
  }
}

/** 打开某个形态（幂等）：两种形态互斥，打开一个就把另一个收起来。 */
export function openHextechOverlay(options: HextechOverlayOptions, mode: HextechOverlayMode): void {
  if (mode === 'in-game') {
    const assistant = hextechOverlayWindow('champ-select')
    if (assistant?.isVisible()) {
      assistantWasVisible = true
      assistant.hide()
    }
    createInGameWindow(options).showInactive()
    return
  }
  hextechOverlayWindow('in-game')?.hide()
  const assistant = createAssistantWindow(options)
  if (assistant.isMinimized()) {
    assistant.restore()
  }
  userDetachedAssistant = false
  lastDockTarget = ''
  dockAssistantWindow()
  startDockFollower()
  assistant.show()
  assistant.focus()
}

/**
 * 打开某个形态，但**不抢焦点**。
 *
 * 选人阶段自动弹出走这里：参考项目 ARAMGG 弹「英雄详情」也是
 * showInactive + moveTop —— 玩家这时候正在 ban/pick，焦点被抢走是要出事的。
 */
export function openHextechOverlayInactive(options: HextechOverlayOptions, mode: HextechOverlayMode): void {
  if (mode === 'in-game') {
    openHextechOverlay(options, mode)
    return
  }
  hextechOverlayWindow('in-game')?.hide()
  const assistant = createAssistantWindow(options)
  if (assistant.isMinimized()) {
    assistant.restore()
  }
  assistant.showInactive()
  // 每次打开都重新贴一次；玩家这次会话里挪过就不再贴
  userDetachedAssistant = false
  lastDockTarget = ''
  dockAssistantWindow()
  startDockFollower()
  assistant.moveTop()
}

/** 关掉某个形态；返回关掉之后还有没有开着的。 */
export function closeHextechOverlayMode(mode: HextechOverlayMode): boolean {
  hextechOverlayWindow(mode)?.close()
  return isHextechOverlayOpen()
}

/** 开关某个形态，返回切换后的状态。 */
export function toggleHextechOverlay(options: HextechOverlayOptions, mode: HextechOverlayMode): boolean {
  const target = hextechOverlayWindow(mode)
  if (target?.isVisible()) {
    target.close()
    return false
  }
  openHextechOverlay(options, mode)
  return true
}
