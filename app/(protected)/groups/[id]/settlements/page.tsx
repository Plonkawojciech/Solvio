'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'
import { ArrowLeft } from 'lucide-react'
import { SettlementSummary } from '@/components/protected/groups/settlement-summary'

export default function GroupSettlementsPage() {
  const { t } = useTranslation()
  const params = useParams()
  const groupId = params?.id as string

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Link
          href={`/groups/${groupId}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50 rounded-md px-1 -ml-1"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('groups.backToGroup')}
        </Link>

        <h1 className="text-2xl font-bold tracking-tight mt-3">
          {t('settlements.title')}
        </h1>
      </motion.div>

      <SettlementSummary groupId={groupId} />
    </div>
  )
}
