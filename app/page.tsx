import { AuthCard } from "@/components/dashboard/auth-card"
import { ChatPanel } from "@/components/dashboard/chat-panel"
import { LiveStudio } from "@/components/dashboard/live-studio"
import { ThemeToggle } from "@/components/theme-toggle"

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-[1680px] flex-1 flex-col p-4 sm:p-6 lg:p-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">TikTok Live Studio Kit</h1>
          <p className="text-sm text-muted-foreground">
            Stream key extractor &amp; real-time chat reader for OBS
          </p>
        </div>
        <ThemeToggle />
      </header>

      <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
        <section className="space-y-6">
          <AuthCard />
          <LiveStudio />
        </section>

        <section className="min-w-0 lg:relative">
          <ChatPanel />
        </section>
      </div>

      <footer className="mt-10 text-xs text-muted-foreground">
        Unofficial automation — may violate TikTok&apos;s terms of service. Use at your own risk.
      </footer>
    </main>
  )
}
