import { EngineError } from "@/server/engine/errors"
import { getEngine } from "@/server/engine/singleton"
import { jsonRoute, readJsonBody } from "@/server/http"

export function POST(req: Request) {
  return jsonRoute(async () => {
    const body = await readJsonBody<{ title?: unknown; category?: unknown; ageRestricted?: unknown }>(req)
    const title = typeof body.title === "string" ? body.title.trim() : ""
    if (!title || title.length > 100) {
      throw new EngineError("A live title between 1 and 100 characters is required.", "BAD_REQUEST")
    }
    const category =
      typeof body.category === "string" && body.category.trim() ? body.category.trim() : undefined
    return getEngine().live.create({ title, category, ageRestricted: body.ageRestricted === true })
  })
}
