import type { SessionData } from '../types/api.ts'
import { apiClient } from './httpClient.ts'

export const SIMULATOR_SESSION_DATA_FLAG = 'rankpeek.dev.simulatorSessionData'

export interface SimulatorSessionDataFlagContext {
  isDev?: boolean
  getFlag?: () => string | null
}

export interface GamingSessionDataSources {
  forceRefresh?: boolean
  flagContext?: SimulatorSessionDataFlagContext
  getLiveSessionData?: (options: { forceRefresh: boolean }) => Promise<SessionData>
  getSimulatorSessionData?: () => Promise<SessionData>
}

function readSimulatorFlag(): string | null {
  if (typeof localStorage === 'undefined') {
    return null
  }
  return localStorage.getItem(SIMULATOR_SESSION_DATA_FLAG)
}

function isDevMode(): boolean {
  return import.meta.env?.DEV === true
}

export function isSimulatorSessionDataEnabled(context: SimulatorSessionDataFlagContext = {}): boolean {
  const isDev = context.isDev ?? isDevMode()
  const getFlag = context.getFlag ?? readSimulatorFlag
  return isDev && getFlag() === '1'
}

export async function getGamingSessionData(sources: GamingSessionDataSources = {}): Promise<SessionData> {
  const options = { forceRefresh: sources.forceRefresh === true }

  if (isSimulatorSessionDataEnabled(sources.flagContext)) {
    if (sources.getSimulatorSessionData) {
      return sources.getSimulatorSessionData()
    }
    const simulatorClient = await import('./devSimulatorClient.ts')
    return simulatorClient.getSimulatorSessionData()
  }

  if (sources.getLiveSessionData) {
    return sources.getLiveSessionData(options)
  }
  return apiClient.getSessionData(undefined, options)
}
