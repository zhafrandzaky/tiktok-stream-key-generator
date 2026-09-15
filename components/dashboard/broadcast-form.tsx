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
import type { LiveRoomResult } from "@/lib/types"

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
  onCreated,
}: {
  disabled?: boolean
  onCreated: (room: LiveRoomResult) => void
}) {
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState<string>("Talk")
  const [ageRestricted, setAgeRestricted] = useState(false)
  const [busy, setBusy] = useState(false)

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
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="focus-glass w-full rounded-xl">
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
