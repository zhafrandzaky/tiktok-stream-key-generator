import { createHash } from "node:crypto"
import type { BrowserContext, Locator, Page, Response } from "playwright"
import {
  isMaximumAttemptsMessage,
  parseQrCheck,
  parseQrSession,
  type QrSession,
} from "@/lib/parsers/tiktok-auth"
import type { SessionState } from "@/lib/types"
import type { BrowserManager } from "./browser"
import type { AuthController, AuthQr, AuthStatus, LoginMode } from "./engine"
import { AlreadyAuthenticatedError, LoginPageFailedError, LoginRateLimitedError, SessionImportFailedError } from "./errors"
import { importFirefoxSession } from "./firefox-import"
import { computeRateLimitHit, createRateLimitStore, type RateLimitStore } from "./rate-limit-store"
import type { SessionStore } from "./session-store"

export const DEFAULT_LOGIN_URLS = [
  "https://www.tiktok.com/login/qrcode",
  "https://www.tiktok.com/login?lang=en",
]

export const WINDOW_LOGIN_URLS = [
  "https://www.tiktok.com/login/phone-or-email/email",
  "https://www.tiktok.com/login?lang=en",
]

export const QR_SELECTORS = [
  'canvas[data-e2e*="qr" i]',
  '[data-e2e*="qrcode" i] canvas',
  'img[alt*="qr" i]',
  '[class*="qrcode" i] canvas',
  '[class*="qr-code" i]',
  '[class*="qrCode" i]',
  'canvas',
]

export const CAPTCHA_SELECTORS = [
  'iframe[src*="captcha" i]',
  '[id*="captcha" i]',
  '[class*="captcha" i]',
  '[data-e2e*="captcha" i]',
]

export const IDENTITY_SELECTORS = {
  uniqueId: ['[data-e2e="profile-username"]', '[data-e2e="user-title"]', 'h1[data-e2e*="username" i]'],
  nickname: ['[data-e2e="profile-nickname"]', '[data-e2e="user-subtitle"]'],
}

const QR_TAB_PATTERNS = [/qr code/i, /log in with qr/i]
const QR_CAPTURE_TIMEOUT_MS = 10_000
const GET_QRCODE_PATH = "/passport/web/get_qrcode/"
const CHECK_QRCONNECT_PATH = "/passport/web/check_qrconnect/"

export function hasSessionCookie(cookies: Array<{ name: string; value: string }>): boolean {
  return cookies.some((cookie) => cookie.name === "sessionid" && cookie.value.trim().length > 0)
}

export function classifyPageState(input: {
  hasQr: boolean
  hasCaptcha: boolean
  url: string
}): "qr" | "captcha" | "logged-in" | "unknown" {
  if (input.hasCaptcha) return "captcha"
  if (input.hasQr) return "qr"
  const url = input.url.toLowerCase()
  const onAuthUrl = url.includes("/login") || url.includes("/signup") || url.includes("/captcha")
  if (!onAuthUrl && url.startsWith("http")) return "logged-in"
  return "unknown"
}

export function bumpQrVersion(
  prev: { hash: string; version: number } | null,
  currentHash: string,
): { hash: string; version: number; changed: boolean } {
  if (!prev) return { hash: currentHash, version: 1, changed: true }
  if (prev.hash === currentHash) return { hash: prev.hash, version: prev.version, changed: false }
  return { hash: currentHash, version: prev.version + 1, changed: true }
}

function isVisible(locator: Locator): Promise<boolean> {
  return locator
    .isVisible({ timeout: 250 })
    .then((visible) => visible)
    .catch(() => false)
}

