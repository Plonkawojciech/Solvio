# Solvio deep audit and optimization plan

Date: 2026-05-11
Scope: repository `/Users/wojciechplonka/Programo/solvio`, local branch `main`, web app, API, iOS app, current uncommitted docs.

## Verification snapshot

- Git state: `main...origin/main [ahead 2]`, not clean.
- Uncommitted files: `.production-hardening-loop.md`, `progress.md`.
- Uncommitted change content: documentation/status only. No application code changes are currently unstaged.
- Local commits ahead of origin:
  - `bfc3f3a feat: harden solvio web and native apps`
  - `cec3372 chore: remove tracked build artifacts`
- Verified commands:
  - `npm test` -> 8 test files, 130 tests passed.
  - `npm run lint` -> passed.
  - `npm run build` -> passed.
  - `xcodebuild -project native-ios/Solvio.xcodeproj -scheme Solvio -configuration Debug -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO` -> build succeeded.
- Runtime smoke test on local dev server `localhost:3017`:
  - Main web pages returned HTTP 200 after demo login.
  - Warm API timings were mostly 20-200 ms in dev after first hit.
  - Cold/warming API timings were 1-3 s for several routes, so production P95/P99 instrumentation is still needed.
  - Runtime warning observed: `rate-limit` fell back from persistent DB limiter to in-memory limiter because the `rate_limit_buckets` query failed. Treat `npm run db:push` / migration `drizzle/0004_rate_limit_buckets.sql` as a deployment blocker before relying on cross-instance throttling.

## High-level diagnosis

Solvio is functional and currently builds cleanly, but the frontend is too page-heavy and client-heavy. Many screens are 400-1900 line client components that fetch after mount, reimplement loading/error/empty states, and do large client-side derivations. The backend has improved batching and caching in key places, but several endpoints still need query consolidation, pagination, typed response contracts, shared error envelopes, observability, and production performance budgets. The iOS app is more mature in data caching than web because `AppDataStore` provides stale-while-revalidate and cache invalidation, but the scan/receipt flows still need UX polish, progress diagnostics, and recovery cases.

## Cross-cutting priorities

1. Add production observability: per-route latency, DB query count, cache state, AI/OCR duration, payload size, and error code.
2. Add Lighthouse CI and Playwright E2E smoke tests for all primary routes with seeded demo data.
3. Add API response schemas shared between web and iOS, ideally `zod` on server and generated TypeScript types.
4. Split large pages into feature modules and view-model hooks. Start with `expenses`, `analysis`, `savings`, `groups/[id]`, `dashboard`, `bank`, `invoices`.
5. Move repeated client fetch bundles into typed route hooks or server components where possible.
6. Add URL-backed filters and pagination to list-heavy screens.
7. Standardize loading, empty, error, retry, stale-cache, and partial-data states.
8. Introduce user-facing cache freshness labels for AI/current-data features: promotions, audit, prices, shopping advisor.
9. Make AI/web-search routes return provenance, confidence, and source health.
10. Add data-quality dashboards for OCR, merchant normalization, category assignment, promotion matching, and duplicate detection.

## Risks and deferred work found in repo

- A3 iOS polish was explicitly lost to 401 and deferred: `VirtualReceiptCreateView`, `IncomesView`, `MainTabView`, `RootView`.
- Lighthouse CI is still deferred.
- More batching remains for `/api/personal/{financial-health,shopping-advisor,promotions,subscriptions,budget}`.
- `bankConnections` orphan GC cron remains deferred.
- `CRON_SECRET`, DB migrations, and `CSRF_ENFORCE=1` rollout are operational requirements.
- Persistent rate limiting is not effective until `rate_limit_buckets` exists in the target DB; local smoke test showed memory fallback.
- Next.js root warning must be fixed: a parent `/Users/wojciechplonka/package-lock.json` causes workspace-root inference ambiguity.
- `GET /api/data/categories` returns 405. That may be intentional, but the API naming suggests a readable data route and should be clarified.

## OCR and receipt scanning plan

