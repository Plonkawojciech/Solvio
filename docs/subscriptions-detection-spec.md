# Solvio — Subscriptions auto-detection technical spec

**Last updated:** 2026-05-07 (round 3)
**Scope:** Subscription auto-detection from Solvio's `expenses` + `receipts` tables (no Plaid; uses GoCardless when bank txns flow in).
**Source of truth:** `docs/research-round3.md` § Sub-topic 1.

---

## Goal

Detect, for each authenticated user, the subscriptions they're paying for — so Solvio can:
1. Surface them in a unified `SubscriptionsView` (iOS).
2. Project annual cost.
3. Predict next charge date.
4. Alert before charge.
5. Deeplink to vendor cancel page (no concierge).
6. Auto-flag historic expenses as `isRecurring=true`.

**Not in scope:** auto-cancel via concierge service (legal complexity, KNF). Future R10+ work.

---

## API contract

### Request

```http
POST /api/personal/subscriptions/detect
  Authorization: cookie session (auth() wrapper)
  Body: optional { force?: boolean, windowDays?: number = 90 }

  - Idempotent. Can be re-run on demand.
  - Rate limit: 6/hr per user (generous because pattern matcher is cheap).
  - `force=true` skips the 7-day cache.
```

### Response

```ts
type SubscriptionCandidate = {
  // Stable canonical key used to dedupe across runs
  candidateKey: string  // e.g. sha256(`${userId}:${normalizedVendor}:${frequency}:${currency}`)
  
  // Human-facing
  vendor: string                  // normalized: "Netflix" not "NETFLIX.COM 8669..."
  vendorRaw: string                // last seen raw merchant string
  amount: string                   // decimal as string, like Drizzle convention
  currency: 'PLN' | 'EUR' | 'USD' | 'GBP' | string
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'bi-monthly' | 'quarterly' | 'annual'
  
  // Detection metadata
  predictedNextDate: string        // ISO date
  confidence: number               // 0.0 - 1.0
  status: 'mature' | 'early_detection' | 'inactive'
  source: 'expense' | 'receipt' | 'bank_txn' | 'mixed'
  firstSeenAt: string              // ISO date
  lastSeenAt: string               // ISO date
  occurrenceCount: number
  amountStdDev: number             // for UI to show "fixed" vs "variable"
  
  // Action layer
  cancelUrl?: string               // from curated vendor table; null if unknown
  category?: string                // mapped from receipts.categoryId via merchantRules
  isOnAllowlist: boolean
  
  // User actions (state)
  isConfirmed: boolean             // user explicitly confirmed
  isDismissed: boolean             // user explicitly dismissed
  snoozedUntil?: string            // ISO date
  trialEndsAt?: string             // computed: firstSeenAt + 27 days IF total < 1 PLN ("trial")
}

type DetectResponse = {
  generatedAt: string
  windowDays: number
  candidates: SubscriptionCandidate[]
  cached: boolean                   // true if returned from 7-day cache
  totalAnnualCost: { [currency: string]: number }
}
```

---

## Algorithm

### Stage 1: Data fetch

```sql
-- Pull rolling N-day window
SELECT id, vendor, amount, date, categoryId
  FROM expenses
  WHERE userId = $1 AND date >= NOW() - INTERVAL '$2 days'

UNION ALL

SELECT id, vendor, total AS amount, date, NULL AS categoryId
  FROM receipts
  WHERE userId = $1 AND date >= NOW() - INTERVAL '$2 days'

-- (Future: bank_transactions table when GoCardless flow ships)
```

### Stage 2: Vendor normalization

For each row, `vendorRaw → vendorNormalized`:

```ts
function normalizeVendor(raw: string): string {
  let v = raw.toLowerCase().trim()
  // Strip diacritics
  v = v.normalize('NFD').replace(/[̀-ͯ]/g, '')
  // Strip POS-batch tail (last 4 digits, often preceded by *)
  v = v.replace(/\*?\d{4,8}\s*$/, '')
  // Strip address suffixes (look for "ul.", "al.", numbers > 4 digits etc.)
  v = v.replace(/\b(ul|al|os|pl|sw)\.?\s+.*$/, '')
  v = v.replace(/\bsp\.?\s*z\.?\s*o\.?\s*o\.?\s*$/, '')
  // Collapse whitespace
  v = v.replace(/\s+/g, ' ').trim()
  // Apply user's merchantRules (R1/A4)
  const rule = lookupMerchantRule(userId, v)
  if (rule) return rule.canonical
  return v
}
```

