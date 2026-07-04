import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Sidebar — a column aside. Width is driven by layout tokens:
 * `--sidebar-width` normally, `--sidebar-width-collapsed` when collapsed
 * (exposed as the `w-sidebar` / `w-sidebar-collapsed` utilities).
 */
const sidebarVariants = cva(
  "flex h-full flex-col gap-(--layout-gap) overflow-y-auto border-border bg-background p-(--container-padding-x) transition-[width] duration-200",
  {
    variants: {
      collapsed: {
        true: "w-sidebar-collapsed items-center",
        false: "w-sidebar",
      },
    },
    defaultVariants: {
      collapsed: false,
    },
  }
)

function Sidebar({
  className,
  collapsed,
  children,
  ...props
}: React.ComponentProps<"aside"> & VariantProps<typeof sidebarVariants>) {
  return (
    <aside className={cn(sidebarVariants({ collapsed }), className)} {...props}>
      {children}
    </aside>
  )
}

export { Sidebar, sidebarVariants }
