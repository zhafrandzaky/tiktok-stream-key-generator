import { describe, expect, it, vi } from "vitest"
import { createChatBridge } from "@/server/ws/chat-bridge"
import type { ChatEvent } from "@/lib/types"

function fakeSocket() {
  const sent: string[] = []
  const state = { closed: false }
  return {
    socket: {
      send: (data: string) => {
        sent.push(data)
      },
      close: () => {
        state.closed = true
      },
    },
    sent,
    state,
  }
}

function parseSends(sent: string[]) {
  return sent.map((raw) => JSON.parse(raw) as Record<string, unknown>)
}

const chat = (at: number): ChatEvent => ({
  type: "chat",
  user: { uniqueId: "u", nickname: "U" },
  comment: "hi",
  at,
})

describe("createChatBridge", () => {
  it("sends hello snapshot on attach", () => {
    const bridge = createChatBridge({ getSnapshot: () => [chat(1)], subscribe: () => () => {} })
    const { socket, sent } = fakeSocket()
    bridge.attach(socket)
    expect(parseSends(sent)).toEqual([{ op: "hello", snapshot: [chat(1)] }])
  })

  it("broadcasts events to attached sockets", async () => {
    const bridge = createChatBridge({ getSnapshot: () => [], subscribe: () => () => {} })
    const a = fakeSocket()
    const b = fakeSocket()
    bridge.attach(a.socket)
    bridge.attach(b.socket)
    bridge.broadcast(chat(2))
    await Promise.resolve()
    expect(parseSends(a.sent).at(-1)).toEqual({ op: "event", event: chat(2) })
    expect(parseSends(b.sent).at(-1)).toEqual({ op: "event", event: chat(2) })
  })

  it("answers ping with pong", () => {
    const bridge = createChatBridge({ getSnapshot: () => [], subscribe: () => () => {} })
    const { socket, sent } = fakeSocket()
    const conn = bridge.attach(socket)
    conn.handleMessage('{"op":"ping"}')
    expect(parseSends(sent).at(-1)).toEqual({ op: "pong" })
  })

  it("replies with an error frame on unknown messages", () => {
    const bridge = createChatBridge({ getSnapshot: () => [], subscribe: () => () => {} })
    const { socket, sent } = fakeSocket()
    const conn = bridge.attach(socket)
    conn.handleMessage("garbage")
    expect(parseSends(sent).at(-1)).toMatchObject({ op: "error", code: "BAD_MESSAGE" })
  })

  it("drops oldest events beyond queueLimit for slow consumers", async () => {
    const bridge = createChatBridge({ getSnapshot: () => [], subscribe: () => () => {}, queueLimit: 2 })
    const { socket, sent } = fakeSocket()
    bridge.attach(socket)
    bridge.broadcast(chat(1))
    bridge.broadcast(chat(2))
    bridge.broadcast(chat(3))
    await Promise.resolve()
    const events = parseSends(sent)
      .filter((m) => m.op === "event")
      .map((m) => (m.event as ChatEvent).at)
    expect(events).toEqual([2, 3])
  })

  it("stops delivering to closed sockets and shrinks size", async () => {
    const bridge = createChatBridge({ getSnapshot: () => [], subscribe: () => () => {} })
    const { socket, sent } = fakeSocket()
    const conn = bridge.attach(socket)
    expect(bridge.size()).toBe(1)
    conn.handleClose()
    expect(bridge.size()).toBe(0)
    bridge.broadcast(chat(9))
    await Promise.resolve()
    expect(parseSends(sent).some((m) => m.op === "event")).toBe(false)
  })

  it("removes sockets whose send throws", async () => {
    const bridge = createChatBridge({ getSnapshot: () => [], subscribe: () => () => {} })
    const socket = {
      send: vi.fn(() => {
        throw new Error("broken pipe")
      }),
      close: vi.fn(),
    }
    bridge.attach(socket)
    bridge.broadcast(chat(1))
    await Promise.resolve()
    expect(bridge.size()).toBe(0)
  })
})
