import { pgTable, uuid, text, decimal, date, timestamp, boolean, jsonb, varchar, unique, index, integer, uniqueIndex } from 'drizzle-orm/pg-core'

export const userSettings = pgTable('user_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').unique().notNull(),
  currency: varchar('currency', { length: 3 }).default('PLN').notNull(),
  language: varchar('language', { length: 2 }).default('pl').notNull(),
  productType: varchar('product_type', { length: 10 }).default('personal').notNull(), // 'personal' | 'business'
  companyName: varchar('company_name', { length: 255 }),
  nip: varchar('nip', { length: 10 }),
  onboardingComplete: boolean('onboarding_complete').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  icon: varchar('icon', { length: 50 }),
  color: varchar('color', { length: 7 }),
  isDefault: boolean('is_default').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_categories_user_id').on(t.userId),
])

export const receipts = pgTable('receipts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  vendor: varchar('vendor', { length: 255 }),
  date: date('date'),
  total: decimal('total', { precision: 12, scale: 2 }),
  currency: varchar('currency', { length: 3 }).default('PLN').notNull(),
  imageUrl: text('image_url'),
  items: jsonb('items'),
  rawOcr: jsonb('raw_ocr'),
  status: varchar('status', { length: 20 }).default('processed').notNull(),
  hash: text('hash'),
  groupId: text('group_id'),
  paidByMemberId: text('paid_by_member_id'),
  exchangeRate: decimal('exchange_rate', { precision: 10, scale: 6 }),
  detectedLanguage: text('detected_language'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_receipts_user_id').on(t.userId),
  index('idx_receipts_group_id').on(t.groupId),
  index('idx_receipts_user_status').on(t.userId, t.status),
  index('idx_receipts_user_vendor').on(t.userId, t.vendor),
  index('idx_receipts_user_date').on(t.userId, t.date),
])

export const receiptItems = pgTable('receipt_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  receiptId: uuid('receipt_id').notNull(),
  userId: text('user_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  quantity: decimal('quantity', { precision: 10, scale: 3 }).default('1'),
  unitPrice: decimal('unit_price', { precision: 12, scale: 2 }),
  totalPrice: decimal('total_price', { precision: 12, scale: 2 }),
  categoryId: uuid('category_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_receipt_items_receipt_id').on(t.receiptId),
  index('idx_receipt_items_user_id').on(t.userId),
])

export const expenses = pgTable('expenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).default('PLN').notNull(),
  date: date('date').notNull(),
  categoryId: uuid('category_id'),
  receiptId: uuid('receipt_id'),
  vendor: varchar('vendor', { length: 255 }),
  notes: text('notes'),
  tags: text('tags').array(),
  isRecurring: boolean('is_recurring').default(false).notNull(),
  // Business-only fields (nullable, ignored for personal)
  deductibility: varchar('deductibility', { length: 5 }), // 'kup' | 'nkup'
  vatRate: varchar('vat_rate', { length: 5 }), // '23%', '8%', '5%', '0%', 'zw'
  vatAmount: decimal('vat_amount', { precision: 12, scale: 2 }),
  netAmount: decimal('net_amount', { precision: 12, scale: 2 }),
  departmentId: uuid('department_id'),
  invoiceId: uuid('invoice_id'),
  approvalStatus: varchar('approval_status', { length: 20 }), // 'pending' | 'approved' | 'rejected'
  bankTransactionId: uuid('bank_transaction_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_expenses_user_date').on(t.userId, t.date),
  index('idx_expenses_user_id').on(t.userId),
  index('idx_expenses_category_id').on(t.categoryId),
  index('idx_expenses_receipt_id').on(t.receiptId),
  index('idx_expenses_vendor').on(t.userId, t.vendor),
])

export const categoryBudgets = pgTable('category_budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  categoryId: uuid('category_id').notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  period: varchar('period', { length: 10 }).default('monthly').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique().on(t.userId, t.categoryId, t.period),
  index('idx_category_budgets_user_id').on(t.userId),
])

