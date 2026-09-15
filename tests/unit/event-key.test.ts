import { describe, expect, it } from "vitest"
import { eventKey } from "@/lib/event-key"
import type { ChatEvent } from "@/lib/types"

const event = (at: number): ChatEvent => ({
  type: "chat",
  user: { uniqueId: "u", nickname: "U" },
  comment: "hi",
  at,
})

describe("eventKey", () => {
  it("returns a stable key for the same event object", () => {
    const chat = event(1)
    expect(eventKey(chat)).toBe(eventKey(chat))
  })

  it("returns distinct keys for distinct events", () => {
    expect(eventKey(event(1))).not.toBe(eventKey(event(1)))
  })

  it("prefixes the key with the event type", () => {
    expect(eventKey(event(1)).startsWith("chat-")).toBe(true)
  })
})
