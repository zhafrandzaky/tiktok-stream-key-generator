import { test as base, expect } from "@playwright/test"

export const test = base

test.beforeEach(async ({ request }) => {
  await request.post("/api/auth/logout").catch(() => undefined)
  await request.post("/api/chat/disconnect").catch(() => undefined)
})

export { expect }
