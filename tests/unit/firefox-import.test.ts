import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import {
  findCookieDatabases,
  importFirefoxSession,
  mapFirefoxCookie,
  readTikTokCookies,
} from "@/server/engine/firefox-import"

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "ff-test-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function createCookieDb(profileDir: string, rows: Array<Record<string, unknown>>): string {
  const dbPath = path.join(profileDir, "cookies.sqlite")
  const db = new DatabaseSync(dbPath)
  db.exec(`CREATE TABLE moz_cookies (
    name TEXT, value TEXT, host TEXT, path TEXT, expiry INTEGER,
    isSecure INTEGER, isHttpOnly INTEGER, sameSite INTEGER
  )`)
  const insert = db.prepare(
    `INSERT INTO moz_cookies (name, value, host, path, expiry, isSecure, isHttpOnly, sameSite)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const row of rows) {
    insert.run(
      String(row.name),
      String(row.value),
      String(row.host),
      String(row.path ?? "/"),
      Number(row.expiry ?? 0),
      Number(row.isSecure ?? 1),
      Number(row.isHttpOnly ?? 1),
      Number(row.sameSite ?? 0),
    )
  }
  db.close()
  return dbPath
}

describe("mapFirefoxCookie", () => {
  it("converts millisecond expiry to seconds", () => {
    const cookie = mapFirefoxCookie({
      name: "sessionid",
      value: "abc",
      host: ".tiktok.com",
      path: "/",
      expiry: 1789506626287,
      isSecure: 1,
      isHttpOnly: 1,
      sameSite: 0,
    })
    expect(cookie.expires).toBe(1789506626)
    expect(cookie.domain).toBe(".tiktok.com")
    expect(cookie.secure).toBe(true)
    expect(cookie.httpOnly).toBe(true)
  })

  it("handles second-based expiry and session cookies", () => {
    const seconds = mapFirefoxCookie({
      name: "a",
      value: "1",
      host: "www.tiktok.com",
      path: "/",
      expiry: 1789506626,
      isSecure: 0,
      isHttpOnly: 0,
      sameSite: 1,
    })
    expect(seconds.expires).toBe(1789506626)
    expect(seconds.sameSite).toBe("Lax")

    const session = mapFirefoxCookie({
      name: "b",
      value: "2",
      host: ".tiktok.com",
      path: "/",
      expiry: 0,
      isSecure: 1,
      isHttpOnly: 1,
      sameSite: 2,
    })
    expect(session.expires).toBe(-1)
    expect(session.sameSite).toBe("Strict")
  })
})

describe("readTikTokCookies", () => {
  it("reads only tiktok cookies from a Firefox database", async () => {
    const profileDir = path.join(dir, "profile.default-release")
    await mkdir(profileDir, { recursive: true })
    const dbPath = createCookieDb(profileDir, [
      { name: "sessionid", value: "sid-value", host: ".tiktok.com", expiry: 1789506626287 },
      { name: "ttwid", value: "ttwid-value", host: ".tiktok.com", expiry: 1821020966371 },
      { name: "other", value: "nope", host: ".example.com", expiry: 1789506626287 },
    ])

    const cookies = await readTikTokCookies(dbPath)
    expect(cookies.map((cookie) => cookie.name).sort()).toEqual(["sessionid", "ttwid"])
    expect(cookies.find((cookie) => cookie.name === "sessionid")?.value).toBe("sid-value")
  })
})

describe("findCookieDatabases", () => {
  it("finds profile databases sorted by recency", async () => {
    const older = path.join(dir, "aaa.default")
    const newer = path.join(dir, "bbb.default-release")
    await mkdir(older, { recursive: true })
    await mkdir(newer, { recursive: true })
    createCookieDb(older, [])
    createCookieDb(newer, [])
    const found = await findCookieDatabases([dir])
    expect(found).toHaveLength(2)
    expect(found[0]).toContain("bbb.default-release")
  })
})

describe("importFirefoxSession", () => {
  it("returns the session cookies for a profile with a valid sessionid", async () => {
    const profileDir = path.join(dir, "valid.default-release")
    await mkdir(profileDir, { recursive: true })
    createCookieDb(profileDir, [
      { name: "sessionid", value: "sid-value", host: ".tiktok.com", expiry: Date.now() + 86_400_000 },
      { name: "ttwid", value: "ttwid-value", host: ".tiktok.com", expiry: Date.now() + 86_400_000 },
    ])

    const result = await importFirefoxSession({ searchDirs: [dir] })
    expect(result).not.toBeNull()
    expect(result?.cookies.some((cookie) => cookie.name === "sessionid")).toBe(true)
    expect(result?.profilePath).toContain("valid.default-release")
  })

  it("skips profiles whose sessionid is expired", async () => {
    const profileDir = path.join(dir, "expired.default-release")
    await mkdir(profileDir, { recursive: true })
    createCookieDb(profileDir, [
      { name: "sessionid", value: "sid-value", host: ".tiktok.com", expiry: Date.now() - 60_000 },
    ])
    expect(await importFirefoxSession({ searchDirs: [dir] })).toBeNull()
  })

  it("returns null when no profile has a session", async () => {
    const profileDir = path.join(dir, "empty.default-release")
    await mkdir(profileDir, { recursive: true })
    createCookieDb(profileDir, [{ name: "ttwid", value: "x", host: ".tiktok.com", expiry: 0 }])
    expect(await importFirefoxSession({ searchDirs: [dir] })).toBeNull()
  })
})
