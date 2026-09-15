import { describe, expect, it, vi } from "vitest"
import { createFakeEngine } from "@/server/engine/fake-engine"
import { AuthRequiredError } from "@/server/engine/errors"

describe("fake engine contract", () => {
  it("runs the auth lifecycle with deterministic timings", async () => {
    vi.useFakeTimers()
    const engine = createFakeEngine()
    const qr = await engine.auth.start()
    expect(qr.qrDataUrl.startsWith("data:image/png;base64,")).toBe(true)
    expect((await engine.auth.session()).status).toBe("anonymous")
    expect((await engine.auth.status()).qr?.version).toBe(1)

    await vi.advanceTimersByTimeAsync(3000)
    const session = await engine.auth.session()
    expect(session.status).toBe("authenticated")
    expect(session.uniqueId).toBe("demo_user")

    await engine.auth.logout()
    expect((await engine.auth.session()).status).toBe("anonymous")
    expect((await engine.auth.status()).qr).toBeUndefined()
    vi.useRealTimers()
  })

  it("emits the scripted chat sequence", async () => {
    vi.useFakeTimers()
    const engine = createFakeEngine()
    const seen: string[] = []
    engine.chat.subscribe((event) => seen.push(event.type))
    await engine.chat.connect("demo")
    await vi.advanceTimersByTimeAsync(3000)
    expect(seen.slice(0, 4)).toEqual(["status", "status", "chat", "gift"])
    expect(seen).toContain("viewerCount")
    await engine.chat.disconnect()
    const afterDisconnect = seen.length
    await vi.advanceTimersByTimeAsync(2000)
    expect(seen.length).toBe(afterDisconnect)
    vi.useRealTimers()
  })

  it("snapshots recent events for late subscribers", async () => {
    vi.useFakeTimers()
    const engine = createFakeEngine()
    await engine.chat.connect("demo")
    await vi.advanceTimersByTimeAsync(1000)
    expect(engine.chat.snapshot().length).toBeGreaterThan(0)
    await engine.chat.disconnect()
    vi.useRealTimers()
  })

  it("requires auth before creating a live room and returns fixed credentials", async () => {
    vi.useFakeTimers()
    const engine = createFakeEngine({ loginDelayMs: 10, roomDelayMs: 10 })
    await expect(engine.live.create({ title: "Test" })).rejects.toBeInstanceOf(AuthRequiredError)

    await engine.auth.start()
    await vi.advanceTimersByTimeAsync(20)

    const pendingRoom = engine.live.create({ title: "Test" })
    await vi.advanceTimersByTimeAsync(20)
    const room = await pendingRoom
    expect(room.streamKey).toBe("sk_fake_1234567890")
    expect(room.rtmpUrl).toBe("rtmp://fake.push.example.com/live")
    expect((await engine.live.status()).live).toBe(true)

    await engine.live.end()
    expect((await engine.live.status()).live).toBe(false)
    vi.useRealTimers()
  })

  it("reports status", async () => {
    const engine = createFakeEngine()
    expect(await engine.getStatus()).toMatchObject({ ok: true, mode: "fake", auth: "anonymous" })
  })
})