function hashQrDataUrl(dataUrl: string): string {
  return createHash("sha256").update(dataUrl).digest("hex").slice(0, 16)
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function createAuthManager(deps: {
  browsers: BrowserManager
  store: SessionStore
  rateLimitStore?: RateLimitStore
  dataDir?: string
  loginUrls?: string[]
  pollMs?: number
  captureTimeoutMs?: number
}): AuthController {
  const loginUrls = deps.loginUrls ?? DEFAULT_LOGIN_URLS
  const rateLimitStore =
    deps.rateLimitStore ?? createRateLimitStore(deps.dataDir ?? process.env.DATA_DIR ?? ".data")
  const pollMs = deps.pollMs ?? 1000
  const captureTimeoutMs = deps.captureTimeoutMs ?? QR_CAPTURE_TIMEOUT_MS

  let session: SessionState = { status: "anonymous" }
  let qr: AuthQr | null = null
  let qrMeta: { hash: string; version: number } | null = null
  let detail: string | undefined
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let pollBusy = false
  let captchaRelaunched = false
  let loginPage: Page | null = null
  let parked = false
  let activeMode: LoginMode | null = null
  let rateLimitedUntil = 0
  const instrumented = new WeakSet<Page>()

  const stopPolling = () => {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  const startPolling = () => {
    if (pollTimer) return
    pollTimer = setInterval(() => {
      pollOnce().catch(() => undefined)
    }, pollMs)
  }

  const resolveStoredSession = async (): Promise<SessionState> => {
    if (session.status === "authenticated") return session
    const stored = (await deps.store.readState()) as {
      cookies?: Array<{ name: string; value: string }>
    } | null
    if (stored?.cookies?.length && hasSessionCookie(stored.cookies)) {
      session = { status: "authenticated" }
    }
    return session
  }

  const applyQrSession = (incoming: QrSession) => {
    const next = bumpQrVersion(qrMeta, hashQrDataUrl(incoming.qrDataUrl))
    qrMeta = { hash: next.hash, version: next.version }
    if (!next.changed && qr) {
      qr = { ...qr, expiresAt: incoming.expiresAt }
      return
    }
    qr = { qrDataUrl: incoming.qrDataUrl, expiresAt: incoming.expiresAt, version: next.version }
  }

  const parkLoginPage = async () => {
    const page = loginPage
    if (!page || page.isClosed()) return
    parked = true
    await page.goto("about:blank", { timeout: 5000 }).catch(() => undefined)
  }

  const handleRateLimited = async (description?: string) => {
    if (Date.now() < rateLimitedUntil) return
    const previous = await rateLimitStore.read().catch(() => null)
    const { state, cooldownMs } = computeRateLimitHit(previous)
    rateLimitedUntil = state.until
    await rateLimitStore.write(state).catch(() => undefined)
    const minutes = Math.max(1, Math.ceil(cooldownMs / 60_000))
    detail = description
      ? `${description} QR login is paused for ~${minutes} min — or use "Open login window" (email & password).`
      : `TikTok rate-limited QR login. It is paused for ~${minutes} min — or use "Open login window" (email & password).`
    if (activeMode === "qr") {
      await parkLoginPage()
    }
  }

  const clearRateLimit = async () => {
    if (rateLimitedUntil === 0) return
    rateLimitedUntil = 0
    await rateLimitStore.clear().catch(() => undefined)
  }

  const hydrateRateLimit = async () => {
    const stored = await rateLimitStore.read().catch(() => null)
    if (stored && stored.until > Date.now()) {
      rateLimitedUntil = stored.until
    }
  }

  const handleLoginBlocked = async () => {
    if (Date.now() < rateLimitedUntil) return
    const previous = await rateLimitStore.read().catch(() => null)
    const { state, cooldownMs } = computeRateLimitHit(previous)
    rateLimitedUntil = state.until
    await rateLimitStore.write(state).catch(() => undefined)
    const minutes = Math.max(1, Math.ceil(cooldownMs / 60_000))
    detail = `TikTok blocked login attempts from this network (too many tries). Wait ~${minutes} min without retrying — repeated attempts extend the block.`
    if (activeMode === "qr") {
      await parkLoginPage()
    }
  }

  const handleResponse = async (response: Response) => {
    const url = response.url()
    const isPassport = url.includes("/passport/") || url.includes("/api/")
    if (!isPassport) return

    const raw = await response.text().catch(() => "")
    if (!raw) return

    if (url.includes(GET_QRCODE_PATH)) {
      const payload = tryParseJson(raw)
      const parsed = parseQrSession(payload)
      if (parsed) applyQrSession(parsed)
      return
    }

    if (url.includes(CHECK_QRCONNECT_PATH)) {
      if (response.status() !== 200) return
      const check = parseQrCheck(tryParseJson(raw))
      if (check.state === "rate_limited") {
        await handleRateLimited(check.description)
        return
      }
      if (check.state === "error") return
      if (check.state === "scanned") {
        detail = "QR scanned — confirm the login on your phone."
      } else if (check.state === "expired") {
        detail = "QR expired — TikTok is refreshing the code."
      } else if (check.state === "confirmed") {
        detail = "Login confirmed — finishing sign-in…"
      }
      await clearRateLimit()
      return
    }

    if (isMaximumAttemptsMessage(raw)) {
      await handleLoginBlocked()
    }
  }

  const instrumentPage = (page: Page) => {
    if (instrumented.has(page)) return
    instrumented.add(page)
    page.on("response", (response) => {
      void handleResponse(response)
    })
  }

  const findVisible = async (page: Page, selectors: string[]): Promise<Locator | null> => {
    for (const selector of selectors) {
      const locator = page.locator(selector).first()
      if (await isVisible(locator)) return locator
    }
    return null
  }

  const readIdentity = async (page: Page): Promise<{ uniqueId?: string; nickname?: string } | null> => {
    const read = async (selectors: string[]): Promise<string | undefined> => {
      for (const selector of selectors) {
        const text = await page
          .locator(selector)
          .first()
          .textContent({ timeout: 500 })
          .catch(() => null)
        const trimmed = text?.trim()
        if (trimmed) return trimmed
      }
      return undefined
    }
    const uniqueId = await read(IDENTITY_SELECTORS.uniqueId)
    const nickname = await read(IDENTITY_SELECTORS.nickname)
    if (!uniqueId && !nickname) return null
    return { ...(uniqueId ? { uniqueId } : {}), ...(nickname ? { nickname } : {}) }
  }

  const captureQrFromPage = async (page: Page): Promise<AuthQr | null> => {
    const dataUrl = await page
      .evaluate(() => {
        const canvases = Array.from(document.querySelectorAll("canvas"))
        for (const canvas of canvases) {
          if (canvas.offsetWidth > 100 && canvas.offsetHeight > 100) {
            try {
              return canvas.toDataURL("image/png")
            } catch {
              return null
            }
          }
        }
        return null
      })
      .catch(() => null)

    if (dataUrl) {
      applyQrSession({ qrDataUrl: dataUrl, expiresAt: Date.now() + 120_000 })
      return qr
    }

    const element = await findVisible(page, QR_SELECTORS)
    if (!element) return null
    const buffer = await element.screenshot({ type: "png", animations: "disabled" }).catch(() => null)
    if (!buffer) return null
    applyQrSession({
      qrDataUrl: `data:image/png;base64,${buffer.toString("base64")}`,
      expiresAt: Date.now() + 120_000,
    })
    return qr
  }

  const waitForQrSession = async (page: Page): Promise<AuthQr | null> => {
    const deadline = Date.now() + captureTimeoutMs
    while (Date.now() < deadline) {
      if (qr) return qr
      if (Date.now() < rateLimitedUntil) return null
      await page.waitForTimeout(250)
    }
    return qr ?? (await captureQrFromPage(page))
  }

  const openLoginPage = async (
    context: BrowserContext,
    urls: string[] = loginUrls,
    options: { requireQr?: boolean } = {},
  ): Promise<Page> => {
    const requireQr = options.requireQr ?? true
    if (parked) {
      loginPage = null
      parked = false
    }
    const page = loginPage && !loginPage.isClosed() ? loginPage : await context.newPage()
    loginPage = page
    instrumentPage(page)

    for (const url of urls) {
      const loaded = await page
        .goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 })
        .then(() => true)
        .catch(() => false)
      if (!loaded) continue

      if (!requireQr) return page

      if (await findVisible(page, QR_SELECTORS)) return page

      for (const pattern of QR_TAB_PATTERNS) {
        const tab = page.getByText(pattern).first()
        if (await isVisible(tab)) {
          await tab.click({ timeout: 2000 }).catch(() => undefined)
          break
        }
      }

      if (await findVisible(page, QR_SELECTORS)) return page
    }
    throw new LoginPageFailedError()
  }

  const restoreSession = async (context: BrowserContext): Promise<boolean> => {
    const cookies = await context.cookies()
    if (hasSessionCookie(cookies)) return true
    const state = (await deps.store.readState()) as {
      cookies?: Array<{ name: string; value: string; domain: string; path: string }>
    } | null
    if (!state?.cookies?.length) return false
    await context.addCookies(state.cookies).catch(() => undefined)
    const restored = await context.cookies()
    return hasSessionCookie(restored)
  }

  const completeLogin = async (context: BrowserContext) => {
    stopPolling()
    const state = await context.storageState().catch(() => null)
    if (state) await deps.store.writeState(state).catch(() => undefined)
    const page = loginPage ?? context.pages().at(-1)
    const identity = page ? (await readIdentity(page).catch(() => null)) : null
    session = { status: "authenticated", ...(identity ?? {}) }
    qr = null
    qrMeta = null
    detail = undefined
    activeMode = null
    parked = false
  }

  const pollOnce = async (): Promise<void> => {
    if (pollBusy) return
    pollBusy = true
    try {
      const context = deps.browsers.currentContext()
      if (!context) return
      const cookies = await context.cookies()
      if (hasSessionCookie(cookies)) {
        await completeLogin(context)
        return
      }
      if (parked) return
      const page = loginPage && !loginPage.isClosed() ? loginPage : context.pages().at(-1)
      if (!page) return

      const hasCaptcha = Boolean(await findVisible(page, CAPTCHA_SELECTORS))
      if (hasCaptcha) {
        detail = "TikTok requires human verification. Complete it in the opened browser window."
        if (activeMode === "qr" && !deps.browsers.isHeaded() && !captchaRelaunched) {
          captchaRelaunched = true
          const relaunched = await deps.browsers.relaunchHeaded()
          loginPage = null
          const reopened = await openLoginPage(relaunched).catch(() => null)
          if (reopened) await captureQrFromPage(reopened)
        }
        return
      }

      if (activeMode === "window") {
        const blocked = await page
          .getByText(/maximum number of attempts|too many (login )?attempts/i)
          .first()
          .isVisible({ timeout: 250 })
          .catch(() => false)
        if (blocked) await handleLoginBlocked()
        return
      }

      const hasQr = Boolean(await findVisible(page, QR_SELECTORS))
      if (hasQr && !qr) {
        await captureQrFromPage(page)
      }
    } finally {
      pollBusy = false
    }
  }

  return {
    async start(mode: LoginMode = "qr"): Promise<AuthQr> {
      if (session.status === "authenticated") throw new AlreadyAuthenticatedError()
      await hydrateRateLimit()
      if (mode === "qr" && Date.now() < rateLimitedUntil) {
        const remainingSeconds = Math.max(1, Math.ceil((rateLimitedUntil - Date.now()) / 1000))
        throw new LoginRateLimitedError(
          `TikTok is still rate-limiting QR login. Retry in ~${Math.ceil(remainingSeconds / 60)} min, or use "Open login window".`,
          remainingSeconds,
        )
      }

      const context =
        mode === "window" ? await deps.browsers.ensureHeaded() : await deps.browsers.getContext()

      const restored = await restoreSession(context)
      if (restored) {
        await completeLogin(context)
        throw new AlreadyAuthenticatedError("Existing TikTok session restored.")
      }

      await deps.store.clear().catch(() => undefined)
      activeMode = mode
      const page =
        mode === "window"
          ? await openLoginPage(context, WINDOW_LOGIN_URLS, { requireQr: false })
          : await openLoginPage(context)

      if (mode === "window") {
        detail =
          "Log in with your email and password in the browser window. This page detects it automatically."
        startPolling()
        return qr ?? { qrDataUrl: "", expiresAt: 0, version: 0 }
      }

      const captured = await waitForQrSession(page)
      if (!captured) {
        if (Date.now() < rateLimitedUntil) {
          const remainingSeconds = Math.max(1, Math.ceil((rateLimitedUntil - Date.now()) / 1000))
          throw new LoginRateLimitedError(
            `TikTok is rate-limiting QR login. Retry in ~${Math.ceil(remainingSeconds / 60)} min, or use "Open login window".`,
            remainingSeconds,
          )
        }
        throw new LoginPageFailedError()
      }
      startPolling()
      return captured
    },

    async status(): Promise<AuthStatus> {
      const current = await resolveStoredSession()
      await hydrateRateLimit()
      const rateLimited = Date.now() < rateLimitedUntil
      return {
        ...current,
        ...(qr ? { qr } : {}),
        ...(detail ? { detail } : {}),
        ...(activeMode ? { mode: activeMode } : {}),
        ...(rateLimited
          ? { rateLimited: true, retryAfter: Math.max(1, Math.ceil((rateLimitedUntil - Date.now()) / 1000)) }
          : {}),
      }
    },

    async logout(): Promise<void> {
      stopPolling()
      session = { status: "anonymous" }
      qr = null
      qrMeta = null
      detail = undefined
      captchaRelaunched = false
      loginPage = null
      parked = false
      activeMode = null
      await hydrateRateLimit()
      await deps.store.clear().catch(() => undefined)
      await deps.browsers.clearCookies()
      await deps.browsers.dispose()
    },

    async session(): Promise<SessionState> {
      return resolveStoredSession()
    },

    async importFromFirefox(): Promise<SessionState> {
      const imported = await importFirefoxSession()
      if (!imported) throw new SessionImportFailedError()

      const context = await deps.browsers.getContext()
      await context.clearCookies().catch(() => undefined)
      await context.addCookies(imported.cookies)
      const cookies = await context.cookies()
      if (!hasSessionCookie(cookies)) {
        throw new SessionImportFailedError(
          "The Firefox session could not be transferred to the app browser. Try logging in again in Firefox.",
        )
      }

      const state = await context.storageState().catch(() => null)
      if (state) await deps.store.writeState(state)

      stopPolling()
      session = { status: "authenticated" }
      qr = null
      qrMeta = null
      detail = `Imported session from Firefox (${imported.profilePath}).`
      activeMode = null
      parked = false
      await clearRateLimit()
      return session
    },
  }
}
