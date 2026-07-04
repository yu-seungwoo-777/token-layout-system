import { test, expect, type Page } from "@playwright/test"

const routes = [
  "/demo",
  "/demo/1col",
  "/demo/2col",
  "/demo/3col",
  "/demo/components",
  "/demo/shadcn",
]

/** Click every button currently in the DOM, dismissing overlays between. */
async function clickAllButtons(page: Page) {
  const buttons = await page.getByRole("button").all()
  for (const btn of buttons) {
    await btn.click({ timeout: 1500 }).catch(() => {})
    await page.keyboard.press("Escape").catch(() => {})
  }
}

for (const route of routes) {
  test(`no runtime error while interacting: ${route}`, async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`))
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`[console.error] ${m.text()}`)
    })

    await page.goto(route)
    await page.waitForLoadState("networkidle")

    // Tabs lazily mount their panels, so activate each tab and exercise the
    // controls it reveals (Dialog / DropdownMenu / Select / Switch ...).
    const tabs = await page.getByRole("tab").all()
    if (tabs.length) {
      for (const tab of tabs) {
        await tab.click().catch(() => {})
        await clickAllButtons(page)
      }
    } else {
      await clickAllButtons(page)
    }

    expect(errors, `\nRuntime errors on ${route}:\n${errors.join("\n")}`).toEqual(
      []
    )
  })
}
