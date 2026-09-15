"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2, MessagesSquare, PlugZap, Unplug } from "lucide-react"
import { toast } from "sonner"
import { EventRow } from "@/components/dashboard/event-row"
import { GlassPanel } from "@/components/glass-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NumberTicker } from "@/components/ui/number-ticker"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useChatSocket } from "@/hooks/use-chat-socket"
import { apiGet, apiPost } from "@/lib/api-client"
import { eventKey } from "@/lib/event-key"
import type { SessionState } from "@/lib/types"

export function ChatPanel() {
  const { events, connected } = useChatSocket({ maxEvents: 150 })
  const [username, setUsername] = useState("")
  const [busy, setBusy] = useState(false)
  const [activeRoom, setActiveRoom] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const pinnedRef = useRef(true)

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

  const chatEvents = events.filter((event) => event.type === "chat")
  const otherEvents = events.filter((event) => event.type !== "chat" && event.type !== "viewerCount")

  useEffect(() => {
    const element = scrollRef.current
    if (!element || !pinnedRef.current) return
    element.scrollTop = element.scrollHeight
  }, [events])

  const onScroll = () => {
    const element = scrollRef.current
    if (!element) return
    pinnedRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40
  }

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

      <Tabs defaultValue="chat" className="mt-4">
        <TabsList className="glass rounded-xl">
          <TabsTrigger value="chat" className="rounded-lg">
            Chat
          </TabsTrigger>
          <TabsTrigger value="events" className="rounded-lg">
            Events
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat">
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="mt-3 h-[360px] space-y-2 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
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
          </div>
        </TabsContent>

        <TabsContent value="events">
          <div className="mt-3 h-[360px] space-y-2 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {otherEvents.length === 0 ? (
              <p className="pt-6 text-center text-sm text-muted-foreground">
                Gifts, follows, shares and system events appear here.
              </p>
            ) : (
              otherEvents.map((event) => <EventRow key={eventKey(event)} event={event} />)
            )}
          </div>
        </TabsContent>
      </Tabs>
    </GlassPanel>
  )
}
