import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Header — fixed-height top bar. Height is driven solely by the
 * `--header-height` layout token (exposed as the `h-header` utility).
 */
function Header({ className, children, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      className={cn(
        "flex h-header items-center gap-(--layout-gap) border-b border-border bg-background px-(--container-padding-x)",
        className
      )}
      {...props}
    >
      {children}
    </header>
  )
}

export { Header }
