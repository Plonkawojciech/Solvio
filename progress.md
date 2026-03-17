# Solvio — Progress Log

**Projekt:** AI-powered SaaS do śledzenia wydatków — skanowanie paragonów (OCR), grupy kosztów, porównywanie cen, raporty finansowe. PL/EN.

**URL produkcyjny:** `https://solvio-lac.vercel.app`

---

## Uwaga: 100% AI Codebase

> Ten projekt jest w **100% pisany i utrzymywany przez agenty AI** (Claude opus-4.6 / sonnet) za pomocą Claude Code. Nie ma kodu pisanego ręcznie przez człowieka.

## Instrukcja dla agentów AI

> **OBOWIĄZEK:** Jako agent AI edytujący ten codebase — **musisz** zaktualizować ten plik po wprowadzeniu zmian. Dodaj wpis do sekcji Changelog poniżej z:
> - datą (YYYY-MM-DD)
> - krótkim opisem co zostało zmienione i dlaczego
> - dotkniętymi plikami/modułami
>
> To jest główny mechanizm śledzenia historii projektu. Git log pokazuje commity, ale ten plik daje AI kontekst semantyczny — co, dlaczego, i jakie moduły były dotknięte. Bez tego kolejny agent nie ma pełnego obrazu stanu projektu.

---

## Changelog

<!-- Dodawaj wpisy od najnowszego do najstarszego -->

| Data | Opis zmian | Dotknięte moduły |
|------|-----------|-----------------|
| 2026-03-17 | Premium design overhaul: dark sidebar (Revolut-style), gradient hero, shadow system (4 levels), gold/emerald/violet accents, shimmer skeletons, stagger list animations, button press feedback (scale 0.97), card hover lift, animated numbers, nav progress bar, premium/soft button variants. | globals.css, button.tsx, card.tsx, input.tsx, skeleton.tsx, tooltip.tsx, sidebar.tsx, app-mobile-header.tsx, dashboard/page.tsx, expenses/page.tsx, savings/client-page.tsx, + 3 new components |
|------|-----------|-----------------|
| 2026-03-17 | Premium micro-interactions & animation polish: stagger animations on expense list (mobile cards + desktop table rows) and savings hub (goals grid, budget rows, challenge cards), button press feedback (active:scale-[0.97] 150ms), shimmer skeleton upgrade (shimmer keyframes replacing animate-pulse), animated-number component (framer-motion count-up), page-transition wrapper, tooltip animations (delayed-open state, sideOffset=6), card hover lift effect (savings-goal-card, challenge-card, bank-account-card + inline mini cards), nav-progress bar (fixed top bar on route transitions). | expenses/page.tsx, savings/client-page.tsx, button.tsx, skeleton.tsx, tooltip.tsx, globals.css, (protected)/layout.tsx, nav-progress.tsx, animated-number.tsx, page-transition.tsx, savings-goal-card.tsx, challenge-card.tsx, bank-account-card.tsx |
| 2026-03-17 | Premium fintech design upgrade: richer color system (deeper primary blue, accent-gold/emerald/violet tokens), gradient utilities (.gradient-primary, .gradient-gold, .shadow-premium, .text-gradient), premium button variants (premium, soft), card top accent line + premium shadows, input better focus states (ring-4, h-10), dark premium sidebar with gradient logo + active left border, mobile header backdrop-blur-xl + shadow, dashboard hero section fully gradient with decorative radial overlays and big bold amount. All dark mode compatible. | globals.css, button.tsx, card.tsx, input.tsx, sidebar.tsx, app-mobile-header.tsx, dashboard/page.tsx |
| 2026-03-17 | Konsolidacja nawigacji: z 12/9 pozycji do 6 per produkt. Nowy hub /savings (tabs: Goals/Budget/Challenges/Deals). Sidebar i mobile bottom nav zaktualizowane. Invoices page: tabbed (Invoices+VAT). Expenses page: tabbed (Expenses+Approvals) dla business. Settings: dodano sekcje Reports, Loyalty Cards, JPK, Analysis. Middleware: /savings jako protected+personal-only. i18n: ~50 nowych kluczy PL/EN. | sidebar.tsx, mobile-bottom-nav.tsx, middleware.ts, i18n.ts, savings/page+client-page+loading, settings/page, invoices/page, expenses/page |
| 2026-03-17 | Inicjalizacja pliku progress.md | — |
