# Solvio — PSD2 Bank API Providers Comparison

**Date:** 2026-05-08
**Status:** Decision-support doc
**Companion to:** `docs/research-round5.md` Section 3
**Owner:** A5 (research)

---

## TL;DR

- **Solvio currently uses GoCardless Bank Account Data (formerly Nordigen).**
- **GoCardless stopped accepting NEW Bank Account Data accounts on July 2025.** Existing Solvio production account works; cannot create a fresh dev/staging or onboard tenants on a new account.
- **Top alternative for net-new connections: Yapily** (strong Polish coverage, AISP-only, PolishAPI alignment).
- **Direct PolishAPI integration** (with KNF AISP license) is a >€100k investment that only pays off past ~10k bank-linked users. **Defer to 2027+.**

---

## Provider matrix — May 2026

| Provider | Open to new customers | Polish bank coverage | Pricing model | Public docs | Sandbox | Notes |
|---|---|---|---|---|---|---|
| **GoCardless** (Nordigen) | NO (closed Jul 2025) | All majors via PolishAPI | Free up to 50 connections/mo | Yes | Yes (existing accounts) | Lock-in risk; keep existing only |
| **Yapily** | YES | All majors (PKO, mBank, Pekao, Santander, ING, Millennium); 25M+ accounts | Custom pricing per Yapily blog | Yes | Yes | Strongest Polish marketing presence; AISP-only |
| **Salt Edge** | YES | 5,000+ across 50 countries; Poland in coverage | Usage-based; KYC/risk separately | Yes | Yes | More legacy / enterprise-focused |
| **Tink (Visa)** | YES | All major Polish banks | €0.50/user/mo (per Finexer) + tiers | Yes | Yes | Visa-owned; per-user kills B2C scaling |
| **TrueLayer** | YES | 95%+ EU incl. Poland | Custom pricing | Yes | Yes | UK/EU strong, payment-init forte |
| **Enable Banking** | YES | Poland in 8-country list | Free for personal use; commercial = paid | Yes | Yes | More app-side overhead |

---

## Polish bank → provider coverage (top 10)

| Bank | Direct portal | GoCardless | Tink | Salt Edge | Yapily | TrueLayer |
|---|---|---|---|---|---|---|
| PKO BP | ✅ developers.pkobp.pl | ✅ | ✅ | ✅ | ✅ | ✅ |
| mBank | ✅ developer.api.mbank.pl | ✅ | ✅ | ✅ | ✅ | ✅ |
| Santander Polska | ✅ developer.santander.pl | ✅ | ✅ | ✅ | ✅ | ✅ |
| ING Bank Śląski | ✅ devportal.ing.pl | ✅ | ✅ | ✅ | ✅ | ✅ |
| Bank Pekao | ✅ developer.pekao.com.pl | ✅ | ✅ | ✅ | ✅ | ✅ |
| Bank Millennium | ✅ openapi.bankmillennium.pl | ✅ | ✅ | ✅ | ✅ | ✅ |
| Alior Bank | private | ✅ | ✅ | ✅ | partial | ✅ |
| BNP Paribas Polska | private | likely | ✅ | ✅ | ✅ | partial |
| Citi Handlowy | private | likely | ✅ | ✅ | partial | partial |
| Credit Agricole | private | likely | ✅ | partial | partial | partial |

**Note:** "✅" means the institution appears in the aggregator's directory at some point in 2024–2026; **production reliability varies, and Polish bank PSD2 APIs have a documented history of unreliable uptime** (see [Toshl X post 2024-05-26](https://x.com/Toshl/status/1795100937117139335)).

---

## Recommended migration path

### Phase 1 (round 6-9 of hardening loop) — Add Yapily as alternative provider

1. Refactor `lib/nordigen/` into `lib/bank-providers/gocardless/`
2. Add `lib/bank-providers/yapily/` with same interface (`createRequisition`, `listAccounts`, `fetchTransactions`, `disconnect`)
3. Add `lib/bank-providers/index.ts` dispatcher with `BANK_PROVIDER` env var (default `gocardless` for back-compat)
4. New users get Yapily (set `BANK_PROVIDER=yapily` in production once Yapily contract signed)
5. Existing users continue on GoCardless

### Phase 2 (rounds 10-15) — Silent migration

When existing users hit the 165-day re-consent prompt (see R5-02 backlog item), route them through Yapily for the new requisition. Old GoCardless requisitions naturally expire and don't get renewed.

### Phase 3 (2027+) — Direct PolishAPI for top 4 banks (only if economics justify)

Only pursue if:
- Solvio has >10,000 bank-linked monthly active users
- AISP licensing capital + KYC compliance budget approved (~€50k+)
- Engineering can dedicate ~12 weeks to direct integration of PKO + mBank + Santander + ING

Otherwise, stay aggregator-only.

---

## Cost projection (rough)

| Stage | Active bank-linked MAU | Yapily ballpark cost | Direct PolishAPI cost (top 4) | Net winner |
|---|---|---|---|---|
| MVP | 200 | €60–120/mo | N/A (not built) | Aggregator |
| Growth | 2,000 | €600–1,200/mo | N/A (not built) | Aggregator |
| Scale | 10,000 | €3,000–6,000/mo | €100k one-off + €0/mo | Direct (after 17–33 months) |
| Mature | 50,000 | €15,000–30,000/mo | €100k one-off + ~€500/mo (long-tail aggregator) | Direct |

Numbers are estimates; Yapily, Tink, Salt Edge all use custom contracts. Get a sales call once usage exceeds 1,000 MAU.

---

## Key regulatory facts

- **Polish AISP licensing:** issued by **KNF (Komisja Nadzoru Finansowego)**. Required for direct PolishAPI access (any PSD2 production endpoint). Process is multi-month, requires capital backing and ongoing compliance reporting.
- **PolishAPI standard:** maintained by Polish Bank Association. Latest published versions: **2.1.4 and 3.0.1** (published 2025-06-17). Aligned with ISO 20022 financial-message format.
- **180-day SCA re-authentication** (replaces the original 90-day rule from PSD2 RTS Sept 2019) — most member states + Polish banks now use 180-day. Plan UX around 165-day proactive re-consent.
- **Berlin Group NextGenPSD2** — alternative European standard. Some Polish banks support both; PolishAPI is the more common in Poland.

---

## Action items for Solvio

1. **Don't create a new GoCardless dev/staging account** — you can't.
2. **Sign up for Yapily developer account** (free sandbox) and prototype a `lib/bank-providers/yapily/` adapter (R5-01 backlog).
3. **Add 165-day re-consent prompt** with push notification + in-app banner (R5-02 backlog).
4. **Document the GoCardless → Yapily migration plan** before round 10 (R5-18 backlog).
5. **Defer direct PolishAPI integration** to 2027+ planning cycle (R5-13 backlog).
