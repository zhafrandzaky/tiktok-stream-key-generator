"use client"

import { NumberTicker } from "@/components/ui/number-ticker"
import { cn } from "@/lib/utils"

export function StatusBar({ live, viewerCount }: { live: boolean; viewerCount?: number }) {
  return (
    <div className="glass flex items-center gap-3 rounded-2xl px-4 py-2.5">
      <span
        className={cn(
          "size-2 rounded-full",
          live ? "animate-pulse bg-emerald-500" : "bg-muted-foreground/50",
        )}
      />
      <span className="text-xs font-medium">{live ? "Live" : "Offline"}</span>
      {viewerCount !== undefined ? (
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <NumberTicker value={viewerCount} className="text-xs font-semibold" />
          viewers
        </span>
      ) : null}
    </div>
  )
}
