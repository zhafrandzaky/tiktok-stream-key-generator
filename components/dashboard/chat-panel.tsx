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
    element.scrollTop = 0
  }, [dependency])

  const onScroll = () => {
    const element = ref.current
    if (!element) return
    pinned.current = element.scrollTop < 40
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

  const lastViewerEvent = events.findLast(
    (event) =>
      event.type === "viewerCount" || (event.type === "member" && event.viewerCount !== undefined),
  )
  const viewerStats =
    lastViewerEvent?.type === "viewerCount"
      ? { count: lastViewerEvent.count, total: lastViewerEvent.total }
      : lastViewerEvent?.type === "member" && lastViewerEvent.viewerCount !== undefined
        ? { count: lastViewerEvent.viewerCount, total: undefined }
        : null

  const likeEvent = events.findLast((event) => event.type === "like")
  const likeTotal = likeEvent?.type === "like" ? likeEvent.total : undefined
  const hasStats = viewerStats !== null || likeTotal !== undefined

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

  const chatList = useMemo(() => [...chatEvents].reverse(), [chatEvents])

  const eventList = useMemo(() => [...eventEvents].reverse(), [eventEvents])
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

  const statBadges = (
    <>
      {viewerStats ? (
        <>
          <Badge data-testid="viewer-count" variant="outline" className="rounded-lg tabular-nums">
            <NumberTicker value={viewerStats.count} className="text-xs font-semibold" />
            <span className="ml-1 text-xs text-muted-foreground">viewers</span>
          </Badge>
          {viewerStats.total !== undefined ? (
            <Badge data-testid="viewer-total" variant="outline" className="rounded-lg tabular-nums">
              <NumberTicker value={viewerStats.total} className="text-xs font-semibold" />
              <span className="ml-1 text-xs text-muted-foreground">total entered</span>
            </Badge>
          ) : null}
        </>
      ) : null}
      {likeTotal !== undefined ? (
        <Badge data-testid="like-total" variant="outline" className="rounded-lg tabular-nums">
          <NumberTicker value={likeTotal} className="text-xs font-semibold" />
          <span className="ml-1 text-xs text-muted-foreground">total likes</span>
        </Badge>
      ) : null}
    </>
  )

  return (
    <GlassPanel className="p-6 lg:absolute lg:inset-0 lg:flex lg:flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <MessagesSquare className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-tight">Live chat &amp; events</h2>
        </div>
        {hasStats ? (
          <div className="order-2 flex w-full flex-wrap items-center gap-2 lg:order-1 lg:w-auto">
            {statBadges}
          </div>
        ) : null}
        <Badge
          variant={connected ? "secondary" : "outline"}
          className="order-1 rounded-lg lg:order-2"
        >
          {connected ? "Socket live" : "Socket idle"}
        </Badge>
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

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <section className="min-w-0 lg:flex lg:min-h-0 lg:flex-col">
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">Chat</h3>
          <AutoScrollList
            dependency={chatList}
            className="h-[440px] space-y-2 lg:h-auto lg:min-h-0 lg:flex-1"
          >
            {chatList.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <MessagesSquare className="size-6 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">
                  No messages yet — connect a live room to start reading chat.
                </p>
              </div>
            ) : (
              chatList.map((event) => <EventRow key={eventKey(event)} event={event} />)
            )}
          </AutoScrollList>
        </section>

        <section className="min-w-0 lg:flex lg:min-h-0 lg:flex-col">
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
          <AutoScrollList
            dependency={eventList}
            className="h-[412px] space-y-2 lg:h-auto lg:min-h-0 lg:flex-1"
          >
            {eventList.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <Gift className="size-6 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">
                  Gifts, follows, likes and system events appear here.
                </p>
              </div>
            ) : (
              eventList.map((event) => <EventRow key={eventKey(event)} event={event} />)
            )}
          </AutoScrollList>
        </section>
      </div>
    </GlassPanel>
  )
}
