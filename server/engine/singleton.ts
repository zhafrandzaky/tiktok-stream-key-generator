import { EngineUnavailableError } from "./errors"
import type { EngineHandle } from "./engine"

export type { EngineHandle, EngineStatus } from "./engine"

const KEY = "__tiktokEngine"

export function setEngine(engine: EngineHandle | null): void {
  ;(globalThis as Record<string, unknown>)[KEY] = engine ?? undefined
}

export function getEngine(): EngineHandle {
  const engine = (globalThis as Record<string, unknown>)[KEY] as EngineHandle | undefined
  if (!engine) throw new EngineUnavailableError()
  return engine
}
