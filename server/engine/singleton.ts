import { EngineUnavailableError } from "./errors"

export type EngineStatus = {
  ok: boolean
  mode: "real" | "fake"
  auth: "anonymous" | "authenticated"
  live: boolean
}

export interface EngineHandle {
  getStatus(): Promise<EngineStatus>
}

const KEY = "__tiktokEngine"

export function setEngine(engine: EngineHandle | null): void {
  ;(globalThis as Record<string, unknown>)[KEY] = engine ?? undefined
}

export function getEngine(): EngineHandle {
  const engine = (globalThis as Record<string, unknown>)[KEY] as EngineHandle | undefined
  if (!engine) throw new EngineUnavailableError()
  return engine
}
