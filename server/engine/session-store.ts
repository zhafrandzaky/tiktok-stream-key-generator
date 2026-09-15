import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"

export interface SessionStore {
  readState(): Promise<unknown | null>
  writeState(state: unknown): Promise<void>
  clear(): Promise<void>
  storageStatePath(): string
}

export function createSessionStore(baseDir: string): SessionStore {
  const filePath = path.join(baseDir, "session", "storageState.json")

  return {
    storageStatePath: () => filePath,

    async readState(): Promise<unknown | null> {
      try {
        const raw = await readFile(filePath, "utf8")
        return JSON.parse(raw) as unknown
      } catch {
        return null
      }
    },

    async writeState(state: unknown): Promise<void> {
      await mkdir(path.dirname(filePath), { recursive: true })
      const tmpPath = `${filePath}.tmp`
      await writeFile(tmpPath, JSON.stringify(state, null, 2), { mode: 0o600 })
      await rename(tmpPath, filePath)
    },

    async clear(): Promise<void> {
      await rm(filePath, { force: true })
    },
  }
}
