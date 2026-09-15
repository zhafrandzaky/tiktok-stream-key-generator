import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"

export type RateLimitState = {
  until: number
  level: number
}

export interface RateLimitStore {
  read(): Promise<RateLimitState | null>
  write(state: RateLimitState): Promise<void>
  clear(): Promise<void>
}

export const RATE_LIMIT_STEPS_MS = [5 * 60_000, 15 * 60_000, 60 * 60_000]

export function computeRateLimitHit(
  prev: RateLimitState | null,
  now: number = Date.now(),
): { state: RateLimitState; cooldownMs: number } {
  const recent = prev !== null && now - prev.until < RATE_LIMIT_STEPS_MS[0]
  const level = recent && prev ? Math.min(prev.level + 1, RATE_LIMIT_STEPS_MS.length - 1) : 0
  const cooldownMs = RATE_LIMIT_STEPS_MS[level] ?? RATE_LIMIT_STEPS_MS[0] ?? 300_000
  return { state: { until: now + cooldownMs, level }, cooldownMs }
}

export function createRateLimitStore(baseDir: string): RateLimitStore {
  const filePath = path.join(baseDir, "session", "rate-limit.json")

  return {
    async read(): Promise<RateLimitState | null> {
      try {
        const raw = await readFile(filePath, "utf8")
        const parsed = JSON.parse(raw) as Partial<RateLimitState>
        if (typeof parsed.until !== "number" || !Number.isFinite(parsed.until)) return null
        return {
          until: parsed.until,
          level: typeof parsed.level === "number" ? parsed.level : 0,
        }
      } catch {
        return null
      }
    },

    async write(state: RateLimitState): Promise<void> {
      await mkdir(path.dirname(filePath), { recursive: true })
      const tmpPath = `${filePath}.tmp`
      await writeFile(tmpPath, JSON.stringify(state), { mode: 0o600 })
      await rename(tmpPath, filePath)
    },

    async clear(): Promise<void> {
      await rm(filePath, { force: true })
    },
  }
}
