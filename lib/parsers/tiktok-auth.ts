export type QrSession = {
  qrDataUrl: string
  expiresAt: number
}

export type QrCheckState = "waiting" | "scanned" | "confirmed" | "expired" | "rate_limited" | "error"

export type QrCheck = {
  state: QrCheckState
  description?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

export function parseQrSession(payload: unknown): QrSession | null {
  const data = asRecord(asRecord(payload)?.data)
  if (!data) return null
  const qrcode = asString(data.qrcode)
  if (!qrcode) return null
  const expireSeconds = asNumber(data.expire_time)
  const expiresAt = expireSeconds !== undefined ? expireSeconds * 1000 : Date.now() + 120_000
  return {
    qrDataUrl: qrcode.startsWith("data:") ? qrcode : `data:image/png;base64,${qrcode}`,
    expiresAt,
  }
}

export function parseQrCheck(payload: unknown): QrCheck {
  const root = asRecord(payload)
  if (!root) return { state: "error" }

  const data = asRecord(root.data) ?? {}
  const message = asString(root.message)
  const description = asString(data.description) ?? asString(data.desc)
  const errorCode = asNumber(data.error_code)

  if (message !== undefined && message !== "success") {
    const rateLimited =
      errorCode === 7 || /maximum number of attempts|too many (requests|attempts)/i.test(description ?? "")
    return {
      state: rateLimited ? "rate_limited" : "error",
      ...(description ? { description } : {}),
    }
  }

  const body = JSON.stringify(data).toLowerCase()
  if (asString(data.user_id) || asString(data.uid) || /confirmed|login_success/.test(body)) {
    return { state: "confirmed", ...(description ? { description } : {}) }
  }
  if (/expire/.test(body)) return { state: "expired", ...(description ? { description } : {}) }
  if (/scan/.test(body)) return { state: "scanned", ...(description ? { description } : {}) }
  return { state: "waiting", ...(description ? { description } : {}) }
}
