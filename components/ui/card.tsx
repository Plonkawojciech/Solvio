'use client'
import * as React from 'react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

function Card({ className, onDrag, onDragStart, onDragEnd, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <motion.div
      data-slot="card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{
        boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
      }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn(
        'relative flex flex-col gap-6 rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm text-card-foreground shadow-sm transition-all duration-200',
        'hover:border-primary/40 hover:shadow-md hover:bg-card/90',
        className
      )}
      {...(props as any)}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        'grid auto-rows-min items-start gap-2 px-6 pt-5',
        'border-b border-border/50 pb-4',
        'grid-rows-[auto_auto] has-[data-slot=card-action]:grid-cols-[1fr_auto]',
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <h3
      data-slot="card-title"
      className={cn(
        'font-semibold text-lg tracking-tight text-foreground',
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <p
      data-slot="card-description"
      className={cn('text-muted-foreground text-sm leading-snug', className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        'col-start-2 row-span-2 row-start-1 self-start justify-self-end',
        'transition-transform duration-200 hover:scale-105',
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      className={cn('px-6 py-2 text-sm text-foreground/90', className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        'flex items-center justify-between border-t border-border/50 px-6 py-4 text-sm',
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
