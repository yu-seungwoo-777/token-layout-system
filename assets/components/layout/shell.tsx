"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { MenuIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Header } from "./header"
import { Footer } from "./footer"
import { Sidebar } from "./sidebar"
import "./grid.css"

/**
 * Column grid for the main region. All track sizes come from layout
 * tokens (`--sidebar-width`, `--sidebar-width-collapsed`,
 * `--grid-3col-ratio`). Responsive downgrade:
 *   3col -> (lg) 2col -> (md) 1col + Sheet drawer
 *   2col -> (md) 1col + Sheet drawer
 * Only Tailwind's default breakpoints (md/lg) are used.
 *
 * Each layout has a paired `-collapsed` variant that swaps the sidebar
 * track from `--sidebar-width` to `--sidebar-width-collapsed`. They're
 * kept as separate cva entries (rather than a second `collapsed` variant
 * dimension) because the swap touches an arbitrary-value token inside
 * a `grid-cols-[…]` template — cva can't compose two arbitrary-value
 * utilities onto the same property cleanly.
 */
const mainGrid = cva(
  "mx-auto grid w-full max-w-(--container-max) gap-(--layout-gap) p-(--container-padding-x)",
  {
    variants: {
      layout: {
        one: "grid-cols-1",
        twoLeft: "grid-cols-1 md:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]",
        twoRight: "grid-cols-1 md:grid-cols-[minmax(0,1fr)_var(--sidebar-width)]",
        three:
          "grid-cols-1 md:grid-cols-[var(--sidebar-width)_minmax(0,1fr)] lg:grid-cols-[var(--grid-3col-ratio)]",
        twoLeftCollapsed:
          "grid-cols-1 md:grid-cols-[var(--sidebar-width-collapsed)_minmax(0,1fr)]",
        twoRightCollapsed:
          "grid-cols-1 md:grid-cols-[minmax(0,1fr)_var(--sidebar-width-collapsed)]",
      },
    },
    defaultVariants: { layout: "one" },
  }
)

type Layout = NonNullable<VariantProps<typeof mainGrid>["layout"]>

export interface ShellProps extends React.ComponentProps<"div"> {
  /** Number of content columns. */
  columns?: 1 | 2 | 3
  /** Side the primary sidebar sits on (ignored when columns === 1). */
  sidebarPosition?: "left" | "right" | "none"
  /** Collapse the desktop sidebar to `--sidebar-width-collapsed` (icon-rail mode).
   *  No effect below `md` — the sidebar is in the Sheet drawer there regardless.
   *  Not supported on `columns === 3` (the 3-col ratio token has no collapsed form). */
  sidebarCollapsed?: boolean
  /** Top bar content. */
  header?: React.ReactNode
  /** Bottom bar content. */
  footer?: React.ReactNode
  /** Primary sidebar content (desktop aside + mobile Sheet). */
  sidebar?: React.ReactNode
  /** Secondary aside content — the right column in a 3-column layout. */
  aside?: React.ReactNode
  /** Accessible title for the mobile Sheet drawer. */
  sidebarTitle?: string
}

// `hasSidebarContent`/`hasAsideContent` reflect whether the caller actually
// passed that slot, not just whether `columns`/`sidebarPosition` requested
// it. Sizing the grid off `columns` alone (ignoring whether `sidebar`/`aside`
// were actually passed) reserves an empty track when a prop is requested
// but the content is omitted — e.g. `columns={2}` with no `sidebar` used to
// still lay out a `--sidebar-width` column with nothing in it.
//
// `sidebarCollapsed` selects the paired `-collapsed` cva variant so the grid
// track and the Sidebar component shrink together; it's ignored for 3-col
// (the ratio token has no collapsed form) and when there's no sidebar content.
function resolveLayout(
  columns: 1 | 2 | 3,
  sidebarPosition: "left" | "right" | "none",
  hasSidebarContent: boolean,
  hasAsideContent: boolean,
  sidebarCollapsed: boolean
): Layout {
  if (sidebarPosition === "none" || !hasSidebarContent) return "one"
  if (columns === 3 && hasAsideContent) return "three"
  const base = sidebarPosition === "right" ? "twoRight" : "twoLeft"
  return sidebarCollapsed ? `${base}Collapsed` : base
}

function Shell({
  columns = 1,
  sidebarPosition = "left",
  sidebarCollapsed = false,
  header,
  footer,
  sidebar,
  aside,
  sidebarTitle = "Menu",
  className,
  children,
  ...props
}: ShellProps) {
  const hasSidebar = columns !== 1 && sidebarPosition !== "none" && sidebar != null
  const hasAside = columns === 3 && aside != null
  // 3-col has no collapsed form (ratio token has no collapsed variant),
  // so drop the flag there to keep resolveLayout's input honest.
  const effectiveCollapsed =
    sidebarCollapsed && !(columns === 3 && hasAside)
  const layout = resolveLayout(
    columns,
    sidebarPosition,
    hasSidebar,
    hasAside,
    effectiveCollapsed
  )
  // Divider sits on the edge facing the content: right border for a
  // left-hand sidebar, left border for a right-hand sidebar.
  const sidebarBorder = layout === "twoRight" || layout === "twoRightCollapsed" ? "border-l" : "border-r"
  const desktopSidebar = hasSidebar ? (
    // Below md the sidebar collapses into the Sheet, so hide it here.
    <div className="hidden md:block">
      <Sidebar collapsed={effectiveCollapsed} className={cn("w-full", sidebarBorder)}>
        {sidebar}
      </Sidebar>
    </div>
  ) : null

  return (
    <div className={cn("shell", className)} {...props}>
      <Header data-slot="shell-header">
        {hasSidebar && (
          <Sheet>
            <SheetTrigger
              aria-label={sidebarTitle}
              className="inline-flex items-center gap-(--space-2) rounded-(--button-radius) border border-border px-(--button-padding-x) py-(--button-padding-y) text-sm md:hidden"
            >
              <MenuIcon className="size-4" />
              <span>{sidebarTitle}</span>
            </SheetTrigger>
            <SheetContent side="left" className="p-0">
              <SheetHeader>
                <SheetTitle>{sidebarTitle}</SheetTitle>
              </SheetHeader>
              <Sidebar className="w-full border-0">{sidebar}</Sidebar>
            </SheetContent>
          </Sheet>
        )}
        {header}
      </Header>

      <main data-slot="shell-main" className="overflow-x-hidden">
        <div className={mainGrid({ layout })}>
          {(layout === "twoLeft" || layout === "three") && desktopSidebar}
          <div className="min-w-0">{children}</div>
          {layout === "twoRight" && desktopSidebar}
          {hasAside && (
            <aside className="hidden min-w-0 lg:block">{aside}</aside>
          )}
        </div>
      </main>

      <Footer data-slot="shell-footer">{footer}</Footer>
    </div>
  )
}

export { Shell }
