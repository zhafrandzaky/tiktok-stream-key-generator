import { afterEach, describe, expect, it } from "vitest"
import { POST as logoutRoute } from "@/app/api/auth/logout/route"
import { POST as importRoute } from "@/app/api/auth/import/firefox/route"
import { POST as startRoute } from "@/app/api/auth/login/start/route"
import { GET as statusRoute } from "@/app/api/auth/login/status/route"
import { GET as sessionRoute } from "@/app/api/auth/session/route"
import { CaptchaError, LoginRateLimitedError, SessionImportFailedError } from "@/server/engine/errors"
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
      importFromFirefox: async () => ({ status: "authenticated" as const }),
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

function startRequest(body?: unknown): Request {
  return new Request("http://localhost/api/auth/login/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

describe("auth routes", () => {
  it("returns the qr payload from start", async () => {
    setEngine(createTestEngine())
    const res = await startRoute(startRequest())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ qrDataUrl: "data:image/png;base64,AA", expiresAt: 123, version: 1 })
  })

  it("passes the requested login mode to the engine", async () => {
    const modes: Array<string | undefined> = []
    setEngine(
      createTestEngine({
        auth: {
          ...createTestEngine().auth,
          start: async (mode) => {
            modes.push(mode)
            return { qrDataUrl: "", expiresAt: 0, version: 0 }
          },
        },
      }),
    )
    await startRoute(startRequest({ mode: "window" }))
    await startRoute(startRequest({ mode: "qr" }))
    await startRoute(startRequest())
    expect(modes).toEqual(["window", "qr", "qr"])
  })

  it("maps LoginRateLimitedError to a flat 429 payload with retryAfter", async () => {
    setEngine(
      createTestEngine({
        auth: {
          ...createTestEngine().auth,
          start: async () => {
            throw new LoginRateLimitedError("paused", 240)
          },
        },
      }),
    )
    const res = await startRoute(startRequest())
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({
      error: "LOGIN_RATE_LIMITED",
      message: "paused",
      retryAfter: 240,
    })
  })

  it("maps cross-module engine errors (duplicated class copies) instead of 500", async () => {
    class ForeignRateLimitedError extends Error {
      readonly isEngineError = true
      readonly code: string
      readonly retryAfter: number

      constructor(code: string, retryAfter: number) {
        super("rate limited from another module instance")
        this.name = "LoginRateLimitedError"
        this.code = code
        this.retryAfter = retryAfter
      }
    }
    setEngine(
      createTestEngine({
        auth: {
          ...createTestEngine().auth,
          start: async () => {
            throw new ForeignRateLimitedError("LOGIN_RATE_LIMITED", 120)
          },
        },
      }),
    )
    const res = await startRoute(startRequest())
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({
      error: "LOGIN_RATE_LIMITED",
      message: "rate limited from another module instance",
      retryAfter: 120,
    })
  })

  it("rejects invalid JSON bodies with 400", async () => {
    setEngine(createTestEngine())
    const res = await startRoute(
      new Request("http://localhost/api/auth/login/start", { method: "POST", body: "{oops" }),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("BAD_REQUEST")
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
    const res = await startRoute(startRequest())
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

  it("imports a Firefox session", async () => {
    setEngine(
      createTestEngine({
        auth: {
          ...createTestEngine().auth,
          importFromFirefox: async () => ({ status: "authenticated", uniqueId: "ff_user" }),
        },
      }),
    )
    const res = await importRoute()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: "authenticated", uniqueId: "ff_user" })
  })

  it("maps a missing Firefox session to 404", async () => {
    setEngine(
      createTestEngine({
        auth: {
          ...createTestEngine().auth,
          importFromFirefox: async () => {
            throw new SessionImportFailedError()
          },
        },
      }),
    )
    const res = await importRoute()
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe("NO_SESSION_FOUND")
  })

  it("returns 503 when the engine is unavailable", async () => {
    setEngine(null)
    const res = await sessionRoute()
    expect(res.status).toBe(503)
    expect((await res.json()).error.code).toBe("ENGINE_UNAVAILABLE")
  })
})
