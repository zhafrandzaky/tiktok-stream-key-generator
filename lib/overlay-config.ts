export type OverlayConfig = {
  theme: "light" | "dark"
  fontSize: number
  max: number
  showGifts: boolean
  showLikes: boolean
  showFollows: boolean
  showViewers: boolean
  showStatus: boolean
  chip: boolean
}

export const DEFAULT_OVERLAY_CONFIG: OverlayConfig = {
  theme: "dark",
  fontSize: 28,
  max: 12,
  showGifts: true,
  showLikes: false,
  showFollows: true,
  showViewers: true,
  showStatus: true,
  chip: true,
}

function parseBoolean(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback
  const lower = value.toLowerCase()
  if (["1", "true", "yes", "on"].includes(lower)) return true
  if (["0", "false", "no", "off"].includes(lower)) return false
  return fallback
}

function parseNumber(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null) return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

export function parseOverlayConfig(search: string): OverlayConfig {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`)
  return {
    theme: params.get("theme") === "light" ? "light" : "dark",
    fontSize: parseNumber(params.get("fontSize"), DEFAULT_OVERLAY_CONFIG.fontSize, 12, 64),
    max: parseNumber(params.get("max"), DEFAULT_OVERLAY_CONFIG.max, 1, 50),
    showGifts: parseBoolean(params.get("showGifts"), DEFAULT_OVERLAY_CONFIG.showGifts),
    showLikes: parseBoolean(params.get("showLikes"), DEFAULT_OVERLAY_CONFIG.showLikes),
    showFollows: parseBoolean(params.get("showFollows"), DEFAULT_OVERLAY_CONFIG.showFollows),
    showViewers: parseBoolean(params.get("showViewers"), DEFAULT_OVERLAY_CONFIG.showViewers),
    showStatus: parseBoolean(params.get("showStatus"), DEFAULT_OVERLAY_CONFIG.showStatus),
    chip: parseBoolean(params.get("chip"), DEFAULT_OVERLAY_CONFIG.chip),
  }
}
