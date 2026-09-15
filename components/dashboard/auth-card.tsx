"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import { Loader2, LogOut, QrCode, RefreshCw, ShieldCheck, UserRound } from "lucide-react"
import { toast } from "sonner"
import { GlassPanel } from "@/components/glass-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ApiError, apiGet, apiPost } from "@/lib/api-client"
import type { SessionState } from "@/lib/types"

type QrPayload = { qrDataUrl: string; expiresAt: number; version: number }
type AuthStatusPayload = SessionState & { qr?: QrPayload; detail?: string }

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
  const polling = !isAuthenticated && (qr !== null || detail !== undefined)

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

  const startLogin = async () => {
    setBusy(true)
    try {
      const payload = await apiPost<QrPayload>("/api/auth/login/start")
      setQr(payload)
      setSecondsLeft(Math.max(0, Math.round((payload.expiresAt - Date.now()) / 1000)))
      setDetail(undefined)
      setSession({ status: "anonymous" })
      toast.info("Scan the QR code with the TikTok app")
    } catch (error) {
      if (error instanceof ApiError && error.code === "ALREADY_AUTHENTICATED") {
        await refreshStatus()
        return
      }
      toast.error(error instanceof Error ? error.message : "Could not start login")
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
          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              className="focus-glass rounded-xl"
              disabled={busy}
              onClick={startLogin}
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
          <Button className="focus-glass rounded-xl" disabled={busy} onClick={startLogin}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <QrCode className="size-4" />}
            Sign in with TikTok
          </Button>
        </div>
      )}
    </GlassPanel>
  )
}
