import { TikTokLiveConnection } from "tiktok-live-connector"
import { normalizeWebcastEvent } from "@/lib/parsers/chat"
import type { ChatEvent } from "@/lib/types"
import type { ChatController } from "./engine"
import { ExtractionFailedError, NotLiveError } from "./errors"
import type { EventBus } from "./events"

export function nextBackoff(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 30_000)
}

export interface ConnectorLike {
  connect(): Promise<unknown>
  disconnect(): Promise<void>
  on(event: string, listener: (...args: unknown[]) => void): unknown
}

const WATCHED_EVENTS = [
  "chat",
  "gift",
  "follow",
  "share",
  "like",
  "member",
  "roomUser",
  "streamEnd",
  "social",
  "connected",
  "disconnected",
  "error",
] as const

function isOfflineError(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name ?? ""
  const message = error instanceof Error ? error.message : String(error)
  return /offline/i.test(name) || /offline/i.test(message) || /not (currently )?live/i.test(message)
}

function sanitizeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/\s+/g, " ").slice(0, 200)
}

export function createChatConnection(deps: {
  bus: EventBus
  createConnector?: (username: string) => ConnectorLike
  maxReconnectAttempts?: number
}): ChatController {
  const maxReconnectAttempts = deps.maxReconnectAttempts ?? 5
  const createConnector =
    deps.createConnector ??
    ((username: string) =>
      new TikTokLiveConnection(username, {
        signApiKey: process.env.SIGN_API_KEY,
      }) as unknown as ConnectorLike)

  let connector: ConnectorLike | null = null
  let attempts = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let manualClose = false
  let streamEnded = false

  const publish = (event: ChatEvent | null) => {
    if (event) deps.bus.publish(event)
  }

  const clearReconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  const scheduleReconnect = () => {
    if (manualClose || streamEnded) return
    if (attempts >= maxReconnectAttempts) {
      publish({
        type: "status",
        state: "error",
        detail: "Connection lost — reconnect attempts exhausted",
        at: Date.now(),
      })
      return
    }
    const delay = nextBackoff(attempts)
    attempts += 1
    clearReconnect()
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      void connector?.connect().catch(() => {
        scheduleReconnect()
      })
    }, delay)
  }

  const attach = (conn: ConnectorLike) => {
    for (const name of WATCHED_EVENTS) {
      conn.on(name, (...args: unknown[]) => {
        if (name === "connected") attempts = 0
        if (name === "streamEnd") streamEnded = true
        publish(normalizeWebcastEvent(name, args[0], Date.now()))
        if (name === "disconnected") scheduleReconnect()
      })
    }
  }

  return {
    async connect(username: string): Promise<void> {
      await this.disconnect()
      manualClose = false
      streamEnded = false
      attempts = 0
      publish({ type: "status", state: "connecting", detail: username, at: Date.now() })
      const conn = createConnector(username)
      connector = conn
      attach(conn)
      try {
        await conn.connect()
      } catch (error) {
        if (isOfflineError(error)) {
          publish({ type: "status", state: "error", detail: "User is not live", at: Date.now() })
          throw new NotLiveError()
        }
        publish({ type: "status", state: "error", detail: sanitizeMessage(error), at: Date.now() })
        throw new ExtractionFailedError(sanitizeMessage(error))
      }
    },

    async disconnect(): Promise<void> {
      manualClose = true
      clearReconnect()
      const conn = connector
      connector = null
      if (conn) {
        await conn.disconnect().catch(() => undefined)
      }
      publish({ type: "status", state: "disconnected", at: Date.now() })
    },

    subscribe: deps.bus.subscribe,
    snapshot: deps.bus.snapshot,
  }
}
