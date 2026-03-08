'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n'
import { AddExpenseSheet } from '@/components/protected/dashboard/add-expense-sheet'
import { motion, AnimatePresence } from 'framer-motion'
import { Keyboard, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShortcutGroup {
  labelPl: string
  labelEn: string
  shortcuts: {
    keys: string[]
    descPl: string
    descEn: string
  }[]
}

// ─── Shortcut data ────────────────────────────────────────────────────────────

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    labelPl: 'Nawigacja',
    labelEn: 'Navigation',
    shortcuts: [
      { keys: ['g', 'd'], descPl: 'Przejdź do Panelu', descEn: 'Go to Dashboard' },
      { keys: ['g', 'e'], descPl: 'Przejdź do Wydatków', descEn: 'Go to Expenses' },
      { keys: ['g', 'a'], descPl: 'Przejdź do Analizy AI', descEn: 'Go to AI Analysis' },
      { keys: ['g', 'r'], descPl: 'Przejdź do Raportów', descEn: 'Go to Reports' },
      { keys: ['g', 's'], descPl: 'Przejdź do Ustawień', descEn: 'Go to Settings' },
    ],
  },
  {
    labelPl: 'Akcje',
    labelEn: 'Actions',
    shortcuts: [
      { keys: ['n'], descPl: 'Nowy wydatek', descEn: 'New expense' },
    ],
  },
  {
    labelPl: 'Ogólne',
    labelEn: 'General',
    shortcuts: [
      { keys: ['?'], descPl: 'Pokaż skróty klawiszowe', descEn: 'Show keyboard shortcuts' },
      { keys: ['Esc'], descPl: 'Zamknij modal', descEn: 'Close modal' },
    ],
  },
]

// ─── KeyBadge ─────────────────────────────────────────────────────────────────

function KeyBadge({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] font-mono font-medium text-muted-foreground shadow-sm min-w-[1.5rem]">
      {children}
    </kbd>
  )
}

// ─── Shortcuts Modal ──────────────────────────────────────────────────────────

interface ShortcutsModalProps {
  open: boolean
  onClose: () => void
  lang: string
}

function ShortcutsModal({ open, onClose, lang }: ShortcutsModalProps) {
  const isPl = lang === 'pl'

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label={isPl ? 'Skróty klawiszowe' : 'Keyboard shortcuts'}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <Keyboard className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">
                  {isPl ? 'Skróty klawiszowe' : 'Keyboard shortcuts'}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label={isPl ? 'Zamknij' : 'Close'}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="divide-y divide-border px-5 py-3">
              {SHORTCUT_GROUPS.map((group) => (
                <div key={group.labelEn} className="py-3 first:pt-0 last:pb-0">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {isPl ? group.labelPl : group.labelEn}
                  </p>
                  <ul className="space-y-1.5">
                    {group.shortcuts.map((sc) => (
                      <li
                        key={sc.descEn}
                        className="flex items-center justify-between gap-4"
                      >
                        <span className="text-sm text-foreground">
                          {isPl ? sc.descPl : sc.descEn}
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          {sc.keys.map((k, i) => (
                            <React.Fragment key={k}>
                              <KeyBadge>{k}</KeyBadge>
                              {i < sc.keys.length - 1 && (
                                <span className="text-[10px] text-muted-foreground">then</span>
                              )}
                            </React.Fragment>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="border-t border-border px-5 py-3">
              <p className="text-[11px] text-muted-foreground">
                {isPl
                  ? 'Skróty nie działają gdy kursor jest w polu tekstowym.'
                  : 'Shortcuts are disabled when focus is inside a text input.'}
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface KeyboardShortcutsProps {
  /** Called when the shortcuts modal should open — used by the sidebar button */
  triggerRef?: React.RefObject<(() => void) | null>
}

export function KeyboardShortcuts({ triggerRef }: KeyboardShortcutsProps) {
  const router = useRouter()
  const { lang, mounted } = useTranslation()

  const [helpOpen, setHelpOpen] = React.useState(false)
  const [addExpenseOpen, setAddExpenseOpen] = React.useState(false)

  // Sequence state for "g d / g e / g a / g r / g s" chords
  const pendingG = React.useRef(false)
  const pendingTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // Expose open function via ref so the sidebar button can call it
  React.useEffect(() => {
    if (triggerRef) {
      (triggerRef as React.MutableRefObject<(() => void) | null>).current = () => setHelpOpen(true)
    }
  }, [triggerRef])

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Skip if focus is inside an input / textarea / contenteditable
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return
      }

      // Escape — close any open modal
      if (e.key === 'Escape') {
        if (helpOpen) setHelpOpen(false)
        if (addExpenseOpen) setAddExpenseOpen(false)
        return
      }

      // ? — toggle help modal
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        setHelpOpen((v) => !v)
        return
      }

      // n — new expense (only when no modal is open)
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !helpOpen) {
        e.preventDefault()
        setAddExpenseOpen(true)
        return
      }

      // g-chord navigation
      if (e.key === 'g' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        pendingG.current = true
        if (pendingTimer.current) clearTimeout(pendingTimer.current)
        pendingTimer.current = setTimeout(() => {
          pendingG.current = false
        }, 1500) // 1.5s window to press second key
        return
      }

      if (pendingG.current) {
        pendingG.current = false
        if (pendingTimer.current) clearTimeout(pendingTimer.current)

        const map: Record<string, string> = {
          d: '/dashboard',
          e: '/expenses',
          a: '/analysis',
          r: '/reports',
          s: '/settings',
        }
        const destination = map[e.key]
        if (destination) {
          e.preventDefault()
          router.push(destination)
        }
        return
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (pendingTimer.current) clearTimeout(pendingTimer.current)
    }
  }, [router, helpOpen, addExpenseOpen])

  if (!mounted) return null

  return (
    <>
      <ShortcutsModal open={helpOpen} onClose={() => setHelpOpen(false)} lang={lang} />

      <AddExpenseSheet
        isOpen={addExpenseOpen}
        onClose={() => setAddExpenseOpen(false)}
        onAction={() => {
          setAddExpenseOpen(false)
          router.refresh()
        }}
      />
    </>
  )
}

// ─── Sidebar help button ──────────────────────────────────────────────────────

interface KeyboardShortcutsButtonProps {
  onClick: () => void
}

export function KeyboardShortcutsButton({ onClick }: KeyboardShortcutsButtonProps) {
  const { t, mounted } = useTranslation()

  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors gap-2"
      onClick={onClick}
      aria-label={mounted ? t('shortcuts.open') : 'Keyboard shortcuts'}
      title="? — keyboard shortcuts"
    >
      <Keyboard className="h-4 w-4 shrink-0" />
      <span className="text-xs" suppressHydrationWarning>
        {mounted ? t('shortcuts.label') : 'Keyboard shortcuts'}
      </span>
      <KeyBadge>?</KeyBadge>
    </Button>
  )
}