1. Add structured OCR result confidence per field: vendor, total, date, currency, line items.
2. Store OCR provenance per field: Azure field, raw text fallback, store-pattern fallback, AI fallback.
3. Add receipt quality checks before upload: blur, crop confidence, brightness, thermal-paper contrast.
4. Add client-side image compression metrics to iOS and web scan flows.
5. Add an explicit “review required” state when totals do not match line-item sum.
6. Add merchant normalization audit table for raw merchant -> canonical merchant -> confidence.
7. Add duplicate explanation in UI: same vendor/date/amount/image hash.
8. Add retry queue to web scan flow similar to iOS `ScanQueueManager`.
9. Add batch scan on web and progress chip parity with iOS.
10. Add OCR provider fallback plan: Azure primary, AI text parser fallback, manual confirmation.
11. Add receipt fixture tests for Polish chains: Biedronka, Lidl, Kaufland, Żabka, Rossmann, Carrefour.
12. Add “bad scan recovery” UX: recrop, rotate, reupload, edit vendor, edit total, assign missing lines.

## Promotions and live deals plan

1. Show cache state in UI: fresh, stale, global, estimate, live web search.
2. Never show “scanning stores” when serving cache instantly; use “last updated” state instead.
3. Add source confidence and source host per promotion card.
4. Add promotion validation job that checks URLs still resolve and dates are current.
5. Store per-store leaflet metadata separately from per-promotion rows.
6. Add “why this matches you” explanation based on purchase history.
7. Add “app-only”, “multi-buy”, “loyalty card required” badges with clear text.
8. Add manual feedback: useful, wrong price, expired, not in store.
9. Prewarm global promotions for PL/EN and PLN at cron level and track last success.
10. Add fallback static store landing links only as “view store leaflet”, not as proof of a deal.
11. Split AI prompt construction from route handler and test JSON cleanup separately.
12. Add cost budget and timeout telemetry for OpenAI web search calls.

## API and data architecture plan

1. Move repeated `auth/getHubAuth` handling into route helpers.
2. Add standard JSON error envelope: `code`, `message`, `details`, `retryAfter`, `requestId`.
3. Add route-level `zod` response validation for high-risk AI and OCR routes.
4. Add DB query count logging in dev and sampled production.
5. Add cursor pagination to expenses, receipts, transactions, invoices, audit history, groups.
6. Use `db.batch` for remaining multi-query reads where Neon HTTP round trips matter.
7. Move expensive derived metrics to server-side aggregation.
8. Make cache headers consistent and documented per route.
9. Add route tests for all auth/tenant boundaries.
10. Add contract tests for iOS repository decoders against real API fixtures.
11. Add rate-limit source header in dev: database vs memory fallback.
12. Add background jobs for stale data cleanup: bank connections, store intel, old reports, blobs.

## iOS app plan

1. Complete deferred A3 polish: virtual receipt, incomes, main tab, root routing.
2. Add visual scan queue detail screen with retry, remove, and edit-after-save.
3. Add AppDataStore metrics overlay in debug: cache hit, refresh, stale, failed.
4. Add offline mode for cached dashboard, receipts, goals, loyalty, budget.
5. Add deep-link tests for receipt, settlement, scan, group, and tab routes.
6. Add VoiceOver audit pass for all new iOS screens.
7. Add dynamic type pass for large text and small iPhone widths.
8. Add haptic consistency map: save, delete, warning, scan success/failure.
9. Add snapshot tests for PL/EN on core screens.
10. Add App Intents only after current flow stability is measured.
11. Add background upload recovery if the app is killed during scan queue processing.
12. Add privacy manifest CI check before App Store builds.

## Per-page backlog

### `/` marketing landing
1. Measure LCP and CLS in Lighthouse CI.
2. Verify hero copy clearly says what Solvio does in the first viewport.
3. Add real product screenshots or generated product visuals instead of relying only on copy.
4. Add pricing/trust proof if this is used for acquisition.
5. Add SEO metadata per language.
6. Add structured data for app/product.
7. Add reduced-motion handling for animated sections.
8. Add keyboard focus pass for CTAs.
9. Add responsive text overflow checks.
10. Add conversion event instrumentation.

