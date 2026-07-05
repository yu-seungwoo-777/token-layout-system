import { test, expect, type Page } from "@playwright/test"

/**
 * Routes the smoke test walks. Fill these in with the actual pages your
 * skill build produced — every page that renders a Shell or an interactive
 * shadcn component should be here, since the test's whole point is to open
 * each overlay and catch runtime throws (gotcha #3: a DropdownMenuLabel
 * outside its group passes grep + build + tsc and only fails when opened).
 *
 * The placeholder list below is intentionally NOT a set of paths that
 * "might" exist — committing a spec that points at routes you never
 * created is the failure mode gotcha #8 warns about: green-looking CI
 * verifying nothing. Replace this list before running verify.sh; an empty
 * array skips the smoke entirely (and is itself a smell — flag it).
 *
 * To enumerate your routes automatically instead of hardcoding, walk the
 * App Router tree (e.g. globby "app/**\/page.{tsx,ts}" then strip the
 * leading "app/" and trailing "/page.ext" via path manipulation).
 */
const routes: string[] = [
  // "/",
  // "/demo",
  // "/demo/components",
]

/** Click every button currently in the DOM, dismissing overlays between. */
async function clickAllButtons(page: Page) {
  const buttons = await page.getByRole("button").all()
  for (const btn of buttons) {
    await btn.click({ timeout: 1500 }).catch(() => {})
    await page.keyboard.press("Escape").catch(() => {})
  }
}

// Empty route list = no pages exercised = smoke verifies nothing. Fail
// loudly rather than silently passing an unrun spec (gotcha #8).
test("smoke has routes to walk", () => {
  expect(
    routes.length,
    "No routes in smoke.spec.ts — fill the array with your app's pages " +
      "(every Shell/overlay route) before running verify.sh. An empty list " +
      "would pass every check while exercising nothing."
  ).toBeGreaterThan(0)
})

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
