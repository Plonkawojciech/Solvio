# Solvio — GDPR/RODO Export & Account Deletion + Apple Privacy Manifest

**Date:** 2026-05-07 / 2026-05-08 (R4 quick win)
**Source:** `docs/research-round4.md` §3 (backup, export, account deletion, Privacy Manifest)
**Audience:** future backend + iOS agents shipping privacy compliance

---

## TL;DR

1. **Apple Privacy Manifest (`PrivacyInfo.xcprivacy`) is mandatory since May 1, 2024.** Solvio's iOS bundle currently does not have one. Submission without it = `ITMS-91053` rejection. Template in §4 of this doc.
2. **In-app account deletion is mandatory.** Apple required since June 30, 2022. Solvio needs `POST /api/personal/account/delete` + 24h grace + cron-driven hard delete + financial records anonymization.
3. **Data export must be machine-readable.** Solvio's current JSON-only export complies with GDPR Art. 20 but should bundle JSON + CSV + PDF in a ZIP for best-in-class compliance.
4. **Polish accounting law conflicts with hard delete.** Tax records must be retained 5 years from end of tax year. Resolution: anonymize (replace `userId`, drop email/IP/device IDs) instead of hard-delete.
5. **Privacy notice must be in Polish.** RODO requires consumer notices in Polish; Solvio needs a `/polityka-prywatnosci` page that lists administrator (Programo s.c.), legal basis (Art. 6(1)(b/c/f) RODO), retention periods, recipients, and contact.

---

## Part 1: Apple Privacy Manifest template

Save as `native-ios/Solvio/PrivacyInfo.xcprivacy` and add to Solvio target's Copy Bundle Resources.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- Solvio does not track users across other apps/sites -->
    <key>NSPrivacyTracking</key>
    <false/>
    <key>NSPrivacyTrackingDomains</key>
    <array/>

    <!-- Data types Solvio collects -->
    <key>NSPrivacyCollectedDataTypes</key>
    <array>
        <!-- Email — for account login -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeEmailAddress</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
        <!-- Purchase history — receipts and expenses -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypePurchaseHistory</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
                <string>NSPrivacyCollectedDataTypePurposeAnalytics</string>
            </array>
        </dict>
        <!-- Other financial info — group splits, settlements -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeOtherFinancialInfo</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
        <!-- Photos — receipt scans -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypePhotosorVideos</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
        <!-- Device ID — for session/auth (sha256 of email) -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeDeviceID</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
    </array>

    <!-- Required Reason API declarations -->
    <key>NSPrivacyAccessedAPITypes</key>
    <array>
        <!-- @AppStorage uses UserDefaults under the hood -->
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>CA92.1</string>  <!-- Reading/writing data exclusive to the app -->
            </array>
        </dict>
        <!-- File timestamps for cache freshness checks -->
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>C617.1</string>  <!-- Files within app container -->
                <string>3B52.1</string>  <!-- Display to user -->
            </array>
        </dict>
        <!-- Disk space check before downloading reports -->
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryDiskSpace</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>E174.1</string>  <!-- Check destination has enough space -->
                <string>85F4.1</string>  <!-- Write check -->
            </array>
        </dict>
        <!-- System boot time for performance metrics -->
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategorySystemBootTime</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>35F9.1</string>  <!-- Calculate time intervals -->
            </array>
        </dict>
    </array>
</dict>
</plist>
```

**Reason code reference:**
- `CA92.1` (UserDefaults): app-exclusive read/write.
- `C617.1` (FileTimestamp): files within app container, app group, or CloudKit container.
- `3B52.1` (FileTimestamp): display timestamp to the user.
- `35F9.1` (SystemBootTime): calculate time intervals between events.
- `E174.1` (DiskSpace): check space at destination before write.
- `85F4.1` (DiskSpace): check before write to avoid out-of-space errors.

**Validation:**
- Xcode 15+: Product → Archive → Distribute → Generate Privacy Report. Verify all collected types appear.
- App Store submission: if missing, you get `ITMS-91053`.

**When to update:** any new data category collected (e.g., adding voice notes → `NSPrivacyCollectedDataTypeAudioData`), or any new SDK that calls Required Reason APIs.

---

## Part 2: Account deletion flow

### Frontend — iOS Settings → Account → Delete account

```
┌─ Step 1: What will happen ─────────────────┐
│ Permanently deleted:                       │
│ • All expenses, receipts, groups, reports  │
│ • Subscription auto-renew cancelled        │
│   (open App Store subs)                    │
│                                            │
│ Retained for legal compliance:             │
│ • Anonymized financial records (5 years)   │
│   per Polish accounting law                │
│ • Audit log entry (90 days)                │
│                                            │
│ Timing:                                    │
│ • Personal data: instant                   │
│ • Backup purge: 30 days                    │
│ • 24h grace period to undo                 │
│                                            │
│ [Cancel]  [Continue]                       │
└────────────────────────────────────────────┘
                 ↓
