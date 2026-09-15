import type { ChatEvent, ChatUser } from "@/lib/types"

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown, maxLength = 300): string | undefined {
  return typeof value === "string" && value.length > 0 ? value.slice(0, maxLength) : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function asCount(value: unknown): number | undefined {
  const direct = asNumber(value)
  if (direct !== undefined) return Math.max(0, Math.round(direct))
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed >= 0) return Math.round(parsed)
  }
  return undefined
}

function firstAvatarUrl(record: Record<string, unknown>): string | undefined {
  for (const key of ["avatarThumb", "avatarMedium", "avatarLarge", "avatarJpg", "profilePicture"]) {
    const image = asRecord(record[key])
    if (!image) continue
    const urls = image.urlList ?? image.urls
    if (Array.isArray(urls)) {
      const first = urls.find((url) => typeof url === "string" && url.length > 0)
      if (typeof first === "string") return first.slice(0, 500)
    }
    const direct = asString(image.url, 500)
    if (direct) return direct
  }
  return asString(record.profilePictureUrl, 500)
}

function parseUser(value: unknown): ChatUser | null {
  const record = asRecord(value)
  if (!record) return null
  const uniqueId =
    asString(record.uniqueId, 100) ??
    asString(record.displayId, 100) ??
    asString(record.idStr, 100) ??
    asString(record.userId, 100) ??
    asString(record.id, 100)
  if (!uniqueId) return null
  const nickname = asString(record.nickname, 100) ?? uniqueId
  const avatarUrl = firstAvatarUrl(record)
  return avatarUrl ? { uniqueId, nickname, avatarUrl } : { uniqueId, nickname }
}

function giftStreakEnded(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (value === true) return true
  if (value === false) return false
  if (value === 1 || value === "1" || value === "true") return true
  return false
}

export function normalizeWebcastEvent(eventName: string, data: unknown, at: number = Date.now()): ChatEvent | null {
  const record = asRecord(data)

  switch (eventName) {
    case "chat": {
      if (!record) return null
      const user = parseUser(record.user)
      if (!user) return null
      const comment = asString(record.content, 500) ?? asString(record.comment, 500) ?? ""
      return { type: "chat", user, comment, at }
    }

    case "gift": {
      if (!record) return null
      const user = parseUser(record.user)
      if (!user) return null
      const details = asRecord(record.giftDetails)
      const extended = asRecord(record.extendedGiftInfo)
      const repeatCount = asNumber(record.repeatCount) ?? 1
      const diamondCount = asNumber(details?.diamondCount) ?? asNumber(extended?.diamondCount)
      const diamonds = diamondCount !== undefined ? diamondCount * repeatCount : undefined
      const giftId = record.giftId !== undefined && record.giftId !== null ? String(record.giftId) : ""
      const giftName =
        asString(details?.giftName, 100) ?? asString(extended?.name, 100) ?? asString(extended?.giftName, 100)
      return {
        type: "gift",
        user,
        giftId,
        ...(giftName ? { giftName } : {}),
        repeatCount,
        ...(diamonds !== undefined ? { diamonds } : {}),
        streakEnd: giftStreakEnded(record.repeatEnd),
        at,
      }
    }

    case "follow":
    case "share": {
      if (!record) return null
      const user = parseUser(record.user)
      if (!user) return null
      return { type: eventName, user, at }
    }

    case "social": {
      if (!record) return null
      const user = parseUser(record.user)
      if (!user) return null
      const shareCount = asCount(record.shareCount) ?? 0
      const followCount = asCount(record.followCount) ?? 0
      const action = asString(record.action)?.toLowerCase()
      if (shareCount > 0 || record.shareType !== undefined || action === "share") {
        return { type: "share", user, at }
      }
      if (followCount > 0 || action === "follow") {
        return { type: "follow", user, at }
      }
      return null
    }

    case "like": {
      if (!record) return null
      const user = parseUser(record.user)
      const count = asCount(record.count) ?? asCount(record.likeCount) ?? 1
      const total = asCount(record.total) ?? asCount(record.totalLikeCount)
      return {
        type: "like",
        ...(user ? { user } : {}),
        count,
        ...(total !== undefined ? { total } : {}),
        at,
      }
    }

    case "member": {
      if (!record) return null
      const user = parseUser(record.user)
      if (!user) return null
      const viewerCount = asCount(record.memberCount)
      return { type: "member", user, ...(viewerCount !== undefined ? { viewerCount } : {}), at }
    }

    case "roomUser": {
      if (!record) return null
      const count = asCount(record.viewerCount) ?? asCount(record.total) ?? asCount(record.totalUser)
      if (count === undefined) return null
      const cumulative = asCount(record.totalUser)
      return {
        type: "viewerCount",
        count,
        ...(cumulative !== undefined && cumulative !== count ? { total: cumulative } : {}),
        at,
      }
    }

    case "streamEnd": {
      const action = asNumber(record?.action)
      return { type: "streamEnd", reason: action !== undefined ? `action:${action}` : "ended", at }
    }

    case "connected": {
      const detail = asString(record?.roomId)
      return { type: "status", state: "connected", ...(detail ? { detail } : {}), at }
    }

    case "disconnected": {
      const code = asNumber(record?.code)
      const detail = code !== undefined ? String(code) : undefined
      return { type: "status", state: "disconnected", ...(detail ? { detail } : {}), at }
    }

    case "error": {
      const info = asString(record?.info, 300)
      return { type: "status", state: "error", ...(info ? { detail: info } : {}), at }
    }

    default:
      return null
  }
}
