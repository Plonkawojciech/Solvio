'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'
import { useProductType } from '@/hooks/use-product-type'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Users, UserPlus, AlertCircle, RefreshCw, Building2, Mail,
  Loader2, Shield, Crown, UserCog, User as UserIcon, Clock,
} from 'lucide-react'
import { toast } from 'sonner'
import { TeamMemberCard, type TeamMember } from '@/components/protected/business/team-member-card'
import { cn } from '@/lib/utils'

// i18n keys:
// 'team.title' / 'team.description'
// 'team.invite' / 'team.inviteTitle' / 'team.inviteDesc'
// 'team.invite.email' / 'team.invite.role' / 'team.invite.department' / 'team.invite.spendingLimit'
// 'team.invite.send' / 'team.invite.sending' / 'team.invite.success' / 'team.invite.error'
// 'team.members' / 'team.pendingInvitations'
// 'team.companyInfo' / 'team.memberCount'
// 'team.filter.all' / 'team.filter.department'
// 'team.empty.title' / 'team.empty.desc'
// 'team.error.title' / 'team.error.desc' / 'team.error.retry'
// 'team.removeConfirm' / 'team.removeConfirmDesc' / 'team.removeAction' / 'team.removeSuccess'
// 'team.editTitle' / 'team.editSuccess'

interface Company {
  id: string
  name: string
  nip: string | null
  vatPayer: boolean
}

interface Department {
  id: string
  name: string
  budget: string | null
  color: string | null
}

// ---- Skeleton ----
function TeamSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:gap-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-36 rounded bg-muted" />
        <div className="h-4 w-56 rounded bg-muted" />
      </div>
      <div className="rounded-xl border bg-card p-4 flex items-center gap-4">
        <div className="h-12 w-12 rounded-lg bg-muted" />
        <div className="space-y-2">
          <div className="h-5 w-40 rounded bg-muted" />
          <div className="h-3 w-32 rounded bg-muted" />
        </div>
      </div>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-muted" />
              <div className="space-y-1.5">
                <div className="h-4 w-28 rounded bg-muted" />
                <div className="h-3 w-36 rounded bg-muted" />
              </div>
            </div>
            <div className="h-1.5 w-full rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- Error ----
function TeamError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35 }}
        className="flex flex-col items-center gap-4 text-center max-w-sm"
      >
        <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold" suppressHydrationWarning>{t('team.error.title')}</h3>
          <p className="text-sm text-muted-foreground" suppressHydrationWarning>{t('team.error.desc')}</p>
        </div>
        <Button onClick={onRetry} variant="outline" className="gap-2" suppressHydrationWarning>
          <RefreshCw className="h-4 w-4" />
          {t('team.error.retry')}
        </Button>
      </motion.div>
    </div>
  )
}

// ---- Empty ----
function TeamEmpty({ onInvite }: { onInvite: () => void }) {
  const { t } = useTranslation()
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex items-center justify-center min-h-[400px]"
    >
      <div className="flex flex-col items-center gap-4 text-center max-w-sm">
        <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Users className="h-10 w-10 text-primary" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold" suppressHydrationWarning>{t('team.empty.title')}</h3>
          <p className="text-sm text-muted-foreground" suppressHydrationWarning>{t('team.empty.desc')}</p>
        </div>
        <Button onClick={onInvite} className="gap-2" suppressHydrationWarning>
          <UserPlus className="h-4 w-4" />
          {t('team.invite')}
        </Button>
      </div>
    </motion.div>
  )
}

