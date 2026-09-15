"use client"

import { useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { Gift, Heart, Share2, UserPlus } from "lucide-react"
import { BlurFade } from "@/components/ui/blur-fade"
import { useChatSocket } from "@/hooks/use-chat-socket"
import { eventKey } from "@/lib/event-key"
import { parseOverlayConfig, type OverlayConfig } from "@/lib/overlay-config"
import type { ChatEvent } from "@/lib/types"
import { cn } from "@/lib/utils"

function OverlayRow({ event, config }: { event: ChatEvent; config: OverlayConfig }) {
  const chipClass = config.chip
    ? config.theme === "dark"
      ? "bg-black/40 backdrop-blur-sm"
      : "bg-white/70 backdrop-blur-sm"
    : "bg-transparent"
  const rowClass = cn("w-fit max-w-full rounded-xl px-3 py-1.5 leading-snug", chipClass)

  switch (event.type) {
    case "chat":
      return (
        <div className={rowClass}>
          <span className="font-semibold">{event.user.nickname}</span>
          <span className={config.theme === "dark" ? "text-white/90" : "text-slate-700"}>
            {" "}
            {event.comment}
          </span>
        </div>
      )
    case "gift":
      return (
        <div className={rowClass}>
          <Gift className="mr-1 inline size-[0.9em] align-[-0.1em] text-amber-400" />
          <span className="font-semibold">{event.user.nickname}</span>
          <span className={config.theme === "dark" ? "text-white/90" : "text-slate-700"}>
            {" "}
            sent {event.giftName ?? "a gift"}
            {event.repeatCount > 1 ? ` x${event.repeatCount}` : ""}
          </span>
        </div>
      )
    case "follow":
    case "share": {
      const Icon = event.type === "follow" ? UserPlus : Share2
      return (
        <div className={rowClass}>
          <Icon className="mr-1 inline size-[0.9em] align-[-0.1em] text-sky-400" />
          <span className="font-semibold">{event.user.nickname}</span>
          <span className={config.theme === "dark" ? "text-white/90" : "text-slate-700"}>
            {" "}
            {event.type === "follow" ? "followed" : "shared the stream"}
          </span>
        </div>
      )
    }
    case "like":
      return (
        <div className={rowClass}>
          <Heart className="mr-1 inline size-[0.9em] align-[-0.1em] text-rose-400" />
          <span className={config.theme === "dark" ? "text-white/90" : "text-slate-700"}>
            {event.user ? `${event.user.nickname} sent ` : ""}
            {event.count} likes
          </span>
        </div>
      )
    case "member":
      return (
        <div className={rowClass}>
          <span className={config.theme === "dark" ? "text-white/80" : "text-slate-600"}>
            {event.user.nickname} joined
          </span>
        </div>
      )
    case "streamEnd":
      return (
        <div className={rowClass}>
          <span className={config.theme === "dark" ? "text-white/80" : "text-slate-600"}>
            Stream ended
          </span>
        </div>
      )
    case "status":
      return (
        <div className={rowClass}>
          <span className={config.theme === "dark" ? "text-white/70" : "text-slate-500"}>
            {event.state}
            {event.detail ? ` · ${event.detail}` : ""}
          </span>
        </div>
      )
    default:
      return null
  }
}

export function ChatOverlay() {
  const searchParams = useSearchParams()
  const config = useMemo(() => parseOverlayConfig(searchParams.toString()), [searchParams])
  const { events, connected } = useChatSocket({ maxEvents: 200 })

  const visible = events
    .filter((event) => {
      if (event.type === "chat") return true
      if (event.type === "gift") return config.showGifts
      if (event.type === "like") return config.showLikes
      if (event.type === "follow" || event.type === "share") return config.showFollows
      if (event.type === "viewerCount") return false
      if (event.type === "status" || event.type === "streamEnd") return config.showStatus
      return false
    })
    .slice(-config.max)

  const lastViewerEvent = events.findLast((event) => event.type === "viewerCount")
  const viewerStats =
    lastViewerEvent?.type === "viewerCount"
      ? { count: lastViewerEvent.count, total: lastViewerEvent.total }
      : null

  return (
    <div
      className={cn(
        "fixed inset-0 flex flex-col justify-end gap-2 overflow-hidden bg-transparent p-5",
        config.theme === "dark" ? "text-white" : "text-slate-900",
      )}
      style={{ fontSize: `${config.fontSize}px` }}
    >
      {config.showViewers && viewerStats ? (
        <div
          className={cn(
            "w-fit rounded-full px-3 py-1 text-[0.5em] font-medium",
            config.theme === "dark" ? "bg-black/45 text-white backdrop-blur-sm" : "bg-white/75 backdrop-blur-sm",
          )}
        >
          {viewerStats.count} viewers
          {viewerStats.total !== undefined ? ` · ${viewerStats.total} total` : ""}
        </div>
      ) : null}

      <div className="flex flex-col items-start gap-1.5 overflow-hidden">
        {visible.map((event) => (
          <BlurFade
            key={eventKey(event)}
            duration={0.35}
            offset={6}
            blur="4px"
            className="max-w-full"
          >
            <OverlayRow event={event} config={config} />
          </BlurFade>
        ))}
      </div>

      {config.showStatus && !connected ? (
        <div
          className={cn(
            "w-fit rounded-full px-3 py-1 text-[0.5em] font-medium",
            config.theme === "dark" ? "bg-black/45 text-red-300 backdrop-blur-sm" : "bg-white/75 text-red-600 backdrop-blur-sm",
          )}
        >
          overlay disconnected — retrying
        </div>
      ) : null}
    </div>
  )
}
