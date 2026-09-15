import { NextResponse } from "next/server"
import { EngineUnavailableError } from "@/server/engine/errors"
import { getEngine } from "@/server/engine/singleton"

export async function GET() {
  try {
    const engine = await getEngine().getStatus()
    return NextResponse.json({ status: "ok", engine })
  } catch (error) {
    if (error instanceof EngineUnavailableError) {
      return NextResponse.json({ status: "engine_unavailable" }, { status: 503 })
    }
    return NextResponse.json({ status: "error" }, { status: 500 })
  }
}
