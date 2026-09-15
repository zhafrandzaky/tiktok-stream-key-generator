import type { ChatEvent } from "@/lib/types"

export interface EventBus {
  publish(event: ChatEvent): void
  subscribe(listener: (event: ChatEvent) => void): () => void
  snapshot(): ChatEvent[]
}

export function createEventBus(snapshotLimit = 50): EventBus {
  const listeners = new Set<(event: ChatEvent) => void>()
  const buffer: ChatEvent[] = []

  return {
    publish(event: ChatEvent): void {
      buffer.push(event)
      if (buffer.length > snapshotLimit) {
        buffer.splice(0, buffer.length - snapshotLimit)
      }
      for (const listener of listeners) {
        try {
          listener(event)
        } catch (error) {
          console.error("[event-bus] listener failed", error)
        }
      }
    },

    subscribe(listener: (event: ChatEvent) => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    snapshot(): ChatEvent[] {
      return [...buffer]
    },
  }
}
