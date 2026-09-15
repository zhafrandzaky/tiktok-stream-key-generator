import type { ChatEvent } from "@/lib/types"
import { encodeServerMessage, parseClientMessage } from "@/server/ws/protocol"

export interface BridgeSocket {
  send(data: string): void
  close(code?: number, reason?: string): void
}

export interface ChatSocket {
  handleMessage(raw: string): void
  handleClose(): void
  queueSize(): number
}

type Entry = {
  socket: BridgeSocket
  queue: ChatEvent[]
  closed: boolean
  flushing: boolean
}

export function createChatBridge(deps: {
  getSnapshot: () => ChatEvent[]
  subscribe: (listener: (event: ChatEvent) => void) => () => void
  queueLimit?: number
}) {
  const queueLimit = deps.queueLimit ?? 500
  const entries = new Set<Entry>()

  const closeEntry = (entry: Entry) => {
    if (entry.closed) return
    entry.closed = true
    entry.queue.length = 0
    entries.delete(entry)
  }

  const flush = (entry: Entry) => {
    if (entry.closed) return
    while (entry.queue.length > 0) {
      const event = entry.queue.shift()
      if (!event) return
      try {
        entry.socket.send(encodeServerMessage({ op: "event", event }))
      } catch {
        closeEntry(entry)
        return
      }
    }
  }

  const scheduleFlush = (entry: Entry) => {
    if (entry.flushing || entry.closed) return
    entry.flushing = true
    queueMicrotask(() => {
      entry.flushing = false
      flush(entry)
    })
  }

  const broadcast = (event: ChatEvent) => {
    for (const entry of entries) {
      entry.queue.push(event)
      if (entry.queue.length > queueLimit) {
        entry.queue.splice(0, entry.queue.length - queueLimit)
      }
      scheduleFlush(entry)
    }
  }

  const unsubscribeBus = deps.subscribe(broadcast)

  const attach = (socket: BridgeSocket): ChatSocket => {
    const entry: Entry = { socket, queue: [], closed: false, flushing: false }
    entries.add(entry)
    try {
      socket.send(encodeServerMessage({ op: "hello", snapshot: deps.getSnapshot() }))
    } catch {
      closeEntry(entry)
    }
    return {
      handleMessage: (raw) => {
        if (entry.closed) return
        const msg = parseClientMessage(raw)
        if (!msg) {
          try {
            socket.send(encodeServerMessage({ op: "error", code: "BAD_MESSAGE", message: "Unsupported message" }))
          } catch {
            closeEntry(entry)
          }
          return
        }
        if (msg.op === "ping") {
          try {
            socket.send(encodeServerMessage({ op: "pong" }))
          } catch {
            closeEntry(entry)
          }
        }
      },
      handleClose: () => closeEntry(entry),
      queueSize: () => entry.queue.length,
    }
  }

  const dispose = () => {
    for (const entry of entries) closeEntry(entry)
    unsubscribeBus()
  }

  return {
    attach,
    broadcast,
    dispose,
    size: () => entries.size,
  }
}