export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  type: varchar('type', { length: 20 }).notNull(),
  periodStart: date('period_start'),
  periodEnd: date('period_end'),
  format: varchar('format', { length: 10 }),
  fileUrl: text('file_url'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_reports_user_id').on(t.userId),
])

export const audits = pgTable('audits', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  totalSpent: decimal('total_spent', { precision: 12, scale: 2 }),
  potentialSaving: decimal('potential_saving', { precision: 12, scale: 2 }),
  bestStore: varchar('best_store', { length: 255 }),
  data: jsonb('data'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_audits_user_id').on(t.userId),
])

// ── Groups ────────────────────────────────────────────────────────────────────
export const groups = pgTable('groups', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  description: text('description'),
  createdBy: text('created_by').notNull(),
  currency: text('currency').notNull().default('PLN'),
  emoji: text('emoji').default('👥'),
  mode: varchar('mode', { length: 15 }).default('default').notNull(), // 'default' | 'trip' | 'household'
  startDate: date('start_date'),
  endDate: date('end_date'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_groups_created_by').on(t.createdBy),
])

// ── Group Members ──────────────────────────────────────────────────────────────
export const groupMembers = pgTable('group_members', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  groupId: text('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  userId: text('user_id'), // null for external (non-app) members
  displayName: text('display_name').notNull(),
  email: text('email'),
  color: text('color').default('#6366f1'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_group_members_group_id').on(t.groupId),
  index('idx_group_members_user_id').on(t.userId),
])

// ── Expense Splits ─────────────────────────────────────────────────────────────
export const expenseSplits = pgTable('expense_splits', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  groupId: text('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'set null' }),
  receiptId: uuid('receipt_id').references(() => receipts.id, { onDelete: 'set null' }),
  paidByMemberId: text('paid_by_member_id').notNull().references(() => groupMembers.id),
  totalAmount: decimal('total_amount', { precision: 12, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('PLN'),
  description: text('description').notNull(),
  splits: jsonb('splits').notNull().$type<Array<{
    memberId: string
    amount: number
    settled: boolean
    settledAt?: string
  }>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_expense_splits_group_id').on(t.groupId),
])

// ── Receipt Item Assignments (group splitting per item) ───────────────────
export const receiptItemAssignments = pgTable('receipt_item_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  receiptItemId: uuid('receipt_item_id').notNull(),
  groupId: text('group_id').notNull(),
  memberId: text('member_id').notNull(),
  share: decimal('share', { precision: 5, scale: 4 }).default('1').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_receipt_item_assignments_item_id').on(t.receiptItemId),
  index('idx_receipt_item_assignments_group_id').on(t.groupId),
])

// ── Payment Requests ───────────────────────────────────────────────────────────
export const paymentRequests = pgTable('payment_requests', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  splitId: text('split_id').references(() => expenseSplits.id, { onDelete: 'cascade' }),
  groupId: text('group_id').references(() => groups.id, { onDelete: 'cascade' }),
  fromMemberId: text('from_member_id').notNull().references(() => groupMembers.id),
  toMemberId: text('to_member_id').notNull().references(() => groupMembers.id),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('PLN'),
  status: text('status').notNull().default('pending'), // 'pending' | 'settled' | 'declined'
  note: text('note'),
  shareToken: text('share_token'),
  bankAccount: text('bank_account'),
  itemBreakdown: jsonb('item_breakdown').$type<Array<{
    itemName: string
    store: string
    date: string
    amount: number
    share: number
  }>>(),
  settledAt: timestamp('settled_at'),
  settledBy: text('settled_by'), // 'creditor' | 'debtor'
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_payment_requests_split_id').on(t.splitId),
  index('idx_payment_requests_group_id').on(t.groupId),
])

// ── Price Comparisons ──────────────────────────────────────────────────────────
export const priceComparisons = pgTable('price_comparisons', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  productName: text('product_name').notNull(),
  normalizedName: text('normalized_name'), // for deduplication
  currentStore: text('current_store'), // where user last bought it
  currentPrice: decimal('current_price', { precision: 12, scale: 2 }),
  currentPurchaseDate: text('current_purchase_date'),
  // Best deal found
  bestStore: text('best_store'),
  bestPrice: decimal('best_price', { precision: 12, scale: 2 }),
  bestPriceSource: text('best_price_source'), // URL or description
  bestPriceValidUntil: text('best_price_valid_until'),
  // Savings
  savingsAmount: decimal('savings_amount', { precision: 12, scale: 2 }),
  savingsPercent: decimal('savings_percent', { precision: 5, scale: 2 }),
  currency: text('currency').notNull().default('PLN'),
  // AI raw response
  allPrices: jsonb('all_prices').$type<Array<{
    store: string
    price: number
    pricePerUnit?: string
    promotion?: string
    validUntil?: string
    source?: string
  }>>(),
  aiSummary: text('ai_summary'),
  checkedAt: timestamp('checked_at').defaultNow().notNull(),
}, (t) => [
  index('idx_price_comparisons_user_id').on(t.userId),
  index('idx_price_comparisons_user_checked').on(t.userId, t.checkedAt),
])

