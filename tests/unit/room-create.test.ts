import { describe, expect, it } from "vitest"
import { isLiveRoomStatus, parseRoomCreateInfo, parseRoomCreateResponse } from "@/lib/parsers/room-create"

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

describe("isLiveRoomStatus", () => {
  it("treats PREPARE(1), ONLINE(2) and PAUSE(3) as an existing live room", () => {
    expect([1, 2, 3].every((status) => isLiveRoomStatus(status))).toBe(true)
  })

  it("treats OFFLINE(4), DEFAULT(0), SUSPENDED(-1), LIVE_AND_LEAVE(-2) and unknowns as not live", () => {
    expect([4, 0, -1, -2, undefined, "2", null].every((status) => !isLiveRoomStatus(status))).toBe(true)
  })
})

describe("parseRoomCreateInfo", () => {
  it("reads live_status and last_room_id_str", () => {
    const body = JSON.stringify({ status_code: 0, data: { live_status: 2, last_room_id_str: "7685" } })
    expect(parseRoomCreateInfo(body)).toEqual({ liveStatus: 2, roomId: "7685" })
  })

  it("returns partial data and tolerates malformed bodies", () => {
    expect(parseRoomCreateInfo(JSON.stringify({ data: { live_status: 4 } }))).toEqual({ liveStatus: 4 })
    expect(parseRoomCreateInfo(JSON.stringify({ data: {} }))).toEqual({})
    expect(parseRoomCreateInfo("not json")).toBeNull()
  })
})
