import type { ChatEvent, LiveRoomResult, LiveStatus, SessionState } from "@/lib/types"
import { createAuthManager } from "./auth-manager"
import { createBrowserManager } from "./browser"
import { createChatConnection } from "./chat-connection"
import { createEventBus } from "./events"
import { createLiveRoom } from "./live-room"
import { createSessionStore, type SessionStore } from "./session-store"

export type EngineStatus = {
  ok: boolean
  mode: "real" | "fake"
  auth: "anonymous" | "authenticated"
  live: boolean
}

export type AuthQr = {
  qrDataUrl: string
  expiresAt: number
  version: number
}

export type LoginMode = "qr" | "window"

export type AuthStatus = SessionState & {
  qr?: AuthQr
  detail?: string
  mode?: LoginMode
}

export interface AuthController {
  start(mode?: LoginMode): Promise<AuthQr>
  status(): Promise<AuthStatus>
  logout(): Promise<void>
  session(): Promise<SessionState>
}

export interface LiveController {
  create(input: { title: string; category?: string; ageRestricted?: boolean }): Promise<LiveRoomResult>
  end(): Promise<void>
  status(): Promise<LiveStatus>
}

export interface ChatController {
  connect(username: string): Promise<void>
  disconnect(): Promise<void>
  subscribe(listener: (event: ChatEvent) => void): () => void
  snapshot(): ChatEvent[]
}

export interface EngineHandle {
  getStatus(): Promise<EngineStatus>
  dispose(): Promise<void>
  auth: AuthController
  live: LiveController
  chat: ChatController
}

export type EngineDeps = {
  dataDir: string
  headless?: boolean
}

export function createEngine(deps: EngineDeps): EngineHandle {
  const bus = createEventBus()
  const store: SessionStore = createSessionStore(deps.dataDir)
  const browsers = createBrowserManager({
    dataDir: deps.dataDir,
    headless: deps.headless ?? true,
  })
  const auth = createAuthManager({ browsers, store })

  const live: LiveController = createLiveRoom({
    browsers,
    auth,
    dataDir: deps.dataDir,
  })

  const chat: ChatController = createChatConnection({ bus })

  return {
    auth,
    live,
    chat,
    async dispose(): Promise<void> {
      await chat.disconnect().catch(() => undefined)
      await browsers.dispose()
    },
    async getStatus(): Promise<EngineStatus> {
      const session = await auth.session()
      const liveStatus = await live.status()
      return {
        ok: true,
        mode: "real",
        auth: session.status === "authenticated" ? "authenticated" : "anonymous",
        live: liveStatus.live,
      }
    },
  }
}
