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
| 2026-03-17 | Konsolidacja nawigacji: z 12/9 pozycji do 6 per produkt. Nowy hub /savings (tabs: Goals/Budget/Challenges/Deals). Sidebar i mobile bottom nav zaktualizowane. Invoices page: tabbed (Invoices+VAT). Expenses page: tabbed (Expenses+Approvals) dla business. Settings: dodano sekcje Reports, Loyalty Cards, JPK, Analysis. Middleware: /savings jako protected+personal-only. i18n: ~50 nowych kluczy PL/EN. | sidebar.tsx, mobile-bottom-nav.tsx, middleware.ts, i18n.ts, savings/page+client-page+loading, settings/page, invoices/page, expenses/page |
| 2026-03-17 | Inicjalizacja pliku progress.md | — |
