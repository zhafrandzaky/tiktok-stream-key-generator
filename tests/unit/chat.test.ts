import { describe, expect, it } from "vitest"
import { normalizeWebcastEvent } from "@/lib/parsers/chat"

const at = 1000

describe("normalizeWebcastEvent", () => {
  it("normalizes chat", () => {
    const data = {
      user: { uniqueId: "alice", nickname: "Alice", profilePictureUrl: "https://img/a.jpg" },
      comment: "hello",
    }
    expect(normalizeWebcastEvent("chat", data, at)).toEqual({
      type: "chat",
      user: { uniqueId: "alice", nickname: "Alice", avatarUrl: "https://img/a.jpg" },
      comment: "hello",
      at,
    })
  })

  it("drops chat without uniqueId", () => {
    expect(normalizeWebcastEvent("chat", { comment: "hi" }, at)).toBeNull()
  })

  it("marks gift streak end", () => {
    const data = {
      user: { uniqueId: "bob", nickname: "Bob" },
      giftId: 5655,
      repeatCount: 3,
      repeatEnd: true,
      giftDetails: { giftName: "Rose", giftType: 1, diamondCount: 2 },
    }
    expect(normalizeWebcastEvent("gift", data, at)).toMatchObject({
      type: "gift",
      giftName: "Rose",
      repeatCount: 3,
      diamonds: 6,
      streakEnd: true,
    })
  })

  it("marks gift streak in progress", () => {
    const data = {
      user: { uniqueId: "bob", nickname: "Bob" },
      giftId: 1,
      repeatCount: 1,
      repeatEnd: false,
      giftDetails: { giftType: 1, diamondCount: 5 },
    }
    expect(normalizeWebcastEvent("gift", data, at)).toMatchObject({ streakEnd: false, diamonds: 5 })
  })

  it("treats missing repeatEnd as streak end", () => {
    const data = { user: { uniqueId: "bob", nickname: "Bob" }, giftId: 2, giftDetails: { diamondCount: 1 } }
    expect(normalizeWebcastEvent("gift", data, at)).toMatchObject({ streakEnd: true, repeatCount: 1 })
  })

  it("normalizes follow and share", () => {
    expect(normalizeWebcastEvent("follow", { user: { uniqueId: "c", nickname: "C" } }, at)).toMatchObject({
      type: "follow",
      user: { uniqueId: "c" },
    })
    expect(normalizeWebcastEvent("share", { user: { uniqueId: "c", nickname: "C" } }, at)).toMatchObject({
      type: "share",
    })
  })

  it("maps social actions to follow or share", () => {
    expect(
      normalizeWebcastEvent("social", { user: { uniqueId: "s", nickname: "S" }, action: "follow" }, at),
    ).toMatchObject({ type: "follow" })
    expect(
      normalizeWebcastEvent("social", { user: { uniqueId: "s", nickname: "S" }, action: "share" }, at),
    ).toMatchObject({ type: "share" })
    expect(
      normalizeWebcastEvent("social", { user: { uniqueId: "s", nickname: "S" }, action: "mystery" }, at),
    ).toBeNull()
  })

  it("normalizes like counts", () => {
    expect(
      normalizeWebcastEvent(
        "like",
        { user: { uniqueId: "d", nickname: "D" }, likeCount: 5, totalLikeCount: 99 },
        at,
      ),
    ).toMatchObject({ type: "like", count: 5, total: 99 })
  })

  it("normalizes member join with viewer count", () => {
    expect(
      normalizeWebcastEvent("member", { user: { uniqueId: "e", nickname: "E" }, memberCount: 42 }, at),
    ).toMatchObject({ type: "member", viewerCount: 42 })
  })

  it("normalizes roomUser viewer count", () => {
    expect(normalizeWebcastEvent("roomUser", { viewerCount: 123 }, at)).toEqual({
      type: "viewerCount",
      count: 123,
      at,
    })
  })

  it("normalizes streamEnd", () => {
    expect(normalizeWebcastEvent("streamEnd", { action: 3 }, at)).toEqual({
      type: "streamEnd",
      reason: "action:3",
      at,
    })
    expect(normalizeWebcastEvent("streamEnd", {}, at)).toEqual({ type: "streamEnd", reason: "ended", at })
  })

  it("normalizes control events to status", () => {
    expect(normalizeWebcastEvent("connected", { roomId: "r1" }, at)).toEqual({
      type: "status",
      state: "connected",
      detail: "r1",
      at,
    })
    expect(normalizeWebcastEvent("disconnected", { code: 1000 }, at)).toEqual({
      type: "status",
      state: "disconnected",
      detail: "1000",
      at,
    })
    expect(normalizeWebcastEvent("error", { info: "boom" }, at)).toEqual({
      type: "status",
      state: "error",
      detail: "boom",
      at,
    })
  })

  it("returns null for unknown events", () => {
    expect(normalizeWebcastEvent("emote", {}, at)).toBeNull()
    expect(normalizeWebcastEvent("chat", null, at)).toBeNull()
    expect(normalizeWebcastEvent("roomUser", { viewerCount: "many" }, at)).toBeNull()
  })
})
