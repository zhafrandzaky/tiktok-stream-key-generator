import { afterEach, describe, expect, it } from "vitest"
import { POST as logoutRoute } from "@/app/api/auth/logout/route"
import { POST as startRoute } from "@/app/api/auth/login/start/route"
import { GET as statusRoute } from "@/app/api/auth/login/status/route"
import { GET as sessionRoute } from "@/app/api/auth/session/route"
import { CaptchaError } from "@/server/engine/errors"
import { setEngine, type EngineHandle } from "@/server/engine/singleton"

function createTestEngine(overrides: Partial<EngineHandle> = {}): EngineHandle {
  return {
    getStatus: async () => ({ ok: true, mode: "fake", auth: "anonymous", live: false }),
    dispose: async () => {},
    auth: {
      start: async () => ({ qrDataUrl: "data:image/png;base64,AA", expiresAt: 123, version: 1 }),
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

afterEach(() => setEngine(null))

describe("auth routes", () => {
  it("returns the qr payload from start", async () => {
    setEngine(createTestEngine())
    const res = await startRoute()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ qrDataUrl: "data:image/png;base64,AA", expiresAt: 123, version: 1 })
  })

  it("maps CaptchaError to 409 CAPTCHA", async () => {
    setEngine(
      createTestEngine({
        auth: {
          ...createTestEngine().auth,
          start: async () => {
            throw new CaptchaError()
          },
        },
      }),
    )
    const res = await startRoute()
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe("CAPTCHA")
  })

  it("returns status", async () => {
    setEngine(
      createTestEngine({
        auth: {
          ...createTestEngine().auth,
          status: async () => ({ status: "anonymous", qr: { qrDataUrl: "x", expiresAt: 1, version: 2 } }),
        },
      }),
    )
    const res = await statusRoute()
    expect(res.status).toBe(200)
    expect((await res.json()).qr.version).toBe(2)
  })

  it("returns 204 on logout", async () => {
    setEngine(createTestEngine())
    const res = await logoutRoute()
    expect(res.status).toBe(204)
  })

  it("returns the session", async () => {
    setEngine(
      createTestEngine({
        auth: {
          ...createTestEngine().auth,
          session: async () => ({ status: "authenticated", uniqueId: "demo" }),
        },
      }),
    )
    const res = await sessionRoute()
    expect(await res.json()).toEqual({ status: "authenticated", uniqueId: "demo" })
  })

  it("returns 503 when the engine is unavailable", async () => {
    setEngine(null)
    const res = await sessionRoute()
    expect(res.status).toBe(503)
    expect((await res.json()).error.code).toBe("ENGINE_UNAVAILABLE")
  })
})