// ══════════════════════════════════════════════════════════════════════════════
// Merchant Auto-Categorization Rules
// ══════════════════════════════════════════════════════════════════════════════

export const merchantRules = pgTable('merchant_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  vendor: text('vendor').notNull(),
  categoryId: uuid('category_id').notNull(),
  count: integer('count').default(1),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  uniqueIndex('merchant_rules_user_vendor_idx').on(table.userId, table.vendor),
  index('merchant_rules_user_idx').on(table.userId),
])

// ══════════════════════════════════════════════════════════════════════════════
// PKO PSD2 Bank Integration
// ══════════════════════════════════════════════════════════════════════════════

export const bankConnections = pgTable('bank_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  provider: varchar('provider', { length: 50 }).default('pko').notNull(), // institution name (e.g., 'PKO Bank Polski')
  institutionId: text('institution_id'), // Nordigen institution ID (e.g., 'PKO_BPKOPLPW')
  requisitionId: text('requisition_id'), // Nordigen requisition ID
  accessToken: text('access_token'), // legacy PKO field, unused with Nordigen
  refreshToken: text('refresh_token'), // legacy PKO field, unused with Nordigen
  consentId: text('consent_id'), // Nordigen agreement ID
  consentExpiresAt: timestamp('consent_expires_at', { withTimezone: true }),
  accountIds: jsonb('account_ids').$type<string[]>(),
  status: varchar('status', { length: 20 }).default('pending').notNull(), // 'pending' | 'active' | 'expired' | 'revoked'
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_bank_connections_user_id').on(t.userId),
])

export const bankAccounts = pgTable('bank_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  connectionId: uuid('connection_id').notNull().references(() => bankConnections.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  accountNumber: text('account_number'),
  accountName: varchar('account_name', { length: 255 }),
  accountType: varchar('account_type', { length: 30 }), // 'personal' | 'business' | 'savings'
  currency: varchar('currency', { length: 3 }).default('PLN'),
  balance: decimal('balance', { precision: 14, scale: 2 }),
  balanceUpdatedAt: timestamp('balance_updated_at', { withTimezone: true }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_bank_accounts_user_id').on(t.userId),
  index('idx_bank_accounts_connection_id').on(t.connectionId),
])

export const bankTransactions = pgTable('bank_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => bankAccounts.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  externalId: text('external_id'),
  amount: decimal('amount', { precision: 14, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).default('PLN'),
  date: date('date').notNull(),
  bookingDate: date('booking_date'),
  description: text('description'),
  counterpartyName: text('counterparty_name'),
  counterpartyAccount: text('counterparty_account'),
  mccCode: varchar('mcc_code', { length: 10 }),
  transactionType: varchar('transaction_type', { length: 30 }),
  category: varchar('category', { length: 20 }), // 'debit' | 'credit'
  expenseId: uuid('expense_id'),
  suggestedCategoryId: uuid('suggested_category_id'),
  isMatched: boolean('is_matched').default(false).notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_bank_transactions_user_id').on(t.userId),
  index('idx_bank_transactions_date').on(t.date),
  index('idx_bank_transactions_account_id').on(t.accountId),
  index('idx_bank_transactions_user_date').on(t.userId, t.date),
])

