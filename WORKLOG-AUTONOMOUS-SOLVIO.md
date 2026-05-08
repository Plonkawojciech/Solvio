# Worklog Autonomous Solvio

## 2026-05-08 15:54 CEST
- Inspected: `CLAUDE.md`, `progress.md`, architecture/research/perf/ux/security docs, repo structure, current dirty worktree, key web/iOS auth + settlement + AI/security routes.
- Changed: started rolling checkpoint file per autonomous-run requirement.
- Validated: confirmed server-side CSRF rollout exists (`middleware.ts`, `lib/csrf.ts`, `/api/auth/csrf`), while native iOS client still appears cookie-only.
- Next: finish iOS CSRF client integration and retry logic, then re-rank remaining high-value API/public-flow defects.

## 2026-05-08 15:58 CEST
- Inspected: native auth/session stack in `ApiClient.swift` and `SessionStore.swift`, plus current server CSRF contract.
- Changed: wired iOS CSRF token fetch/cache/header attachment into `ApiClient`, added one-shot retry on CSRF 403s, and refreshed/cleared token state during login, restore, logout, and unauthorized handling.
- Validated: `xcodebuild -project native-ios/Solvio.xcodeproj -scheme Solvio -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build` succeeded.
- Next: harden remaining high-risk API endpoints around upload limits, destructive actions, and data export throttling.

## 2026-05-08 16:00 CEST
- Inspected: OCR/HEIC upload routes, demo reset flow, export-data route, and receipt item storage behavior in `lib/db/schema.ts`.
- Changed: added HEIC size/empty-file guards, sanitized receipt OCR Azure failure classification without leaking raw upstream details, rate-limited `demo/reset` and `export-data`, and fixed demo reset to delete `receipt_items` by `userId` instead of a dead no-op predicate.
- Validated: `npm install`, `npm run test` (126/126), and incremental iOS rebuilds while continuing the pass.
- Next: close any remaining build blockers and remove accidental shipping artifacts from the native app bundle.

## 2026-05-08 16:04 CEST
- Inspected: failed production build output plus native packaging logs.
- Changed: fixed `app/settlement/[id]/page.tsx` to pass the required language/labels props, rewrote `lib/csrf.ts` to use Edge-safe Web Crypto APIs instead of Node `crypto`, and removed `SavingsHubView.swift.bak` from the Xcode resources phase so it no longer ships inside the app bundle.
- Validated: `npm run lint`, `npm run build`, and `xcodebuild -project native-ios/Solvio.xcodeproj -scheme Solvio -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build` all passed.
- Next: highest remaining risk is distributed/serverless rate limiting and broader API route coverage, plus the pending iOS `PrivacyInfo.xcprivacy` requirement noted in research.

## 2026-05-08 16:16 CEST
- Inspected: the remaining rate-limited API surfaces plus unthrottled bank/report mutation routes, and the new persistent limiter schema/test scaffolding.
- Changed: rolled auth, AI, OCR, export, shopping, pricing, and recategorization endpoints onto `rateLimitPersistent`; added missing per-user throttles to `bank/sync`, `bank/disconnect`, `bank/match`, `reports/generate`, and `reports/custom`; tightened custom-report validation for category count/length and invalid date/amount ranges.
- Validated: code-level sweep confirmed all `app/api` limiter call sites now use the persistent path (`30` routes) and no `rateLimit(` calls remain there.
- Next: add realistic native iOS privacy/compliance artifacts now (`PrivacyInfo.xcprivacy`, localized permission copy), then run web/native validation again.

## 2026-05-08 16:24 CEST
- Inspected: current persistent-throttle partials (`lib/rate-limit.ts`, `drizzle/0004_rate_limit_buckets.sql`) plus remaining AI/auth/export/bank callsites and the native iOS project wiring path.
- Changed: hardened `rateLimitPersistent()` with explicit no-DB fallback, one-shot warning, injected test seam, and opportunistic bucket GC; rolled the persistent limiter across the remaining auth, export, bank, OCR, and AI endpoints; fixed generic limiter-key collisions (`groups/ai-suggest`, `groups/[id]/ai-insights`, `ocr-invoice`); added localized `InfoPlist.strings`, corrected the existing `PrivacyInfo.xcprivacy` photo/video data-type constant, wired both into `native-ios/Solvio.xcodeproj`, and kept `native-ios/project.yml` aligned.
- Validated: `npm run test` (130/130), `npm run lint`, `npm run build`, `plutil -lint native-ios/Solvio/Resources/PrivacyInfo.xcprivacy`, and `xcodebuild -project native-ios/Solvio.xcodeproj -scheme Solvio -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build` all passed. Build log confirms `PrivacyInfo.xcprivacy` is copied into `Solvio.app`.
- Next: remaining production risk is operational, not code-path correctness — the new persistent limiter only becomes cross-instance effective after applying `drizzle/0004_rate_limit_buckets.sql` / `db:push` to the target database, and full App Store privacy review still depends on keeping the manifest in sync with any future SDK/data-collection changes.
