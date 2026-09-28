import axios from 'axios'
import { API_BASE_URL } from './httpClient.ts'
import type { ApiResponse, SessionData } from '../types/api.ts'

const DEV_SIMULATOR_BASE_URL = API_BASE_URL.replace(/\/api\/v1$/, '/api/dev/simulator')

class SimulatorApiError extends Error {
  code: number
  timestamp: number

  constructor(message: string, code: number, timestamp: number) {
    super(message)
    this.name = 'SimulatorApiError'
    this.code = code
    this.timestamp = timestamp
  }
}

export async function getSimulatorSessionData(): Promise<SessionData> {
  const { data: response } = await axios.get<ApiResponse<SessionData>>(
    `${DEV_SIMULATOR_BASE_URL}/session-data`
  )
  if (response.code !== 200) {
    throw new SimulatorApiError(response.message, response.code, response.timestamp)
  }
  return response.data
}
