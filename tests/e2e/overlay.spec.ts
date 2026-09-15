import { expect, test } from "./fixtures"

test("renders live events on a transparent background", async ({ page, request }) => {
  const response = await request.post("/api/chat/connect", { data: { username: "demo" } })
  expect(response.status()).toBe(204)

  await page.goto("/overlay/chat?theme=dark&max=5&showViewers=1&showGifts=1")
  await expect(page.getByText("first!", { exact: false }).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/viewers/)).toBeVisible()

  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(background).toBe("rgba(0, 0, 0, 0)")
})

test("hides system status rows when showStatus=0", async ({ page, request }) => {
  await request.post("/api/chat/connect", { data: { username: "demo" } })
  await page.goto("/overlay/chat?showStatus=0")
  await expect(page.getByText("first!", { exact: false }).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/connected · fake-room/)).toHaveCount(0)
})

test("hides gift rows when showGifts=0", async ({ page, request }) => {
  await request.post("/api/chat/connect", { data: { username: "demo" } })
  await page.goto("/overlay/chat?showGifts=0")
  await expect(page.getByText("first!", { exact: false }).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/sent Rose/)).toHaveCount(0)
})
