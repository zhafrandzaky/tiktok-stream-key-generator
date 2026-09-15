import { expect, type Page } from "@playwright/test"

export async function ensureSignedIn(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "networkidle" })
  const connected = page.getByText("Connected", { exact: true })
  if (await connected.isVisible().catch(() => false)) return
  const signIn = page.getByRole("button", { name: /sign in with tiktok/i })
  await expect(signIn).toBeVisible({ timeout: 10_000 })
  await signIn.click()
  await expect(connected).toBeVisible({ timeout: 10_000 })
}

export async function createLiveRoom(page: Page, title: string): Promise<void> {
  await page.fill("#live-title", title)
  await page.getByRole("button", { name: /create live room/i }).click()
  await expect(page.getByTestId("rtmp-url")).toBeVisible({ timeout: 10_000 })
}
