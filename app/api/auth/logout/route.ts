import { jsonRoute } from "@/server/http"
import { getEngine } from "@/server/engine/singleton"

export function POST() {
  return jsonRoute(async () => {
    await getEngine().auth.logout()
  })
}
