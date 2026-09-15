import type { ChatEvent, LiveRoomResult, LiveStatus, SessionState } from "@/lib/types"
import { EngineError } from "./errors"
import { createEventBus } from "./events"
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

export type AuthStatus = SessionState & {
  qr?: AuthQr
  detail?: string
}

export interface AuthController {
  start(): Promise<AuthQr>
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
  auth: AuthController
  live: LiveController
  chat: ChatController
}

export type EngineDeps = {
  dataDir: string
  headless?: boolean
}

function notImplemented(name: string): () => Promise<never> {
  return async () => {
    throw new EngineError(`${name} is not available`, "NOT_IMPLEMENTED")
  }
}

export function createEngine(deps: EngineDeps): EngineHandle {
  const bus = createEventBus()
  const store: SessionStore = createSessionStore(deps.dataDir)

  const readSession = async (): Promise<SessionState> => {
    const state = await store.readState()
    return state ? { status: "authenticated" } : { status: "anonymous" }
  }

  const auth: AuthController = {
    start: notImplemented("auth.start") as AuthController["start"],
    status: async () => readSession(),
    logout: async () => {
      await store.clear()
    },
    session: readSession,
  }

  const live: LiveController = {
    create: notImplemented("live.create") as LiveController["create"],
    end: async () => {},
    status: async () => ({ authenticated: false, live: false }),
  }

  const chat: ChatController = {
    connect: notImplemented("chat.connect") as ChatController["connect"],
    disconnect: async () => {},
    subscribe: bus.subscribe,
    snapshot: bus.snapshot,
  }

  return {
    auth,
    live,
    chat,
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
