import { describe, expect, it } from "vitest"
import { couldContainRtmp } from "@/server/engine/live-room"

describe("couldContainRtmp", () => {
  it("accepts json payloads that mention rtmp fields", () => {
    expect(couldContainRtmp("application/json; charset=utf-8", '{"stream_url":"rtmp://x","stream_key":"y"}')).toBe(
      true,
    )
    expect(couldContainRtmp("application/json", '{"data":{"push_url":"rtmp://x/y"}}')).toBe(true)
  })

  it("rejects json without rtmp hints", () => {
    expect(couldContainRtmp("application/json", '{"status_code":0,"data":{}}')).toBe(false)
  })

  it("accepts text/plain payloads with rtmp hints", () => {
    expect(couldContainRtmp("text/plain", "rtmp://push.example.com/live stream_key=abc")).toBe(true)
  })

  it("rejects non-text content types", () => {
    expect(couldContainRtmp("image/png", "stream_url rtmp")).toBe(false)
    expect(couldContainRtmp(null, "stream_url rtmp")).toBe(false)
  })

  it("rejects html responses", () => {
    expect(couldContainRtmp("text/html; charset=utf-8", "<html>stream_url rtmp</html>")).toBe(false)
  })

  it("rejects oversized bodies", () => {
    const huge = `{"stream_url":"rtmp://x","pad":"${"a".repeat(600_000)}"}`
    expect(couldContainRtmp("application/json", huge)).toBe(false)
  })

  it("rejects empty bodies", () => {
    expect(couldContainRtmp("application/json", "")).toBe(false)
  })
})
