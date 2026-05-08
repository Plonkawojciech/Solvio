# Solvio — Landing-page SEO + a11y checklist

**Last updated:** 2026-05-07 (round 3)
**Scope:** marketing landing at `/` (and any future `/about`, `/pricing` pages). Does NOT cover protected `/dashboard`, etc.
**Source of truth:** `docs/research-round3.md` § Sub-topic 3.

---

## Why this exists

Solvio's marketing surface (`app/(marketing)/page.tsx`) ships a basic OpenGraph + Twitter card and that's it. Every other SEO/a11y signal is missing. None of these are hard fixes; the entire checklist is one ~200-line PR worth of work, ships in <2 hours.

---

## Critical (do first — round 4 candidate)

- [ ] **`app/sitemap.ts`** — list public routes only (`/`, `/login`, `/welcome`). Use `MetadataRoute.Sitemap` type. Use `alternates.languages` for `pl-PL` + `en-US`.
- [ ] **`app/robots.ts`** — allow `/`, disallow all `/api/`, `/dashboard`, `/expenses`, `/groups`, `/settings`, `/analysis`, `/audit`, `/prices`, `/reports`, `/business/`, `/personal/`, `/welcome`, `/receipt/`. Reference `sitemap` URL.
- [ ] **JSON-LD `SoftwareApplication`** — name, OS=iOS, applicationCategory=FinanceApplication, offers/price=0/priceCurrency=PLN, url. Required by Google: `name` + `price` (or `aggregateRating`).
- [ ] **JSON-LD `Organization`** — Programo s.c., founders Wojciech + Bartosz, address PL, logo URL.
- [ ] **JSON-LD `FAQPage`** — 8 PL+EN Q&A pairs:
  1. Czy Solvio wspiera polskie paragony? / Does Solvio support Polish receipts?
  2. Jakie banki obsługujecie? / Which banks are supported?
  3. Jak działa RODO/GDPR? / How is GDPR handled?
  4. Czy Solvio działa na Androidzie? / Is Solvio on Android?
  5. Ile kosztuje? / How much does it cost?
  6. Jak działa dzielenie wydatków? / How does expense splitting work?
  7. Kiedy będzie eksport JPK? / When will JPK export ship?
  8. Jak dokładny jest OCR? / How accurate is the OCR?
- [ ] **`metadata.alternates`** — canonical + languages map for `pl-PL`, `en-US`, `x-default`.
- [ ] **`<html lang>` switching** — currently static `lang="en"`; switch dynamically based on `lib/i18n.ts` resolved language.
- [ ] **OpenGraph image** — `app/(marketing)/opengraph-image.png` (1200×630, ≤8MB). Twitter falls back to OG.

## Important (round 5-6 candidates)

- [ ] **Lighthouse CI** — `lhci/cli` in GitHub Actions; thresholds: LCP <2.5s, INP <200ms, CLS <0.1.
- [ ] **Reduce framer-motion on landing** — replace static-variant `motion.*` instances with CSS animations. INP is the most-failed Core Web Vital in 2026 (~43% sites fail it).
- [ ] **`<Image priority>` + `fetchPriority="high"`** on the hero LCP image.
- [ ] **Skip-to-content link** — `<a href="#main" className="sr-only focus:not-sr-only">Skip to content</a>` at top of `<body>`.
- [ ] **`useReducedMotion()`** — wrap framer-motion components to respect `prefers-reduced-motion`.
- [ ] **Form labels** — replace placeholder-as-label with `<label htmlFor>` on `/login` + `/welcome` forms; placeholder is supplemental only.
- [ ] **Form errors** — add `aria-live="polite"` on error states.
- [ ] **Color contrast audit** — run [APCA](https://www.myndex.com/APCA/) on Solvio's brand palette in `globals.css`; fix any text pair below 4.5:1.

## WCAG 2.2 AA new SC (June 28, 2025 EAA deadline already passed)

The European Accessibility Act is in force. Solvio is currently exempt as <10 employees AND <€2M turnover, but compliance is the path. Round 1 covered WCAG 2.1; round 3 adds 2.2:

- [ ] **2.4.11 Focus Not Obscured (Min)** — verify sticky nav doesn't hide focused field on mobile.
- [ ] **2.5.7 Dragging Movements** — any drag UI (Recharts brush) needs alt button.
- [ ] **2.5.8 Target Size (Min) 24×24** — audit landing CTAs and footer links.
- [ ] **3.2.6 Consistent Help** — if "Help"/"Contact" link appears, must be in same location across pages.
- [ ] **3.3.7 Redundant Entry** — login/signup forms autofill prior info.
- [ ] **3.3.8 Accessible Authentication** — Solvio uses email magic link, no cognitive puzzle → ✓ already compliant.

## Polish keyword targets

For h1, h2, meta description, and FAQ:

| Polish keyword | Use in |
|---|---|
| `aplikacja do paragonów` | Hero h1 (PL), title |
| `skanowanie paragonów aplikacja` | Subtitle, FAQ Q1 |
| `aplikacja do wydatków` | Page title PL variant |
| `program do śledzenia wydatków` | Subtitle |
| `aplikacja do dzielenia rachunków` | Feature section |
| `OCR paragonów polska` | Blog / docs / FAQ |
| `Splitwise alternatywa polska` | Comparison page (when ready) |
| `Kontomierz alternatywa` | Comparison page |

For English: `expense tracker poland`, `polish receipt scanner`, `split bill app europe`.

---

## Validation

Before any SEO PR ships:
1. [Google Rich Results Test](https://search.google.com/test/rich-results) — paste rendered HTML, verify SoftwareApplication / Organization / FAQPage all parse.
2. [PageSpeed Insights](https://pagespeed.web.dev/) — `/` and `/login`. Target all 3 CWV "Good" at 75th percentile.
3. [WebAIM WAVE](https://wave.webaim.org/) — paste URL, fix all errors, review alerts.
4. [hreflang.org tag tester](https://hreflang.org/) — verify symmetric language references.

---

## Out of scope

- PWA manifest, service worker, "Add to Home Screen" — **intentionally NOT shipped** per `app/layout.tsx` comment ("iOS users install the native app from the App Store; web is a back-office surface"). Don't add these.
- Service worker — same reason.
- AMP — deprecated by Google as of 2024.

---

**Owner:** A5 (research) for spec; A2 or A1 for backend `app/sitemap.ts` + `app/robots.ts`; A3 generally doesn't touch web.
