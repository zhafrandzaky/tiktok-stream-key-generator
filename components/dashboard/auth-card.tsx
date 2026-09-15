"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import { Import, Loader2, LogOut, QrCode, RefreshCw, ShieldCheck, UserRound } from "lucide-react"
import { toast } from "sonner"
import { GlassPanel } from "@/components/glass-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ApiError, apiGet, apiPost } from "@/lib/api-client"
import type { SessionState } from "@/lib/types"

type QrPayload = { qrDataUrl: string; expiresAt: number; version: number }
type AuthStatusPayload = SessionState & {
  qr?: QrPayload
  detail?: string
  mode?: "qr" | "window"
  rateLimited?: boolean
  retryAfter?: number
}

function formatCountdown(seconds: number): string {
  const clamped = Math.max(0, seconds)
  const minutes = Math.floor(clamped / 60)
  const rest = clamped % 60
  return `${minutes}:${rest.toString().padStart(2, "0")}`
}

export function AuthCard() {
  const [session, setSession] = useState<SessionState | null>(null)
  const [qr, setQr] = useState<QrPayload | null>(null)
  const [detail, setDetail] = useState<string | undefined>(undefined)
  const [windowMode, setWindowMode] = useState(false)
  const [rateLimited, setRateLimited] = useState(false)
  const [rateLimitMinutes, setRateLimitMinutes] = useState(0)
  const [busy, setBusy] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const authenticatedRef = useRef(false)

  const applyStatus = useCallback((status: AuthStatusPayload) => {
    setSession({
      status: status.status,
      ...(status.uniqueId ? { uniqueId: status.uniqueId } : {}),
      ...(status.nickname ? { nickname: status.nickname } : {}),
    })
    setQr(status.qr ?? null)
    setDetail(status.detail)
    setWindowMode(status.status !== "authenticated" && status.mode === "window")
    setRateLimited(status.status !== "authenticated" && status.rateLimited === true)
    setRateLimitMinutes(status.retryAfter ? Math.max(1, Math.ceil(status.retryAfter / 60)) : 0)
    if (status.qr) {
      setSecondsLeft(Math.max(0, Math.round((status.qr.expiresAt - Date.now()) / 1000)))
    }

    if (status.status === "authenticated" && !authenticatedRef.current) {
      authenticatedRef.current = true
      toast.success(status.uniqueId ? `Signed in as @${status.uniqueId}` : "Signed in to TikTok")
    }
    if (status.status !== "authenticated") {
      authenticatedRef.current = false
    }
  }, [])

  const refreshStatus = useCallback(async () => {
    try {
      const status = await apiGet<AuthStatusPayload>("/api/auth/login/status")
      applyStatus(status)
    } catch (error) {
      if (error instanceof ApiError && error.status === 503) {
        setDetail("Engine unavailable — start the app with `npm run dev`.")
      }
    }
  }, [applyStatus])

  useEffect(() => {
    const id = setTimeout(() => {
      void refreshStatus()
    }, 0)
    return () => clearTimeout(id)
  }, [refreshStatus])

  const isAuthenticated = session?.status === "authenticated"
  const polling = !isAuthenticated && (windowMode || qr !== null || detail !== undefined)

  useEffect(() => {
    if (!polling) return
    const id = setInterval(() => {
      void refreshStatus()
    }, 2000)
    return () => clearInterval(id)
  }, [polling, refreshStatus])

  useEffect(() => {
    if (!qr) return
    const id = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.round((qr.expiresAt - Date.now()) / 1000)))
    }, 1000)
    return () => clearInterval(id)
  }, [qr])

  const startLogin = async (mode: "qr" | "window" = "qr") => {
    setBusy(true)
    try {
      const payload = await apiPost<QrPayload>("/api/auth/login/start", { mode })
      if (payload.qrDataUrl) {
        setQr(payload)
        setSecondsLeft(Math.max(0, Math.round((payload.expiresAt - Date.now()) / 1000)))
      } else {
        setQr(null)
      }
      setDetail(undefined)
      setWindowMode(mode === "window")
      setSession({ status: "anonymous" })
      toast.info(
        mode === "window"
          ? "Complete the login in the browser window"
          : "Scan the QR code with the TikTok app",
      )
    } catch (error) {
      if (error instanceof ApiError && error.code === "ALREADY_AUTHENTICATED") {
        await refreshStatus()
        return
      }
      if (error instanceof ApiError && error.code === "LOGIN_RATE_LIMITED") {
        const minutes = Math.max(1, Math.ceil((error.retryAfter ?? 300) / 60))
        toast.error(`TikTok rate-limited QR login. Retry in ~${minutes} min, or use "Open login window".`)
        await refreshStatus()
        return
      }
      toast.error(error instanceof Error ? error.message : "Could not start login")
      await refreshStatus()
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    setBusy(true)
    try {
      await apiPost("/api/auth/logout")
      setSession({ status: "anonymous" })
      setQr(null)
      setDetail(undefined)
      toast.success("Signed out of TikTok")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign out")
    } finally {
      setBusy(false)
    }
  }

  const switchAccount = async () => {
    await logout()
    await startLogin()
  }

  const importFromFirefox = async () => {
    setBusy(true)
    try {
      await apiPost("/api/auth/import/firefox")
      toast.success("Imported the TikTok session from Firefox")
      await refreshStatus()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import the Firefox session")
    } finally {
      setBusy(false)
    }
  }

  return (
    <GlassPanel className="p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-tight">TikTok account</h2>
        </div>
        {isAuthenticated ? (
          <Badge variant="secondary" className="rounded-lg">
            Connected
          </Badge>
        ) : (
          <Badge variant="outline" className="rounded-lg text-muted-foreground">
            Not signed in
          </Badge>
        )}
      </div>

      <Separator className="my-4 opacity-60" />

      {isAuthenticated ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-secondary">
              <UserRound className="size-5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {session?.nickname ?? session?.uniqueId ?? "TikTok creator"}
              </p>
              {session?.uniqueId ? (
                <p className="truncate text-xs text-muted-foreground">@{session.uniqueId}</p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              className="focus-glass rounded-xl"
              disabled={busy}
              onClick={switchAccount}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Switch account
            </Button>
            <Button variant="ghost" className="focus-glass rounded-xl" disabled={busy} onClick={logout}>
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </div>
      ) : windowMode ? (
        <div className="space-y-4 py-2 text-center">
          <Loader2 className="mx-auto size-8 animate-spin text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Waiting for login in the browser window…</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Log in there with your email and password — QR login stays paused while TikTok
              rate-limits it. This page detects the session automatically.
            </p>
          </div>
          {detail ? <p className="text-xs text-amber-600 dark:text-amber-400">{detail}</p> : null}
          <div className="flex justify-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="focus-glass rounded-xl"
              disabled={busy}
              onClick={() => startLogin("qr")}
            >
              <QrCode className="size-4" />
              Use QR code instead
            </Button>
            <Button variant="ghost" size="sm" className="focus-glass rounded-xl" disabled={busy} onClick={logout}>
              Cancel
            </Button>
          </div>
        </div>
      ) : qr ? (
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="rounded-2xl bg-white p-3 shadow-sm">
              <Image
                src={qr.qrDataUrl}
                alt="TikTok login QR code"
                width={220}
                height={220}
                unoptimized
                className="h-[220px] w-[220px] rounded-lg"
              />
            </div>
          </div>
          <div className="text-center text-sm">
            <p className="font-medium">Scan with the TikTok mobile app</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Profile → menu → Scan. Code refreshes automatically · expires in {formatCountdown(secondsLeft)}
            </p>
          </div>
          {detail ? <p className="text-center text-xs text-amber-600 dark:text-amber-400">{detail}</p> : null}
          {rateLimited ? (
            <p className="text-center text-xs text-muted-foreground">
              TikTok paused QR login for this network
              {rateLimitMinutes ? ` (~${rateLimitMinutes} min)` : ""}. The login window works right away.
            </p>
          ) : null}
          <div className="flex justify-center gap-2">
            <Button
              variant={rateLimited ? "default" : "ghost"}
              size="sm"
              className="focus-glass rounded-xl"
              disabled={busy}
              onClick={() => startLogin("window")}
            >
              Open login window
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="focus-glass rounded-xl"
              disabled={busy}
              onClick={() => startLogin("qr")}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Refresh code
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 py-2 text-center">
          <QrCode className="mx-auto size-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Sign in with QR code</p>
            <p className="mt-1 text-xs text-muted-foreground">
              A TikTok QR code opens right here. No password is stored and no browser data leaves this machine.
            </p>
          </div>
          {detail ? <p className="text-xs text-amber-600 dark:text-amber-400">{detail}</p> : null}
          {rateLimited ? (
            <p className="text-xs text-muted-foreground">
              TikTok paused QR login for this network
              {rateLimitMinutes ? ` (~${rateLimitMinutes} min)` : ""}. Sign in with email and
              password in the login window instead.
            </p>
          ) : null}
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              variant={rateLimited ? "default" : "secondary"}
              className="focus-glass rounded-xl"
              disabled={busy}
              onClick={() => startLogin("window")}
            >
              Open login window
            </Button>
            <Button
              variant={rateLimited ? "ghost" : "default"}
              className="focus-glass rounded-xl"
              disabled={busy}
              onClick={() => startLogin("qr")}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <QrCode className="size-4" />}
              Sign in with TikTok
            </Button>
          </div>
          <div className="space-y-1.5 pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="focus-glass rounded-xl"
              disabled={busy}
              onClick={importFromFirefox}
            >
              <Import className="size-4" />
              Import session from Firefox
            </Button>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Already logged in at tiktok.com in Firefox on this machine? Import that session — the
              app reuses it for stream keys and chat, no second login required.
            </p>
          </div>
        </div>
      )}
    </GlassPanel>
  )
}
