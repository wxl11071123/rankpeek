import * as http from 'http'

/**
 * 局内检测的「眼睛」：主进程自己盯 LCU 游戏阶段。
 *
 * 参考项目（ARAMGG）就是这么做的 —— 自动截图服务由 gameflow 托管，
 * 只有 `InProgress` 才允许跑游戏内 OCR。放在主进程的好处是：
 * 不依赖任何窗口是否打开、不依赖渲染进程的 localStorage，进对局一定起得来。
 */
const IN_GAME_PHASES = ['InProgress', 'GameStart', 'Reconnect']
/** 选人阶段：参考项目 ARAMGG 在这时候弹「英雄详情」侧栏，我们弹同一个助手窗口。 */
const CHAMP_SELECT_PHASES = ['ChampSelect']

export interface HextechGameWatcherOptions {
  /** 后端地址，例如 http://127.0.0.1:8080 */
  backendBaseUrl: string
  /** 刚进对局（上升沿）。 */
  onInGame: () => void
  /** 离开对局（下降沿）。 */
  onLeaveGame: () => void
  /** 刚进选人（上升沿）：自动弹侧栏用。 */
  onChampSelect?: () => void
  intervalMs?: number
  /** 测试用：直接给阶段，不走 HTTP。 */
  fetchPhase?: () => Promise<string | null>
  logger?: Pick<Console, 'warn'>
}

export function isInGamePhase(phase: string | null | undefined): boolean {
  return IN_GAME_PHASES.includes(String(phase ?? ''))
}

export function isChampSelectPhase(phase: string | null | undefined): boolean {
  return CHAMP_SELECT_PHASES.includes(String(phase ?? ''))
}

/** 问后端要当前游戏阶段；失败按「不在对局」处理。 */
export function fetchGamePhase(backendBaseUrl: string, timeoutMs = 3000): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false
    const done = (value: string | null) => {
      if (!settled) {
        settled = true
        resolve(value)
      }
    }
    try {
      const request = http.get(backendBaseUrl + '/api/v1/hextech/phase', (response) => {
        let body = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          body += chunk
        })
        response.on('end', () => {
          try {
            done(JSON.parse(body)?.data?.phase ?? null)
          } catch {
            done(null)
          }
        })
      })
      request.setTimeout(timeoutMs, () => {
        request.destroy()
        done(null)
      })
      request.on('error', () => done(null))
    } catch {
      done(null)
    }
  })
}

/**
 * 盯着阶段变化，进出对局各回调一次（只在边沿触发，不会每轮都喊）。
 */
export function startHextechGameWatcher(options: HextechGameWatcherOptions): () => void {
  const intervalMs = options.intervalMs ?? 5000
  const logger = options.logger ?? console
  // 调试用：RANKPEEK_FAKE_PHASE=InProgress 可以在没打游戏时验证整条链路
  const fakePhase = process.env.RANKPEEK_FAKE_PHASE
  const fetchPhase =
    options.fetchPhase ??
    (async () => (fakePhase ? fakePhase : await fetchGamePhase(options.backendBaseUrl)))

  let inGame = false
  let champSelect = false
  let stopped = false

  async function tick(): Promise<void> {
    if (stopped) {
      return
    }
    try {
      const phase = await fetchPhase()
      const nowInGame = isInGamePhase(phase)
      if (nowInGame !== inGame) {
        inGame = nowInGame
        if (nowInGame) {
          options.onInGame()
        } else {
          options.onLeaveGame()
        }
      }
      const nowChampSelect = isChampSelectPhase(phase)
      if (nowChampSelect !== champSelect) {
        champSelect = nowChampSelect
        if (nowChampSelect) {
          options.onChampSelect?.()
        }
      }
    } catch (error) {
      logger.warn('[hextech-watcher] phase check failed: ' + String(error))
    }
  }

  const timer = setInterval(() => void tick(), intervalMs)
  void tick()
  return () => {
    stopped = true
    clearInterval(timer)
  }
}
