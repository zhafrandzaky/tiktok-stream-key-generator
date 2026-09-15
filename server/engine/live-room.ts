import { chmod, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import type { Locator, Page, Response } from "playwright"
import { extractRtmp, RtmpParseError } from "@/lib/parsers/rtmp"
import type { LiveRoomResult, LiveStatus } from "@/lib/types"
import type { BrowserManager } from "./browser"
import type { AuthController, LiveController } from "./engine"
import { AuthRequiredError, ExtractionFailedError, NotEligibleError } from "./errors"

export const LIVE_URL_CANDIDATES = [
  "https://www.tiktok.com/tiktokstudio/live",
  "https://www.tiktok.com/creator-center/live",
]

export const LIVE_SELECTORS = {
  title: [
    'input[placeholder*="title" i]',
    'textarea[placeholder*="title" i]',
    'input[name*="title" i]',
    'textarea[name*="title" i]',
  ],
  category: [
    'button:has-text("Category")',
    'button:has-text("Topic")',
    '[data-e2e*="category" i]',
    '[data-e2e*="topic" i]',
  ],
  ageRestricted: [
    'input[type="checkbox"][name*="age" i]',
    '[data-e2e*="age" i] input[type="checkbox"]',
    '[data-e2e*="age" i] button[role="switch"]',
  ],
  goLive: [
    'button:has-text("Go LIVE")',
    'a:has-text("Go LIVE")',
    '[role="button"]:has-text("Go LIVE")',
    '[role="link"]:has-text("Go LIVE")',
    'button:has-text("Go Live")',
    'a:has-text("Go Live")',
    '[data-e2e*="go-live" i]',
  ],
  endLive: [
    'button:has-text("End LIVE")',
    'button:has-text("End Live")',
    'button:has-text("Stop")',
    '[data-e2e*="end-live" i]',
  ],
}

const NOT_ELIGIBLE_PATTERNS = [
  /not eligible/i,
  /can(?:not|'t) go live/i,
  /live access is not available/i,
  /download for windows/i,
  /get live studio/i,
  /build the ultimate tiktok live experience/i,
]

const DOWNLOAD_PAGE_PATTERN = /\/studio\/download/i

const CREATE_TIMEOUT_MS = 45_000

export function couldContainRtmp(contentType: string | null, body: string): boolean {
  if (!body || body.length > 512 * 1024) return false
  const type = (contentType ?? "").toLowerCase()
  const isTexty = type.includes("json") || type.includes("plain")
  if (!isTexty) return false
  const lower = body.toLowerCase()
  return ["stream_url", "stream_key", "push_url", "rtmp"].some((needle) => lower.includes(needle))
}

type DomInput = { name: string; id: string; value: string }

async function readToggleState(locator: Locator): Promise<boolean | null> {
  const aria = await locator.getAttribute("aria-checked").catch(() => null)
  if (aria !== null) return aria === "true"
  return locator.isChecked().catch(() => null)
}

export function createLiveRoom(deps: {
  browsers: BrowserManager
  auth: AuthController
  dataDir: string
  createTimeoutMs?: number
}): LiveController {
  const createTimeoutMs = deps.createTimeoutMs ?? CREATE_TIMEOUT_MS
  let activeRoom: LiveRoomResult | null = null
  let pageRef: Page | null = null

  const artifact = async (page: Page, payloads: string[]): Promise<string> => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-")
    const dir = path.join(deps.dataDir, "artifacts")
    await mkdir(dir, { recursive: true, mode: 0o700 })
    const screenshotPath = path.join(dir, `live-create-${stamp}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined)
    await chmod(screenshotPath, 0o600).catch(() => undefined)
    const metaPath = path.join(dir, `live-create-${stamp}.json`)
    const keys = new Set<string>()
    for (const payload of payloads) {
      try {
        const parsed: unknown = JSON.parse(payload)
        const walk = (node: unknown, depth: number) => {
          if (depth > 4 || typeof node !== "object" || node === null) return
          for (const [key, value] of Object.entries(node)) {
            keys.add(key)
            walk(value, depth + 1)
          }
        }
        walk(parsed, 0)
      } catch {
        continue
      }
    }
    await writeFile(metaPath, JSON.stringify({ responseKeys: [...keys].sort() }, null, 2), {
      mode: 0o600,
    }).catch(() => undefined)
    return screenshotPath
  }

  const findVisible = async (page: Page, selectors: string[]) => {
    for (const selector of selectors) {
      const locator = page.locator(selector).first()
      const visible = await locator
        .isVisible({ timeout: 300 })
        .then((value) => value)
        .catch(() => false)
      if (visible) return locator
    }
    return null
  }

  const waitForVisible = async (page: Page, selectors: string[], timeout: number) => {
    const locator = page.locator(selectors.join(", ")).first()
    const found = await locator
      .waitFor({ state: "visible", timeout })
      .then(() => true)
      .catch(() => false)
    return found ? locator : null
  }

  const waitForBody = async (page: Page, timeout: number) => {
    await page
      .waitForFunction(() => (document.body?.innerText ?? "").trim().length > 0, undefined, {
        timeout,
      })
      .catch(() => undefined)
  }

  const extractFromDom = async (page: Page): Promise<LiveRoomResult | null> => {
    const inputs = await page
      .locator("input, textarea")
      .evaluateAll((elements) =>
        elements.map((element) => ({
          name: element.getAttribute("name") ?? "",
          id: element.getAttribute("id") ?? "",
          value: (element as HTMLInputElement | HTMLTextAreaElement).value ?? "",
        })),
      )
      .catch((): DomInput[] => [])

    const rtmpInput = inputs.find((input) => /rtmps?:\/\//i.test(input.value))
    const keyInput = inputs.find(
      (input) => /stream.?key/i.test(`${input.name} ${input.id}`) && input.value.trim().length >= 6,
    )
    if (!rtmpInput || !keyInput) return null

    const rtmpUrl = rtmpInput.value.trim()
    const streamKey = keyInput.value.trim()
    return {
      rtmpUrl,
      streamKey,
      combinedPushUrl: `${rtmpUrl.replace(/\/$/, "")}/${streamKey}`,
      applied: [],
    }
  }

  return {
    async create(input): Promise<LiveRoomResult> {
      const session = await deps.auth.session()
      if (session.status !== "authenticated") throw new AuthRequiredError()

      const context = await deps.browsers.getContext()
      let page = context.pages().at(-1) ?? (await context.newPage())
      pageRef = page

      const payloads: string[] = []
      const onResponse = (response: Response) => {
        const contentType = response.headers()["content-type"] ?? null
        if (!contentType || !contentType.toLowerCase().includes("json")) return
        void response
          .text()
          .then((text) => {
            if (payloads.length < 200 && couldContainRtmp(contentType, text)) payloads.push(text)
          })
          .catch(() => undefined)
      }

      const instrumented: Page[] = []
      const instrumentPage = (target: Page) => {
        if (instrumented.includes(target)) return
        instrumented.push(target)
        target.on("response", onResponse)
      }
      for (const existing of context.pages()) instrumentPage(existing)

      const followNewPages = (newPage: Page) => {
        instrumentPage(newPage)
        page = newPage
        pageRef = newPage
        void newPage.waitForLoadState("domcontentloaded").catch(() => undefined)
      }
      context.on("page", followNewPages)

      try {
        let navigated = false
        for (const url of LIVE_URL_CANDIDATES) {
          const loaded = await page
            .goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 })
            .then(() => true)
            .catch(() => false)
          if (!loaded) continue
          if (!page.url().toLowerCase().includes("/login")) {
            navigated = true
            break
          }
        }
        if (!navigated) {
          throw new AuthRequiredError("The TikTok session expired. Sign in again.")
        }

        await waitForBody(page, 25_000)

        const bodyText = (await page.textContent("body").catch(() => "")) ?? ""
        if (NOT_ELIGIBLE_PATTERNS.some((pattern) => pattern.test(bodyText))) {
          throw new NotEligibleError()
        }

        const applied: string[] = []

        const entry = await waitForVisible(page, LIVE_SELECTORS.goLive, 25_000)
        if (!entry) {
          const path = await artifact(page, payloads)
          throw new ExtractionFailedError(
            `Could not find the Go LIVE control. Debug artifact: ${path}`,
          )
        }
        await entry.click().catch(() => undefined)

        await page.waitForTimeout(3000)

        const newestPage = context.pages().at(-1)
        if (newestPage && newestPage !== page) {
          page = newestPage
          pageRef = newestPage
        }
        await waitForBody(page, 15_000)

        if (DOWNLOAD_PAGE_PATTERN.test(page.url())) {
          const path = await artifact(page, payloads)
          throw new NotEligibleError(
            `TikTok only offers the LIVE Studio desktop app for this account (no RTMP/OBS access). Debug artifact: ${path}`,
          )
        }

        const titleField = await findVisible(page, LIVE_SELECTORS.title)
        if (titleField && input.title) {
          await titleField.fill(input.title).catch(() => undefined)
          applied.push("title")
        }

        if (input.category) {
          const categoryTrigger = await findVisible(page, LIVE_SELECTORS.category)
          if (categoryTrigger) {
            await categoryTrigger.click().catch(() => undefined)
            const option = page.getByRole("option", { name: input.category }).first()
            const optionVisible = await option
              .isVisible({ timeout: 1000 })
              .then((visible) => visible)
              .catch(() => false)
            if (optionVisible) {
              await option.click().catch(() => undefined)
              applied.push("category")
            } else {
              await page.keyboard.press("Escape").catch(() => undefined)
            }
          }
        }

        if (input.ageRestricted) {
          const toggle = await findVisible(page, LIVE_SELECTORS.ageRestricted)
          if (toggle) {
            const isOn = await readToggleState(toggle)
            if (isOn !== true) await toggle.click().catch(() => undefined)
            applied.push("ageRestricted")
          }
        }

        const deadline = Date.now() + createTimeoutMs
        let parsedCount = 0
        let confirmed = false
        while (Date.now() < deadline) {
          while (parsedCount < payloads.length) {
            const payload = payloads[parsedCount]
            parsedCount += 1
            if (!payload) continue
            try {
              const room = extractRtmp(payload)
              activeRoom = { ...room, applied }
              return activeRoom
            } catch (error) {
              if (!(error instanceof RtmpParseError)) throw error
            }
          }

          const latestPage = context.pages().at(-1)
          if (latestPage && latestPage !== page) {
            page = latestPage
            pageRef = latestPage
            await waitForBody(page, 10_000)
            if (DOWNLOAD_PAGE_PATTERN.test(page.url())) {
              const path = await artifact(page, payloads)
              throw new NotEligibleError(
                `TikTok only offers the LIVE Studio desktop app for this account (no RTMP/OBS access). Debug artifact: ${path}`,
              )
            }
          }

          if (!confirmed && Date.now() > deadline - createTimeoutMs + 12_000) {
            confirmed = true
            const confirmButton = page.locator(LIVE_SELECTORS.goLive.join(", ")).last()
            const confirmVisible = await confirmButton
              .isVisible({ timeout: 500 })
              .then((visible) => visible)
              .catch(() => false)
            if (confirmVisible) {
              await confirmButton.click().catch(() => undefined)
              applied.push("confirm")
            }
          }

          await page.waitForTimeout(500)
        }

        const domResult = await extractFromDom(page)
        if (domResult) {
          activeRoom = { ...domResult, applied }
          return activeRoom
        }

        const path = await artifact(page, payloads)
        throw new ExtractionFailedError(
          `TikTok did not return stream credentials in time. Debug artifact: ${path}`,
        )
      } finally {
        for (const instrumentedPage of instrumented) {
          instrumentedPage.off("response", onResponse)
        }
        context.off("page", followNewPages)
      }
    },

    async end(): Promise<void> {
      const page = pageRef
      activeRoom = null
      if (!page) return
      const endButton = await findVisible(page, LIVE_SELECTORS.endLive)
      if (!endButton) return
      await endButton.click().catch(() => undefined)
      await page.waitForTimeout(1500)
    },

    async status(): Promise<LiveStatus> {
      const session = await deps.auth.session()
      return {
        authenticated: session.status === "authenticated",
        live: activeRoom !== null,
        ...(activeRoom ? { room: activeRoom } : {}),
      }
    },
  }
}
