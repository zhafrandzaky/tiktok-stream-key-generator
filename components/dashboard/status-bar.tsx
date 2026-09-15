"use client"

import { cn } from "@/lib/utils"

export function StatusBar({ live }: { live: boolean }) {
  return (
    <div className="glass flex items-center gap-3 rounded-2xl px-4 py-2.5">
      <span
        className={cn(
          "size-2 rounded-full",
          live ? "animate-pulse bg-emerald-500" : "bg-muted-foreground/50",
        )}
      />
      <span className="text-xs font-medium">{live ? "Live" : "Offline"}</span>
    </div>
  )
}