// ---- Main Page ----
export default function TeamPage() {
  const { t, lang, mounted } = useTranslation()
  const { isBusiness } = useProductType()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [departmentsList, setDepartmentsList] = useState<Department[]>([])
  const [currentUserRole, setCurrentUserRole] = useState<string>('employee')

  // Invite sheet
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('employee')
  const [inviteDepartment, setInviteDepartment] = useState<string>('')
  const [inviteLimit, setInviteLimit] = useState('')
  const [inviting, setInviting] = useState(false)

  // Edit sheet
  const [editOpen, setEditOpen] = useState(false)
  const [editMember, setEditMember] = useState<TeamMember | null>(null)
  const [editRole, setEditRole] = useState('employee')
  const [editDepartment, setEditDepartment] = useState<string>('')
  const [editLimit, setEditLimit] = useState('')
  const [editing, setEditing] = useState(false)

  // Remove dialog
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false)
  const [removeMember, setRemoveMember] = useState<TeamMember | null>(null)
  const [removing, setRemoving] = useState(false)

  // Filter
  const [departmentFilter, setDepartmentFilter] = useState('all')

  const currency = 'PLN'
  const locale = lang === 'pl' ? 'pl-PL' : 'en-US'

  useEffect(() => {
    if (mounted && !isBusiness) {
      router.replace('/dashboard')
    }
  }, [mounted, isBusiness, router])

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/business/team', { signal })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data = await res.json()

      setCompany(data.company || null)
      setMembers(data.members || [])
      setDepartmentsList(data.departments || [])
      setCurrentUserRole(data.currentUserRole || 'employee')
    } catch (err: any) {
      if (err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isBusiness) return
    const controller = new AbortController()
    fetchData(controller.signal)
    return () => controller.abort()
  }, [fetchData, isBusiness])

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return
    setInviting(true)
    try {
      const res = await fetch('/api/business/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
          departmentId: inviteDepartment || null,
          spendingLimit: inviteLimit ? parseFloat(inviteLimit) : null,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Invite failed')
      }

      toast.success(t('team.invite.success'))
      setInviteOpen(false)
      setInviteEmail('')
      setInviteRole('employee')
      setInviteDepartment('')
      setInviteLimit('')
      fetchData()
    } catch (err: any) {
      toast.error(err.message || t('team.invite.error'))
    } finally {
      setInviting(false)
    }
  }

  const handleEdit = async () => {
    if (!editMember) return
    setEditing(true)
    try {
      const res = await fetch(`/api/business/team/${editMember.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: editRole,
          departmentId: editDepartment || null,
          spendingLimit: editLimit ? parseFloat(editLimit) : null,
        }),
      })

      if (!res.ok) throw new Error('Update failed')

      toast.success(t('team.editSuccess'))
      setEditOpen(false)
      setEditMember(null)
      fetchData()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setEditing(false)
    }
  }

  const handleRemove = async () => {
    if (!removeMember) return
    setRemoving(true)
    try {
      const res = await fetch(`/api/business/team/${removeMember.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Remove failed')

      toast.success(t('team.removeSuccess'))
      setRemoveDialogOpen(false)
      setRemoveMember(null)
      fetchData()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setRemoving(false)
    }
  }

  const openEdit = (member: TeamMember) => {
    setEditMember(member)
    setEditRole(member.role)
    setEditDepartment(member.departmentId || '')
    setEditLimit(member.spendingLimit || '')
    setEditOpen(true)
  }

  const openRemove = (member: TeamMember) => {
    setRemoveMember(member)
    setRemoveDialogOpen(true)
  }

  if (!isBusiness) return null
  if (loading) return <TeamSkeleton />
  if (error) return <TeamError onRetry={() => fetchData()} />

  const canManage = ['owner', 'admin'].includes(currentUserRole)
  const activeMembers = members.filter(m => m.isActive)
  const pendingMembers = members.filter(m => !m.isActive)

  const filteredMembers = departmentFilter === 'all'
    ? activeMembers
    : activeMembers.filter(m => m.departmentId === departmentFilter)

  const fadeUp = {
    hidden: { opacity: 0, y: 24 },
    show: (i: number) => ({
      opacity: 1, y: 0,
      transition: { duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] as const },
    }),
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="flex flex-col gap-4 sm:gap-6">
      {/* Header */}
      <motion.div custom={0} initial="hidden" animate="show" variants={fadeUp}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" suppressHydrationWarning>{t('team.title')}</h1>
            <p className="text-sm text-muted-foreground mt-1" suppressHydrationWarning>{t('team.description')}</p>
          </div>
          {canManage && (
            <Button className="gap-2" onClick={() => setInviteOpen(true)} suppressHydrationWarning>
              <UserPlus className="h-4 w-4" />
              {t('team.invite')}
            </Button>
          )}
        </div>
      </motion.div>

      {/* Company Info Header */}
      {company && (
        <motion.div custom={1} initial="hidden" animate="show" variants={fadeUp}>
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-lg">{company.name}</h2>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  {company.nip && <span>NIP: {company.nip}</span>}
                  <span suppressHydrationWarning>{activeMembers.length} {t('team.memberCount')}</span>
                </div>
              </div>
              {company.vatPayer && (
                <Badge className="bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900">
                  VAT
                </Badge>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Department Filter */}
      {departmentsList.length > 0 && (
        <motion.div custom={2} initial="hidden" animate="show" variants={fadeUp}>
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t('team.filter.department')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" suppressHydrationWarning>{t('team.filter.all')}</SelectItem>
              {departmentsList.map(dept => (
                <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </motion.div>
      )}

      {/* Active Members */}
      {filteredMembers.length === 0 && pendingMembers.length === 0 ? (
        <TeamEmpty onInvite={() => setInviteOpen(true)} />
      ) : (
        <>
          {filteredMembers.length > 0 && (
            <motion.div custom={3} initial="hidden" animate="show" variants={fadeUp}>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2" suppressHydrationWarning>
                <Users className="h-4 w-4" />
                {t('team.members')} ({filteredMembers.length})
              </h3>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {filteredMembers.map((member, idx) => (
                  <TeamMemberCard
                    key={member.id}
                    member={member}
                    currency={currency}
                    locale={locale}
                    onEdit={canManage ? openEdit : undefined}
                    onRemove={canManage ? openRemove : undefined}
                    index={idx}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {/* Pending Invitations */}
          {pendingMembers.length > 0 && (
            <motion.div custom={4} initial="hidden" animate="show" variants={fadeUp}>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2" suppressHydrationWarning>
                <Clock className="h-4 w-4" />
                {t('team.pendingInvitations')} ({pendingMembers.length})
              </h3>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {pendingMembers.map((member, idx) => (
                  <TeamMemberCard
                    key={member.id}
                    member={member}
                    currency={currency}
                    locale={locale}
                    onRemove={canManage ? openRemove : undefined}
                    index={idx}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </>
      )}

      {/* Invite Sheet */}
      <Sheet open={inviteOpen} onOpenChange={setInviteOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2" suppressHydrationWarning>
              <UserPlus className="h-5 w-5" />
              {t('team.inviteTitle')}
            </SheetTitle>
            <SheetDescription suppressHydrationWarning>
              {t('team.inviteDesc')}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 py-4 px-4">
            <div className="space-y-2">
              <Label suppressHydrationWarning>{t('team.invite.email')}</Label>
              <div className="relative">
                <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="jan@firma.pl"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label suppressHydrationWarning>{t('team.invite.role')}</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <Shield className="h-3.5 w-3.5 text-blue-600" />
                      <span suppressHydrationWarning>{t('team.role.admin')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="manager">
                    <div className="flex items-center gap-2">
                      <UserCog className="h-3.5 w-3.5 text-emerald-600" />
                      <span suppressHydrationWarning>{t('team.role.manager')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="employee">
                    <div className="flex items-center gap-2">
                      <UserIcon className="h-3.5 w-3.5 text-gray-600" />
                      <span suppressHydrationWarning>{t('team.role.employee')}</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {departmentsList.length > 0 && (
              <div className="space-y-2">
                <Label suppressHydrationWarning>{t('team.invite.department')}</Label>
                <Select value={inviteDepartment} onValueChange={setInviteDepartment}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">—</SelectItem>
                    {departmentsList.map(dept => (
                      <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label suppressHydrationWarning>{t('team.invite.spendingLimit')}</Label>
              <Input
                type="number"
                placeholder="5000"
                value={inviteLimit}
                onChange={(e) => setInviteLimit(e.target.value)}
                min="0"
                step="100"
              />
              <p className="text-xs text-muted-foreground">PLN / {t('team.perMonth')}</p>
            </div>
          </div>

          <SheetFooter>
            <Button
              onClick={handleInvite}
              disabled={inviting || !inviteEmail.trim()}
              className="w-full gap-2"
              suppressHydrationWarning
            >
              {inviting && <Loader2 className="h-4 w-4 animate-spin" />}
              {inviting ? t('team.invite.sending') : t('team.invite.send')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Edit Sheet */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle suppressHydrationWarning>{t('team.editTitle')}</SheetTitle>
            <SheetDescription>{editMember?.displayName || editMember?.email}</SheetDescription>
          </SheetHeader>

          <div className="space-y-4 py-4 px-4">
            <div className="space-y-2">
              <Label suppressHydrationWarning>{t('team.invite.role')}</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin" suppressHydrationWarning>{t('team.role.admin')}</SelectItem>
                  <SelectItem value="manager" suppressHydrationWarning>{t('team.role.manager')}</SelectItem>
                  <SelectItem value="employee" suppressHydrationWarning>{t('team.role.employee')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {departmentsList.length > 0 && (
              <div className="space-y-2">
                <Label suppressHydrationWarning>{t('team.invite.department')}</Label>
                <Select value={editDepartment} onValueChange={setEditDepartment}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">—</SelectItem>
                    {departmentsList.map(dept => (
                      <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label suppressHydrationWarning>{t('team.invite.spendingLimit')}</Label>
              <Input
                type="number"
                placeholder="5000"
                value={editLimit}
                onChange={(e) => setEditLimit(e.target.value)}
                min="0"
                step="100"
              />
            </div>
          </div>

          <SheetFooter>
            <Button
              onClick={handleEdit}
              disabled={editing}
              className="w-full gap-2"
              suppressHydrationWarning
            >
              {editing && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('common.save')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Remove Confirmation Dialog */}
      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle suppressHydrationWarning>{t('team.removeConfirm')}</DialogTitle>
            <DialogDescription suppressHydrationWarning>
              {t('team.removeConfirmDesc')} <strong>{removeMember?.displayName || removeMember?.email}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRemoveDialogOpen(false)} suppressHydrationWarning>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={removing}
              className="gap-2"
              suppressHydrationWarning
            >
              {removing && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('team.removeAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
