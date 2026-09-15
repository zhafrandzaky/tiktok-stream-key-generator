import path from "node:path"
import { chromium, type BrowserContext } from "playwright"

export interface BrowserManager {
  getContext(): Promise<BrowserContext>
  currentContext(): BrowserContext | null
  relaunchHeaded(): Promise<BrowserContext>
  ensureHeaded(): Promise<BrowserContext>
  clearCookies(): Promise<void>
  dispose(): Promise<void>
  isHeaded(): boolean
}

export function createBrowserManager(opts: { dataDir: string; headless: boolean }): BrowserManager {
  const userDataDir = path.join(opts.dataDir, "browser-profile")
  let context: BrowserContext | null = null
  let pending: Promise<BrowserContext> | null = null
  let headless = opts.headless

  async function launch(nextHeadless: boolean): Promise<BrowserContext> {
    if (context) {
      await context.close().catch(() => undefined)
      context = null
    }
    const launched = await chromium.launchPersistentContext(userDataDir, {
      headless: nextHeadless,
      viewport: { width: 1280, height: 800 },
      locale: "en-US",
    })
    launched.on("close", () => {
      if (context === launched) context = null
    })
    context = launched
    headless = nextHeadless
    return launched
  }

  async function ensureContext(): Promise<BrowserContext> {
    if (context) return context
    if (!pending) {
      pending = launch(headless).finally(() => {
        pending = null
      })
    }
    return pending
  }

  return {
    async getContext(): Promise<BrowserContext> {
      return ensureContext()
    },

    currentContext(): BrowserContext | null {
      return context
    },

    async relaunchHeaded(): Promise<BrowserContext> {
      return launch(false)
    },

    async ensureHeaded(): Promise<BrowserContext> {
      if (context && !headless) return context
      return launch(false)
    },

    async clearCookies(): Promise<void> {
      if (!context) return
      await context.clearCookies().catch(() => undefined)
    },

    async dispose(): Promise<void> {
      if (!context) return
      await context.close().catch(() => undefined)
      context = null
    },

    isHeaded(): boolean {
      return !headless
    },
  }
}
