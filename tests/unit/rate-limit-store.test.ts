import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  computeRateLimitHit,
  createRateLimitStore,
  RATE_LIMIT_STEPS_MS,
} from "@/server/engine/rate-limit-store"

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "ratelimit-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe("computeRateLimitHit", () => {
  it("starts at the shortest cooldown", () => {
    const { state, cooldownMs } = computeRateLimitHit(null, 1000)
    expect(cooldownMs).toBe(RATE_LIMIT_STEPS_MS[0])
    expect(state).toEqual({ until: 1000 + RATE_LIMIT_STEPS_MS[0]!, level: 0 })
  })

  it("escalates on repeated hits within the first step window", () => {
    const now = 1_000_000
    const first = computeRateLimitHit(null, now).state
    const second = computeRateLimitHit(first, now + 60_000).state
    const third = computeRateLimitHit(second, now + 120_000).state
    const fourth = computeRateLimitHit(third, now + 180_000).state
    expect([first.level, second.level, third.level, fourth.level]).toEqual([0, 1, 2, 2])
    expect(second.until - (now + 60_000)).toBe(RATE_LIMIT_STEPS_MS[1])
    expect(third.until - (now + 120_000)).toBe(RATE_LIMIT_STEPS_MS[2])
  })

  it("resets the level after a long quiet period", () => {
    const now = 1_000_000
    const first = computeRateLimitHit(null, now).state
    const later = computeRateLimitHit(first, now + RATE_LIMIT_STEPS_MS[0] * 3).state
    expect(later.level).toBe(0)
  })
})

describe("createRateLimitStore", () => {
  it("returns null when no state exists", async () => {
    expect(await createRateLimitStore(dir).read()).toBeNull()
  })

  it("round-trips state with 0600 permissions", async () => {
    const store = createRateLimitStore(dir)
    await store.write({ until: 123, level: 2 })
    expect(await store.read()).toEqual({ until: 123, level: 2 })
    const mode = (await stat(path.join(dir, "session", "rate-limit.json"))).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it("tolerates corrupt or partial state", async () => {
    const store = createRateLimitStore(dir)
    await mkdir(path.join(dir, "session"), { recursive: true })
    await writeFile(path.join(dir, "session", "rate-limit.json"), "{oops")
    expect(await store.read()).toBeNull()
    await writeFile(path.join(dir, "session", "rate-limit.json"), '{"level":2}')
    expect(await store.read()).toBeNull()
  })

  it("clears state", async () => {
    const store = createRateLimitStore(dir)
    await store.write({ until: 5, level: 0 })
    await store.clear()
    expect(await store.read()).toBeNull()
  })
})
