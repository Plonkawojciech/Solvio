'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n'
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
import { Plus, Trash2, Loader2, Users } from 'lucide-react'

const EMOJIS = ['👥', '🏠', '🎉', '✈️', '🍕', '🎓', '💍', '🏋️', '🛒', '🎮']

const CURRENCIES = [
  { code: 'PLN', label: 'PLN – Złoty' },
  { code: 'EUR', label: 'EUR – Euro' },
  { code: 'USD', label: 'USD – Dollar' },
  { code: 'GBP', label: 'GBP – Pound' },
  { code: 'CZK', label: 'CZK – Koruna' },
  { code: 'CHF', label: 'CHF – Franc' },
]

const MEMBER_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6',
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

export function NewGroupSheet({ open, onOpenChange, onCreated }: NewGroupSheetProps) {
  const { t } = useTranslation()

  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('👥')
  const [currency, setCurrency] = useState('PLN')
  const [members, setMembers] = useState<Member[]>([
    { id: '1', name: '', email: '' },
    { id: '2', name: '', email: '' },
  ])
  const [loading, setLoading] = useState(false)

  const addMember = () => {
    setMembers((prev) => [
      ...prev,
      { id: String(Date.now()), name: '', email: '' },
    ])
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
          members: validMembers.map((m) => ({
            name: m.name.trim(),
            email: m.email.trim() || null,
          })),
        }),
      })
      if (!res.ok) throw new Error('Failed to create group')
      toast.success(t('groups.created'), { description: t('groups.createdDesc') })
      // Reset
      setName('')
      setEmoji('👥')
      setCurrency('PLN')
      setMembers([
        { id: '1', name: '', email: '' },
        { id: '2', name: '', email: '' },
      ])
      onOpenChange(false)
      onCreated()
    } catch {
      toast.error(t('groups.failedCreate'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto flex flex-col gap-0 p-0">
        <SheetHeader className="p-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-xl">
              {emoji}
            </div>
            <div>
              <SheetTitle>{t('groups.createGroup')}</SheetTitle>
              <SheetDescription className="text-sm text-muted-foreground mt-0.5">
                {t('groups.addMembers')}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Group name */}
          <div className="space-y-2">
            <Label>{t('groups.groupName')}</Label>
            <Input
              placeholder={t('groups.groupNamePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Emoji picker */}
          <div className="space-y-2">
            <Label>{t('groups.emoji')}</Label>
            <div className="flex flex-wrap gap-2">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={`flex h-10 w-10 items-center justify-center rounded-lg text-xl transition-all border-2 ${
                    emoji === e
                      ? 'border-primary bg-primary/10 scale-110'
                      : 'border-transparent bg-muted hover:bg-muted/80'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
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
              <span className="text-xs text-muted-foreground">
                {members.filter((m) => m.name.trim()).length} / {members.length}
              </span>
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
