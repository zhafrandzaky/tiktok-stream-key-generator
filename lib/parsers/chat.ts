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

function parseUser(value: unknown): ChatUser | null {
  const record = asRecord(value)
  if (!record) return null
  const uniqueId = asString(record.uniqueId, 100)
  if (!uniqueId) return null
  const nickname = asString(record.nickname, 100) ?? uniqueId
  const avatarUrl = asString(record.profilePictureUrl, 500)
  return avatarUrl ? { uniqueId, nickname, avatarUrl } : { uniqueId, nickname }
}

export function normalizeWebcastEvent(eventName: string, data: unknown, at: number = Date.now()): ChatEvent | null {
  const record = asRecord(data)

  switch (eventName) {
    case "chat": {
      if (!record) return null
      const user = parseUser(record.user)
      if (!user) return null
      return { type: "chat", user, comment: asString(record.comment, 500) ?? "", at }
    }

    case "gift": {
      if (!record) return null
      const user = parseUser(record.user)
      if (!user) return null
      const details = asRecord(record.giftDetails)
      const repeatCount = asNumber(record.repeatCount) ?? 1
      const diamondCount = asNumber(details?.diamondCount)
      const diamonds = diamondCount !== undefined ? diamondCount * repeatCount : undefined
      const giftId = asString(String(record.giftId ?? "")) ?? ""
      const giftName = asString(details?.giftName, 100)
      return {
        type: "gift",
        user,
        giftId,
        ...(giftName ? { giftName } : {}),
        repeatCount,
        ...(diamonds !== undefined ? { diamonds } : {}),
        streakEnd: record.repeatEnd !== false,
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
      const action = asString(record.action)?.toLowerCase()
      if (action === "follow") return { type: "follow", user, at }
      if (action === "share") return { type: "share", user, at }
      return null
    }

    case "like": {
      if (!record) return null
      const user = parseUser(record.user)
      const count = asNumber(record.likeCount) ?? 1
      const total = asNumber(record.totalLikeCount)
      return { type: "like", ...(user ? { user } : {}), count, ...(total !== undefined ? { total } : {}), at }
    }

    case "member": {
      if (!record) return null
      const user = parseUser(record.user)
      if (!user) return null
      const viewerCount = asNumber(record.memberCount)
      return { type: "member", user, ...(viewerCount !== undefined ? { viewerCount } : {}), at }
    }

    case "roomUser": {
      if (!record) return null
      const count = asNumber(record.viewerCount)
      if (count === undefined) return null
      return { type: "viewerCount", count, at }
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
