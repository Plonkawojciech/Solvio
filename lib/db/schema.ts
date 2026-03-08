import { pgTable, uuid, text, decimal, date, timestamp, boolean, jsonb, varchar, unique } from 'drizzle-orm/pg-core'

export const userSettings = pgTable('user_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').unique().notNull(),
  currency: varchar('currency', { length: 3 }).default('PLN').notNull(),
  language: varchar('language', { length: 2 }).default('pl').notNull(),
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
})

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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

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
})

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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const categoryBudgets = pgTable('category_budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  categoryId: uuid('category_id').notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  period: varchar('period', { length: 10 }).default('monthly').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [unique().on(t.userId, t.categoryId, t.period)])

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
})

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
})

// ── Groups ────────────────────────────────────────────────────────────────────
export const groups = pgTable('groups', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  description: text('description'),
  createdBy: text('created_by').notNull(),
  currency: text('currency').notNull().default('PLN'),
  emoji: text('emoji').default('👥'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Group Members ──────────────────────────────────────────────────────────────
export const groupMembers = pgTable('group_members', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  groupId: text('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  userId: text('user_id'), // null for external (non-app) members
  displayName: text('display_name').notNull(),
  email: text('email'),
  color: text('color').default('#6366f1'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

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
})

// ── Payment Requests ───────────────────────────────────────────────────────────
export const paymentRequests = pgTable('payment_requests', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  splitId: text('split_id').notNull().references(() => expenseSplits.id, { onDelete: 'cascade' }),
  fromMemberId: text('from_member_id').notNull().references(() => groupMembers.id),
  toMemberId: text('to_member_id').notNull().references(() => groupMembers.id),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('PLN'),
  status: text('status').notNull().default('pending'), // 'pending' | 'settled' | 'declined'
  note: text('note'),
  settledAt: timestamp('settled_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

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
})
