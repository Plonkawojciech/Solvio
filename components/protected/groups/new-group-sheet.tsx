'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n'
import { useSession } from '@/lib/use-session'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2, Loader2, Users, CalendarDays, ChevronDown, ChevronUp, UserPlus } from 'lucide-react'
import { AppIcon, IconPicker } from '@/lib/app-icons'

const CURRENCIES = [
  { code: 'PLN', label: 'PLN -- Zloty' },
  { code: 'EUR', label: 'EUR -- Euro' },
  { code: 'USD', label: 'USD -- Dollar' },
  { code: 'GBP', label: 'GBP -- Pound' },
  { code: 'CZK', label: 'CZK -- Koruna' },
  { code: 'CHF', label: 'CHF -- Franc' },
]

const MEMBER_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6',
]

type TemplateKey = 'dinner' | 'trip' | 'household' | 'event' | 'quickDebt' | 'custom'

interface TemplateConfig {
  key: TemplateKey
  emoji: string
  labelKey: string
  descKey: string
  defaultEmoji: string
  defaultMode: string
  hasDates: boolean
  defaultMemberCount: number
}

const TEMPLATES: TemplateConfig[] = [
  {
    key: 'dinner',
    emoji: 'pizza',
    labelKey: 'groups.templates.dinner',
    descKey: 'groups.templates.dinnerDesc',
    defaultEmoji: 'pizza',
    defaultMode: 'default',
    hasDates: false,
    defaultMemberCount: 3,
  },
  {
    key: 'trip',
    emoji: 'plane',
    labelKey: 'groups.templates.trip',
    descKey: 'groups.templates.tripDesc',
    defaultEmoji: 'plane',
    defaultMode: 'trip',
    hasDates: true,
    defaultMemberCount: 4,
  },
  {
    key: 'household',
    emoji: 'home',
    labelKey: 'groups.templates.household',
    descKey: 'groups.templates.householdDesc',
    defaultEmoji: 'home',
    defaultMode: 'household',
    hasDates: false,
    defaultMemberCount: 3,
  },
  {
    key: 'event',
    emoji: 'party',
    labelKey: 'groups.templates.event',
    descKey: 'groups.templates.eventDesc',
    defaultEmoji: 'party',
    defaultMode: 'default',
    hasDates: true,
    defaultMemberCount: 5,
  },
  {
    key: 'quickDebt',
    emoji: 'banknote',
    labelKey: 'groups.templates.quickDebt',
    descKey: 'groups.templates.quickDebtDesc',
    defaultEmoji: 'banknote',
    defaultMode: 'default',
    hasDates: false,
    defaultMemberCount: 2,
  },
  {
    key: 'custom',
    emoji: 'globe',
    labelKey: 'groups.templates.custom',
    descKey: 'groups.templates.customDesc',
    defaultEmoji: 'globe',
    defaultMode: 'default',
    hasDates: false,
    defaultMemberCount: 2,
  },
]

interface Member {
  id: string
  name: string
  email: string
}

interface NewGroupSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function generateMembers(count: number): Member[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    name: '',
    email: '',
  }))
}

