import { getEngine } from "@/server/engine/singleton"
import { jsonRoute } from "@/server/http"

export function POST() {
  return jsonRoute(async () => {
    await getEngine().live.end()
  })
}
