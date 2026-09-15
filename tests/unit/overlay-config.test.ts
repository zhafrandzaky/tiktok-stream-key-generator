import { describe, expect, it } from "vitest"
import { DEFAULT_OVERLAY_CONFIG, parseOverlayConfig } from "@/lib/overlay-config"

describe("parseOverlayConfig", () => {
  it("returns defaults for an empty search", () => {
    expect(parseOverlayConfig("")).toEqual(DEFAULT_OVERLAY_CONFIG)
    expect(parseOverlayConfig("?")).toEqual(DEFAULT_OVERLAY_CONFIG)
  })

  it("parses numbers", () => {
    const config = parseOverlayConfig("?fontSize=36&max=20")
    expect(config.fontSize).toBe(36)
    expect(config.max).toBe(20)
  })

  it("clamps numbers into range", () => {
    expect(parseOverlayConfig("?fontSize=200").fontSize).toBe(64)
    expect(parseOverlayConfig("?fontSize=2").fontSize).toBe(12)
    expect(parseOverlayConfig("?max=0").max).toBe(1)
    expect(parseOverlayConfig("?max=999").max).toBe(50)
  })

  it("falls back on invalid numbers", () => {
    expect(parseOverlayConfig("?fontSize=abc").fontSize).toBe(DEFAULT_OVERLAY_CONFIG.fontSize)
    expect(parseOverlayConfig("?max=NaN").max).toBe(DEFAULT_OVERLAY_CONFIG.max)
  })

  it("parses booleans in several notations", () => {
    expect(parseOverlayConfig("?showGifts=0").showGifts).toBe(false)
    expect(parseOverlayConfig("?showGifts=false").showGifts).toBe(false)
    expect(parseOverlayConfig("?showLikes=1").showLikes).toBe(true)
    expect(parseOverlayConfig("?showLikes=on").showLikes).toBe(true)
    expect(parseOverlayConfig("?showStatus=no").showStatus).toBe(false)
  })

  it("keeps defaults for unknown boolean values", () => {
    expect(parseOverlayConfig("?showGifts=maybe").showGifts).toBe(DEFAULT_OVERLAY_CONFIG.showGifts)
  })

  it("accepts only dark or light for theme", () => {
    expect(parseOverlayConfig("?theme=light").theme).toBe("light")
    expect(parseOverlayConfig("?theme=dark").theme).toBe("dark")
    expect(parseOverlayConfig("?theme=neon").theme).toBe("dark")
  })
})
