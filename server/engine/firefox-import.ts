import { copyFile, mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import path from "node:path"

export type FirefoxCookieRow = {
  name: string
  value: string
  host: string
  path: string
  expiry: number
  isSecure: number
  isHttpOnly: number
  sameSite: number
}

export type SessionCookie = {
  name: string
  value: string
  domain: string
  path: string
  expires: number
  httpOnly: boolean
  secure: boolean
  sameSite?: "Strict" | "Lax" | "None"
}

export type FirefoxImportResult = {
  cookies: SessionCookie[]
  profilePath: string
  sessionExpiresAt: number
}

export function mapFirefoxCookie(row: FirefoxCookieRow): SessionCookie {
  const expiryMs = row.expiry > 1e12 ? row.expiry : row.expiry * 1000
  const expires = row.expiry > 0 ? Math.floor(expiryMs / 1000) : -1
  const sameSite =
    row.sameSite === 1 ? ("Lax" as const) : row.sameSite === 2 ? ("Strict" as const) : undefined
  return {
    name: row.name,
    value: row.value,
    domain: row.host,
    path: row.path || "/",
    expires,
    httpOnly: row.isHttpOnly === 1,
    secure: row.isSecure === 1,
    ...(sameSite ? { sameSite } : {}),
  }
}

export function firefoxProfileCandidates(): string[] {
  const home = homedir()
  const candidates = [
    process.env.FIREFOX_PROFILE_DIR,
    path.join(home, ".mozilla", "firefox"),
    path.join(home, ".config", "mozilla", "firefox"),
    path.join(home, "snap", "firefox", "common", ".mozilla", "firefox"),
    path.join(home, ".var", "app", "org.mozilla.firefox", ".mozilla", "firefox"),
  ]
  return candidates.filter((candidate): candidate is string => Boolean(candidate))
}

export async function findCookieDatabases(baseDirs: string[]): Promise<string[]> {
  const found: Array<{ file: string; mtimeMs: number }> = []
  for (const base of baseDirs) {
    const entries = await readdir(base, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const profileDir = path.join(base, entry.name)
      const file = path.join(profileDir, "cookies.sqlite")
      const info = await stat(file).catch(() => null)
      if (info?.isFile()) found.push({ file, mtimeMs: info.mtimeMs })
    }
  }
  return found.sort((a, b) => b.mtimeMs - a.mtimeMs).map((entry) => entry.file)
}

export async function readTikTokCookies(dbPath: string): Promise<SessionCookie[]> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "ff-cookies-"))
  try {
    const local = path.join(tempDir, "cookies.sqlite")
    await copyFile(dbPath, local).catch(() => undefined)
    await copyFile(`${dbPath}-wal`, `${local}-wal`).catch(() => undefined)
    await copyFile(`${dbPath}-shm`, `${local}-shm`).catch(() => undefined)
    await mkdir(tempDir, { recursive: true })

    const { DatabaseSync } = await import("node:sqlite")
    const db = new DatabaseSync(local, { readOnly: true })
    try {
      const rows = db
        .prepare(
          `SELECT name, value, host, path, expiry, isSecure, isHttpOnly, sameSite
           FROM moz_cookies WHERE host LIKE '%tiktok%'`,
        )
        .all() as FirefoxCookieRow[]
      return rows.map(mapFirefoxCookie)
    } finally {
      db.close()
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function importFirefoxSession(options?: {
  searchDirs?: string[]
}): Promise<FirefoxImportResult | null> {
  const bases = options?.searchDirs ?? firefoxProfileCandidates()
  const databases = await findCookieDatabases(bases)
  for (const dbPath of databases) {
    const cookies = await readTikTokCookies(dbPath)
    const session = cookies.find((cookie) => cookie.name === "sessionid" && cookie.value.trim().length > 0)
    if (!session) continue
    if (session.expires > 0 && session.expires * 1000 < Date.now()) continue
    return {
      cookies,
      profilePath: path.dirname(dbPath),
      sessionExpiresAt: session.expires,
    }
  }
  return null
}
