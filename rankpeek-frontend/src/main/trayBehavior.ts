export type WindowCloseAction = 'hide-to-tray' | 'quit'
export type WindowMinimizeAction = 'keep-minimized'
export type TrayMenuAction =
  | 'show-window'
  | 'hide-window'
  | 'navigate-home'
  | 'navigate-summoner'
  | 'navigate-match-history'
  | 'toggle-devtools'
  | 'quit'
  | 'separator'

export interface TrayDecisionInput {
  isTrayEnabled: boolean
  isQuitting: boolean
}

export interface TrayMenuEntry {
  label: string
  action: TrayMenuAction
}

export function getWindowCloseAction(_input: TrayDecisionInput): WindowCloseAction {
  return 'quit'
}

export function getWindowMinimizeAction(input: TrayDecisionInput): WindowMinimizeAction {
  return 'keep-minimized'
}

export function getTrayMenuEntries(): TrayMenuEntry[] {
  return [
    { label: '显示主窗口', action: 'show-window' },
    { label: '隐藏到托盘', action: 'hide-window' },
    { label: '', action: 'separator' },
    { label: '首页', action: 'navigate-home' },
    { label: '召唤师信息', action: 'navigate-summoner' },
    { label: '战绩查询', action: 'navigate-match-history' },
    { label: '', action: 'separator' },
    { label: '开发者工具', action: 'toggle-devtools' },
    { label: '退出', action: 'quit' }
  ]
}
