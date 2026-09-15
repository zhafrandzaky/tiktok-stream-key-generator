import { describe, expect, it } from "vitest"
import { extractRtmp, findRtmpPayload, RtmpParseError } from "@/lib/parsers/rtmp"

describe("findRtmpPayload", () => {
  it("finds split stream_url + stream_key at top level", () => {
    expect(
      findRtmpPayload({ stream_url: "rtmp://push.example.com/live", stream_key: "sk-123" }),
    ).toEqual({ streamUrl: "rtmp://push.example.com/live", streamKey: "sk-123" })
  })

  it("finds camelCase rtmpPushUrl + streamKey", () => {
    expect(findRtmpPayload({ rtmpPushUrl: "rtmp://push.example.com/live", streamKey: "sk-9" })).toEqual({
      pushUrl: "rtmp://push.example.com/live",
      streamKey: "sk-9",
    })
  })

  it("finds nested payloads", () => {
    const payload = { data: { room: { push_url: "rtmp://cdn/app", stream_key: "nested-1" } } }
    expect(findRtmpPayload(payload)).toEqual({ pushUrl: "rtmp://cdn/app", streamKey: "nested-1" })
  })

  it("returns null when no rtmp fields exist", () => {
    expect(findRtmpPayload({ status_code: 400, message: "nope" })).toBeNull()
  })

  it("ignores non-rtmp urls", () => {
    expect(findRtmpPayload({ push_url: "https://example.com/not-rtmp" })).toBeNull()
  })

  it("stops at depth bound without throwing", () => {
    let deep: Record<string, unknown> = { stream_key: "too-deep" }
    for (let i = 0; i < 12; i++) deep = { child: deep }
    expect(findRtmpPayload(deep)).toBeNull()
  })
})

describe("extractRtmp", () => {
  it("extracts a split pair", () => {
    expect(
      extractRtmp(JSON.stringify({ stream_url: "rtmp://push.example.com/live", stream_key: "sk-1" })),
    ).toEqual({
      rtmpUrl: "rtmp://push.example.com/live",
      streamKey: "sk-1",
      combinedPushUrl: "rtmp://push.example.com/live/sk-1",
    })
  })

  it("treats push_url as server url when a stream key is present", () => {
    expect(extractRtmp(JSON.stringify({ push_url: "rtmp://cdn/app", stream_key: "nested-1" }))).toEqual({
      rtmpUrl: "rtmp://cdn/app",
      streamKey: "nested-1",
      combinedPushUrl: "rtmp://cdn/app/nested-1",
    })
  })

  it("splits a combined push URL of form rtmp://host/app/key", () => {
    expect(extractRtmp(JSON.stringify({ push_url: "rtmp://push.example.com/live/stream-key-abc" }))).toEqual({
      rtmpUrl: "rtmp://push.example.com/live",
      streamKey: "stream-key-abc",
      combinedPushUrl: "rtmp://push.example.com/live/stream-key-abc",
    })
  })

  it("parses query-style combined URLs", () => {
    expect(extractRtmp(JSON.stringify({ push_url: "rtmp://push.example.com/live?key=abc123" }))).toEqual({
      rtmpUrl: "rtmp://push.example.com/live",
      streamKey: "abc123",
      combinedPushUrl: "rtmp://push.example.com/live?key=abc123",
    })
  })

  it("ignores non-rtmp strings", () => {
    expect(() => extractRtmp(JSON.stringify({ push_url: "https://example.com/not-rtmp" }))).toThrow(
      RtmpParseError,
    )
  })

  it("throws on invalid json", () => {
    expect(() => extractRtmp("not json")).toThrow(RtmpParseError)
  })

  it("throws when nothing matches", () => {
    expect(() => extractRtmp(JSON.stringify({ message: "no rtmp here" }))).toThrow(RtmpParseError)
  })

  it("throws when only a stream key exists without a server url", () => {
    expect(() => extractRtmp(JSON.stringify({ stream_key: "sk-1" }))).toThrow(RtmpParseError)
  })

  it("does not leak the stream key in error messages", () => {
    try {
      extractRtmp(JSON.stringify({ stream_key: "super-secret-key" }))
      expect.unreachable()
    } catch (error) {
      expect((error as Error).message).not.toContain("super-secret-key")
    }
  })
})
