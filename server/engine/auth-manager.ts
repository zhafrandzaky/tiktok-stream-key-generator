import { createHash } from "node:crypto"
import type { BrowserContext, Locator, Page } from "playwright"
import type { SessionState } from "@/lib/types"
import type { BrowserManager } from "./browser"
import type { AuthController, AuthQr, AuthStatus } from "./engine"
import { AlreadyAuthenticatedError, LoginPageFailedError } from "./errors"
import type { SessionStore } from "./session-store"

export const DEFAULT_LOGIN_URLS = [
  "https://www.tiktok.com/login/qrcode",
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

function hashBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex").slice(0, 16)
}

export function createAuthManager(deps: {
  browsers: BrowserManager
  store: SessionStore
  loginUrls?: string[]
  pollMs?: number
}): AuthController {
  const loginUrls = deps.loginUrls ?? DEFAULT_LOGIN_URLS
  const pollMs = deps.pollMs ?? 2000

  let session: SessionState = { status: "anonymous" }
  let qr: AuthQr | null = null
  let qrMeta: { hash: string; version: number } | null = null
  let detail: string | undefined
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let pollBusy = false
  let captchaRelaunched = false

  const stopPolling = () => {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
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

  const captureQr = async (page: Page): Promise<AuthQr | null> => {
    const element = await findVisible(page, QR_SELECTORS)
    if (!element) return null
    const buffer = await element.screenshot({ type: "png" }).catch(() => null)
    if (!buffer) return null
    const next = bumpQrVersion(qrMeta, hashBuffer(buffer))
    const changed = next.changed
    qrMeta = { hash: next.hash, version: next.version }
    if (!changed && qr) return qr
    qr = {
      qrDataUrl: `data:image/png;base64,${buffer.toString("base64")}`,
      expiresAt: Date.now() + 120_000,
      version: next.version,
    }
    return qr
  }

  const openLoginPage = async (context: BrowserContext): Promise<Page> => {
    for (const url of loginUrls) {
      const page = await context.newPage()
      const loaded = await page
        .goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 })
        .then(() => true)
        .catch(() => false)
      if (!loaded) {
        await page.close().catch(() => undefined)
        continue
      }

      if (await findVisible(page, QR_SELECTORS)) return page

      for (const pattern of QR_TAB_PATTERNS) {
        const tab = page.getByText(pattern).first()
        if (await isVisible(tab)) {
          await tab.click({ timeout: 2000 }).catch(() => undefined)
          break
        }
      }

      if (await findVisible(page, QR_SELECTORS)) return page
      await page.close().catch(() => undefined)
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
    const page = context.pages().at(-1)
    const identity = page ? (await readIdentity(page).catch(() => null)) : null
    session = { status: "authenticated", ...(identity ?? {}) }
    qr = null
    qrMeta = null
    detail = undefined
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
      const page = context.pages().at(-1)
      if (!page) return
      const hasQr = Boolean(await findVisible(page, QR_SELECTORS))
      const hasCaptcha = Boolean(await findVisible(page, CAPTCHA_SELECTORS))
      const state = classifyPageState({ hasQr, hasCaptcha, url: page.url() })

      if (state === "captcha") {
        detail = "TikTok requires human verification. Complete it in the opened browser window."
        if (!deps.browsers.isHeaded() && !captchaRelaunched) {
          captchaRelaunched = true
          const relaunched = await deps.browsers.relaunchHeaded()
          const loginPage = await openLoginPage(relaunched).catch(() => null)
          if (loginPage) await captureQr(loginPage)
        }
        return
      }

      if (state === "logged-in") {
        await completeLogin(context)
        return
      }

      if (hasQr) {
        detail = undefined
        await captureQr(page)
      }
    } finally {
      pollBusy = false
    }
  }

  return {
    async start(): Promise<AuthQr> {
      if (session.status === "authenticated") throw new AlreadyAuthenticatedError()
      const context = await deps.browsers.getContext()
      const restored = await restoreSession(context)
      if (restored) {
        await completeLogin(context)
        throw new AlreadyAuthenticatedError("Existing TikTok session restored.")
      }
      await deps.store.clear().catch(() => undefined)
      const page = await openLoginPage(context)
      const captured = await captureQr(page)
      if (!captured) throw new LoginPageFailedError()
      if (!pollTimer) {
        pollTimer = setInterval(() => {
          void pollOnce()
        }, pollMs)
      }
      return captured
    },

    async status(): Promise<AuthStatus> {
      return { ...session, ...(qr ? { qr } : {}), ...(detail ? { detail } : {}) }
    },

    async logout(): Promise<void> {
      stopPolling()
      session = { status: "anonymous" }
      qr = null
      qrMeta = null
      detail = undefined
      captchaRelaunched = false
      await deps.store.clear().catch(() => undefined)
      await deps.browsers.clearCookies()
    },

    async session(): Promise<SessionState> {
      if (session.status === "authenticated") return session
      const stored = await deps.store.readState()
      return stored ? { status: "authenticated" } : session
    },
  }
}
