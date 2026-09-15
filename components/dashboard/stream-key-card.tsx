"use client"

import { useEffect, useState } from "react"
import { Eye, EyeOff, Loader2, PhoneOff } from "lucide-react"
import { useReducedMotion } from "motion/react"
import { toast } from "sonner"
import { CopyButton } from "@/components/copy-button"
import { GlassPanel } from "@/components/glass-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { BorderBeam } from "@/components/ui/border-beam"
import { apiPost } from "@/lib/api-client"
import type { LiveRoomResult } from "@/lib/types"

function maskKey(key: string): string {
  if (key.length <= 8) return "•".repeat(Math.max(key.length, 6))
  const head = key.slice(0, 6)
  const tail = key.slice(-4)
  return `${head}${"•".repeat(Math.max(8, key.length - 10))}${tail}`
}

export function StreamKeyCard({
  room,
  onEnded,
}: {
  room: LiveRoomResult | null
  onEnded: () => void
}) {
  const [revealed, setRevealed] = useState(false)
  const [hideIn, setHideIn] = useState(0)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (!revealed) return
    const hideAt = Date.now() + 60_000
    const id = setInterval(() => {
      const remaining = hideAt - Date.now()
      if (remaining <= 0) {
        setRevealed(false)
        setHideIn(0)
        return
      }
      setHideIn(Math.ceil(remaining / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [revealed])

  const toggleReveal = () => {
    const next = !revealed
    setRevealed(next)
    if (next) setHideIn(60)
  }

  const endStream = async () => {
    setBusy(true)
    try {
      await apiPost("/api/live/end")
      setConfirmOpen(false)
      setRevealed(false)
      toast.success("Stream ended")
      onEnded()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not end the stream")
    } finally {
      setBusy(false)
    }
  }

  return (
    <GlassPanel className="relative overflow-hidden p-6">
      {room && !reduceMotion ? (
        <BorderBeam
          size={120}
          duration={9}
          borderWidth={1}
          colorFrom="#38bdf8"
          colorTo="#94a3b8"
        />
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight">OBS credentials</h2>
        {room ? (
          <Badge variant="secondary" className="rounded-lg">
            <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-emerald-500" />
            Streaming
          </Badge>
        ) : (
          <Badge variant="outline" className="rounded-lg text-muted-foreground">
            Idle
          </Badge>
        )}
      </div>

      <Separator className="my-4 opacity-60" />

      {room ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-border/60 bg-background/40 p-3">
            <p className="text-xs text-muted-foreground">Server URL (RTMP)</p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <code className="min-w-0 truncate text-sm">{room.rtmpUrl}</code>
              <CopyButton
                value={room.rtmpUrl}
                label="Server URL"
                className="focus-glass shrink-0 rounded-lg"
              />
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-background/40 p-3">
            <p className="text-xs text-muted-foreground">Stream key</p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <code className="min-w-0 truncate text-sm">
                {revealed ? room.streamKey : maskKey(room.streamKey)}
              </code>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="focus-glass size-8 rounded-lg"
                  aria-label={revealed ? "Hide stream key" : "Show stream key"}
                  onClick={toggleReveal}
                >
                  {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
                <CopyButton
                  value={room.streamKey}
                  label="Stream key"
                  className="focus-glass rounded-lg"
                />
              </div>
            </div>
            {revealed && hideIn > 0 ? (
              <p className="mt-1 text-[11px] text-muted-foreground">Hides automatically in {hideIn}s</p>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/40 p-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Combined push URL</p>
              <p className="truncate text-xs text-muted-foreground/80">
                Paste this into OBS &ldquo;Server&rdquo; if you prefer a single field
              </p>
            </div>
            <CopyButton
              value={room.combinedPushUrl ?? `${room.rtmpUrl.replace(/\/$/, "")}/${room.streamKey}`}
              label="Combined push URL"
              className="focus-glass shrink-0 rounded-lg"
            />
          </div>

          <div className="flex justify-end pt-1">
            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary" className="focus-glass rounded-xl">
                  <PhoneOff className="size-4" />
                  End stream
                </Button>
              </DialogTrigger>
              <DialogContent className="glass-strong rounded-2xl">
                <DialogHeader>
                  <DialogTitle>End the live stream?</DialogTitle>
                  <DialogDescription>
                    This stops the broadcast on TikTok. OBS will keep sending data until you stop it.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="ghost"
                    className="focus-glass rounded-xl"
                    disabled={busy}
                    onClick={() => setConfirmOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    className="focus-glass rounded-xl"
                    disabled={busy}
                    onClick={endStream}
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <PhoneOff className="size-4" />}
                    End stream
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No active room. Sign in, set a title and create a live room — the RTMP URL and stream key
          appear here, ready to paste into OBS.
        </p>
      )}
    </GlassPanel>
  )
}
