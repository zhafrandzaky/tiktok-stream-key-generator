import type { ChatEvent } from "@/lib/types"

export type ClientMessage = { op: "subscribe" } | { op: "ping" }

export type ServerMessage =
  | { op: "hello"; snapshot: ChatEvent[] }
  | { op: "event"; event: ChatEvent }
  | { op: "pong" }
  | { op: "error"; code: string; message: string }

export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const data: unknown = JSON.parse(raw)
    if (typeof data !== "object" || data === null || Array.isArray(data)) return null
    const op = (data as { op?: unknown }).op
    if (op === "subscribe" || op === "ping") return { op }
    return null
  } catch {
    return null
  }
}

export function encodeServerMessage(msg: ServerMessage): string {
  return JSON.stringify(msg)
}
