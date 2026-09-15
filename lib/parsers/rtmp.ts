export type RtmpFields = {
  streamUrl?: string
  streamKey?: string
  pushUrl?: string
}

export class RtmpParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RtmpParseError"
  }
}

const MAX_DEPTH = 10

const STREAM_URL_KEYS = /^(stream_url|streamurl|rtmp_url|rtmpurl)$/i
const PUSH_URL_KEYS = /^(push_url|pushurl|rtmp_push_url|rtmppushurl)$/i
const STREAM_KEY_KEYS = /^(stream_key|streamkey)$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isRtmpUrl(value: string): boolean {
  const trimmed = value.trim().toLowerCase()
  return trimmed.startsWith("rtmp://") || trimmed.startsWith("rtmps://")
}

export function findRtmpPayload(value: unknown): RtmpFields | null {
  const found: RtmpFields = {}
  let hasKey = false

  const visit = (node: unknown, depth: number): void => {
    if (depth > MAX_DEPTH) return
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item, depth + 1)
        if (found.streamUrl && hasKey) return
      }
      return
    }
    if (!isRecord(node)) return

    for (const [key, val] of Object.entries(node)) {
      if (typeof val !== "string") continue
      const trimmed = val.trim()
      if (!found.streamUrl && STREAM_URL_KEYS.test(key) && isRtmpUrl(trimmed)) {
        found.streamUrl = trimmed
      } else if (!found.pushUrl && PUSH_URL_KEYS.test(key) && isRtmpUrl(trimmed)) {
        found.pushUrl = trimmed
      } else if (!hasKey && STREAM_KEY_KEYS.test(key) && trimmed.length > 0) {
        found.streamKey = trimmed
        hasKey = true
      }
    }

    for (const val of Object.values(node)) {
      if (isRecord(val) || Array.isArray(val)) {
        visit(val, depth + 1)
        if (found.streamUrl && hasKey) return
        if (found.pushUrl && hasKey) return
      }
    }
  }

  visit(value, 0)

  if (!found.streamUrl && !found.pushUrl && !found.streamKey) return null
  return found
}

function buildCombined(serverUrl: string, streamKey: string): string {
  return serverUrl.endsWith("/") ? `${serverUrl}${streamKey}` : `${serverUrl}/${streamKey}`
}

function stripQueryKey(url: string, keys: string[]): { rtmpUrl: string; streamKey: string } | null {
  for (const key of keys) {
    const match = new RegExp(`([?&])${key}=([^&]*)`).exec(url)
    if (!match) continue
    let streamKey = ""
    try {
      streamKey = decodeURIComponent(match[2] ?? "")
    } catch {
      continue
    }
    if (!streamKey) continue
    const cleaned = url
      .replace(new RegExp(`([?&])${key}=[^&]*`), (_, sep: string) => (sep === "?" ? "?" : ""))
      .replace(/\?&/, "?")
      .replace(/\?$/, "")
      .replace(/&$/, "")
    return { rtmpUrl: cleaned, streamKey }
  }
  return null
}

function splitPathKey(url: string): { rtmpUrl: string; streamKey: string } | null {
  const withoutQuery = url.split("?")[0] ?? url
  const lastSlash = withoutQuery.lastIndexOf("/")
  if (lastSlash < 0) return null
  const streamKey = withoutQuery.slice(lastSlash + 1)
  if (streamKey.length < 6) return null
  if (!/[-_\d]/.test(streamKey)) return null
  return { rtmpUrl: withoutQuery.slice(0, lastSlash), streamKey }
}

export function extractRtmp(input: string): {
  rtmpUrl: string
  streamKey: string
  combinedPushUrl: string
} {
  let parsed: unknown
  try {
    parsed = JSON.parse(input)
  } catch {
    throw new RtmpParseError("Payload is not valid JSON")
  }

  const fields = findRtmpPayload(parsed)
  if (!fields) throw new RtmpParseError("No RTMP fields found in the payload")

  if (fields.streamKey) {
    if (fields.streamUrl) {
      return {
        rtmpUrl: fields.streamUrl,
        streamKey: fields.streamKey,
        combinedPushUrl: buildCombined(fields.streamUrl, fields.streamKey),
      }
    }
    if (fields.pushUrl) {
      const split =
        stripQueryKey(fields.pushUrl, ["stream_key", "key", "streamKey"]) ??
        splitPathKey(fields.pushUrl)
      const rtmpUrl = split?.rtmpUrl ?? fields.pushUrl
      return {
        rtmpUrl,
        streamKey: fields.streamKey,
        combinedPushUrl: buildCombined(rtmpUrl, fields.streamKey),
      }
    }
    throw new RtmpParseError("Found a stream key without a server URL")
  }

  if (fields.pushUrl) {
    const fromQuery = stripQueryKey(fields.pushUrl, ["stream_key", "key", "streamKey"])
    if (fromQuery) return { ...fromQuery, combinedPushUrl: fields.pushUrl }

    const fromPath = splitPathKey(fields.pushUrl)
    if (fromPath) return { ...fromPath, combinedPushUrl: fields.pushUrl }

    throw new RtmpParseError("Push URL does not contain a stream key")
  }

  throw new RtmpParseError("Incomplete RTMP payload")
}
