import { Client, type IMessage } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import type { GameState, CacheUpdateEvent } from '@/types/api'

type GameStateCallback = (state: GameState) => void
type CacheUpdateCallback = (event: CacheUpdateEvent) => void
type GenericCallback = (data: unknown) => void

class WebSocketClient {
  private client: Client | null = null
  private gameStateCallbacks: Set<GameStateCallback> = new Set()
  private championSelectCallbacks: Set<GenericCallback> = new Set()
  private lobbyCallbacks: Set<GenericCallback> = new Set()
  private cacheUpdateCallbacks: Set<CacheUpdateCallback> = new Set()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private baseReconnectDelay = 1000

  connect(): void {
    if (this.client?.active || this.client?.connected) {
      return
    }

    const reconnectDelay = this.calculateReconnectDelay()

    const client = new Client({
      webSocketFactory: () => new SockJS('http://127.0.0.1:8080/ws'),
      reconnectDelay,
      onConnect: () => {
        if (this.client !== client) {
          return
        }

        console.log('WebSocket connected')
        this.reconnectAttempts = 0
        this.subscribeToTopics(client)
      },
      onDisconnect: () => {
        console.log('WebSocket disconnected')
      },
      onStompError: (frame) => {
        console.error('STOMP error:', frame.headers['message'])
      },
      onWebSocketError: (event) => {
        console.error('WebSocket error:', event)
        this.handleReconnect()
      }
    })

    this.client = client
    client.activate()
  }

  private calculateReconnectDelay(): number {
    return Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      30000
    )
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      const delay = this.calculateReconnectDelay()
      console.log(`WebSocket reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
    }
  }

  resetReconnectAttempts(): void {
    this.reconnectAttempts = 0
  }

  /**
   * 订阅主题
   */
  private subscribeToTopics(client = this.client): void {
    if (!client?.connected) return

    // 游戏状态变化
    client.subscribe('/topic/game-state', (message: IMessage) => {
      const data = JSON.parse(message.body) as GameState
      this.gameStateCallbacks.forEach(cb => cb(data))
    })

    // 选人阶段变化
    client.subscribe('/topic/champion-select', (message: IMessage) => {
      const data = JSON.parse(message.body)
      this.championSelectCallbacks.forEach(cb => cb(data))
    })

    // 大厅变化
    client.subscribe('/topic/lobby', (message: IMessage) => {
      const data = JSON.parse(message.body)
      this.lobbyCallbacks.forEach(cb => cb(data))
    })

    client.subscribe('/topic/cache-updates', (message: IMessage) => {
      try {
        const data = JSON.parse(message.body) as CacheUpdateEvent
        for (const callback of this.cacheUpdateCallbacks) {
          try {
            callback(data)
          } catch (e) {
            console.warn('Cache update callback failed', e)
          }
        }
      } catch (e) {
        console.warn('Failed to parse cache update message', e)
      }
    })
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.client) {
      this.client.deactivate()
      this.client = null
    }
  }

  /**
   * 是否已连接
   */
  isConnected(): boolean {
    return this.client?.connected ?? false
  }

  // ========== 事件订阅 ==========

  /**
   * 订阅游戏状态变化
   */
  onGameState(callback: GameStateCallback): () => void {
    this.gameStateCallbacks.add(callback)
    return () => this.gameStateCallbacks.delete(callback)
  }

  /**
   * 订阅选人阶段变化
   */
  onChampionSelect(callback: GenericCallback): () => void {
    this.championSelectCallbacks.add(callback)
    return () => this.championSelectCallbacks.delete(callback)
  }

  /**
   * 订阅大厅变化
   */
  onLobby(callback: GenericCallback): () => void {
    this.lobbyCallbacks.add(callback)
    return () => this.lobbyCallbacks.delete(callback)
  }

  onCacheUpdate(callback: CacheUpdateCallback): () => void {
    this.cacheUpdateCallbacks.add(callback)
    return () => this.cacheUpdateCallbacks.delete(callback)
  }
}

export const wsClient = new WebSocketClient()
