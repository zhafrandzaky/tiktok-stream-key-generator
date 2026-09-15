"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Gift, Loader2, MessagesSquare, PlugZap, Unplug } from "lucide-react"
import { toast } from "sonner"
import { EventRow } from "@/components/dashboard/event-row"
import { GlassPanel } from "@/components/glass-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NumberTicker } from "@/components/ui/number-ticker"
import { Separator } from "@/components/ui/separator"
import { useChatSocket } from "@/hooks/use-chat-socket"
import { apiGet, apiPost } from "@/lib/api-client"
import { eventKey } from "@/lib/event-key"
import type { ChatEvent, SessionState } from "@/lib/types"
import { cn } from "@/lib/utils"

type EventCategory = "gift" | "follow" | "share" | "like" | "member" | "system"

const EVENT_FILTERS: Array<{ id: EventCategory; label: string; defaultOn: boolean }> = [
  { id: "gift", label: "Gifts", defaultOn: true },
  { id: "follow", label: "Follows", defaultOn: true },
  { id: "share", label: "Shares", defaultOn: true },
  { id: "like", label: "Likes", defaultOn: true },
  { id: "member", label: "Joins", defaultOn: false },
  { id: "system", label: "System", defaultOn: true },
]

function categoryOf(event: ChatEvent): EventCategory | null {
  switch (event.type) {
    case "gift":
      return "gift"
    case "follow":
      return "follow"
    case "share":
      return "share"
    case "like":
      return "like"
    case "member":
      return "member"
    case "status":
    case "streamEnd":
      return "system"
    default:
      return null
  }
}

function AutoScrollList({
  dependency,
  className,
  children,
}: {
  dependency: unknown
  className?: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const pinned = useRef(true)

  useEffect(() => {
    const element = ref.current
    if (!element || !pinned.current) return
    element.scrollTop = element.scrollHeight
  }, [dependency])

  const onScroll = () => {
    const element = ref.current
    if (!element) return
    pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40
  }

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className={cn(
        "overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {children}
    </div>
  )
}

export function ChatPanel() {
  const { events, connected } = useChatSocket({ maxEvents: 200 })
  const [username, setUsername] = useState("")
  const [busy, setBusy] = useState(false)
  const [activeRoom, setActiveRoom] = useState<string | null>(null)
  const [enabled, setEnabled] = useState<Record<EventCategory, boolean>>(() =>
    Object.fromEntries(EVENT_FILTERS.map((filter) => [filter.id, filter.defaultOn])) as Record<
      EventCategory,
      boolean
    >,
  )

  useEffect(() => {
    const id = setTimeout(() => {
      void apiGet<SessionState>("/api/auth/session")
        .then((session) => {
          if (session.uniqueId) setUsername((prev) => (prev ? prev : `@${session.uniqueId}`))
        })
        .catch(() => undefined)
    }, 0)
    return () => clearTimeout(id)
  }, [])

  const viewerCount = useMemo(() => {
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index]
      if (!event) continue
      if (event.type === "viewerCount") return event.count
      if (event.type === "member" && event.viewerCount !== undefined) return event.viewerCount
    }
    return undefined
  }, [events])

  const chatEvents = useMemo(() => events.filter((event) => event.type === "chat"), [events])

  const eventEvents = useMemo(
    () =>
      events.filter((event) => {
        const category = categoryOf(event)
        if (!category || !enabled[category]) return false
        if (event.type === "gift" && !event.streakEnd) return false
        return true
      }),
    [events, enabled],
  )
  const connect = async () => {
    const value = username.trim().replace(/^@/, "")
    if (!value) {
      toast.error("Enter a TikTok username first")
      return
    }
    setBusy(true)
    try {
      await apiPost("/api/chat/connect", { username: value })
      setActiveRoom(value)
      toast.success(`Reading live chat for @${value}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not connect to the live chat")
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setBusy(true)
    try {
      await apiPost("/api/chat/disconnect")
      setActiveRoom(null)
      toast.success("Chat disconnected")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not disconnect")
    } finally {
      setBusy(false)
    }
  }

  return (
    <GlassPanel className="p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessagesSquare className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-tight">Live chat &amp; events</h2>
        </div>
        <div className="flex items-center gap-2">
          {viewerCount !== undefined ? (
            <Badge variant="outline" className="rounded-lg tabular-nums">
              <NumberTicker value={viewerCount} className="text-xs font-semibold" />
              <span className="ml-1 text-xs text-muted-foreground">viewers</span>
            </Badge>
          ) : null}
          <Badge variant={connected ? "secondary" : "outline"} className="rounded-lg">
            {connected ? "Socket live" : "Socket idle"}
          </Badge>
        </div>
      </div>

      <Separator className="my-4 opacity-60" />

      <div className="flex gap-2">
        <Input
          value={username}
          placeholder="@username to read chat from"
          aria-label="TikTok username"
          className="focus-glass rounded-xl"
          onChange={(event) => setUsername(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void connect()
          }}
        />
        {activeRoom ? (
          <Button
            variant="secondary"
            className="focus-glass shrink-0 rounded-xl"
            disabled={busy}
            onClick={disconnect}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Unplug className="size-4" />}
            Disconnect
          </Button>
        ) : (
          <Button className="focus-glass shrink-0 rounded-xl" disabled={busy} onClick={connect}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
            Connect
          </Button>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <section className="min-w-0">
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">Chat</h3>
          <AutoScrollList dependency={chatEvents} className="h-[380px] space-y-2">
            {chatEvents.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <MessagesSquare className="size-6 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">
                  No messages yet — connect a live room to start reading chat.
                </p>
              </div>
            ) : (
              chatEvents.map((event) => <EventRow key={eventKey(event)} event={event} />)
            )}
          </AutoScrollList>
        </section>

        <section className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-medium text-muted-foreground">Events</h3>
            <span className="text-[11px] tabular-nums text-muted-foreground/70">
              {eventEvents.length}
            </span>
          </div>
          <div className="mb-2 flex flex-wrap gap-1">
            {EVENT_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                aria-pressed={enabled[filter.id]}
                className={cn(
                  "focus-glass rounded-lg border px-2 py-1 text-[11px] transition-colors",
                  enabled[filter.id]
                    ? "border-white/20 bg-secondary text-secondary-foreground"
                    : "border-transparent text-muted-foreground hover:bg-secondary/50",
                )}
                onClick={() =>
                  setEnabled((prev) => ({ ...prev, [filter.id]: !prev[filter.id] }))
                }
              >
                {filter.label}
              </button>
            ))}
          </div>
          <AutoScrollList dependency={eventEvents} className="h-[326px] space-y-2">
            {eventEvents.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <Gift className="size-6 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">
                  Gifts, follows, likes and system events appear here.
                </p>
              </div>
            ) : (
              eventEvents.map((event) => <EventRow key={eventKey(event)} event={event} />)
            )}
          </AutoScrollList>
        </section>
      </div>
    </GlassPanel>
  )
}
