import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiError, apiGet, apiPost } from "@/lib/api-client"

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("api-client", () => {
  it("returns parsed JSON on success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, { ok: true })))
    await expect(apiGet<{ ok: boolean }>("/x")).resolves.toEqual({ ok: true })
  })

  it("returns undefined for 204 responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(204)))
    await expect(apiPost("/x")).resolves.toBeUndefined()
  })

  it("posts JSON bodies with the right headers", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { ok: true }))
    vi.stubGlobal("fetch", fetchMock)
    await apiPost("/api/live/create", { title: "T" })
    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe("/api/live/create")
    expect(init.method).toBe("POST")
    expect(init.body).toBe(JSON.stringify({ title: "T" }))
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json")
  })

  it("maps error payloads to ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(401, { error: { code: "AUTH_REQUIRED", message: "Sign in first" } })),
    )
    const error = await apiGet("/x").catch((value: unknown) => value)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: "AUTH_REQUIRED", status: 401, message: "Sign in first" })
  })

  it("parses flat 429 payloads with retryAfter", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(429, {
          error: "LOGIN_RATE_LIMITED",
          message: "TikTok is still rate-limiting QR login.",
          retryAfter: 240,
        }),
      ),
    )
    const error = await apiPost("/api/auth/login/start", { mode: "qr" }).catch(
      (value: unknown) => value,
    )
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      code: "LOGIN_RATE_LIMITED",
      status: 429,
      retryAfter: 240,
      message: "TikTok is still rate-limiting QR login.",
    })
  })

  it("falls back to a generic message when the error body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>oops</html>", { status: 500 })),
    )
    const error = await apiGet("/x").catch((value: unknown) => value)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: "UNKNOWN", status: 500 })
    expect((error as ApiError).message).toContain("500")
  })

  it("returns null when a success body is not valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not-json", { status: 200 })),
    )
    await expect(apiGet("/x")).resolves.toBeNull()
  })
})
