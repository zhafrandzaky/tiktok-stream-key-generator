import { expect, test } from "./fixtures"
import { createLiveRoom, ensureSignedIn } from "./helpers"

test("creates a live room, masks and copies the stream key, then ends the stream", async ({ page }) => {
  await ensureSignedIn(page)
  await createLiveRoom(page, "E2E stream")

  await expect(page.getByTestId("rtmp-url")).toHaveText("rtmp://fake.push.example.com/live")
  const key = page.getByTestId("stream-key")
  await expect(key).toHaveText(/^sk_fak•+7890$/)

  await page.getByRole("button", { name: /show stream key/i }).click()
  await expect(key).toHaveText("sk_fake_1234567890")
  await expect(page.getByText(/Hides automatically in \d+s/)).toBeVisible()

  await page.getByRole("button", { name: /hide stream key/i }).click()
  await expect(key).toHaveText(/^sk_fak•+7890$/)

  await page.getByRole("button", { name: /copy stream key/i }).click()
  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboard).toBe("sk_fake_1234567890")

  await page.getByRole("button", { name: /end stream/i }).first().click()
  await page.getByRole("dialog").getByRole("button", { name: /end stream/i }).click()
  await expect(page.getByText("No active room")).toBeVisible({ timeout: 10_000 })
})

test("shows viewer and like counters", async ({ page }) => {
  await page.goto("/")
  await page.getByPlaceholder("@username to read chat from").fill("@demo")
  await page.getByRole("button", { name: /^connect$/i }).click()
  await expect(page.getByTestId("viewer-count")).toContainText("128", { timeout: 10_000 })
  await expect(page.getByTestId("viewer-total")).toContainText("1,543")
  await expect(page.getByTestId("like-total")).toContainText("2,345")
})

test("surfaces a sign-in error when creating a room while unauthenticated", async ({ page }) => {
  await page.route("**/api/live/create", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "AUTH_REQUIRED", message: "You need to sign in to TikTok first." },
      }),
    }),
  )
  await page.goto("/")
  await page.fill("#live-title", "Needs auth")
  await page.getByRole("button", { name: /create live room/i }).click()
  await expect(page.getByText("You need to sign in to TikTok first.")).toBeVisible({ timeout: 8000 })
})
