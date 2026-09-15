"use client"

import { Gift, Heart, Share2, ThumbsUp, UserPlus, Wifi, WifiOff } from "lucide-react"
import type { ChatEvent } from "@/lib/types"
import { cn } from "@/lib/utils"

export function EventRow({ event, className }: { event: ChatEvent; className?: string }) {
  const base = "flex items-start gap-2 text-sm leading-relaxed"

  switch (event.type) {
    case "chat":
      return (
        <div className={cn(base, className)}>
          <span className="shrink-0 font-semibold">{event.user.nickname}</span>
          <span className="min-w-0 break-words text-muted-foreground">{event.comment}</span>
        </div>
      )
    case "gift":
      return (
        <div className={cn(base, "text-amber-600 dark:text-amber-400", className)}>
          <Gift className="mt-0.5 size-4 shrink-0" />
          <span className="font-medium">{event.user.nickname}</span>
          <span className="min-w-0 text-muted-foreground">
            sent{" "}
            {event.giftName ? `${event.giftName} x${event.repeatCount}` : `${event.repeatCount} gifts`}
            {event.diamonds ? ` · ${event.diamonds} coins` : ""}
          </span>
        </div>
      )
    case "follow":
      return (
        <div className={cn(base, "text-sky-600 dark:text-sky-400", className)}>
          <UserPlus className="mt-0.5 size-4 shrink-0" />
          <span className="font-medium">{event.user.nickname}</span>
          <span className="text-muted-foreground">followed</span>
        </div>
      )
    case "share":
      return (
        <div className={cn(base, "text-sky-600 dark:text-sky-400", className)}>
          <Share2 className="mt-0.5 size-4 shrink-0" />
          <span className="font-medium">{event.user.nickname}</span>
          <span className="text-muted-foreground">shared the stream</span>
        </div>
      )
    case "like":
      return (
        <div className={cn(base, "text-rose-600 dark:text-rose-400", className)}>
          <Heart className="mt-0.5 size-4 shrink-0" />
          <span className="text-muted-foreground">
            {event.user ? `${event.user.nickname} sent` : "Likes"} {event.count} likes
            {event.total ? ` · ${event.total} total` : ""}
          </span>
        </div>
      )
    case "member":
      return (
        <div className={cn(base, "text-muted-foreground", className)}>
          <ThumbsUp className="mt-0.5 size-4 shrink-0" />
          <span>{event.user.nickname} joined</span>
        </div>
      )
    case "viewerCount":
      return (
        <div className={cn(base, "text-muted-foreground", className)}>
          <span>
            {event.count} viewers
            {event.total !== undefined ? ` · ${event.total} total entered` : ""}
          </span>
        </div>
      )
    case "streamEnd":
      return (
        <div className={cn(base, "text-muted-foreground", className)}>
          <span>Stream ended{event.reason ? ` (${event.reason})` : ""}</span>
        </div>
      )
    case "status":
      return (
        <div className={cn(base, "text-muted-foreground", className)}>
          {event.state === "connected" ? (
            <Wifi className="mt-0.5 size-4 shrink-0 text-emerald-500" />
          ) : (
            <WifiOff className="mt-0.5 size-4 shrink-0" />
          )}
          <span>
            {event.state}
            {event.detail ? ` · ${event.detail}` : ""}
          </span>
        </div>
      )
    default:
      return null
  }
}
