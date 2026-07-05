import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Typography — text styles as components. Font-size / line-height /
 * weight all come from the raw scale in raw.css (text-*, --leading-*,
 * --weight-*), so type stays in sync with the rest of the token system.
 */
const typographyVariants = cva("", {
  variants: {
    variant: {
      h1: "text-2xl leading-(--leading-tight) font-(--weight-bold) text-foreground",
      h2: "text-xl leading-(--leading-tight) font-(--weight-bold) text-foreground",
      h3: "text-lg leading-(--leading-normal) font-(--weight-medium) text-foreground",
      body: "text-base leading-(--leading-relaxed) font-(--weight-normal) text-foreground",
      muted: "text-sm leading-(--leading-normal) font-(--weight-normal) text-muted-foreground",
    },
  },
  defaultVariants: { variant: "body" },
})

type TypographyProps = React.ComponentProps<"p"> &
  VariantProps<typeof typographyVariants> & {
    as?: React.ElementType
  }

function Typography({ className, variant, as, ...props }: TypographyProps) {
  const Comp = as ?? "p"
  return (
    <Comp className={cn(typographyVariants({ variant }), className)} {...props} />
  )
}

const H1 = (p: React.ComponentProps<"h1">) => (
  <Typography as="h1" variant="h1" {...p} />
)
const H2 = (p: React.ComponentProps<"h2">) => (
  <Typography as="h2" variant="h2" {...p} />
)
const H3 = (p: React.ComponentProps<"h3">) => (
  <Typography as="h3" variant="h3" {...p} />
)
const Body = (p: React.ComponentProps<"p">) => (
  <Typography as="p" variant="body" {...p} />
)
const Muted = (p: React.ComponentProps<"p">) => (
  <Typography as="p" variant="muted" {...p} />
)

export { Typography, typographyVariants, H1, H2, H3, Body, Muted }
