import { describe, expect, it } from "vitest"
import { encodeServerMessage, parseClientMessage } from "@/server/ws/protocol"

describe("parseClientMessage", () => {
  it("parses subscribe", () => {
    expect(parseClientMessage('{"op":"subscribe"}')).toEqual({ op: "subscribe" })
  })

  it("parses ping", () => {
    expect(parseClientMessage('{"op":"ping"}')).toEqual({ op: "ping" })
  })

  it("rejects unknown ops", () => {
    expect(parseClientMessage('{"op":"nope"}')).toBeNull()
  })

  it("rejects invalid json", () => {
    expect(parseClientMessage("not-json")).toBeNull()
  })

  it("rejects non-object payloads", () => {
    expect(parseClientMessage('"ping"')).toBeNull()
    expect(parseClientMessage("null")).toBeNull()
  })
})

describe("encodeServerMessage", () => {
  it("round-trips an event message", () => {
    const msg = { op: "event", event: { type: "viewerCount", count: 12, at: 1 } } as const
    expect(JSON.parse(encodeServerMessage(msg))).toEqual(msg)
  })
})