┌─ Step 2: Re-authentication ────────────────┐
│ Send 6-digit code to your email            │
│                                            │
│ Code: [______]                             │
│                                            │
│ [Cancel]  [Verify]                         │
└────────────────────────────────────────────┘
                 ↓
┌─ Step 3: Final confirmation ───────────────┐
│ Type "USUŃ KONTO" / "DELETE ACCOUNT"       │
│ to confirm:                                │
│                                            │
│ [_________________________]                │
│                                            │
│ Reason (optional):                         │
│ [_________________________]                │
│                                            │
│ [Cancel]  [Permanently Delete]             │
└────────────────────────────────────────────┘
                 ↓
┌─ Step 4: Done ─────────────────────────────┐
│ ✓ Twoje konto zostanie usunięte w ciągu 24h│
│ ✓ Otrzymasz email z potwierdzeniem         │
│                                            │
│ [OK — sign out]                            │
└────────────────────────────────────────────┘
```

### Backend — `POST /api/personal/account/delete`

```typescript
// app/api/personal/account/delete/route.ts (NEW)
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import { userSettings, auditLog } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const deleteSchema = z.object({
  verificationCode: z.string().length(6),
  reason: z.string().max(1000).optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session.userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = deleteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  // Verify the email code (existing email-code infrastructure)
  const codeValid = await verifyEmailCode(session.userId, parsed.data.verificationCode)
  if (!codeValid) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 403 })
  }

  // Schedule deletion in 24h
  const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

  await db.batch([
    db
      .update(userSettings)
      .set({ deletionScheduledAt: scheduledAt, deletionReason: parsed.data.reason })
      .where(eq(userSettings.userId, session.userId)),
    db.insert(auditLog).values({
      userId: session.userId,
      action: 'account_deletion_initiated',
      metadata: { scheduledAt, reason: parsed.data.reason },
    }),
  ])

  // Send confirmation email with 24h undo link
  await sendDeletionScheduledEmail(session.userId, scheduledAt)

  return NextResponse.json({ success: true, scheduledAt })
}
```

### Cron — `app/api/cron/account-deletion-process/route.ts`

```typescript
// Runs hourly. Processes any userSettings.deletionScheduledAt < now()
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  userSettings, categories, groups, paymentRequests, bankConnections,
  bankAccounts, priceComparisons, goals, reports, expenses, receipts,
  expenseSplits, auditLog,
} from '@/lib/db/schema'
import { and, eq, isNotNull, lte } from 'drizzle-orm'

