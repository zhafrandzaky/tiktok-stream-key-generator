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

  it("prefers `total` for current viewers and reports `totalUser` as cumulative total", () => {
    expect(normalizeWebcastEvent("roomUser", { total: "2675", totalUser: "368215" }, at)).toEqual({
      type: "viewerCount",
      count: 2675,
      total: 368215,
      at,
    })
  })

  it("omits the cumulative total when it equals the current count", () => {
    expect(normalizeWebcastEvent("roomUser", { total: 400, totalUser: 400 }, at)).toEqual({
      type: "viewerCount",
      count: 400,
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

  it("handles missing optional fields defensively", () => {
    expect(normalizeWebcastEvent("chat", { user: { uniqueId: "a", nickname: "A" } }, at)).toMatchObject({
      comment: "",
    })
    expect(normalizeWebcastEvent("gift", { user: { uniqueId: "a", nickname: "A" } }, at)).toMatchObject({
      giftId: "",
      repeatCount: 1,
      streakEnd: true,
    })
    expect(normalizeWebcastEvent("gift", { user: { uniqueId: "a", nickname: "A" } }, at)).not.toHaveProperty(
      "diamonds",
    )
    expect(normalizeWebcastEvent("gift", { giftDetails: {} }, at)).toBeNull()
    expect(normalizeWebcastEvent("follow", {}, at)).toBeNull()
    expect(normalizeWebcastEvent("member", { user: { uniqueId: "a", nickname: "A" } }, at)).not.toHaveProperty(
      "viewerCount",
    )
    expect(normalizeWebcastEvent("social", { user: { uniqueId: "a", nickname: "A" } }, at)).toBeNull()
    expect(normalizeWebcastEvent("status", {}, at)).toBeNull()
  })

  it("normalizes likes without a user and with default count", () => {
    expect(normalizeWebcastEvent("like", {}, at)).toEqual({ type: "like", count: 1, at })
  })

  it("normalizes control events without details", () => {
    expect(normalizeWebcastEvent("connected", {}, at)).toEqual({ type: "status", state: "connected", at })
    expect(normalizeWebcastEvent("disconnected", {}, at)).toEqual({
      type: "status",
      state: "disconnected",
      at,
    })
    expect(normalizeWebcastEvent("error", {}, at)).toEqual({ type: "status", state: "error", at })
  })
})

describe("normalizeWebcastEvent with real tiktok payload shapes", () => {
  const realUser = {
    id: "7605171734949528584",
    nickname: "YINGSAN_^~^",
    displayId: "yingsan_tt",
    avatarThumb: { urlList: ["https://p16.example/avt.webp"] },
  }

  it("reads chat text from `content` and the handle from displayId", () => {
    expect(normalizeWebcastEvent("chat", { user: realUser, content: "Mano ni" }, at)).toEqual({
      type: "chat",
      user: {
        uniqueId: "yingsan_tt",
        nickname: "YINGSAN_^~^",
        avatarUrl: "https://p16.example/avt.webp",
      },
      comment: "Mano ni",
      at,
    })
  })

  it("falls back to idStr or numeric id when displayId is absent", () => {
    const withoutDisplayId = {
      id: realUser.id,
      nickname: realUser.nickname,
      avatarThumb: realUser.avatarThumb,
    }
    expect(normalizeWebcastEvent("chat", { user: withoutDisplayId, content: "hi" }, at)).toMatchObject({
      user: { uniqueId: "7605171734949528584" },
    })
    expect(
      normalizeWebcastEvent("chat", { user: { id: "42", idStr: "42" }, content: "hi" }, at),
    ).toMatchObject({ user: { uniqueId: "42" } })
  })

  it("normalizes likes from count/total", () => {
    expect(
      normalizeWebcastEvent("like", { user: realUser, count: 12, total: "123502" }, at),
    ).toMatchObject({ type: "like", count: 12, total: 123502 })
  })

  it("normalizes viewer counts from totalUser", () => {
    expect(normalizeWebcastEvent("roomUser", { totalUser: "264774", ranks: [] }, at)).toEqual({
      type: "viewerCount",
      count: 264774,
      at,
    })
  })

  it("treats numeric repeatEnd values correctly for gift streaks", () => {
    const gift = (repeatEnd: number) => ({
      user: realUser,
      giftId: 5655,
      repeatCount: 3,
      repeatEnd,
      giftDetails: { giftName: "Rose", diamondCount: 2 },
    })
    expect(normalizeWebcastEvent("gift", gift(0), at)).toMatchObject({ streakEnd: false, diamonds: 6 })
    expect(normalizeWebcastEvent("gift", gift(1), at)).toMatchObject({ streakEnd: true })
  })

  it("classifies social events by followCount/shareCount", () => {
    expect(
      normalizeWebcastEvent("social", { user: realUser, followCount: "1", shareCount: "0" }, at),
    ).toMatchObject({ type: "follow" })
    expect(
      normalizeWebcastEvent("social", { user: realUser, followCount: "0", shareCount: "1" }, at),
    ).toMatchObject({ type: "share" })
    expect(normalizeWebcastEvent("social", { user: realUser, followCount: "0" }, at)).toBeNull()
  })

  it("normalizes member joins from real payloads", () => {
    expect(
      normalizeWebcastEvent("member", { user: realUser, memberCount: 264774, action: 1 }, at),
    ).toMatchObject({ type: "member", viewerCount: 264774 })
  })
})