### Stage 3: Group by normalized vendor

```ts
const groups: Map<string, Row[]> = new Map()
for (const row of rows) {
  const v = normalizeVendor(row.vendor)
  if (!groups.has(v)) groups.set(v, [])
  groups.get(v)!.push(row)
}

// Drop groups with <2 occurrences (lowest possible early_detection threshold)
for (const [v, group] of groups) {
  if (group.length < 2) groups.delete(v)
}
```

### Stage 4: Cadence detection

```ts
function detectCadence(group: Row[]): { frequency: Frequency, status: 'mature'|'early_detection' } | null {
  if (group.length < 2) return null
  const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date))
  const deltas: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    deltas.push(daysBetween(sorted[i-1].date, sorted[i].date))
  }
  const median = medianOf(deltas)
  const stdDev = standardDeviation(deltas)
  
  // Reject if stddev > 20% of median (too irregular)
  if (median > 0 && stdDev / median > 0.20) return null
  
  let frequency: Frequency
  if (median >= 6 && median <= 8) frequency = 'weekly'
  else if (median >= 12 && median <= 16) frequency = 'biweekly'
  else if (median >= 26 && median <= 33) frequency = 'monthly'
  else if (median >= 56 && median <= 64) frequency = 'bi-monthly'
  else if (median >= 86 && median <= 95) frequency = 'quarterly'
  else if (median >= 355 && median <= 380) frequency = 'annual'
  else return null
  
  return {
    frequency,
    status: group.length >= 3 ? 'mature' : 'early_detection',
  }
}
```

### Stage 5: Amount stability

```ts
function amountStability(group: Row[]): { stable: boolean, stdDev: number, median: number } {
  const amounts = group.map(r => parseFloat(r.amount))
  const median = medianOf(amounts)
  const stdDev = standardDeviation(amounts)
  if (median === 0) return { stable: false, stdDev, median }
  const cv = stdDev / median  // coefficient of variation
  return { stable: cv <= 0.10, stdDev, median }
}
```

### Stage 6: Allowlist / blocklist

```ts
const SUBSCRIPTION_ALLOWLIST = [
  // Streaming
  'netflix', 'spotify', 'disney+', 'disney plus', 'hbo max', 'prime video', 'amazon prime',
  'youtube premium', 'apple tv+', 'apple music', 'tidal', 'audible', 'storytel', 'audioteka',
  'player+', 'canal+', 'polsat box go', 'tvn24 go', 'wp pilot',
  // Productivity / SaaS
  'github', 'adobe', 'microsoft 365', 'office 365', 'google one', 'apple icloud',
  'chatgpt', 'openai', 'anthropic', 'claude.ai', 'notion', 'figma', 'linear',
  // Gaming
  'playstation', 'xbox', 'nintendo', 'steam',
  // Polish-specific
  'allegro smart', 'inpost paczkomat', 'rtv abonament', 'opłata abonamentowa',
  'orange', 'play', 't-mobile', 'plus', 'netia',
  'pge', 'tauron', 'enea', 'energa', 'innogy',
  'multisport', 'medicover', 'enelmed', 'lux med',
  'patreon', 'substack', 'onet premium', 'wyborcza prenumerata',
  // Subscription-y verbs
  'subscription', 'subskrypcja', 'abonament', 'prenumerata', 'membership',
]

const NON_SUBSCRIPTION_BLOCKLIST = [
  // Groceries (handled by Plaid same way)
  'biedronka', 'lidl', 'auchan', 'carrefour', 'zabka', 'kaufland', 'tesco',
  'dino', 'aldi', 'leclerc', 'netto', 'piotr i pawel',
  // Gas
  'orlen', 'bp', 'shell', 'lotos', 'circle k',
  // Restaurants / Cafés  
  'mcdonald', 'kfc', 'burger king', 'starbucks', 'costa coffee',
  // Common one-off retail
  'rossmann', 'hebe', 'super-pharm', 'apteka',
]

function isAllowlisted(vendor: string): boolean {
  return SUBSCRIPTION_ALLOWLIST.some(a => vendor.includes(a))
}

function isBlocklisted(vendor: string): boolean {
  return NON_SUBSCRIPTION_BLOCKLIST.some(b => vendor.includes(b))
}
```

