import { jsonRoute } from "@/server/http"
import { getEngine } from "@/server/engine/singleton"

export function GET() {
  return jsonRoute(() => getEngine().auth.session())
}
