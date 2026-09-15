import { cn } from "@/lib/utils"

export function GlassPanel({
  className,
  strong,
  ...props
}: React.ComponentProps<"div"> & { strong?: boolean }) {
  return (
    <div
      className={cn(strong ? "glass-strong" : "glass", "rounded-3xl", className)}
      {...props}
    />
  )
}
