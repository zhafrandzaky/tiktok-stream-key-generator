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

  const streamUrl =
    typeof data.stream_url === "object" && data.stream_url !== null
      ? (data.stream_url as Record<string, unknown>)
      : {}

  const candidateResolutions = Array.isArray(streamUrl.candidate_resolution)
    ? streamUrl.candidate_resolution.filter((item): item is string => typeof item === "string")
    : undefined

  const nameMap =
    typeof streamUrl.resolution_name === "object" && streamUrl.resolution_name !== null
      ? (streamUrl.resolution_name as Record<string, unknown>)
      : null
  const resolutionOptions = nameMap
    ? Object.entries(nameMap)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string")
        .map(([key, label]) => ({ key, label }))
    : undefined

  return {
    ...rtmp,
    ...(roomId ? { roomId } : {}),
    applied: ["title"],
    ...(candidateResolutions && candidateResolutions.length > 0 ? { candidateResolutions } : {}),
    ...(resolutionOptions && resolutionOptions.length > 0 ? { resolutionOptions } : {}),
  }
}

export const LIVE_ROOM_STATUSES = new Set([1, 2, 3])

export function isLiveRoomStatus(status: unknown): boolean {
  return typeof status === "number" && LIVE_ROOM_STATUSES.has(status)
}

export function parseRoomCreateInfo(body: string): { liveStatus?: number; roomId?: string } | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return null
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null
  const root = parsed as { data?: unknown }
  const data =
    typeof root.data === "object" && root.data !== null
      ? (root.data as Record<string, unknown>)
      : {}
  const liveStatus = typeof data.live_status === "number" ? data.live_status : undefined
  const roomId =
    typeof data.last_room_id_str === "string" && data.last_room_id_str.length > 0
      ? data.last_room_id_str
      : undefined
  return {
    ...(liveStatus !== undefined ? { liveStatus } : {}),
    ...(roomId ? { roomId } : {}),
  }
}
