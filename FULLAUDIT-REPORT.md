# Full Audit Report — Solvio — 2026-03-18 (v2)

## Overall Risk Score: ŚREDNI

## Executive Summary
Solvio ma solidną izolację multi-user (0 IDOR), poprawny system sesji HMAC, i czyste TypeScript/ESLint. Główne problemy to: timing attack na hub secret comparison, demo reset endpoint bez ograniczenia do demo konta, N+1 queries w team/settings/expenses DELETE, SELECT * pobierające rawOcr JSONB, 28+ icon buttons bez aria-label, i brak dark mode na publicznych stronach receipt/settlement. Architektura jest dojrzała po licznych optymalizacjach w tej sesji.

## Problemy KRYTYCZNE
- [SECURITY] lib/auth-compat.ts:16 — hub secret porównywany `!==` zamiast timingSafeEqual
- [SECURITY] auth/demo/reset — kasuje dane DOWOLNEGO zalogowanego usera, nie tylko demo
- [SECURITY] Middleware nie weryfikuje auth na /api/ routes (defense-in-depth gap)
- [PERF] business/team GET — N+1: osobne SUM query per team member
- [PERF] data/settings POST — 10 sekwencyjnych UPDATE przy zmianie języka
- [PERF] data/expenses DELETE — sekwencyjne receipt cleanup w for loop
- [UX] 28+ icon buttons bez aria-label (WCAG fail)

## Problemy WYSOKIE
- [SECURITY] 3 AI routes bez rate limiting (ai-suggest, ai-insights, ocr-invoice)
- [SECURITY] Settlement share token — timing attack (!=== zamiast timingSafeEqual)
- [SECURITY] Demo login jest GET (CSRF via img tag)
- [PERF] rawOcr JSONB via SELECT * w 3 routes (50-200KB/row)
- [PERF] 8 tabel bez indexes
- [UX] Settlement/receipt pages — zero dark mode, hardcoded English, contrast fails
- [UX] Touch targets h-7 w-7 (28px) w expenses/bank
- [GENERAL] 29 as any assertions, 12 silently swallowed .catch(() => {})

## Statystyki
| Obszar | Krytyczne | Wysokie | Średnie |
|--------|-----------|---------|---------|
| General | 2 | 7 | 8 |
| Security | 3 | 5 | 7 |
| Multi-user | 0 | 0 | 2 |
| Performance | 3 | 3 | 4 |
| UX/a11y | 3 | 5 | 6 |
| **SUMA** | **11** | **20** | **27** |
