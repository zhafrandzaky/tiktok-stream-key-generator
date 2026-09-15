import { afterEach, describe, expect, it } from "vitest"
import { POST as createLive } from "@/app/api/live/create/route"
import { POST as endLive } from "@/app/api/live/end/route"
import { GET as liveStatus } from "@/app/api/live/status/route"
import {
  AuthRequiredError,
  ExtractionFailedError,
  NotEligibleError,
} from "@/server/engine/errors"
import { setEngine, type EngineHandle } from "@/server/engine/singleton"
import type { LiveRoomResult } from "@/lib/types"

const room: LiveRoomResult = {
  rtmpUrl: "rtmp://push.example.com/live",
  streamKey: "sk-abc",
  combinedPushUrl: "rtmp://push.example.com/live/sk-abc",
  applied: ["title"],
}

function createTestEngine(overrides: Partial<EngineHandle> = {}): EngineHandle {
  return {
    getStatus: async () => ({ ok: true, mode: "fake", auth: "authenticated", live: false }),
    dispose: async () => {},
    auth: {
      start: async () => ({ qrDataUrl: "x", expiresAt: 1, version: 1 }),
      status: async () => ({ status: "authenticated" }),
      logout: async () => {},
      session: async () => ({ status: "authenticated" }),
    },
    live: {
      create: async () => room,
      end: async () => {},
      status: async () => ({ authenticated: true, live: false }),
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

function createRequest(body: unknown): Request {
  return new Request("http://localhost/api/live/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

afterEach(() => setEngine(null))

describe("live routes", () => {
  it("creates a room and returns credentials", async () => {
    setEngine(createTestEngine())
    const res = await createLive(createRequest({ title: "My stream" }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ streamKey: "sk-abc", applied: ["title"] })
  })

  it("rejects a missing title with 400 BAD_REQUEST", async () => {
    setEngine(createTestEngine())
    const res = await createLive(createRequest({}))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("BAD_REQUEST")
  })

  it("rejects invalid json bodies", async () => {
    setEngine(createTestEngine())
    const res = await createLive(
      new Request("http://localhost/api/live/create", { method: "POST", body: "{oops" }),
    )
    expect(res.status).toBe(400)
  })

  it("maps AuthRequiredError to 401", async () => {
    setEngine(
      createTestEngine({
        live: {
          create: async () => {
            throw new AuthRequiredError()
          },
          end: async () => {},
          status: async () => ({ authenticated: false, live: false }),
        },
      }),
    )
    const res = await createLive(createRequest({ title: "T" }))
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe("AUTH_REQUIRED")
  })

  it("maps cross-module engine errors (duplicated class copies) instead of 500", async () => {
    class ForeignAuthRequiredError extends Error {
      readonly isEngineError = true
      readonly code = "AUTH_REQUIRED"

      constructor() {
        super("You need to sign in to TikTok first.")
        this.name = "AuthRequiredError"
      }
    }
    setEngine(
      createTestEngine({
        live: {
          create: async () => {
            throw new ForeignAuthRequiredError()
          },
          end: async () => {},
          status: async () => ({ authenticated: false, live: false }),
        },
      }),
    )
    const res = await createLive(createRequest({ title: "T" }))
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe("AUTH_REQUIRED")
  })

  it("maps NotEligibleError to 409", async () => {
    setEngine(
      createTestEngine({
        live: {
          create: async () => {
            throw new NotEligibleError()
          },
          end: async () => {},
          status: async () => ({ authenticated: true, live: false }),
        },
      }),
    )
    const res = await createLive(createRequest({ title: "T" }))
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe("NOT_ELIGIBLE")
  })

  it("maps ExtractionFailedError to 400 with the message", async () => {
    setEngine(
      createTestEngine({
        live: {
          create: async () => {
            throw new ExtractionFailedError("Debug artifact: /tmp/x.png")
          },
          end: async () => {},
          status: async () => ({ authenticated: true, live: false }),
        },
      }),
    )
    const res = await createLive(createRequest({ title: "T" }))
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toContain("Debug artifact")
  })

  it("returns live status", async () => {
    setEngine(
      createTestEngine({
        live: {
          create: async () => room,
          end: async () => {},
          status: async () => ({ authenticated: true, live: true, room }),
        },
      }),
    )
    const res = await liveStatus()
    expect((await res.json()).live).toBe(true)
  })

  it("returns 204 when ending a stream", async () => {
    setEngine(createTestEngine())
    const res = await endLive()
    expect(res.status).toBe(204)
  })

  it("returns 503 when the engine is unavailable", async () => {
    setEngine(null)
    const res = await liveStatus()
    expect(res.status).toBe(503)
  })
})