### `/login`
1. Add explicit loading state for normal email login and demo login independently.
2. Add rate-limit countdown display when API returns 429.
3. Add validation before submit.
4. Add “check your email” success state if magic link flow is real.
5. Add clear demo-account data explanation.
6. Add passwordless auth telemetry.
7. Add auth error mapping from query string to friendly copy.
8. Add accessibility test for form labels and errors.
9. Add keyboard-only flow test.
10. Add redirect intent preservation after login.

### `/welcome`
1. Replace pure timed redirect with readiness signal if possible.
2. Add skip button with accessible label.
3. Respect reduced motion fully.
4. Avoid progress animation if destination is already ready.
5. Add error fallback if dashboard redirect fails.
6. Add i18n source instead of inline strings.
7. Add telemetry for onboarding completion path.
8. Keep copy minimal and actionable.
9. Test mobile viewport height.
10. Add smoke test for redirect.

### `/onboarding`
1. Persist partial choices.
2. Add validation and disabled submit state.
3. Show what product mode changes.
4. Add back/edit step if multi-step grows.
5. Add server-side idempotency.
6. Add analytics for drop-off.
7. Add keyboard and screen-reader pass.
8. Add retry state for save failure.
9. Add optimistic transition to dashboard.
10. Add tests for already-onboarded redirect.

### `/dashboard`
1. Move more derived metrics server-side.
2. Stop defaulting to `since=all` for web unless the UI truly needs all history.
3. Add explicit freshness indicator for cached dashboard data.
4. Add URL or user preference for time range.
5. Add widget-level skeletons instead of full-page blocking.
6. Add empty-state CTAs based on whether user has expenses, receipts, bank, or goals.
7. Add anomaly explanation and severity levels.
8. Add performance budget for chart JS.
9. Add dashboard API P95 alert.
10. Add E2E smoke test after adding an expense or scan.

### `/expenses`
1. Split the 1900-line page into table, filters, receipt modal, edit dialog, pagination, and hooks.
2. Move filtering/sorting/pagination server-side for large histories.
3. Add URL-backed filters and search.
4. Add virtualized table/list for long datasets.
5. Add batch actions: delete, recategorize, export.
6. Add receipt modal route or deep link instead of local-only modal state.
7. Add optimistic update rollback for mutations.
8. Replace hardcoded QR service dependency with internal QR generation or cached image.
9. Add keyboard shortcut discoverability inside page.
10. Add test coverage for search/filter/sort interactions.

### `/groups`
1. Add server-side sorting by unsettled amount/activity.
2. Add empty state for first group with clear CTA.
3. Add group search if list grows.
4. Add archived groups.
5. Add unread/activity badges.
6. Add optimistic group create.
7. Add skeleton parity with final layout.
8. Add member avatars with deterministic colors.
9. Add group deletion/archive confirmation flow.
10. Add E2E for create group -> open group.

### `/groups/[id]`
1. Split page into dashboard, timeline, receipts, settlements, members, and actions.
2. Fetch group and receipts in parallel in one endpoint or one client hook.
3. Add not-found vs unauthorized distinction.
4. Add polling or refresh after split/settle actions.
5. Add item-level receipt assignment status.
6. Add activity timeline virtualization.
7. Add optimistic settle with rollback.
8. Add conflict handling when another member settles first.
9. Add mobile-first action tray.
10. Add accessibility labels for shares and unsettled totals.

### `/groups/[id]/receipts`
1. Reuse group detail data cache instead of refetching group and receipts separately.
2. Add receipt thumbnails and OCR status.
3. Add filters by assigned/unassigned/member.
4. Add batch assignment.
5. Add upload/scan CTA in empty state.
6. Add receipt detail deep links.
7. Add skeleton matching card layout.
8. Add error retry state.
9. Add pagination.
10. Add E2E for scan group receipt -> assign items.

### `/groups/[id]/settlements`
1. Replace placeholder/simple page with full settlement history.
2. Add pending/paid/declined tabs.
3. Add payment request detail drawer.
4. Add copy/share link actions.
5. Add expiry state.
6. Add conflict-safe status update.
7. Add print/share summary.
8. Add audit trail.
9. Add loading and error states.
10. Add mobile layout pass.