export async function GET(req: Request) {
  // Auth via Vercel cron secret
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const due = await db
    .select()
    .from(userSettings)
    .where(
      and(
        isNotNull(userSettings.deletionScheduledAt),
        lte(userSettings.deletionScheduledAt, new Date())
      )
    )

  for (const u of due) {
    const userId = u.userId

    // 1. Hard-delete personal-only data
    await db.batch([
      db.delete(categories).where(eq(categories.userId, userId)),
      db.delete(groups).where(eq(groups.createdBy, userId)),  // groups where user is sole creator
      db.delete(bankConnections).where(eq(bankConnections.userId, userId)),
      db.delete(bankAccounts).where(eq(bankAccounts.userId, userId)),
      db.delete(priceComparisons).where(eq(priceComparisons.userId, userId)),
      db.delete(goals).where(eq(goals.userId, userId)),
      db.delete(reports).where(eq(reports.userId, userId)),
    ])

    // 2. Anonymize financial records (5y retention per Polish tax law)
    const anonId = `anon_${crypto.randomUUID()}`
    await db.batch([
      db.update(expenses).set({ userId: anonId }).where(eq(expenses.userId, userId)),
      db.update(receipts).set({ userId: anonId }).where(eq(receipts.userId, userId)),
      db.update(expenseSplits).set({ userId: anonId }).where(eq(expenseSplits.userId, userId)),
      db.update(paymentRequests).set({ fromUserId: anonId }).where(eq(paymentRequests.fromUserId, userId)),
      db.update(paymentRequests).set({ toUserId: anonId }).where(eq(paymentRequests.toUserId, userId)),
    ])

    // 3. Final audit log entry, then delete userSettings
    await db.insert(auditLog).values({
      userId: anonId,  // anonymized so log has no PII
      action: 'account_deletion_completed',
      metadata: { deletedAt: new Date() },
    })
    await db.delete(userSettings).where(eq(userSettings.userId, userId))

    // 4. Send confirmation email — last shot before email is gone
    await sendDeletionCompletedEmail(u.email)
  }

  return NextResponse.json({ processed: due.length })
}
```

**Wire to Vercel cron in `vercel.json`:**
```json
{
  "crons": [
    {
      "path": "/api/cron/account-deletion-process",
      "schedule": "0 * * * *"
    }
  ]
}
```

---

## Part 3: Data export — JSON + CSV + PDF ZIP bundle

### Endpoint expansion — `/api/personal/export-data`

Currently returns JSON. Expand to bundle all 3 formats:

```typescript
// Updated app/api/personal/export-data/route.ts
import { put } from '@vercel/blob'
import JSZip from 'jszip'
import { buildJsonExport, buildCsvBundle, buildPdfSummary } from '@/lib/exports'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session.userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const userId = session.userId

  // Build the three formats in parallel
  const [json, csv, pdf] = await Promise.all([
    buildJsonExport(userId),    // existing
    buildCsvBundle(userId),     // NEW — one CSV per table
    buildPdfSummary(userId),    // NEW — human-readable summary
  ])

  // Bundle into ZIP
  const zip = new JSZip()
  zip.file('solvio-export.json', JSON.stringify(json, null, 2))
  for (const [name, content] of Object.entries(csv)) {
    zip.file(`csv/${name}.csv`, content)
  }
  zip.file('solvio-summary.pdf', pdf)
  zip.file('README.txt', readmeText())  // explains formats and Polish tax law retention

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

  // Upload to Vercel Blob with 24h expiry
  const blob = await put(
    `exports/${userId}/${Date.now()}.zip`,
    zipBuffer,
    { access: 'public', contentType: 'application/zip', addRandomSuffix: true }
  )

  // Audit log entry
  await db.insert(auditLog).values({
    userId,
    action: 'data_export',
    metadata: {
      sizeBytes: zipBuffer.byteLength,
      formats: ['json', 'csv', 'pdf'],
      blobUrl: blob.url,
    },
  })

  // For large exports, send email with link instead of inline response
  if (zipBuffer.byteLength > 5 * 1024 * 1024) {
    await sendExportReadyEmail(userId, blob.url)
    return NextResponse.json({ status: 'email_sent', sizeBytes: zipBuffer.byteLength })
  }

  return NextResponse.json({ status: 'ready', url: blob.url, sizeBytes: zipBuffer.byteLength })
}
```

### CSV bundle structure

One CSV per table:
- `expenses.csv` — id, date, vendor, category, amount, currency, notes, tags, createdAt
- `receipts.csv` — id, vendor, date, total, currency, imageUrl, status, createdAt
- `receipt_items.csv` — receiptId, name, quantity, unitPrice, totalPrice, categoryId
- `categories.csv` — id, name, color, icon, isDefault
- `category_budgets.csv` — categoryId, amount, period, currency
- `groups.csv` — id, name, currency, emoji, createdAt
- `group_members.csv` — groupId, displayName, email, color, joinedAt
- `expense_splits.csv` — expenseId, groupId, paidByMemberId, totalAmount, splits (JSON-in-cell)
- `payment_requests.csv` — splitId, fromMemberId, toMemberId, amount, status, settledAt
- `goals.csv` — id, name, targetAmount, currentAmount, deadline, completedAt
- `audit_log.csv` — last 90 days, anonymized to action+timestamp only (no metadata jsonb to avoid leaking sensitive context)

### PDF summary structure

Cover page with:
- Title: "Solvio — Twoje dane / Your Data"
- Generation date.
- User email (since they're authenticated, this is their own data).
- Date range covered.
- Polish tax law retention notice.
- Total expense count, receipts count, groups count.
- Top 5 categories by total spend.

Then summary tables:
- Monthly spend last 12 months.
- Category breakdown.
- Goals status.

(NOT every expense — that's what the CSV is for. PDF is the human-readable summary.)

### README.txt content

```
Solvio Export — Twoje dane / Your Data

Generated: <timestamp>
User: <email>

