import type { ChatEvent } from "@/lib/types"

const eventIds = new WeakMap<object, number>()
let nextEventId = 1

export function eventKey(event: ChatEvent): string {
  let id = eventIds.get(event)
  if (id === undefined) {
    id = nextEventId
    nextEventId += 1
    eventIds.set(event, id)
  }
  return `${event.type}-${id}`
}
