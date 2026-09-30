"use client"

import { useState } from "react"
import { Loader2, Radio } from "lucide-react"
import { toast } from "sonner"
import { GlassPanel } from "@/components/glass-panel"
import { RippleButton } from "@/components/ripple-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { apiPost } from "@/lib/api-client"
import { buildQualityOptions, type Orientation } from "@/lib/stream-quality"
import type { LiveRoomResult } from "@/lib/types"
import { cn } from "@/lib/utils"

const CATEGORIES = [
  "Talk",
  "Gaming",
  "Music",
  "Entertainment",
  "Sports",
  "Education",
  "Lifestyle",
]

export function BroadcastForm({
  disabled,
  qualityKey,
  onQualityChange,
  orientation,
  onOrientationChange,
  onCreated,
}: {
  disabled?: boolean
  qualityKey: string
  onQualityChange: (key: string) => void
  orientation: Orientation
  onOrientationChange: (orientation: Orientation) => void
  onCreated: (room: LiveRoomResult) => void
}) {
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState<string>("Talk")
  const [ageRestricted, setAgeRestricted] = useState(false)
  const [busy, setBusy] = useState(false)
  const qualityOptions = buildQualityOptions({ orientation })

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) {
      toast.error("Enter a live title first")
      return
    }
    setBusy(true)
    try {
      const room = await apiPost<LiveRoomResult>("/api/live/create", {
        title: trimmed,
        category,
        ageRestricted,
      })
      toast.success("Live room created — credentials ready for OBS")
      onCreated(room)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the live room")
    } finally {
      setBusy(false)
    }
  }

  return (
    <GlassPanel className="p-6">
      <h2 className="text-sm font-semibold tracking-tight">Broadcast setup</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Configure the room before going live. Options unavailable on TikTok&apos;s page are skipped.
      </p>
      <Separator className="my-4 opacity-60" />
      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-2">
          <Label htmlFor="live-title">Live title</Label>
          <Input
            id="live-title"
            value={title}
            maxLength={100}
            placeholder="Tonight's session"
            className="focus-glass rounded-xl"
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="live-category">Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="live-category" className="focus-glass w-full rounded-xl">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent className="glass-strong rounded-xl">
              {CATEGORIES.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Orientation</Label>
          <div className="flex gap-1">
            {(["portrait", "landscape"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={orientation === value}
                className={cn(
                  "focus-glass rounded-xl border px-3 py-1.5 text-xs capitalize transition-colors",
                  orientation === value
                    ? "border-white/20 bg-secondary text-secondary-foreground"
                    : "border-transparent text-muted-foreground hover:bg-secondary/50",
                )}
                onClick={() => onOrientationChange(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="stream-quality">Stream quality</Label>
          <Select value={qualityKey} onValueChange={onQualityChange}>
            <SelectTrigger id="stream-quality" className="focus-glass w-full rounded-xl">
              <SelectValue placeholder="Choose quality" />
            </SelectTrigger>
            <SelectContent className="glass-strong rounded-xl">
              {qualityOptions.map((option) => (
                <SelectItem key={option.key} value={option.key}>
                  {option.label} · {option.width}×{option.height} · {option.fps} fps · {option.bitrateKbps} kbps
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            TikTok transcodes server-side — use the same numbers in OBS. The preset is shown with your
            credentials.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Age restriction</p>
            <p className="text-xs text-muted-foreground">Restrict the room to viewers 18+</p>
          </div>
          <Switch
            checked={ageRestricted}
            className="focus-glass"
            onCheckedChange={setAgeRestricted}
            aria-label="Age restriction"
          />
        </div>

        <RippleButton
          type="submit"
          disabled={busy || disabled}
          className="focus-glass w-full rounded-xl"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Radio className="size-4" />}
          Create live room &amp; get stream key
        </RippleButton>
      </form>
    </GlassPanel>
  )
}
