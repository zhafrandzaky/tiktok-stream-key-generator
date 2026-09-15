import { expect, test } from "./fixtures"
import { ensureSignedIn } from "./helpers"

test("signs in through the QR flow", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByText("Not signed in")).toBeVisible()
  await page.getByRole("button", { name: /sign in with tiktok/i }).click()
  await expect(page.getByAltText("TikTok login QR code")).toBeVisible()
  await expect(page.getByText("Scan with the TikTok mobile app")).toBeVisible()
  await expect(page.getByText("Connected")).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText("@demo_user", { exact: true })).toBeVisible()
})

test("supports the browser-window login fallback", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: /open login window/i }).click()
  await expect(page.getByText("Waiting for login in the browser window…")).toBeVisible({ timeout: 8000 })
  await expect(page.getByRole("button", { name: /use qr code instead/i })).toBeVisible()
  await expect(page.getByText("Connected")).toBeVisible({ timeout: 10_000 })
})

test("signs out back to the QR state", async ({ page }) => {
  await ensureSignedIn(page)
  await page.getByRole("button", { name: /sign out/i }).click()
  await expect(page.getByText("Not signed in")).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole("button", { name: /sign in with tiktok/i })).toBeVisible()
  await expect(page.getByText("Connected")).toHaveCount(0)
})
