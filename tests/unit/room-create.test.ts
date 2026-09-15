import { describe, expect, it } from "vitest"
import { parseRoomCreateResponse } from "@/lib/parsers/room-create"

const PUSH_URL =
  "rtmp://push-rtmp-l10-sg01.tiktokcdn.com/stage/stream-2137703598951235785?amun=true&c=ID&expire=6ab2c0b9&sign=c43f167e"

function fixture(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    status_code: 0,
    data: {
      id_str: "7685821721445796616",
      title: "Test OBS",
      stream_url: { rtmp_push_url: PUSH_URL },
      ...overrides,
    },
  })
}

describe("parseRoomCreateResponse", () => {
  it("extracts credentials and room id from a successful response", () => {
    expect(parseRoomCreateResponse(fixture())).toEqual({
      rtmpUrl: "rtmp://push-rtmp-l10-sg01.tiktokcdn.com/stage",
      streamKey: "stream-2137703598951235785?amun=true&c=ID&expire=6ab2c0b9&sign=c43f167e",
      combinedPushUrl: PUSH_URL,
      roomId: "7685821721445796616",
      applied: ["title"],
    })
  })

  it("returns null when status_code is not 0", () => {
    expect(parseRoomCreateResponse(JSON.stringify({ status_code: 10011, data: {} }))).toBeNull()
  })

  it("returns null when the payload has no rtmp fields", () => {
    expect(parseRoomCreateResponse(fixture({ stream_url: undefined }))).toBeNull()
  })

  it("returns null for invalid JSON or non-object payloads", () => {
    expect(parseRoomCreateResponse("not json")).toBeNull()
    expect(parseRoomCreateResponse("[]")).toBeNull()
    expect(parseRoomCreateResponse("null")).toBeNull()
  })

  it("omits roomId when id_str is missing", () => {
    const parsed = parseRoomCreateResponse(fixture({ id_str: undefined }))
    expect(parsed).not.toBeNull()
    expect(parsed).not.toHaveProperty("roomId")
  })
})
