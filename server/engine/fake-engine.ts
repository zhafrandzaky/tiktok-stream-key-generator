import type { ChatEvent, LiveRoomResult, LiveStatus, SessionState } from "@/lib/types"
import type {
  AuthController,
  AuthQr,
  AuthStatus,
  ChatController,
  EngineHandle,
  LiveController,
  LoginMode,
} from "./engine"
import { AlreadyAuthenticatedError, AuthRequiredError } from "./errors"
import { createEventBus } from "./events"

export type FakeEngineOptions = {
  loginDelayMs?: number
  roomDelayMs?: number
  chatIntervalMs?: number
}

const QR_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

const FAKE_ROOM: LiveRoomResult = {
  rtmpUrl: "rtmp://fake.push.example.com/live",
  streamKey: "sk_fake_1234567890",
  combinedPushUrl: "rtmp://fake.push.example.com/live/sk_fake_1234567890",
  roomId: "fake-room",
  applied: ["title"],
}

export function createFakeEngine(options: FakeEngineOptions = {}): EngineHandle {
  const loginDelayMs = options.loginDelayMs ?? 3000
  const roomDelayMs = options.roomDelayMs ?? 500
  const chatIntervalMs = options.chatIntervalMs ?? 300

  const bus = createEventBus()
  let session: SessionState = { status: "anonymous" }
  let qr: AuthQr | null = null
  let activeMode: LoginMode | null = null
  let loginTimer: ReturnType<typeof setTimeout> | null = null
  let room: LiveRoomResult | null = null
  let isLive = false
  let connectTimer: ReturnType<typeof setTimeout> | null = null
  let chatTimer: ReturnType<typeof setInterval> | null = null

  const stopLoginTimer = () => {
    if (loginTimer) {
      clearTimeout(loginTimer)
      loginTimer = null
    }
  }

  const stopChatTimers = () => {
    if (connectTimer) {
      clearTimeout(connectTimer)
      connectTimer = null
    }
    if (chatTimer) {
      clearInterval(chatTimer)
      chatTimer = null
    }
  }

  const auth: AuthController = {
    async start(mode: LoginMode = "qr"): Promise<AuthQr> {
      if (session.status === "authenticated") throw new AlreadyAuthenticatedError()
      stopLoginTimer()
      activeMode = mode
      qr = { qrDataUrl: QR_PNG, expiresAt: Date.now() + 120_000, version: 1 }
      loginTimer = setTimeout(() => {
        session = { status: "authenticated", uniqueId: "demo_user", nickname: "Demo User" }
        qr = null
        activeMode = null
        loginTimer = null
      }, loginDelayMs)
      return qr
    },

    async status(): Promise<AuthStatus> {
      return {
        ...session,
        ...(qr ? { qr } : {}),
        ...(activeMode ? { mode: activeMode } : {}),
      }
    },

    async logout(): Promise<void> {
      stopLoginTimer()
      qr = null
      activeMode = null
      session = { status: "anonymous" }
      room = null
      isLive = false
    },

    async session(): Promise<SessionState> {
      return session
    },

    async importFromFirefox(): Promise<SessionState> {
      stopLoginTimer()
      qr = null
      activeMode = null
      session = { status: "authenticated", uniqueId: "demo_user", nickname: "Demo User" }
      return session
    },
  }

  const live: LiveController = {
    async create(input): Promise<LiveRoomResult> {
      if (session.status !== "authenticated") throw new AuthRequiredError()
      await new Promise((resolve) => setTimeout(resolve, roomDelayMs))
      room = { ...FAKE_ROOM, applied: input.title ? ["title"] : [] }
      isLive = true
      return room
    },

    async end(): Promise<void> {
      isLive = false
      room = null
    },

    async status(): Promise<LiveStatus> {
      return {
        authenticated: session.status === "authenticated",
        live: isLive,
        ...(room ? { room } : {}),
      }
    },
  }

  const script: Array<(at: number) => ChatEvent> = [
    (at) => ({ type: "chat", user: { uniqueId: "alice", nickname: "Alice" }, comment: "first!", at }),
    (at) => ({
      type: "gift",
      user: { uniqueId: "bob", nickname: "Bob" },
      giftId: "5655",
      giftName: "Rose",
      repeatCount: 3,
      diamonds: 6,
      streakEnd: true,
      at,
    }),
    (at) => ({ type: "follow", user: { uniqueId: "carol", nickname: "Carol" }, at }),
    (at) => ({ type: "member", user: { uniqueId: "erin", nickname: "Erin" }, at }),
    (at) => ({ type: "viewerCount", count: 128, total: 1543, at }),
    (at) => ({ type: "chat", user: { uniqueId: "dave", nickname: "Dave" }, comment: "hello from demo", at }),
    (at) => ({ type: "streamEnd", reason: "action:3", at }),
  ]

  const chat: ChatController = {
    async connect(username: string): Promise<void> {
      stopChatTimers()
      bus.publish({ type: "status", state: "connecting", detail: username, at: Date.now() })
      connectTimer = setTimeout(() => {
        connectTimer = null
        bus.publish({ type: "status", state: "connected", detail: "fake-room", at: Date.now() })
        let index = 0
        chatTimer = setInterval(() => {
          const build = script[index % script.length]
          index += 1
          if (build) bus.publish(build(Date.now()))
        }, chatIntervalMs)
      }, chatIntervalMs)
    },

    async disconnect(): Promise<void> {
      stopChatTimers()
      bus.publish({ type: "status", state: "disconnected", at: Date.now() })
    },

    subscribe: bus.subscribe,
    snapshot: bus.snapshot,
  }

  return {
    auth,
    live,
    chat,
    async dispose(): Promise<void> {
      stopLoginTimer()
      stopChatTimers()
    },
    async getStatus() {
      return {
        ok: true,
        mode: "fake",
        auth: session.status === "authenticated" ? "authenticated" : "anonymous",
        live: isLive,
      }
    },
  }
}