### Stage 7: Confidence scoring + final assembly

```ts
function scoreCandidate(group: Row[], vendor: string,
  cadence: ReturnType<typeof detectCadence>,
  stability: ReturnType<typeof amountStability>,
): number {
  if (isBlocklisted(vendor)) return 0
  if (!cadence) return 0
  
  let score = 0.5  // baseline
  
  if (group.length >= 3) score += 0.1
  if (group.length >= 6) score += 0.1
  if (stability.stable) score += 0.15
  if (cadence.frequency === 'monthly' || cadence.frequency === 'annual') score += 0.05
  if (isAllowlisted(vendor)) score = Math.max(score, 0.95)
  
  return Math.min(1.0, score)
}
```

### Stage 8: Filter + return

```ts
const candidates: SubscriptionCandidate[] = []
for (const [vendor, group] of groups) {
  const cadence = detectCadence(group)
  if (!cadence) continue
  const stability = amountStability(group)
  const confidence = scoreCandidate(group, vendor, cadence, stability)
  if (confidence < 0.5) continue
  
  // Check user's negative list (subscription_dismissals)
  const isDismissed = await isInNegativeList(userId, vendor)
  if (isDismissed) continue  // (or include with isDismissed=true; UX choice)
  
  candidates.push(buildCandidate(vendor, group, cadence, stability, confidence))
}
```

---

## Storage

### New table: `subscription_candidates` (cache)

```sql
CREATE TABLE subscription_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  userId text NOT NULL,
  candidateKey text NOT NULL,
  snapshot jsonb NOT NULL,
  detectedAt timestamp NOT NULL DEFAULT now(),
  createdAt timestamp NOT NULL DEFAULT now(),
  UNIQUE(userId, candidateKey)
);
CREATE INDEX idx_subscription_candidates_user ON subscription_candidates(userId);
```

TTL: 7 days (re-run regenerates).

### New table: `subscription_dismissals` (negative list)

```sql
CREATE TABLE subscription_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  userId text NOT NULL,
  vendorNormalized text NOT NULL,
  dismissedAt timestamp NOT NULL DEFAULT now(),
  UNIQUE(userId, vendorNormalized)
);
CREATE INDEX idx_subscription_dismissals_user ON subscription_dismissals(userId);
```

### Existing column: `expenses.isRecurring` (R0)

When user **confirms** a candidate, write back:
```sql
UPDATE expenses
SET isRecurring = true,
    recurringMetadata = jsonb_build_object(
      'frequency', $1,
      'predictedNextDate', $2,
      'detectedAt', now()
    )
WHERE userId = $3 AND vendor ILIKE $4 AND date >= $5
```

(Adds new column `expenses.recurringMetadata jsonb NULL` — backwards compatible.)

---

## API endpoints

### `POST /api/personal/subscriptions/detect`
Runs the algorithm. Returns `DetectResponse`.

### `GET /api/personal/subscriptions`
Returns last cached `DetectResponse` from `subscription_candidates` table without running algorithm.

### `POST /api/personal/subscriptions/[candidateKey]/confirm`
Marks candidate as user-confirmed. Writes back to `expenses.isRecurring`.

### `POST /api/personal/subscriptions/[candidateKey]/dismiss`
Adds vendor to `subscription_dismissals`. Detection won't surface this vendor again.

### `POST /api/personal/subscriptions/[candidateKey]/snooze`
Body: `{ days: number }`. Hides candidate for N days.

---

## iOS UX (`SubscriptionsView.swift`)

```
Tab: Subscriptions

[List]
  Section: "Active subscriptions" (mature, confidence ≥ 0.7)
    [Row] Netflix • Monthly • 49 PLN • Next: May 15
       Swipe-left actions: Dismiss / Snooze 30d
       Tap: detail view with cancel deeplink
  
  Section: "Possible subscriptions" (early_detection OR confidence 0.5-0.7)
    [Row] Patreon • Monthly • 25 PLN • Need 1 more occurrence
       Action: Confirm / Dismiss
  
  Section: "Annual cost projection"
    Total: 1,234 PLN/year
    Breakdown: Streaming 588 / Productivity 240 / Telco 360
  
  Toolbar: [Refresh] (calls detect endpoint)
```

