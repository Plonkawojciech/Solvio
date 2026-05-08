# HSTS Preload Submission — solvio-lac.vercel.app

> Round 4 / A2 Security. One-time operational task for Wojtek/Bartek.

## Status (2026-05-07)

`next.config.ts` already ships:

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

That's a 2-year max-age (>1 year minimum required), `includeSubDomains` (covers `*.vercel.app` if Solvio ever moves to a subdomain), and `preload` (declares intent to be added to the Chromium preload list).

Verify on production with:

```bash
curl -sI https://solvio-lac.vercel.app | grep -i strict-transport-security
```

Expected output: `strict-transport-security: max-age=63072000; includeSubDomains; preload`

## Why preload?

Without preload, the first time a visitor hits the domain over HTTP they see one redirect-to-HTTPS. Preload bakes the HTTPS-only rule into Chromium / Firefox / Safari at the browser level — even the first-ever request goes over HTTPS. Closes a tiny attack window on first-contact MITM.

## Submission

Solvio currently runs on `solvio-lac.vercel.app`. The Chromium preload list is shared across browsers and the entry is **immutable** — once on the list it's effectively permanent.

**Decision: do NOT submit `solvio-lac.vercel.app` to the preload list.**

Reasons:
1. `*.vercel.app` is a shared apex domain. Vercel itself owns the preload entry for `vercel.app`. Submitting subdomains under `vercel.app` is generally rejected by hstspreload.org because the parent domain is already preloaded.
2. We will likely move to `solvio.app` or `solvio.pl` for production at some point. Locking `solvio-lac.vercel.app` into preload is pointless.
3. Solvio's own custom domain (when registered) is the right thing to submit.

## When you register a custom domain (e.g. `solvio.app`)

1. **Verify HTTPS for 6+ weeks** with the headers above. The preload list checker requires demonstrated `Strict-Transport-Security` consistency.
2. Visit https://hstspreload.org and enter the domain.
3. The site runs an automated check:
   - HTTPS reachable on the apex
   - HTTPS reachable on `www.` if it resolves
   - HSTS header on every HTTPS response
   - `max-age` ≥ 31536000 (1 year)
   - `includeSubDomains` token present
   - `preload` token present
   - HTTP redirects to HTTPS on the apex
4. Click "Submit". Inclusion takes 6-12 weeks (next Chromium release rolling out).

## Pre-flight checklist (run before clicking Submit)

```bash
# 1. HSTS header on apex over HTTPS
curl -sI https://solvio.app | grep -i strict-transport-security
# Expected: strict-transport-security: max-age=63072000; includeSubDomains; preload

# 2. HSTS header on www over HTTPS
curl -sI https://www.solvio.app | grep -i strict-transport-security
# Expected: same as above

# 3. HTTP → HTTPS redirect on apex
curl -sI http://solvio.app | head -5
# Expected: HTTP/1.1 308 Permanent Redirect with Location: https://solvio.app/

# 4. HTTPS reachable + 200
curl -sI https://solvio.app | head -1
# Expected: HTTP/2 200 (or 308 to /something redirect)
```

If all four pass, the submission will be accepted on the first try.

## Removing from preload (if ever needed)

Once submitted, removal is hard. The Chromium `removable.txt` list takes 6-12 weeks to roll out and the domain stays HTTPS-only in older browser versions effectively forever (Chrome 60+ always requires HTTPS for preloaded domains). **Treat preload submission as effectively permanent.**

## Owner

Wojtek + Bartek (s.c. equal admins). Submit only after a custom domain is live and validated for at least 6 weeks.