// ══════════════════════════════════════════════════════════════════════════════
// Savings Goals & Budget Planning
// ══════════════════════════════════════════════════════════════════════════════

export const savingsGoals = pgTable('savings_goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  emoji: varchar('emoji', { length: 10 }).default('🎯'),
  targetAmount: decimal('target_amount', { precision: 14, scale: 2 }).notNull(),
  currentAmount: decimal('current_amount', { precision: 14, scale: 2 }).default('0').notNull(),
  currency: varchar('currency', { length: 3 }).default('PLN'),
  deadline: date('deadline'),
  priority: varchar('priority', { length: 10 }).default('medium'),
  color: varchar('color', { length: 7 }).default('#6366f1'),
  category: varchar('category', { length: 50 }),
  isCompleted: boolean('is_completed').default(false).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  aiTips: jsonb('ai_tips').$type<string[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_savings_goals_user_id').on(t.userId),
])

export const savingsDeposits = pgTable('savings_deposits', {
  id: uuid('id').primaryKey().defaultRandom(),
  goalId: uuid('goal_id').notNull().references(() => savingsGoals.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  amount: decimal('amount', { precision: 14, scale: 2 }).notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_savings_deposits_user_id').on(t.userId),
])

export const monthlyBudgets = pgTable('monthly_budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  month: varchar('month', { length: 7 }).notNull(),
  totalIncome: decimal('total_income', { precision: 14, scale: 2 }),
  totalBudget: decimal('total_budget', { precision: 14, scale: 2 }),
  savingsTarget: decimal('savings_target', { precision: 14, scale: 2 }),
  aiSummary: text('ai_summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_monthly_budgets_user_id').on(t.userId),
  index('idx_monthly_budgets_user_month').on(t.userId, t.month),
])

export const financialChallenges = pgTable('financial_challenges', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  emoji: varchar('emoji', { length: 10 }).default('💪'),
  type: varchar('type', { length: 20 }).notNull(),
  targetCategory: varchar('target_category', { length: 100 }),
  targetAmount: decimal('target_amount', { precision: 12, scale: 2 }),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  isCompleted: boolean('is_completed').default(false),
  currentProgress: decimal('current_progress', { precision: 12, scale: 2 }).default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_financial_challenges_user_id').on(t.userId),
])

// ══════════════════════════════════════════════════════════════════════════════
// Personal Features
// ══════════════════════════════════════════════════════════════════════════════

export const weeklySummaries = pgTable('weekly_summaries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  weekStart: date('week_start').notNull(),
  weekEnd: date('week_end').notNull(),
  totalSpent: decimal('total_spent', { precision: 12, scale: 2 }),
  comparedToAvg: decimal('compared_to_avg', { precision: 5, scale: 2 }),
  topCategory: varchar('top_category', { length: 255 }),
  savingsTips: jsonb('savings_tips').$type<Array<{
    product: string
    currentStore: string
    currentPrice: number
    alternativeStore: string
    alternativePrice: number
    saving: number
  }>>(),
  aiSummary: text('ai_summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_weekly_summaries_user_id').on(t.userId),
])

export const loyaltyCards = pgTable('loyalty_cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  store: varchar('store', { length: 50 }).notNull(), // 'biedronka' | 'lidl' | 'zabka' | 'kaufland' | 'aldi' | 'auchan' | 'carrefour'
  cardNumber: text('card_number'),
  memberName: varchar('member_name', { length: 255 }),
  isActive: boolean('is_active').default(true).notNull(),
  lastUsed: timestamp('last_used', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_loyalty_cards_user_id').on(t.userId),
])

// ══════════════════════════════════════════════════════════════════════════════
// Business Features
// ══════════════════════════════════════════════════════════════════════════════

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: text('owner_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  nip: varchar('nip', { length: 10 }),
  regon: varchar('regon', { length: 14 }),
  address: text('address'),
  city: varchar('city', { length: 100 }),
  postalCode: varchar('postal_code', { length: 10 }),
  country: varchar('country', { length: 2 }).default('PL'),
  vatPayer: boolean('vat_payer').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_companies_owner_id').on(t.ownerId),
])

