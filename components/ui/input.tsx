import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground/60 selection:bg-foreground selection:text-background",
        "h-11 w-full min-w-0 rounded-md border-2 border-foreground bg-card px-3 py-1 text-base font-medium md:text-sm",
        "transition-[box-shadow,transform] outline-none",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "focus-visible:shadow-[3px_3px_0_hsl(var(--foreground))] focus-visible:-translate-x-[1px] focus-visible:-translate-y-[1px]",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
