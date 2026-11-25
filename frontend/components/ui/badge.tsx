import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        // Teintes sémantiques : variables --tag-<ton>-* redéfinies par thème
        // (styles/index.css), contraste texte/fond >= 4,5:1 dans chaque thème.
        info: "border-tag-info-border bg-tag-info text-tag-info-foreground",
        success:
          "border-tag-success-border bg-tag-success text-tag-success-foreground",
        warning:
          "border-tag-warning-border bg-tag-warning text-tag-warning-foreground",
        danger:
          "border-tag-danger-border bg-tag-danger text-tag-danger-foreground",
        neutral:
          "border-tag-neutral-border bg-tag-neutral text-tag-neutral-foreground",
        accent:
          "border-tag-accent-border bg-tag-accent text-tag-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
