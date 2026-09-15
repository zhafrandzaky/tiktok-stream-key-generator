export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly retryAfter?: number

  constructor(message: string, code: string, status: number, retryAfter?: number) {
    super(message)
    this.name = "ApiError"
    this.code = code
    this.status = status
    if (retryAfter !== undefined) this.retryAfter = retryAfter
  }
}

type ParsedError = {
  code: string
  message: string
  retryAfter?: number
}

function parseErrorPayload(payload: unknown, status: number): ParsedError {
  const body = (typeof payload === "object" && payload !== null ? payload : {}) as {
    error?: unknown
    message?: unknown
    retryAfter?: unknown
  }
  const retryAfter = typeof body.retryAfter === "number" ? body.retryAfter : undefined
  const fallbackMessage = `Request failed with status ${status}`

  if (typeof body.error === "string") {
    return {
      code: body.error,
      message: typeof body.message === "string" ? body.message : fallbackMessage,
      ...(retryAfter !== undefined ? { retryAfter } : {}),
    }
  }

  const nested = (typeof body.error === "object" && body.error !== null ? body.error : {}) as {
    code?: unknown
    message?: unknown
  }
  return {
    code: typeof nested.code === "string" ? nested.code : "UNKNOWN",
    message: typeof nested.message === "string" ? nested.message : fallbackMessage,
    ...(retryAfter !== undefined ? { retryAfter } : {}),
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  })

  if (response.status === 204) return undefined as T

  const payload: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const parsed = parseErrorPayload(payload, response.status)
    throw new ApiError(parsed.message, parsed.code, response.status, parsed.retryAfter)
  }

  return payload as T
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path)
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}
