import { describe, expect, it, vi } from "vitest"
import { createChatConnection, nextBackoff, type ConnectorLike } from "@/server/engine/chat-connection"
import { NotLiveError } from "@/server/engine/errors"
import { createEventBus } from "@/server/engine/events"

function fakeConnector() {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  return {
    connect: vi.fn(async () => ({ roomId: "room-1" })),
    disconnect: vi.fn(async () => {}),
    on(event: string, listener: (...args: unknown[]) => void) {
      const list = listeners.get(event) ?? []
      list.push(listener)
      listeners.set(event, list)
      return this
    },
    emit(event: string, ...args: unknown[]) {
      for (const listener of listeners.get(event) ?? []) listener(...args)
    },
  }
}

describe("nextBackoff", () => {
  it("grows exponentially and caps at 30 seconds", () => {
    expect([0, 1, 2, 3, 4, 5, 10].map(nextBackoff)).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000,
    ])
  })
})

describe("createChatConnection", () => {
  it("normalizes connector events onto the bus", async () => {
    const bus = createEventBus()
    const connector = fakeConnector()
    const chat = createChatConnection({ bus, createConnector: () => connector })

    await chat.connect("demo")
    connector.emit("chat", { user: { uniqueId: "alice", nickname: "Alice" }, comment: "hi" })
    connector.emit("roomUser", { viewerCount: 55 })

    const events = bus.snapshot()
    expect(events.at(-2)).toMatchObject({ type: "chat", comment: "hi" })
    expect(events.at(-1)).toEqual({ type: "viewerCount", count: 55, at: expect.any(Number) })
    await chat.disconnect()
  })

  it("rejects when the user is not live", async () => {
    const bus = createEventBus()
    const connector = fakeConnector()
    connector.connect.mockRejectedValueOnce(
      Object.assign(new Error("User is offline"), { name: "UserOfflineError" }),
    )
    const chat = createChatConnection({ bus, createConnector: () => connector })

    await expect(chat.connect("nobody")).rejects.toBeInstanceOf(NotLiveError)
    expect(bus.snapshot().some((event) => event.type === "status" && event.state === "error")).toBe(true)
  })

  it("wraps other connection failures", async () => {
    const bus = createEventBus()
    const connector = fakeConnector()
    connector.connect.mockRejectedValueOnce(new Error("sign server unavailable"))
    const chat = createChatConnection({ bus, createConnector: () => connector })

    await expect(chat.connect("demo")).rejects.toThrow("sign server unavailable")
  })

  it("reconnects with backoff after an unexpected disconnect", async () => {
    vi.useFakeTimers()
    const bus = createEventBus()
    const connector = fakeConnector()
    const chat = createChatConnection({ bus, createConnector: () => connector as ConnectorLike })

    await chat.connect("demo")
    expect(connector.connect).toHaveBeenCalledTimes(1)

    connector.emit("disconnected", { code: 1006 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(connector.connect).toHaveBeenCalledTimes(2)

    await chat.disconnect()
    vi.useRealTimers()
  })

  it("stops reconnecting after a manual disconnect", async () => {
    vi.useFakeTimers()
    const bus = createEventBus()
    const connector = fakeConnector()
    const chat = createChatConnection({ bus, createConnector: () => connector as ConnectorLike })

    await chat.connect("demo")
    await chat.disconnect()
    connector.emit("disconnected", { code: 1006 })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(connector.connect).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it("does not reconnect after the stream ends", async () => {
    vi.useFakeTimers()
    const bus = createEventBus()
    const connector = fakeConnector()
    const chat = createChatConnection({ bus, createConnector: () => connector as ConnectorLike })

    await chat.connect("demo")
    connector.emit("streamEnd", { action: 3 })
    connector.emit("disconnected", { code: 1000 })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(connector.connect).toHaveBeenCalledTimes(1)
    await chat.disconnect()
    vi.useRealTimers()
  })

  it("gives up after max reconnect attempts", async () => {
    vi.useFakeTimers()
    const bus = createEventBus()
    const connector = fakeConnector()
    connector.connect
      .mockResolvedValueOnce({ roomId: "r" })
      .mockRejectedValue(new Error("still offline"))
    const chat = createChatConnection({
      bus,
      createConnector: () => connector as ConnectorLike,
      maxReconnectAttempts: 2,
    })

    await chat.connect("demo")
    connector.emit("disconnected", { code: 1006 })
    await vi.advanceTimersByTimeAsync(60_000)

    expect(connector.connect).toHaveBeenCalledTimes(3)
    const errorStatus = bus
      .snapshot()
      .findLast((event) => event.type === "status" && event.state === "error")
    expect(errorStatus?.type === "status" ? errorStatus.detail : undefined).toContain("exhausted")
    await chat.disconnect()
    vi.useRealTimers()
  })
})
