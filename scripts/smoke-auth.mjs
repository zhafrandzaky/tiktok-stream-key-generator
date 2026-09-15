import { mkdir } from "node:fs/promises"
import path from "node:path"
import { chromium } from "playwright"

const base = process.env.BASE ?? "http://localhost:3007"
const outDir = process.env.OUT_DIR ?? "/tmp/opencode"
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })

await page.goto(base, { waitUntil: "networkidle" })
await page.screenshot({ path: path.join(outDir, "auth-anonymous.png"), fullPage: true })

await page.getByRole("button", { name: /sign in with tiktok/i }).click()
await page.waitForSelector('img[alt="TikTok login QR code"]', { timeout: 5000 })
await page.screenshot({ path: path.join(outDir, "auth-qr.png"), fullPage: true })

await page.waitForSelector("text=Connected", { timeout: 8000 })
await page.screenshot({ path: path.join(outDir, "auth-connected.png"), fullPage: true })

const bodyText = (await page.textContent("body")) ?? ""
console.log("HAS_CONNECTED:", bodyText.includes("Connected"))
console.log("HAS_DEMO_USER:", bodyText.includes("demo_user") || bodyText.includes("Demo User"))

await browser.close()
