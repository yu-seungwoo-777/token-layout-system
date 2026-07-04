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
import "./layout.css"

/**
 * Column grid for the main region. All track sizes come from layout
 * tokens (`--sidebar-width`, `--grid-3col-ratio`). Responsive downgrade:
 *   3col -> (lg) 2col -> (md) 1col + Sheet drawer
 *   2col -> (md) 1col + Sheet drawer
 * Only Tailwind's default breakpoints (md/lg) are used.
 */
const mainGrid = cva(
  "mx-auto grid w-full max-w-[var(--container-max)] gap-(--layout-gap) p-(--container-padding-x)",
  {
    variants: {
      layout: {
        one: "grid-cols-1",
        twoLeft: "grid-cols-1 md:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]",
        twoRight: "grid-cols-1 md:grid-cols-[minmax(0,1fr)_var(--sidebar-width)]",
        three:
          "grid-cols-1 md:grid-cols-[var(--sidebar-width)_minmax(0,1fr)] lg:grid-cols-[var(--grid-3col-ratio)]",
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

function resolveLayout(
  columns: 1 | 2 | 3,
  sidebarPosition: "left" | "right" | "none"
): Layout {
  if (columns === 1 || sidebarPosition === "none") return "one"
  if (columns === 3) return "three"
  return sidebarPosition === "right" ? "twoRight" : "twoLeft"
}

function Shell({
  columns = 1,
  sidebarPosition = "left",
  header,
  footer,
  sidebar,
  aside,
  sidebarTitle = "메뉴",
  className,
  children,
  ...props
}: ShellProps) {
  const layout = resolveLayout(columns, sidebarPosition)
  const hasSidebar = layout !== "one" && sidebar != null
  const hasAside = layout === "three" && aside != null
  // Divider sits on the edge facing the content: right border for a
  // left-hand sidebar, left border for a right-hand sidebar.
  const sidebarBorder = layout === "twoRight" ? "border-l" : "border-r"
  const desktopSidebar = hasSidebar ? (
    // Below md the sidebar collapses into the Sheet, so hide it here.
    <div className="hidden md:block">
      <Sidebar className={cn("w-full", sidebarBorder)}>{sidebar}</Sidebar>
    </div>
  ) : null

  return (
    <div className={cn("shell", className)} {...props}>
      <Header data-slot="shell-header">
        {hasSidebar && (
          <Sheet>
            <SheetTrigger
              aria-label={sidebarTitle}
              className="inline-flex items-center gap-(--space-2) rounded-[var(--button-radius)] border border-border px-(--button-padding-x) py-(--button-padding-y) text-sm md:hidden"
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
