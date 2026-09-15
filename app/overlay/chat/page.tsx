import { Suspense } from "react"
import { ChatOverlay } from "@/components/overlay/chat-overlay"

export default function OverlayChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatOverlay />
    </Suspense>
  )
}
