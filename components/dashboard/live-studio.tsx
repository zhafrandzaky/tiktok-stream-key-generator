"use client"

import { useEffect, useState } from "react"
import { BroadcastForm } from "@/components/dashboard/broadcast-form"
import { StatusBar } from "@/components/dashboard/status-bar"
import { StreamKeyCard } from "@/components/dashboard/stream-key-card"
import { apiGet } from "@/lib/api-client"
import type { LiveRoomResult, LiveStatus } from "@/lib/types"

export function LiveStudio() {
  const [room, setRoom] = useState<LiveRoomResult | null>(null)
  const [live, setLive] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => {
      void apiGet<LiveStatus>("/api/live/status")
        .then((status) => {
          setRoom(status.room ?? null)
          setLive(status.live)
        })
        .catch(() => undefined)
    }, 0)
    return () => clearTimeout(id)
  }, [])

  return (
    <div className="space-y-6">
      <StatusBar live={live} />
      <BroadcastForm
        disabled={live}
        onCreated={(created) => {
          setRoom(created)
          setLive(true)
        }}
      />
      <StreamKeyCard
        room={room}
        onEnded={() => {
          setRoom(null)
          setLive(false)
        }}
      />
    </div>
  )
}
