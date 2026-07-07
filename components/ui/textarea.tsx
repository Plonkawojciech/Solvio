import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "placeholder:text-muted-foreground/60 aria-invalid:border-destructive",
        "flex field-sizing-content min-h-20 w-full rounded-md border border-border bg-card px-3 py-2 text-base font-medium",
        "transition-[box-shadow,transform] outline-none md:text-sm",
        "focus-visible:shadow-[var(--nb-shadow-sm)] focus-visible:-translate-x-[1px] focus-visible:-translate-y-[1px]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
