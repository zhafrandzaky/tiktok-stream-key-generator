import { afterEach, describe, expect, it } from "vitest"
import { POST as connectChat } from "@/app/api/chat/connect/route"
import { POST as disconnectChat } from "@/app/api/chat/disconnect/route"
import { NotLiveError } from "@/server/engine/errors"
import { setEngine, type EngineHandle } from "@/server/engine/singleton"

function createTestEngine(overrides: Partial<EngineHandle> = {}): EngineHandle {
  return {
    getStatus: async () => ({ ok: true, mode: "fake", auth: "anonymous", live: false }),
    auth: {
      start: async () => ({ qrDataUrl: "x", expiresAt: 1, version: 1 }),
      status: async () => ({ status: "anonymous" }),
      logout: async () => {},
      session: async () => ({ status: "anonymous" }),
    },
    live: {
      create: async () => ({ rtmpUrl: "", streamKey: "", applied: [] }),
      end: async () => {},
      status: async () => ({ authenticated: false, live: false }),
    },
    chat: {
      connect: async () => {},
      disconnect: async () => {},
      subscribe: () => () => {},
      snapshot: () => [],
    },
    ...overrides,
  }
}

function request(body: unknown): Request {
  return new Request("http://localhost/api/chat/connect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

afterEach(() => setEngine(null))

describe("chat routes", () => {
  it("connects with a normalized username", async () => {
    const connected: string[] = []
    setEngine(
      createTestEngine({
        chat: {
          ...createTestEngine().chat,
          connect: async (username) => {
            connected.push(username)
          },
        },
      }),
    )
    const res = await connectChat(request({ username: "@demo_user" }))
    expect(res.status).toBe(204)
    expect(connected).toEqual(["demo_user"])
  })

  it("rejects invalid usernames", async () => {
    setEngine(createTestEngine())
    const res = await connectChat(request({ username: "bad username!" }))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("BAD_REQUEST")
  })

  it("maps NotLiveError to 409 NOT_LIVE", async () => {
    setEngine(
      createTestEngine({
        chat: {
          ...createTestEngine().chat,
          connect: async () => {
            throw new NotLiveError()
          },
        },
      }),
    )
    const res = await connectChat(request({ username: "offline_user" }))
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe("NOT_LIVE")
  })

  it("disconnects with 204", async () => {
    setEngine(createTestEngine())
    const res = await disconnectChat()
    expect(res.status).toBe(204)
  })
})
