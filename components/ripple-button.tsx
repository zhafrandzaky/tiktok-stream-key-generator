"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Ripple = { id: number; x: number; y: number }

export function RippleButton({
  children,
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const [ripples, setRipples] = useState<Ripple[]>([])

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const id = Date.now() + Math.random()
    setRipples((prev) => [
      ...prev,
      { id, x: event.clientX - rect.left, y: event.clientY - rect.top },
    ])
    setTimeout(() => {
      setRipples((prev) => prev.filter((ripple) => ripple.id !== id))
    }, 650)
    onClick?.(event)
  }

  return (
    <Button {...props} className={cn("relative overflow-hidden", className)} onClick={handleClick}>
      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          aria-hidden
          className="animate-ripple-click pointer-events-none absolute size-2 rounded-full bg-current"
          style={{ left: ripple.x, top: ripple.y }}
        />
      ))}
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </Button>
  )
}
