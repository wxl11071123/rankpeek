// 相对路径 + .ts 后缀：node --test 不解析 @/ 别名，可测试的服务都这么写
import { apiClient } from '../api/httpClient.ts'
import { wsClient } from '../api/websocketClient.ts'
import { QUEUE_ID } from '../utils/constants.ts'

/**
 * 选人会话里我们关心的字段（其余字段与跳转无关）。
 */
interface ChampionSelectSnapshot {
  gameId?: number | null
  localPlayerCellId?: number | null
  myTeam?: Array<{
    cellId?: number | null
    championId?: number | null
    championPickIntent?: number | null
  }> | null
}

interface HextechAutoNavigationRoute {
  path: string
  query: Record<string, unknown>
}

interface HextechAutoNavigationRouter {
  currentRoute: { value: HextechAutoNavigationRoute }
  push: (location: { path: string; query: Record<string, string> }) => Promise<unknown> | unknown
}

interface HextechAutoNavigatorOptions {
  subscribe?: (callback: (payload: unknown) => void) => () => void
  resolveQueueId?: () => Promise<number | null>
  logger?: Pick<Console, 'warn'>
}

/**
 * 从选人会话里取本地玩家已锁定的英雄；尚未锁定时退回预选（championPickIntent）。
 */
export function resolveLockedChampionId(session: unknown): number | null {
  const snapshot = session as ChampionSelectSnapshot | null
  if (!snapshot || !Array.isArray(snapshot.myTeam)) {
    return null
  }

  const player = snapshot.myTeam.find((member) => member?.cellId === snapshot.localPlayerCellId)
  if (!player) {
    return null
  }

  const locked = Number(player.championId ?? 0)
  if (Number.isFinite(locked) && locked > 0) {
    return locked
  }

  const intent = Number(player.championPickIntent ?? 0)
  return Number.isFinite(intent) && intent > 0 ? intent : null
}

/**
 * 海斗选人自动跳转：玩家在海克斯大乱斗里锁定英雄后，自动打开该英雄的强化推荐。
 *
 * 只在海斗队列（queueId 2400）生效，避免在排位/匹配里抢走用户的页面。
 */
export function createHextechAutoNavigator(
  router: HextechAutoNavigationRouter,
  options: HextechAutoNavigatorOptions = {}
): () => void {
  const subscribe = options.subscribe ?? ((callback) => wsClient.onChampionSelect(callback))
  const resolveQueueId =
    options.resolveQueueId ??
    (async () => {
      try {
        const session = await apiClient.getSessionData()
        return session?.queueId ?? null
      } catch {
        return null
      }
    })
  const logger = options.logger ?? console

  let lastGameId: number | null = null
  let lastChampionId: number | null = null

  const unsubscribe = subscribe((payload) => {
    const snapshot = payload as ChampionSelectSnapshot | null

    // 换局时重置去重状态，否则下一局选同一个英雄不会再跳
    const gameId = Number(snapshot?.gameId ?? 0)
    if (Number.isFinite(gameId) && gameId > 0 && gameId !== lastGameId) {
      lastGameId = gameId
      lastChampionId = null
    }

    const championId = resolveLockedChampionId(payload)
    if (championId === null || championId === lastChampionId) {
      return
    }
    lastChampionId = championId

    void (async () => {
      const queueId = await resolveQueueId()
      if (queueId !== QUEUE_ID.HEXTECH_ARAM) {
        return
      }

      const current = router.currentRoute.value
      if (current.path === '/hextech' && Number(current.query.championId) === championId) {
        return
      }

      try {
        await router.push({ path: '/hextech', query: { championId: String(championId) } })
      } catch (error) {
        logger.warn('[hextech] 选人自动跳转失败', error)
      }
    })()
  })

  return () => {
    unsubscribe()
  }
}
