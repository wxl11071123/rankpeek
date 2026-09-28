/**
 * 找英雄联盟客户端窗口的位置。
 *
 * 侧栏要像 WeGame 那样贴在客户端旁边，所以得知道客户端现在在哪。
 * 客户端主窗口的类名是 RCLIENT（游戏内那个是 RiotWindowClass），
 * 这里用 user32 枚举顶层窗口，挑可见、没最小化、尺寸正常的那个。
 *
 * 注意：koffi 的 out 结构体必须先 koffi.struct 定义好，回调也要用 koffi.proto 声明类型，
 * 否则 user32.func() 直接抛错（之前就是这么静默失败的）。
 */

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface LeagueWindowScan {
  /** 扫过的顶层窗口总数 */
  scanned: number
  /** 类名是 RCLIENT / RiotWindowClass 的窗口数 */
  clientWindows: number
  visible: number
  minimized: number
  /** 可见、没最小化、尺寸正常的（能用来贴的） */
  usable: number
}

let koffi: any = null
let enumWindows: any = null
let getWindowRect: any = null
let isWindowVisible: any = null
let isIconic: any = null
let getClassNameW: any = null
let enumProcType: any = null
let _initialized = false
let _initError: string | null = null

function ensureInitialized(): boolean {
  if (_initialized) {
    return enumWindows !== null
  }
  _initialized = true
  try {
    koffi = require('koffi')
    const user32 = koffi.load('user32.dll')
    const RECT = koffi.struct('RECT', {
      left: 'int32',
      top: 'int32',
      right: 'int32',
      bottom: 'int32'
    })
    enumProcType = koffi.proto('bool __stdcall EnumWindowsProc(void *hwnd, intptr_t lParam)')
    enumWindows = user32.func('bool __stdcall EnumWindows(EnumWindowsProc *cb, intptr_t lParam)')
    getWindowRect = user32.func('bool __stdcall GetWindowRect(void *hwnd, _Out_ RECT *rect)')
    isWindowVisible = user32.func('bool __stdcall IsWindowVisible(void *hwnd)')
    isIconic = user32.func('bool __stdcall IsIconic(void *hwnd)')
    getClassNameW = user32.func('int __stdcall GetClassNameW(void *hwnd, _Out_ uint16_t *buf, int max)')
  } catch (error) {
    _initError = String(error)
    enumWindows = null
  }
  return enumWindows !== null
}

/** 扫一遍顶层窗口：既拿可用的客户端窗口，也拿统计（排查"为什么没贴上"用）。 */
function scan(): { bounds: WindowBounds | null; stats: LeagueWindowScan } {
  const stats: LeagueWindowScan = { scanned: 0, clientWindows: 0, visible: 0, minimized: 0, usable: 0 }
  if (process.platform !== 'win32' || !ensureInitialized()) {
    return { bounds: null, stats }
  }

  const found: WindowBounds[] = []
  const callback = koffi.register((hwnd: unknown) => {
    stats.scanned += 1
    try {
      const classBuffer = Buffer.alloc(512)
      const length = getClassNameW(hwnd, classBuffer, 256)
      const className = classBuffer.toString('utf16le', 0, Math.max(0, length) * 2)
      if (className !== 'RCLIENT' && className !== 'RiotWindowClass') {
        return true
      }
      stats.clientWindows += 1
      if (!isWindowVisible(hwnd)) {
        return true
      }
      stats.visible += 1
      if (isIconic(hwnd)) {
        stats.minimized += 1
        return true
      }
      const rect: { left: number; top: number; right: number; bottom: number } = {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0
      }
      if (!getWindowRect(hwnd, rect)) {
        return true
      }
      const width = rect.right - rect.left
      const height = rect.bottom - rect.top
      if (width < 400 || height < 300) {
        return true
      }
      stats.usable += 1
      found.push({ x: rect.left, y: rect.top, width, height })
    } catch {
      // 单个窗口读失败不影响其它
    }
    return true
  }, koffi.pointer(enumProcType))

  try {
    enumWindows(callback, 0)
  } catch {
    return { bounds: null, stats }
  } finally {
    koffi.unregister(callback)
  }

  const bounds = found.length > 0
    ? found.sort((left, right) => right.width * right.height - left.width * left.height)[0]
    : null
  return { bounds, stats }
}

/** 客户端窗口的位置；找不到（没开客户端/最小化/读不到）时返回 null。 */
export function findLeagueClientBounds(): WindowBounds | null {
  return scan().bounds
}

/** 一行诊断：koffi 能不能用 + 这一轮扫到了什么。 */
export function leagueWindowDiagnostics(): string {
  ensureInitialized()
  const { stats } = scan()
  return (_initError ? 'init-error=' + _initError + ' ' : 'ok ') + JSON.stringify(stats)
}

/**
 * 贴靠位置：优先贴客户端左边，左边放不下就贴右边，最后夹进工作区。
 * 纯函数，方便单测（窗口查找那部分没法在 CI 里跑）。
 */
export function computeDockBounds(
  client: WindowBounds,
  workArea: WindowBounds,
  width: number,
  gap = 0
): WindowBounds {
  const dockWidth = Math.max(1, Math.round(width))
  const height = Math.round(Math.min(client.height, workArea.height))
  let x = Math.round(client.x - dockWidth - gap)
  if (x < workArea.x) {
    x = Math.round(Math.min(client.x + client.width + gap, workArea.x + workArea.width - dockWidth))
  }
  const y = Math.round(Math.max(workArea.y, Math.min(client.y, workArea.y + workArea.height - height)))
  return { x, y, width: dockWidth, height }
}