CONTENTS / ZAWARTOŚĆ:
- solvio-export.json — Pełna kopia danych w formacie JSON (machine-readable)
- csv/*.csv — Tabele danych w formacie CSV (Excel-friendly)
- solvio-summary.pdf — Podsumowanie czytelne dla człowieka

GDPR / RODO:
Ten plik to realizacja Twoich praw z RODO Art. 15 (dostęp do danych)
i Art. 20 (przenoszalność danych). Format JSON i CSV są
"strukturyzowane, powszechnie używane i nadające się do odczytu maszynowego"
zgodnie z RODO Art. 20.

POLISH ACCOUNTING LAW:
Niektóre dane finansowe (paragony, faktury, transakcje) muszą być
przechowywane przez Solvio przez 5 lat od końca roku podatkowego
zgodnie z polską ustawą o rachunkowości. Po usunięciu konta
te dane zostają zanonimizowane (zastąpienie userId, usunięcie email/IP)
ale pozostają w bazie do wymaganego okresu retencji.

QUESTIONS:
hello@solvio.app
```

---

## Part 4: Polish privacy notice (`/polityka-prywatnosci`)

Required content per RODO + Polish consumer-protection law:

1. **Administrator danych osobowych:**
   - Programo s.c.
   - NIP: [TODO — fill in from Programo s.c. registration]
   - REGON: [TODO]
   - Adres: [TODO]
   - Kontakt: kontakt@programo.pl

2. **Cele przetwarzania danych osobowych:**
   - Założenie i prowadzenie konta użytkownika.
   - Skanowanie paragonów (OCR przez Azure Document Intelligence).
   - Generowanie raportów finansowych.
   - Współdzielenie wydatków w grupach.
   - Wykrywanie subskrypcji i przypomnień o cyklicznych płatnościach.
   - (Opcjonalnie) Synchronizacja z bankiem przez GoCardless Bank Account Data.

3. **Podstawa prawna:**
   - Art. 6 ust. 1 lit. b RODO — wykonanie umowy o świadczenie usług.
   - Art. 6 ust. 1 lit. c RODO — obowiązek prawny (dla danych podlegających ustawie o rachunkowości).
   - Art. 6 ust. 1 lit. f RODO — prawnie uzasadniony interes administratora (audit log dla bezpieczeństwa).

4. **Okres przechowywania:**
   - Konto + dane osobowe (email, ustawienia): do usunięcia konta + 30 dni rezerwy backupów.
   - Paragony, faktury, wydatki: 5 lat od końca roku podatkowego (zgodnie z polską ustawą o rachunkowości).
   - Audit log: 90 dni (R3 GC cron).
   - Dane osobowe po anonimizacji: nieograniczone (już nie są danymi osobowymi).

5. **Odbiorcy danych:**
   - Vercel Inc. — hosting (USA, Standard Contractual Clauses).
   - Neon — bazy danych (eu-central-1, Frankfurt).
   - Microsoft — Azure OpenAI + Azure Document Intelligence (eu-central, Standard Contractual Clauses).
   - Vercel Blob — przechowywanie plików (raporty, paragony).
   - GoCardless Ltd. — integracja z bankiem (UK, post-Brexit DPA).

6. **Prawa osoby, której dane dotyczą:**
   - Prawo dostępu (Art. 15 RODO).
   - Prawo sprostowania (Art. 16).
   - Prawo usunięcia (Art. 17, "prawo do bycia zapomnianym").
   - Prawo ograniczenia przetwarzania (Art. 18).
   - Prawo przenoszenia danych (Art. 20).
   - Prawo sprzeciwu (Art. 21).
   - Prawo do skargi do PUODO (https://uodo.gov.pl).

7. **Cookies i analityka:**
   - Solvio nie używa cookies trackingowych.
   - Sesja użytkownika: cookie `solvio_session` (HMAC-signed, HttpOnly, Secure, SameSite=Lax).

8. **Profilowanie:**
   - Solvio używa AI (Azure OpenAI) do analizy wydatków i wykrywania subskrypcji.
   - Wynik AI jest sugestywny, nie podejmuje wiążących decyzji prawnych ani finansowych.
   - Użytkownik może wyłączyć funkcje AI w ustawieniach (przyszłość).

9. **Kontakt w sprawach RODO:**
   - rodo@solvio.app (lub kontakt@programo.pl).

10. **Data wejścia w życie:** [TODO]

**This template lives in `/app/(marketing)/polityka-prywatnosci/page.tsx`** as a static page. English version at `/privacy-policy`. Both linked from footer.

---

## Implementation order

**R5 (immediate):**
1. PrivacyInfo.xcprivacy file (S — 30 min) — gates next App Store submission.
2. `audit_log` entries on existing export route (S — 30 min) — compliance evidence.
3. Polish privacy policy page from this template (S — 2 hours of writing) — RODO bar.

**R6 (next):**
4. Account deletion flow (M — 2-3 days) — Apple App Store mandatory.
5. Export ZIP bundle (M — 1-2 days) — GDPR Art. 20 grade.
6. Email confirmation infrastructure (S — 1 day) — UX completion.

**R7 (later):**
7. CSV bundle builder (M — 1 day) — depends on schema stability.
8. PDF summary builder (M — 2 days) — depends on design.

---

## References

- See `docs/research-round4.md` §3 for full sourced research.
- All citations checked May 2026.
