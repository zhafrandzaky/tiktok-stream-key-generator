import { jsonRoute } from "@/server/http"
import { getEngine } from "@/server/engine/singleton"

export function POST() {
  return jsonRoute(async () => {
    const engine = getEngine()
    await engine.auth.logout()
    await engine.chat.disconnect().catch(() => undefined)
  })
}