---

## Cost model

For 10k MAU, ~6 subs/user → 60k candidates/run. Algorithm runs in:
- Postgres: ~3 SELECTs, well-indexed, ~50ms
- Node pattern matcher: ~10ms per user
- LLM tiebreaker (only on confidence 0.5-0.65, ~5% of candidates): ~3,000 calls/month × $0.00015 = **~$0.45/month**

vs. Plaid Recurring Transactions: $$$  + US/CA/UK only (not PL!).

**Solvio ships this in pure SQL+Node. Zero recurring API cost.**

---

## Test cases

```ts
describe('detectCadence', () => {
  it('detects monthly Netflix at 30-day intervals', () => {
    const group = [
      { date: '2026-01-15', amount: '49.00', vendor: 'NETFLIX.COM' },
      { date: '2026-02-15', amount: '49.00', vendor: 'NETFLIX.COM' },
      { date: '2026-03-15', amount: '49.00', vendor: 'NETFLIX.COM' },
    ]
    expect(detectCadence(group)?.frequency).toBe('monthly')
    expect(detectCadence(group)?.status).toBe('mature')
  })
  
  it('rejects irregular grocery shopping', () => {
    const group = [
      { date: '2026-01-15', amount: '156.42', vendor: 'BIEDRONKA' },
      { date: '2026-01-22', amount: '203.18', vendor: 'BIEDRONKA' },
      { date: '2026-02-09', amount: '89.55', vendor: 'BIEDRONKA' },
      { date: '2026-02-13', amount: '247.30', vendor: 'BIEDRONKA' },
    ]
    expect(detectCadence(group)).toBeNull()  // stddev/median > 0.20
  })
  
  it('flags as early_detection when only 2 occurrences', () => {
    const group = [
      { date: '2026-01-15', amount: '49.00', vendor: 'NETFLIX.COM' },
      { date: '2026-02-15', amount: '49.00', vendor: 'NETFLIX.COM' },
    ]
    expect(detectCadence(group)?.status).toBe('early_detection')
  })
})

describe('isBlocklisted', () => {
  it('blocks groceries', () => {
    expect(isBlocklisted('biedronka warszawa')).toBe(true)
    expect(isBlocklisted('lidl polska sp z oo')).toBe(true)
    expect(isBlocklisted('netflix')).toBe(false)
  })
})

describe('amountStability', () => {
  it('marks fixed Netflix as stable', () => {
    const group = [{ amount: '49.00' }, { amount: '49.00' }, { amount: '49.00' }]
    expect(amountStability(group as any).stable).toBe(true)
  })
  it('marks variable utility as stable_with_jitter (cv < 0.10)', () => {
    const group = [{ amount: '120.00' }, { amount: '125.00' }, { amount: '128.00' }]
    expect(amountStability(group as any).stable).toBe(true)
  })
  it('rejects highly variable shopping', () => {
    const group = [{ amount: '50' }, { amount: '200' }, { amount: '500' }]
    expect(amountStability(group as any).stable).toBe(false)
  })
})
```

---

## Phasing

- **R4 (next round):** Stages 1-7 in TypeScript, no LLM tiebreaker. Ship `POST /api/personal/subscriptions/detect`. Migration for `subscription_candidates` + `subscription_dismissals`. Add `expenses.recurringMetadata` column.
- **R5:** iOS `SubscriptionsView` (A3 territory).
- **R6+:** LLM tiebreaker for ambiguous (0.5-0.65 confidence) candidates. Vendor cancel-URL table (~50 vendors curated). Trial-end alerts.

---

## References

- [Plaid — Recurring Transactions blog](https://plaid.com/blog/recurring-transactions/)
- [Plaid Recurring Transactions API docs](https://plaid.com/docs/api/products/transactions/) (May 2026)
- [Subaio — Detection algorithm explanation](https://subaio.com/subaio-explained/how-does-subaio-detect-recurring-payments)
- [Anodot — AI Monitor Subscription Payment Model](https://www.anodot.com/blog/ai-monitor-subscription-payment-model/)
- Round 3 research doc: `docs/research-round3.md` § Sub-topic 1

---

**Owner:** Spec by A5; backend impl by A1 or A2; iOS impl by A3. Backlog items R3-1 through R3-4.
