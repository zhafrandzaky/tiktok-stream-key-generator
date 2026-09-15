"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

function legacyCopy(value: string): boolean {
  const textarea = document.createElement("textarea")
  textarea.value = value
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.appendChild(textarea)
  textarea.select()
  const ok = document.execCommand("copy")
  document.body.removeChild(textarea)
  return ok
}

async function writeClipboard(value: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    const ok = await navigator.clipboard
      .writeText(value)
      .then(() => true)
      .catch(() => false)
    if (ok) return true
  }
  return legacyCopy(value)
}

export function CopyButton({
  value,
  label,
  className,
  variant = "ghost",
  size = "sm",
}: {
  value: string
  label: string
  className?: string
  variant?: React.ComponentProps<typeof Button>["variant"]
  size?: React.ComponentProps<typeof Button>["size"]
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    const ok = await writeClipboard(value)
    if (!ok) {
      toast.error("Copy failed — select the value and copy manually")
      return
    }
    setCopied(true)
    toast.success(`${label} copied`)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={copy}
      aria-label={`Copy ${label}`}
      className={className}
    >
      {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  )
}
