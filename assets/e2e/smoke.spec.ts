import { test, expect, type Page } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"

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

/**
 * Walk the App Router tree and return every static route that has a
 * page.{tsx,ts,jsx,js}. Dynamic segments ([param]) are skipped — they need
 * concrete params, so cover them by adding filled-in paths to `routes`
 * manually. Route groups ((group)) are transparent per Next semantics.
 */
function discoverStaticRoutes(appDir: string): string[] {
  const found: string[] = []
  const walk = (dir: string, segments: string[]) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name.startsWith("[")) continue // dynamic — can't guess params
        const next = entry.name.startsWith("(")
          ? segments // route group: no URL segment
          : [...segments, entry.name]
        walk(path.join(dir, entry.name), next)
      } else if (/^page\.(tsx|ts|jsx|js)$/.test(entry.name)) {
        found.push("/" + segments.join("/"))
      }
    }
  }
  if (fs.existsSync(appDir)) walk(appDir, [])
  return found
}

// Coverage-parity gate: the hand-maintained `routes` list decays as the app
// grows — new pages get added, the smoke list doesn't, and the spec quietly
// verifies a shrinking slice while staying green. Fail when a static page
// exists on disk that the smoke never walks.
test("smoke walks every static route (coverage parity)", () => {
  const appDir = ["src/app", "app"].find((d) => fs.existsSync(d))
  if (!appDir) test.skip(true, "no App Router directory found")
  const missing = discoverStaticRoutes(appDir!).filter(
    (r) => !routes.includes(r)
  )
  expect(
    missing,
    `\nStatic routes on disk that smoke.spec.ts never visits — add them to ` +
      `the routes array (or the smoke's coverage silently decays):\n${missing.join("\n")}`
  ).toEqual([])
})

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
