import { getEngine } from "@/server/engine/singleton"
import { jsonRoute } from "@/server/http"

export function GET() {
  return jsonRoute(() => getEngine().live.status())
}
