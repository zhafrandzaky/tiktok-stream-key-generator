"use client"

import { useEffect, useRef, useState } from "react"
import type { ServerMessage } from "@/server/ws/protocol"
import type { ChatEvent } from "@/lib/types"

const PING_INTERVAL_MS = 25_000
const MAX_BACKOFF_MS = 15_000

export function useChatSocket(opts: { maxEvents?: number } = {}): {
  events: ChatEvent[]
  connected: boolean
} {
  const maxEvents = opts.maxEvents ?? 100
  const [events, setEvents] = useState<ChatEvent[]>([])
  const [connected, setConnected] = useState(false)
  const maxRef = useRef(maxEvents)

  useEffect(() => {
    maxRef.current = maxEvents
  }, [maxEvents])

  useEffect(() => {
    let socket: WebSocket | null = null
    let disposed = false
    let attempts = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let pingTimer: ReturnType<typeof setInterval> | null = null

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss" : "ws"
      socket = new WebSocket(`${protocol}://${window.location.host}/ws/chat`)

      socket.onopen = () => {
        attempts = 0
        setConnected(true)
        pingTimer = setInterval(() => {
          socket?.send(JSON.stringify({ op: "ping" }))
        }, PING_INTERVAL_MS)
      }

      socket.onmessage = (message: MessageEvent<string>) => {
        let payload: ServerMessage
        try {
          payload = JSON.parse(message.data) as ServerMessage
        } catch {
          return
        }
        if (payload.op === "hello") {
          setEvents(payload.snapshot.slice(-maxRef.current))
        }
        if (payload.op === "event") {
          setEvents((prev) => [...prev, payload.event].slice(-maxRef.current))
        }
      }

      socket.onclose = () => {
        setConnected(false)
        if (pingTimer) {
          clearInterval(pingTimer)
          pingTimer = null
        }
        if (disposed) return
        const delay = Math.min(1000 * 2 ** attempts, MAX_BACKOFF_MS)
        attempts += 1
        reconnectTimer = setTimeout(connect, delay)
      }

      socket.onerror = () => {
        socket?.close()
      }
    }

    connect()

    return () => {
      disposed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (pingTimer) clearInterval(pingTimer)
      socket?.close()
    }
  }, [])

  return { events, connected }
}
