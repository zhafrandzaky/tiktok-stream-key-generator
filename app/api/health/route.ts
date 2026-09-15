import { NextResponse } from "next/server"
import { toEngineErrorLike } from "@/server/http"
import { getEngine } from "@/server/engine/singleton"

export async function GET() {
  try {
    const engine = await getEngine().getStatus()
    return NextResponse.json({ status: "ok", engine })
  } catch (error) {
    if (toEngineErrorLike(error)?.code === "ENGINE_UNAVAILABLE") {
      return NextResponse.json({ status: "engine_unavailable" }, { status: 503 })
    }
    console.error("[api] health check failed", error)
    return NextResponse.json({ status: "error" }, { status: 500 })
  }
}
