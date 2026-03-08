'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Users, Plus, ArrowRight, Loader2, AlertCircle } from 'lucide-react'
import { NewGroupSheet } from '@/components/protected/groups/new-group-sheet'

const MEMBER_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6',
]

interface GroupMember {
  id: string
  name: string
  email?: string | null
}

interface Group {
  id: string
  name: string
  emoji: string
  currency: string
  totalBalance: number
  members: GroupMember[]
  createdAt: string
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function MemberAvatars({ members }: { members: GroupMember[] }) {
  const visible = members.slice(0, 5)
  const overflow = members.length - 5
  return (
    <div className="flex -space-x-2">
      {visible.map((m, idx) => (
        <div
          key={m.id}
          title={m.name}
          className="h-8 w-8 rounded-full border-2 border-background flex items-center justify-center text-xs font-semibold text-white shrink-0"
          style={{ backgroundColor: MEMBER_COLORS[idx % MEMBER_COLORS.length] }}
        >
          {getInitials(m.name)}
        </div>
      ))}
      {overflow > 0 && (
        <div className="h-8 w-8 rounded-full border-2 border-background bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
          +{overflow}
        </div>
      )}
    </div>
  )
}

function GroupCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Skeleton className="h-12 w-12 rounded-xl shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
          <Skeleton className="h-9 w-20 shrink-0" />
        </div>
        <div className="mt-4 pt-4 border-t flex items-center justify-between">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-5 w-16" />
        </div>
      </CardContent>
    </Card>
  )
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
} as any

export default function GroupsPage() {
  const { t } = useTranslation()
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  const fetchGroups = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch('/api/groups')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setGroups(Array.isArray(data) ? data : (data.groups ?? []))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('groups.title')}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {t('groups.emptyDesc')}
          </p>
        </div>
        <Button onClick={() => setSheetOpen(true)} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          {t('groups.newGroup')}
        </Button>
      </motion.div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <GroupCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20 gap-4 text-center"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-7 w-7 text-destructive" />
          </div>
          <div>
            <p className="font-semibold">{t('groups.failedLoad')}</p>
          </div>
          <Button variant="outline" onClick={fetchGroups}>
            {t('common.refresh')}
          </Button>
        </motion.div>
      ) : groups.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center justify-center py-24 gap-5 text-center"
        >
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
              <Users className="h-10 w-10 text-primary" />
            </div>
            {/* Decorative rings */}
            <div className="absolute -inset-4 rounded-full border-2 border-primary/10 animate-pulse" />
            <div className="absolute -inset-8 rounded-full border border-primary/5" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl font-semibold">{t('groups.emptyTitle')}</h2>
            <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
              {t('groups.emptyDesc')}
            </p>
          </div>
          <Button onClick={() => setSheetOpen(true)} size="lg">
            <Plus className="h-4 w-4 mr-2" />
            {t('groups.emptyAction')}
          </Button>
        </motion.div>
      ) : (
        <AnimatePresence>
          <div className="space-y-3">
            {groups.map((group, i) => (
              <motion.div
                key={group.id}
                custom={i}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
              >
                <Card className="overflow-hidden hover:shadow-md transition-shadow duration-200 group/card">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      {/* Left: emoji + name + member count */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-2xl">
                          {group.emoji || '👥'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate leading-tight">{group.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {group.members.length}{' '}
                            {group.members.length === 1
                              ? t('groups.member')
                              : t('groups.members')}
                          </p>
                        </div>
                      </div>
                      {/* Open button */}
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="shrink-0 group-hover/card:bg-primary group-hover/card:text-primary-foreground group-hover/card:border-primary transition-colors"
                      >
                        <Link href={`/groups/${group.id}`}>
                          {t('groups.open')}
                          <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                        </Link>
                      </Button>
                    </div>

                    {/* Bottom: avatars + balance */}
                    <div className="mt-4 pt-4 border-t flex items-center justify-between gap-3">
                      <MemberAvatars members={group.members} />
                      <div className="text-right">
                        {group.totalBalance === 0 ? (
                          <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                            {t('groups.settled')}
                          </span>
                        ) : (
                          <div>
                            <p className="text-xs text-muted-foreground">{t('groups.balance')}</p>
                            <p
                              className={`text-sm font-semibold tabular-nums ${
                                group.totalBalance > 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-red-500 dark:text-red-400'
                              }`}
                            >
                              {group.totalBalance > 0 ? '+' : ''}
                              {group.currency} {Math.abs(group.totalBalance).toFixed(2)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      )}

      <NewGroupSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onCreated={fetchGroups}
      />
    </div>
  )
}
