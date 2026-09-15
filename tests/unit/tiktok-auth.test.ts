import { describe, expect, it } from "vitest"
import { parseQrCheck, parseQrSession } from "@/lib/parsers/tiktok-auth"

const QR_PNG_PREFIX = "iVBORw0KGgoAAAANSUhEUgAAAgAAAAIAAQMAAADOtka5"

describe("parseQrSession", () => {
  it("parses the get_qrcode response shape", () => {
    const payload = {
      data: {
        app_name: "TikTok PWA",
        expire_time: 1789481381,
        qrcode: QR_PNG_PREFIX,
        token: "abc",
      },
      message: "success",
    }
    expect(parseQrSession(payload)).toEqual({
      qrDataUrl: `data:image/png;base64,${QR_PNG_PREFIX}`,
      expiresAt: 1789481381000,
    })
  })

  it("accepts an already-prefixed data url", () => {
    const payload = { data: { qrcode: "data:image/png;base64,AAAA", expire_time: 10 } }
    expect(parseQrSession(payload)?.qrDataUrl).toBe("data:image/png;base64,AAAA")
  })

  it("falls back to a default expiry when expire_time is missing", () => {
    const before = Date.now()
    const session = parseQrSession({ data: { qrcode: QR_PNG_PREFIX } })
    expect(session?.expiresAt).toBeGreaterThanOrEqual(before + 119_000)
  })

  it("returns null for malformed payloads", () => {
    expect(parseQrSession(null)).toBeNull()
    expect(parseQrSession({})).toBeNull()
    expect(parseQrSession({ data: {} })).toBeNull()
    expect(parseQrSession({ data: { qrcode: 42 } })).toBeNull()
  })
})

describe("parseQrCheck", () => {
  it("detects the real rate-limit response (error_code 7)", () => {
    const payload = {
      data: {
        captcha: "",
        desc_url: "",
        description: "Maximum number of attempts reached. Try again later.",
        error_code: 7,
      },
      message: "error",
    }
    expect(parseQrCheck(payload)).toEqual({
      state: "rate_limited",
      description: "Maximum number of attempts reached. Try again later.",
    })
  })

  it("treats other error messages as generic errors", () => {
    expect(parseQrCheck({ data: { description: "Something else", error_code: 9 }, message: "error" })).toEqual({
      state: "error",
      description: "Something else",
    })
  })

  it("detects waiting state from a success message without status hints", () => {
    expect(parseQrCheck({ data: {}, message: "success" })).toEqual({ state: "waiting" })
  })

  it("detects scanned state", () => {
    expect(parseQrCheck({ data: { scan_status: "scanned" }, message: "success" }).state).toBe("scanned")
  })

  it("detects expired state", () => {
    expect(parseQrCheck({ data: { status: "expired" }, message: "success" }).state).toBe("expired")
  })

  it("detects confirmed state from a user id", () => {
    expect(parseQrCheck({ data: { user_id: "123" }, message: "success" }).state).toBe("confirmed")
  })

  it("returns error for malformed payloads", () => {
    expect(parseQrCheck(null)).toEqual({ state: "error" })
    expect(parseQrCheck("nope")).toEqual({ state: "error" })
  })
})
