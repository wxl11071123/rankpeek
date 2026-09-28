/**
 * 「海斗对局中自动弹出」的开关偏好与阶段判断。
 *
 * 真正的自动弹出由主进程负责（hextechGameWatcher）：它自己盯 LCU 阶段、
 * 自己起贴片窗口，不依赖窗口开没开。渲染进程这边只负责：
 *   1. 记住玩家的开关偏好（localStorage，主进程那份 json 是镜像）
 *   2. 判断某个阶段算不算「在打海斗」（海斗页的手动按钮要用）
 */

/** 局内阶段：只有这些阶段才需要「自动弹出」。 */
const IN_GAME_PHASES = ['InProgress', 'GameStart', 'Reconnect']

/** 这个阶段算不算「在打海斗」。 */
export function isInGamePhase(phase: string | null | undefined): boolean {
  return IN_GAME_PHASES.includes(String(phase ?? ''))
}

export interface HextechOverlaySettings {
  open: boolean
  /** 局内贴片是不是已经显示着。 */
  inGameOpen: boolean
  autoOpen: boolean
}

const AUTO_OPEN_KEY = 'rankpeek.hextech.overlayAutoOpen'

export function readAutoOpenPreference(): boolean {
  try {
    return window.localStorage.getItem(AUTO_OPEN_KEY) === '1'
  } catch {
    return false
  }
}

/** 玩家在这台机器上显式设置过没有：没设置过返回 null，交给主进程那份决定。 */
export function readAutoOpenPreferenceOrNull(): boolean | null {
  try {
    const raw = window.localStorage.getItem(AUTO_OPEN_KEY)
    return raw === null ? null : raw === '1'
  } catch {
    return null
  }
}

export function writeAutoOpenPreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(AUTO_OPEN_KEY, enabled ? '1' : '0')
  } catch {
    // 存不下时本次会话仍然生效
  }
}