export const companyMembers = pgTable('company_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  role: varchar('role', { length: 20 }).notNull(), // 'owner' | 'admin' | 'manager' | 'employee'
  displayName: varchar('display_name', { length: 255 }),
  email: varchar('email', { length: 255 }),
  departmentId: uuid('department_id'),
  spendingLimit: decimal('spending_limit', { precision: 12, scale: 2 }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_company_members_user_id').on(t.userId),
  index('idx_company_members_company_id').on(t.companyId),
])

export const departments = pgTable('departments', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  budget: decimal('budget', { precision: 12, scale: 2 }),
  budgetPeriod: varchar('budget_period', { length: 10 }).default('monthly'),
  color: varchar('color', { length: 7 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_departments_company_id').on(t.companyId),
])

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id'),
  userId: text('user_id').notNull(),
  invoiceNumber: varchar('invoice_number', { length: 100 }),
  vendorName: varchar('vendor_name', { length: 255 }),
  vendorNip: varchar('vendor_nip', { length: 10 }),
  buyerName: varchar('buyer_name', { length: 255 }),
  buyerNip: varchar('buyer_nip', { length: 10 }),
  issueDate: date('issue_date'),
  dueDate: date('due_date'),
  paymentDate: date('payment_date'),
  netAmount: decimal('net_amount', { precision: 14, scale: 2 }),
  vatAmount: decimal('vat_amount', { precision: 14, scale: 2 }),
  grossAmount: decimal('gross_amount', { precision: 14, scale: 2 }),
  vatRate: varchar('vat_rate', { length: 5 }),
  currency: varchar('currency', { length: 3 }).default('PLN'),
  deductibility: varchar('deductibility', { length: 5 }).default('kup'), // 'kup' | 'nkup'
  splitPayment: boolean('split_payment').default(false),
  paymentMethod: varchar('payment_method', { length: 20 }), // 'transfer' | 'cash' | 'card'
  imageUrl: text('image_url'),
  rawOcr: jsonb('raw_ocr'),
  items: jsonb('items').$type<Array<{
    name: string
    quantity: number
    unit: string
    unitPrice: number
    netAmount: number
    vatRate: string
    vatAmount: number
    grossAmount: number
  }>>(),
  status: varchar('status', { length: 20 }).default('pending'), // 'pending' | 'approved' | 'rejected' | 'paid'
  submittedBy: text('submitted_by'),
  approvedBy: text('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  expenseId: uuid('expense_id'),
  departmentId: uuid('department_id'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_invoices_user_id').on(t.userId),
  index('idx_invoices_user_issue_date').on(t.userId, t.issueDate),
])

export const expenseApprovals = pgTable('expense_approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id'),
  expenseId: uuid('expense_id').notNull().references(() => expenses.id, { onDelete: 'cascade' }),
  submittedBy: text('submitted_by').notNull(),
  reviewedBy: text('reviewed_by'),
  status: varchar('status', { length: 20 }).default('pending'), // 'pending' | 'approved' | 'rejected'
  notes: text('notes'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
}, (t) => [
  index('idx_expense_approvals_company_id').on(t.companyId),
])

export const vatEntries = pgTable('vat_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull(),
  userId: text('user_id').notNull(),
  invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
  type: varchar('type', { length: 10 }).notNull(), // 'input' | 'output' (naliczony / należny)
  period: varchar('period', { length: 7 }).notNull(), // 'YYYY-MM'
  netAmount: decimal('net_amount', { precision: 14, scale: 2 }).notNull(),
  vatAmount: decimal('vat_amount', { precision: 14, scale: 2 }).notNull(),
  vatRate: varchar('vat_rate', { length: 5 }).notNull(),
  counterpartyName: varchar('counterparty_name', { length: 255 }),
  counterpartyNip: varchar('counterparty_nip', { length: 10 }),
  documentNumber: varchar('document_number', { length: 100 }),
  documentDate: date('document_date'),
  deductible: boolean('deductible').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_vat_entries_user_id').on(t.userId),
  index('idx_vat_entries_company_id').on(t.companyId),
])
