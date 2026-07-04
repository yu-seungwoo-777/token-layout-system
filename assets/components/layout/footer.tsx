import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Footer — fixed-height bottom bar. Height is driven solely by the
 * `--footer-height` layout token (exposed as the `h-footer` utility).
 */
function Footer({ className, children, ...props }: React.ComponentProps<"footer">) {
  return (
    <footer
      className={cn(
        "flex h-footer items-center gap-(--layout-gap) border-t border-border bg-background px-(--container-padding-x) text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
    </footer>
  )
}

export { Footer }
