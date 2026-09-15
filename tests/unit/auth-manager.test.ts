import { describe, expect, it } from "vitest"
import { bumpQrVersion, classifyPageState, hasSessionCookie } from "@/server/engine/auth-manager"

describe("hasSessionCookie", () => {
  it("detects a non-empty sessionid", () => {
    expect(hasSessionCookie([{ name: "sessionid", value: "abc" }])).toBe(true)
  })

  it("rejects empty or missing sessionid", () => {
    expect(hasSessionCookie([{ name: "sessionid", value: "  " }])).toBe(false)
    expect(hasSessionCookie([{ name: "ttwid", value: "x" }])).toBe(false)
    expect(hasSessionCookie([])).toBe(false)
  })
})

describe("classifyPageState", () => {
  it("prefers captcha", () => {
    expect(classifyPageState({ hasQr: true, hasCaptcha: true, url: "https://www.tiktok.com/login" })).toBe("captcha")
  })

  it("detects qr", () => {
    expect(classifyPageState({ hasQr: true, hasCaptcha: false, url: "https://www.tiktok.com/login/qrcode" })).toBe("qr")
  })

  it("detects logged-in after redirect away from login", () => {
    expect(classifyPageState({ hasQr: false, hasCaptcha: false, url: "https://www.tiktok.com/foryou" })).toBe(
      "logged-in",
    )
  })

  it("returns unknown on login pages without qr or captcha", () => {
    expect(classifyPageState({ hasQr: false, hasCaptcha: false, url: "https://www.tiktok.com/login" })).toBe(
      "unknown",
    )
  })
})

describe("bumpQrVersion", () => {
  it("starts at version 1", () => {
    expect(bumpQrVersion(null, "hash-a")).toEqual({ hash: "hash-a", version: 1, changed: true })
  })

  it("keeps the version when the hash is unchanged", () => {
    expect(bumpQrVersion({ hash: "hash-a", version: 3 }, "hash-a")).toEqual({
      hash: "hash-a",
      version: 3,
      changed: false,
    })
  })

  it("bumps the version when the hash changes", () => {
    expect(bumpQrVersion({ hash: "hash-a", version: 3 }, "hash-b")).toEqual({
      hash: "hash-b",
      version: 4,
      changed: true,
    })
  })
})
