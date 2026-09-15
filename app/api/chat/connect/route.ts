import { EngineError } from "@/server/engine/errors"
import { getEngine } from "@/server/engine/singleton"
import { jsonRoute, readJsonBody } from "@/server/http"

const USERNAME_PATTERN = /^[A-Za-z0-9_.]{1,24}$/

export function POST(req: Request) {
  return jsonRoute(async () => {
    const body = await readJsonBody<{ username?: unknown }>(req)
    const raw = typeof body.username === "string" ? body.username.trim().replace(/^@/, "") : ""
    if (!USERNAME_PATTERN.test(raw)) {
      throw new EngineError("Provide a valid TikTok username (letters, numbers, dots, underscores).", "BAD_REQUEST")
    }
    await getEngine().chat.connect(raw)
  })
}
