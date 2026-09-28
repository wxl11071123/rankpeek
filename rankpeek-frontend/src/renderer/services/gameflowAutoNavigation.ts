import { ref } from 'vue'
import { isNavigationFailure, NavigationFailureType } from 'vue-router'
import { listenGameflowPhase, type GameflowPhaseCallback } from './gameflowPhaseListener.ts'
import {
  createGameflowPhaseTransitionTracker,
  isGameflowAutoGamingRoutePhase,
  isGameflowPostgameNavigationPhase
} from './gamingSessionFlow.ts'

interface AutoNavigationRoute {
  name?: unknown
}

interface AutoNavigationRouter {
  currentRoute: {
    value: AutoNavigationRoute
  }
  push: (location: { name: 'Gaming' | 'MatchHistory' }) => Promise<unknown> | unknown
}

interface GameflowAutoNavigatorOptions {
  listen?: (callback: GameflowPhaseCallback) => () => void
  logger?: Pick<Console, 'warn'>
  now?: () => number
}

export const postgameAutoOpenLatestMatchToken = ref('')

let postgameAutoOpenSequence = 0

export function clearPostgameAutoOpenLatestMatchToken(token: string) {
  if (postgameAutoOpenLatestMatchToken.value === token) {
    postgameAutoOpenLatestMatchToken.value = ''
  }
}

function requestPostgameAutoOpenLatestMatch(phase: string, now: () => number) {
  postgameAutoOpenSequence += 1
  postgameAutoOpenLatestMatchToken.value = `${phase}:${now()}:${postgameAutoOpenSequence}`
}

export function createGameflowAutoNavigator(
  router: AutoNavigationRouter,
  options: GameflowAutoNavigatorOptions = {}
): () => void {
  const listen = options.listen ?? listenGameflowPhase
  const logger = options.logger ?? console
  const now = options.now ?? Date.now
  const phaseTransitions = createGameflowPhaseTransitionTracker()

  return listen((phase) => {
    if (!phaseTransitions.shouldHandlePhase(phase)) {
      return
    }

    if (isGameflowAutoGamingRoutePhase(phase)) {
      pushNamedRouteIfNeeded(router, 'Gaming', logger)
      return
    }

    if (isGameflowPostgameNavigationPhase(phase)) {
      requestPostgameAutoOpenLatestMatch(phase, now)
      pushNamedRouteIfNeeded(router, 'MatchHistory', logger)
    }
  })
}

function pushNamedRouteIfNeeded(
  router: AutoNavigationRouter,
  name: 'Gaming' | 'MatchHistory',
  logger: Pick<Console, 'warn'>
) {
  if (router.currentRoute.value.name === name) {
    return
  }

  void Promise.resolve(router.push({ name })).then((failure) => {
    if (failure && !isNavigationFailure(failure, NavigationFailureType.duplicated)) {
      logger.warn(`Auto navigation to ${name} failed`, failure)
    }
  }).catch((error: unknown) => {
    if (!isNavigationFailure(error, NavigationFailureType.duplicated)) {
      logger.warn(`Auto navigation to ${name} failed`, error)
    }
  })
}