### `/bank`
1. Add consent expiry banner and reconnect CTA.
2. Add 165-day proactive PSD2 reconsent prompt.
3. Add transaction pagination and server-side search.
4. Add matching confidence explanations.
5. Add undo for ignored transactions.
6. Add sync progress states per bank connection.
7. Add detailed error mapping for provider failures.
8. Add orphan connection cleanup job.
9. Add security review for disconnect/delete order.
10. Add E2E with mocked bank data.

### `/subscriptions`
1. Show detection confidence and reasons.
2. Add false-positive dismissal.
3. Add recurrence pattern editing.
4. Add bank transaction and receipt source badges.
5. Add upcoming payments calendar.
6. Add monthly total trend.
7. Add alert configuration.
8. Add empty state explaining required history.
9. Move detection server-side with tested matcher.
10. Add regression fixtures for monthly/weekly/annual patterns.

### `/savings`
1. Split the 1172-line client into tabs and hooks.
2. Replace five parallel fetches with a consolidated savings hub endpoint.
3. Add tab URL state with back/forward support.
4. Add income management completeness: recurring, one-off, inactive.
5. Add optimistic deposit/delete with rollback.
6. Add budget health explanations.
7. Add goal projection assumptions.
8. Add chart lazy-load metrics.
9. Add empty states per tab.
10. Add E2E for create goal -> deposit -> delete.

### `/settings`
1. Split settings, categories, merchant rules, export, danger zone.
2. Add form dirty state and unsaved changes guard.
3. Add export progress and download size.
4. Add account deletion/request deletion flow if required by GDPR docs.
5. Add merchant-rule search and bulk delete.
6. Add settings schema validation on client and server.
7. Add language/currency preview.
8. Add category reorder if supported.
9. Add audit trail for sensitive changes.
10. Add E2E for settings save and export.

### `/analysis`
1. Split the 1269-line page into charts, insight panel, filters, processing hooks.
2. Move aggregation server-side for large datasets.
3. Add time-range URL state.
4. Add chart accessibility tables.
5. Add AI insight cache state and last generated time.
6. Add explainability for each insight.
7. Add no-data states per chart.
8. Add chart bundle budget and lazy-load instrumentation.
9. Add export insights to PDF/CSV.
10. Add E2E for changing period and generating AI insight.

### `/budget`
1. Consolidate settings and budget fetch.
2. Add monthly navigation.
3. Add category budget inline edits.
4. Add validation for negative/too-large values.
5. Add save diff preview.
6. Add carry-over and rollover policy.
7. Add warning when total category budget exceeds income.
8. Add loading states per section.
9. Add optimistic save rollback.
10. Add tests for monthly budget calculations.

### `/challenges`
1. Add server-side templates instead of hardcoded client templates if product wants experimentation.
2. Add streak recovery rules.
3. Add progress history.
4. Add completed archive.
5. Add share challenge summary.
6. Add duplicate challenge prevention.
7. Add better check-in feedback.
8. Add notification hooks.
9. Add empty state by user maturity.
10. Add E2E create/check-in/delete.

### `/loyalty`
1. Add barcode format validation.
2. Add card scan from camera.
3. Add favorite cards.
4. Add store logos locally cached.
5. Add offline availability.
6. Add duplicate prevention.
7. Add full-screen checkout mode.
8. Add secure masking where needed.
9. Add import/export.
10. Add E2E add/toggle/delete card.

### `/prices`
1. Show cache state and source freshness.
2. Add product-level source URLs and confidence.
3. Add store filter.
4. Add “only products I buy often” filter.
5. Add expired/estimated disclaimer.
6. Add price history if stored.
7. Add feedback: price wrong, not comparable, out of stock.
8. Add batch prewarm with cron.
9. Add prompt/JSON parser tests.
10. Add no-receipts guidance that leads to scan flow.

