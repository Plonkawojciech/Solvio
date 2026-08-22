import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react'

import { cn } from '@/lib/utils'

const alertVariants = cva(
  'relative flex gap-3 rounded-md border border-border bg-card p-4 text-sm shadow-[var(--nb-shadow-sm)]',
  {
    variants: {
      variant: {
        default: 'border-border bg-card text-foreground',
        info: 'border-border bg-secondary text-secondary-foreground',
        success: 'border-emerald-700 bg-emerald-50 text-emerald-950 shadow-[var(--nb-shadow-sm)] dark:bg-emerald-950/30 dark:text-emerald-100',
        warning: 'border-amber-700 bg-amber-50 text-amber-950 shadow-[var(--nb-shadow-sm)] dark:bg-amber-950/30 dark:text-amber-100',
        destructive: 'border-destructive bg-destructive/10 text-destructive-foreground shadow-[var(--nb-shadow-sm)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

const iconByVariant = {
  default: Info,
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  destructive: AlertCircle,
} as const

interface AlertProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>,
    VariantProps<typeof alertVariants> {
  hideIcon?: boolean
  title?: React.ReactNode
}

function Alert({
  className,
  variant,
  title,
  hideIcon,
  children,
  ...props
}: AlertProps) {
  const Icon = iconByVariant[variant ?? 'default']
  return (
    <div
      role={variant === 'destructive' || variant === 'warning' ? 'alert' : 'status'}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {!hideIcon && <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />}
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        {title && (
          <p className="font-extrabold uppercase tracking-tight leading-tight">{title}</p>
        )}
        {children && <div className="text-sm leading-snug">{children}</div>}
      </div>
    </div>
  )
}

export { Alert, alertVariants }
