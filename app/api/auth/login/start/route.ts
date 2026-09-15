import { getEngine } from "@/server/engine/singleton"
import { jsonRoute, readOptionalJsonBody } from "@/server/http"

export function POST(req: Request) {
  return jsonRoute(async () => {
    const body = await readOptionalJsonBody<{ mode?: unknown }>(req)
    const mode = body?.mode === "window" ? "window" : "qr"
    return getEngine().auth.start(mode)
  })
}