### `/promotions`
1. Auto-load cached/global promotions on page entry instead of requiring manual scan when cache exists.
2. Distinguish cached, live, stale, estimate in the visible UI.
3. Add “last updated” and valid date range.
4. Add source host and click target per card.
5. Add per-store loading and error states.
6. Add feedback buttons on cards.
7. Add store filter URL state.
8. Add stronger empty state when web search unavailable.
9. Add personalized-match explanations.
10. Add E2E with mocked promotions response.

### `/reports`
1. Add report list endpoint instead of deriving only from expenses.
2. Add generation progress.
3. Add retry if Blob upload succeeds but DB tracking fails.
4. Add report retention policy.
5. Add server-side report status table.
6. Add date range selector.
7. Add preview before download.
8. Add generated file size/type labels.
9. Add error details for PDF/DOCX generation.
10. Add E2E generate monthly report.

### `/invoices`
1. Split upload, list, filters, detail, status actions.
2. Add invoice OCR confidence and review state.
3. Add upload queue with retry.
4. Add vendor/NIP validation.
5. Add duplicate invoice detection.
6. Add VAT-entry linkage visibility.
7. Add pagination and server-side filters.
8. Add better drag-and-drop accessibility.
9. Add file type and size warnings before upload.
10. Add E2E upload mocked invoice -> approve.

### `/team`
1. Add role capability matrix.
2. Add invite pending state.
3. Add resend/revoke invite.
4. Add department management.
5. Add spending-limit validation and currency display.
6. Add audit log for role changes.
7. Add inactive member filters.
8. Add self-removal/owner transfer rules.
9. Add optimistic edit rollback.
10. Add E2E invite/edit/remove member.

### `/vat`
1. Add period selector with URL state.
2. Add VAT export preflight checklist.
3. Add missing company/NIP remediation CTA.
4. Add validation errors per field.
5. Add export preview.
6. Add chart table alternative for accessibility.
7. Add reconciliation with invoices/expenses.
8. Add historical periods.
9. Add JPK schema validation test.
10. Add E2E export mocked JPK.

### `/audit`
1. Show cache state and last generated time.
2. Add section-level confidence.
3. Add source links for web-derived claims.
4. Add “mark as useful/not useful”.
5. Add action checklist generated from audit findings.
6. Add no-data guidance.
7. Add stale fallback label.
8. Add PDF export.
9. Add prompt parser tests.
10. Add E2E with mocked audit.

### `/receipt/[id]`
1. Add not-found/expired/private states.
2. Add stronger privacy copy for public links.
3. Add print layout audit.
4. Add QR/share copy fallback.
5. Add line-item confidence if OCR data exists.
6. Add merchant logo only when reliable.
7. Add currency conversion note.
8. Add mobile receipt readability pass.
9. Add metadata privacy test.
10. Add E2E open public receipt.

### `/settlement/[id]`
1. Keep current metadata privacy hardening.
2. Add token expiry messaging.
3. Add payment status timeline.
4. Add copy link and print polish.
5. Add decline reason if applicable.
6. Add already-settled conflict state.
7. Add anonymous vs logged-in distinction.
8. Add mobile CTA stickiness.
9. Add audit row visibility for owner.
10. Add E2E settle/decline with token.

### Error and loading pages
1. Ensure every protected route has skeleton parity.
2. Add retry action where runtime errors are recoverable.
3. Add request ID when available.
4. Avoid leaking raw server errors.
5. Add translations for all error text.
6. Add consistent iconography.
7. Add mobile layout checks.
8. Add dark-mode checks.
9. Add snapshot tests for global error states.
10. Add Sentry/telemetry hooks.

## Suggested execution order

1. Instrument first: request IDs, route timings, DB query count, AI/OCR timings, cache states.
2. Fix workspace-root warning and operational env checklist.
3. Add Lighthouse CI and Playwright route smoke tests.
4. Split `expenses`, `analysis`, `savings`, `groups/[id]`, `dashboard`.
5. Consolidate API reads for savings, analysis, bank, business pages.
6. Finish iOS A3 polish and scan recovery.
7. Harden promotions with visible freshness/source confidence.
8. Add OCR confidence/provenance and receipt review UX.
9. Add bank consent lifecycle and orphan cleanup.
10. Add privacy/compliance CI gates for iOS and data export/deletion.
