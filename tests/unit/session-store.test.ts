import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createSessionStore } from "@/server/engine/session-store"

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sess-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe("createSessionStore", () => {
  it("returns null when no state exists", async () => {
    expect(await createSessionStore(dir).readState()).toBeNull()
  })

  it("round-trips JSON state", async () => {
    const store = createSessionStore(dir)
    await store.writeState({ cookies: [{ name: "sessionid", value: "x" }] })
    expect(await store.readState()).toEqual({ cookies: [{ name: "sessionid", value: "x" }] })
  })

  it("sets file permissions to 0600", async () => {
    const store = createSessionStore(dir)
    await store.writeState({ a: 1 })
    const mode = (await stat(store.storageStatePath())).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it("writes atomically without leaving temp files", async () => {
    const store = createSessionStore(dir)
    await store.writeState({ a: 1 })
    await store.writeState({ a: 2 })
    expect(await store.readState()).toEqual({ a: 2 })
    const leftovers = (await (await import("node:fs/promises")).readdir(path.dirname(store.storageStatePath()))).filter(
      (name) => name.endsWith(".tmp"),
    )
    expect(leftovers).toEqual([])
  })

  it("clear removes the file and tolerates missing file", async () => {
    const store = createSessionStore(dir)
    await store.writeState({ a: 1 })
    await store.clear()
    expect(await store.readState()).toBeNull()
    await expect(store.clear()).resolves.toBeUndefined()
  })

  it("returns null on corrupt json instead of throwing", async () => {
    const store = createSessionStore(dir)
    await mkdir(path.dirname(store.storageStatePath()), { recursive: true })
    await writeFile(store.storageStatePath(), "{oops")
    expect(await store.readState()).toBeNull()
  })

  it("overwrites with valid json after corruption", async () => {
    const store = createSessionStore(dir)
    await mkdir(path.dirname(store.storageStatePath()), { recursive: true })
    await writeFile(store.storageStatePath(), "{oops")
    await store.writeState({ ok: true })
    expect(await store.readState()).toEqual({ ok: true })
    expect(await readFile(store.storageStatePath(), "utf8")).toContain('"ok": true')
  })
})
