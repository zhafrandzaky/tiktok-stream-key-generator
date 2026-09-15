import { NextResponse } from "next/server"
import { EngineError } from "@/server/engine/errors"

const STATUS_BY_CODE: Record<string, number> = {
  AUTH_REQUIRED: 401,
  ALREADY_AUTHENTICATED: 409,
  CAPTCHA: 409,
  NOT_ELIGIBLE: 409,
  NOT_LIVE: 409,
  EXTRACTION_FAILED: 400,
  LOGIN_PAGE_FAILED: 502,
  ENGINE_UNAVAILABLE: 503,
  NOT_IMPLEMENTED: 501,
  BAD_REQUEST: 400,
}

export function routeError(error: unknown): NextResponse {
  if (error instanceof EngineError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: STATUS_BY_CODE[error.code] ?? 500 },
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
  try {
    return (await req.json()) as T
  } catch {
    throw new EngineError("Request body must be valid JSON", "BAD_REQUEST")
  }
}
