import type { LiveRoomResult } from "@/lib/types"
import { extractRtmp, RtmpParseError } from "./rtmp"

export function parseRoomCreateResponse(body: string): LiveRoomResult | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return null
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null

  const root = parsed as { status_code?: unknown; data?: unknown }
  if (root.status_code !== 0) return null

  const data =
    typeof root.data === "object" && root.data !== null
      ? (root.data as Record<string, unknown>)
      : {}

  let rtmp
  try {
    rtmp = extractRtmp(body)
  } catch (error) {
    if (error instanceof RtmpParseError) return null
    throw error
  }

  const roomId = typeof data.id_str === "string" && data.id_str.length > 0 ? data.id_str : undefined
  return {
    ...rtmp,
    ...(roomId ? { roomId } : {}),
    applied: ["title"],
  }
}
