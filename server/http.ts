import { NextResponse } from "next/server"
import { EngineError } from "@/server/engine/errors"

const STATUS_BY_CODE: Record<string, number> = {
  AUTH_REQUIRED: 401,
  ALREADY_AUTHENTICATED: 409,
  CAPTCHA: 409,
  NOT_ELIGIBLE: 409,
  NOT_LIVE: 409,
  LOGIN_RATE_LIMITED: 429,
  EXTRACTION_FAILED: 400,
  LOGIN_PAGE_FAILED: 502,
  ENGINE_UNAVAILABLE: 503,
  NOT_IMPLEMENTED: 501,
  BAD_REQUEST: 400,
}

export type EngineErrorLike = {
  code: string
  message: string
  retryAfter?: number
}

export function toEngineErrorLike(error: unknown): EngineErrorLike | null {
  if (error instanceof EngineError) return error
  if (!(error instanceof Error)) return null
  const candidate = error as Error & {
    isEngineError?: unknown
    code?: unknown
    retryAfter?: unknown
  }
  if (candidate.isEngineError !== true || typeof candidate.code !== "string") return null
  return {
    code: candidate.code,
    message: error.message,
    ...(typeof candidate.retryAfter === "number" ? { retryAfter: candidate.retryAfter } : {}),
  }
}

export function routeError(error: unknown): NextResponse {
  const engineError = toEngineErrorLike(error)
  if (engineError) {
    const status = STATUS_BY_CODE[engineError.code] ?? 500
    if (engineError.code === "LOGIN_RATE_LIMITED") {
      return NextResponse.json(
        {
          error: "LOGIN_RATE_LIMITED",
          message: engineError.message,
          retryAfter: engineError.retryAfter ?? 300,
        },
        { status: 429 },
      )
    }
    return NextResponse.json(
      { error: { code: engineError.code, message: engineError.message } },
      { status },
    )
  }
  console.error("[api] unhandled error", error)
  return NextResponse.json(
    { error: { code: "INTERNAL", message: "Something went wrong." } },
    { status: 500 },
  )
}

export async function jsonRoute(handler: () => Promise<unknown>): Promise<NextResponse> {
  try {
    const data = await handler()
    if (data === undefined) return new NextResponse(null, { status: 204 })
    return NextResponse.json(data)
  } catch (error) {
    return routeError(error)
  }
}

export async function readJsonBody<T>(req: Request): Promise<T> {
  const contentType = req.headers.get("content-type") ?? ""
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new EngineError("Content-Type must be application/json.", "BAD_REQUEST")
  }
  try {
    return (await req.json()) as T
  } catch {
    throw new EngineError("Request body must be valid JSON", "BAD_REQUEST")
  }
}

export async function readOptionalJsonBody<T>(req: Request): Promise<T | null> {
  const raw = await req.text().catch(() => "")
  if (!raw.trim()) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    throw new EngineError("Request body must be valid JSON", "BAD_REQUEST")
  }
}
