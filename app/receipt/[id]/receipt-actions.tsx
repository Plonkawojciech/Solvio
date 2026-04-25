'use client'

import { useState } from 'react'

/**
 * Primary CTA — big Share button.
 * Tries the native share sheet first (phones), falls back to clipboard copy.
 */
export function ShareButton({
  url,
  vendor,
  shareLabel,
  copiedLabel,
}: {
  url: string
  vendor?: string | null
  shareLabel?: string
  copiedLabel?: string
}) {
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    const shareData: ShareData = {
      title: vendor ? `${vendor} — Solvio` : 'Solvio receipt',
      url,
    }
    try {
      if (typeof navigator !== 'undefined' && 'share' in navigator) {
        await navigator.share(shareData)
        return
      }
    } catch {
      // user cancelled or share not available — fall through to copy
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // nothing more we can do silently
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label={copied ? copiedLabel || 'Copied!' : shareLabel || 'Share'}
      aria-live="polite"
      className="w-full inline-flex items-center justify-center gap-2 h-12 px-5 border-2 border-foreground bg-foreground text-background text-sm font-bold uppercase tracking-wider font-mono shadow-[4px_4px_0_hsl(var(--foreground))] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[5px_5px_0_hsl(var(--foreground))] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 transition-all rounded-md"
    >
      {copied ? (
        <>
          <svg className="w-5 h-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span>{copiedLabel || 'Copied!'}</span>
        </>
      ) : (
        <>
          <svg className="w-5 h-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M16 6l-4-4m0 0L8 6m4-4v13" />
          </svg>
          <span>{shareLabel || 'Share'}</span>
        </>
      )}
    </button>
  )
}

/**
 * Secondary — icon-only buttons.
 */
function IconButton({
  onClick,
  ariaLabel,
  children,
}: {
  onClick: () => void
  ariaLabel: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      className="inline-flex items-center justify-center w-12 h-12 border-2 border-foreground bg-card text-foreground shadow-[3px_3px_0_hsl(var(--foreground))] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0_hsl(var(--foreground))] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 transition-all rounded-md"
    >
      {children}
    </button>
  )
}

export function PrintButton({ label = 'Print' }: { label?: string }) {
  return (
    <IconButton onClick={() => window.print()} ariaLabel={label}>
      <svg className="w-5 h-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
      </svg>
    </IconButton>
  )
}

export function ViewPhotoButton({ imageUrl, label = 'View photo' }: { imageUrl: string; label?: string }) {
  return (
    <IconButton
      onClick={() => window.open(imageUrl, '_blank', 'noopener,noreferrer')}
      ariaLabel={label}
    >
      <svg className="w-5 h-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    </IconButton>
  )
}

/**
 * Optional: small inline toggle for converting amounts between
 * receipt currency and the user's account currency. Client-side
 * reload-free; pure UI state.
 */
export function CurrencyToggle({
  showConverted,
  onToggle,
  label,
}: {
  showConverted: boolean
  onToggle: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={showConverted}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 border-2 border-foreground bg-card text-foreground font-mono text-[10px] font-bold uppercase tracking-widest shadow-[2px_2px_0_hsl(var(--foreground))] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0_hsl(var(--foreground))] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 transition-all rounded"
    >
      <svg className="w-3 h-3" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
      {label}
    </button>
  )
}