export function NewGroupSheet({ open, onOpenChange, onCreated }: NewGroupSheetProps) {
  const { t, lang } = useTranslation()
  const { email: sessionEmail } = useSession()

  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey | null>(null)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('globe')
  const [currency, setCurrency] = useState('PLN')
  const [mode, setMode] = useState('default')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [showDates, setShowDates] = useState(false)
  const [members, setMembers] = useState<Member[]>(generateMembers(2))
  const [loading, setLoading] = useState(false)

  const handleTemplateSelect = (template: TemplateConfig) => {
    setSelectedTemplate(template.key)
    setEmoji(template.defaultEmoji)
    setMode(template.defaultMode)
    setShowDates(template.hasDates)
    if (members.every((m) => !m.name.trim())) {
      setMembers(generateMembers(template.defaultMemberCount))
    }
  }

  const addMember = () => {
    setMembers((prev) => [
      ...prev,
      { id: String(Date.now()), name: '', email: '' },
    ])
  }

  // Dodaje zalogowanego użytkownika jako członka — imię z części lokalnej maila,
  // można je potem edytować jak każde inne pole
  const addSelf = () => {
    if (!sessionEmail) return
    if (members.some((m) => m.email.trim().toLowerCase() === sessionEmail.toLowerCase())) {
      toast.info(t('groups.alreadyAdded'))
      return
    }
    const local = sessionEmail.split('@')[0]
    const selfName = local.charAt(0).toUpperCase() + local.slice(1)
    setMembers((prev) => {
      const emptyIdx = prev.findIndex((m) => !m.name.trim() && !m.email.trim())
      const self = { name: selfName, email: sessionEmail }
      if (emptyIdx >= 0) {
        return prev.map((m, i) => (i === emptyIdx ? { ...m, ...self } : m))
      }
      return [...prev, { id: String(Date.now()), ...self }]
    })
  }

  const removeMember = (id: string) => {
    if (members.length <= 2) return
    setMembers((prev) => prev.filter((m) => m.id !== id))
  }

  const updateMember = (id: string, field: 'name' | 'email', value: string) => {
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, [field]: value } : m))
    )
  }

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error(t('groups.groupName'))
      return
    }
    const validMembers = members.filter((m) => m.name.trim())
    if (validMembers.length < 2) {
      toast.error(t('groups.minMembers'))
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          emoji,
          currency,
          mode,
          startDate: showDates && startDate ? startDate : null,
          endDate: showDates && endDate ? endDate : null,
          members: validMembers.map((m) => ({
            name: m.name.trim(),
            email: m.email.trim() || null,
          })),
        }),
      })
      if (!res.ok) throw new Error('Failed to create group')
      toast.success(t('groups.created'), { description: t('groups.createdDesc') })
      // Reset
      reset()
      onOpenChange(false)
      onCreated()
    } catch {
      toast.error(t('groups.failedCreate'))
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setSelectedTemplate(null)
    setName('')
    setEmoji('globe')
    setCurrency('PLN')
    setMode('default')
    setStartDate('')
    setEndDate('')
    setShowDates(false)
    setMembers(generateMembers(2))
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        onOpenChange(v)
      }}
    >
      <SheetContent className="w-full sm:max-w-md overflow-y-auto flex flex-col gap-0 p-0">
        <SheetHeader className="p-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            <AppIcon value={emoji} fallback="globe" size="lg" chipClassName="bg-primary/10 text-primary" />
            <div>
              <SheetTitle>{t('groups.createGroup')}</SheetTitle>
              <SheetDescription className="text-sm text-muted-foreground mt-0.5">
                {t('groups.addMembers')}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Template selection */}
          <div className="space-y-2">
            <Label>{t('groups.suggestedTemplates')}</Label>
            <div className="grid grid-cols-3 gap-2">
              {TEMPLATES.map((template) => {
                const isActive = selectedTemplate === template.key
                return (
                  <motion.button
                    key={template.key}
                    type="button"
                    onClick={() => handleTemplateSelect(template)}
                    whileTap={{ scale: 0.96 }}
                    className={`relative flex flex-col items-center gap-1.5 rounded-xl border py-3 px-2 text-center transition-all duration-200 ${
                      isActive
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border bg-muted/30 hover:bg-muted/60 hover:border-border'
                    }`}
                  >
                    <AppIcon value={template.emoji} size="sm" chipClassName="bg-transparent text-current" />
                    <span
                      className={`text-xs font-semibold leading-tight ${
                        isActive ? 'text-primary' : 'text-muted-foreground'
                      }`}
                    >
                      {t(template.labelKey as Parameters<typeof t>[0])}
                    </span>
                    <span className="text-[10px] text-muted-foreground leading-tight">
                      {t(template.descKey as Parameters<typeof t>[0])}
                    </span>
                    {isActive && (
                      <motion.div
                        layoutId="template-indicator"
                        className="absolute -top-px -right-px h-3 w-3 rounded-full bg-primary border border-background"
                        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                      />
                    )}
                  </motion.button>
                )
              })}
            </div>
          </div>

          {/* Group name */}
          <div className="space-y-2">
            <Label>{t('groups.groupName')}</Label>
            <Input
              placeholder={t('groups.groupNamePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Icon picker */}
          <div className="space-y-2">
            <Label>{lang === 'pl' ? 'Ikona' : 'Icon'}</Label>
            <IconPicker value={emoji} onChange={setEmoji} pl={lang === 'pl'} />
          </div>

          {/* Optional dates */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowDates(!showDates)}
              className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              <span>{t('groups.optionalDates')}</span>
              {showDates ? (
                <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
            <AnimatePresence>
              {showDates && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-3 p-3 bg-muted/30 rounded-xl border border-border">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">{t('groups.startDate')}</Label>
                        <Input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t('groups.endDate')}</Label>
                        <Input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          min={startDate || undefined}
                          className="text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Currency */}
          <div className="space-y-2">
            <Label>{t('groups.currency')}</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Members */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{t('groups.addMembers')}</Label>
              <div className="flex items-center gap-2">
                {sessionEmail && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-xs text-primary"
                    onClick={addSelf}
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    {t('groups.addMe')}
                  </Button>
                )}
                <span className="text-xs text-muted-foreground">
                  {members.filter((m) => m.name.trim()).length} / {members.length}
                </span>
              </div>
            </div>

            <AnimatePresence initial={false}>
              {members.map((member, idx) => (
                <motion.div
                  key={member.id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-start gap-2"
                >
                  {/* Colored avatar preview */}
                  <div
                    className="mt-2.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: MEMBER_COLORS[idx % MEMBER_COLORS.length] }}
                  >
                    {member.name ? getInitials(member.name) : (idx + 1)}
                  </div>

                  <div className="flex-1 space-y-1.5">
                    <Input
                      placeholder={t('groups.memberName')}
                      value={member.name}
                      onChange={(e) => updateMember(member.id, 'name', e.target.value)}
                    />
                    <Input
                      placeholder={t('groups.memberEmail')}
                      type="email"
                      value={member.email}
                      onChange={(e) => updateMember(member.id, 'email', e.target.value)}
                      className="text-sm"
                    />
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="mt-2 h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeMember(member.id)}
                    disabled={members.length <= 2}
                    aria-label={t('groups.removeMember')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </motion.div>
              ))}
            </AnimatePresence>

            <Button
              variant="outline"
              size="sm"
              className="w-full border-dashed"
              onClick={addMember}
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('groups.addPerson')}
            </Button>

            {members.filter((m) => m.name.trim()).length < 2 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3" />
                {t('groups.minMembers')}
              </p>
            )}
          </div>
        </div>

        <SheetFooter className="p-6 pt-4 border-t">
          <Button
            className="w-full"
            onClick={handleCreate}
            disabled={loading || !name.trim() || members.filter((m) => m.name.trim()).length < 2}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('groups.creating')}
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                {t('groups.createGroup')}
              </>
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
