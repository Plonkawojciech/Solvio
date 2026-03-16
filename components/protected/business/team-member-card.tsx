'use client'

import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MoreHorizontal, Mail, Building2, Wallet, Trash2, Edit2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Progress } from '@/components/ui/progress'

export interface TeamMember {
  id: string
  companyId: string
  userId: string
  role: string
  displayName: string | null
  email: string | null
  departmentId: string | null
  departmentName?: string | null
  spendingLimit: string | null
  spendingUsed?: string
  isActive: boolean
  createdAt: string
}

interface TeamMemberCardProps {
  member: TeamMember
  currency: string
  locale: string
  onEdit?: (member: TeamMember) => void
  onRemove?: (member: TeamMember) => void
  index?: number
  isCurrentUser?: boolean
}

// i18n keys:
// 'team.role.owner' / 'team.role.admin' / 'team.role.manager' / 'team.role.employee'
// 'team.spendingUsed' / 'team.noLimit' / 'team.inactive' / 'team.edit' / 'team.remove'
// 'team.noDepartment'

const roleConfig: Record<string, { color: string; bgColor: string }> = {
  owner: { color: 'text-purple-700 dark:text-purple-400', bgColor: 'bg-purple-100 dark:bg-purple-950/60 border-purple-200 dark:border-purple-900' },
  admin: { color: 'text-blue-700 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-950/60 border-blue-200 dark:border-blue-900' },
  manager: { color: 'text-emerald-700 dark:text-emerald-400', bgColor: 'bg-emerald-100 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-900' },
  employee: { color: 'text-gray-700 dark:text-gray-400', bgColor: 'bg-gray-100 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700' },
}

export function TeamMemberCard({
  member,
  currency,
  locale,
  onEdit,
  onRemove,
  index = 0,
  isCurrentUser = false,
}: TeamMemberCardProps) {
  const { t } = useTranslation()

  const formatAmount = (amount: string | null | undefined) => {
    if (!amount) return '—'
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(parseFloat(amount))
  }

  const role = member.role || 'employee'
  const config = roleConfig[role] || roleConfig.employee
  const displayName = member.displayName || member.email?.split('@')[0] || 'User'
  const initials = displayName.slice(0, 2).toUpperCase()

  const spendingLimit = member.spendingLimit ? parseFloat(member.spendingLimit) : 0
  const spendingUsed = member.spendingUsed ? parseFloat(member.spendingUsed) : 0
  const spendingPercent = spendingLimit > 0 ? Math.min((spendingUsed / spendingLimit) * 100, 100) : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] as any }}
    >
      <Card className={cn(
        'transition-all duration-200 hover:shadow-md',
        !member.isActive && 'opacity-60',
        isCurrentUser && 'border-primary/30 bg-primary/[0.02]'
      )}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              {/* Avatar */}
              <div className={cn(
                'h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-sm font-bold',
                member.isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              )}>
                {initials}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm truncate">{displayName}</p>
                  <Badge className={cn('text-[10px] px-1.5 py-0', config.bgColor, config.color)} suppressHydrationWarning>
                    {t(`team.role.${role}`)}
                  </Badge>
                  {!member.isActive && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground" suppressHydrationWarning>
                      {t('team.inactive')}
                    </Badge>
                  )}
                  {isCurrentUser && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-primary border-primary/30" suppressHydrationWarning>
                      {t('team.you')}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                  {member.email && (
                    <span className="flex items-center gap-1 truncate">
                      <Mail className="h-3 w-3 shrink-0" />
                      {member.email}
                    </span>
                  )}
                  {member.departmentName && (
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3 shrink-0" />
                      {member.departmentName}
                    </span>
                  )}
                </div>

                {/* Spending progress */}
                {spendingLimit > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground flex items-center gap-1" suppressHydrationWarning>
                        <Wallet className="h-3 w-3" />
                        {t('team.spendingUsed')}
                      </span>
                      <span className="tabular-nums font-medium">
                        {formatAmount(member.spendingUsed)} / {formatAmount(member.spendingLimit)}
                      </span>
                    </div>
                    <Progress
                      value={spendingPercent}
                      className="h-1.5"
                    />
                  </div>
                )}
                {spendingLimit === 0 && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <Wallet className="h-3 w-3" />
                    <span suppressHydrationWarning>{t('team.noLimit')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions dropdown */}
            {(onEdit || onRemove) && role !== 'owner' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onEdit && (
                    <DropdownMenuItem onClick={() => onEdit(member)} suppressHydrationWarning>
                      <Edit2 className="h-3.5 w-3.5 mr-2" />
                      {t('team.edit')}
                    </DropdownMenuItem>
                  )}
                  {onRemove && (
                    <DropdownMenuItem
                      onClick={() => onRemove(member)}
                      className="text-destructive focus:text-destructive"
                      suppressHydrationWarning
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      {t('team.remove')}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
