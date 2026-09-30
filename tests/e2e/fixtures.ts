import { test as base, expect, type APIRequestContext } from "@playwright/test"

export const test = base

export async function resetServerState(request: APIRequestContext): Promise<void> {
  await request.post("/api/auth/logout").catch(() => undefined)
  await request.post("/api/chat/disconnect").catch(() => undefined)
  await request.post("/api/live/end").catch(() => undefined)
}

export { expect }
