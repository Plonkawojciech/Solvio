# Solvio — Phase 1 Security Research
**Date:** 2026-03-18
**Scope:** Dependency CVEs, framework vulnerabilities, Vercel serverless security best practices
**Source:** Web searches + package.json analysis

---

## Current package.json versions (relevant packages)

| Package | Current version | Notes |
|---|---|---|
| `next` | ^15.5.9 | Framework |
| `react` / `react-dom` | ^19.0.0 | UI runtime |
| `drizzle-orm` | ^0.45.1 | ORM |
| `drizzle-kit` | ^0.31.9 | Dev tooling |
| `openai` | ^6.8.1 | AI SDK |
| `@vercel/blob` | ^2.3.1 | File storage |
| `@neondatabase/serverless` | ^1.0.2 | DB driver |

---

## Finding 1 — CVE-2025-55182 (React2Shell): CRITICAL RCE — CVSS 10.0

**Affects:** React 19 + Next.js App Router (React Server Components)
**Disclosed:** November/December 2025
**Status in Solvio:** `react: ^19.0.0` — POTENTIALLY VULNERABLE depending on resolved version

### What it is
An unauthenticated attacker can execute arbitrary code on the server by sending a crafted HTTP request to any React Server Function endpoint. The flaw lies in how React decodes payloads sent to Server Function (Server Action) endpoints. No authentication or special access required.

### Affected React versions
- 19.0, 19.1.0, 19.1.1, 19.2.0 — **vulnerable**
- 19.0.1, 19.1.2, 19.2.1 — **patched**
- Safe versions: 19.0.4, 19.1.5, 19.2.4 (also fix subsequent DoS CVEs)

### Affected Next.js versions
- All 15.x before 15.2.6 — **vulnerable**
- Fixed in: 15.0.5, 15.1.9, 15.2.6, 15.3.6, 15.4.8, 15.5.7

**Solvio uses `next: ^15.5.9`** — the `^` semver range resolves to ≥15.5.9, which is above the patched 15.5.7 threshold. However, `react: ^19.0.0` could resolve to 19.0.0 (unpatched). Must verify actual installed versions via `npm list react next`.

### Real-world exploitation
Active exploitation was detected from December 5, 2025. Threat actors (including China-nexus groups) were observed deploying crypto miners via this vector.

### References
- https://react.dev/blog/2025/12/03/critical-security-vulnerability-in-react-server-components
- https://github.com/facebook/react/security/advisories/GHSA-fv66-9v8q-g76r
- https://www.oligo.security/blog/critical-react-next-js-rce-vulnerability-cve-2025-55182-cve-2025-66478-what-you-need-to-know
- https://aws.amazon.com/blogs/security/china-nexus-cyber-threat-groups-rapidly-exploit-react2shell-vulnerability-cve-2025-55182/

---

## Finding 2 — CVE-2025-66478 (Next.js companion to React2Shell): CRITICAL

**Affects:** Next.js 15.x App Router
**Status:** Fixed in 15.5.7+. Solvio's `^15.5.9` likely covers this.

The Next.js-specific companion vulnerability to CVE-2025-55182. Exploited via the same RSC payload deserialization path.

### References
- https://nextjs.org/blog/CVE-2025-66478
- https://github.com/vercel/next.js/security/advisories/GHSA-9qr9-h5gf-34mp
- https://github.com/vercel/next.js/discussions/86939

---

## Finding 3 — CVE-2025-55184 (React DoS) + CVE-2025-67779: HIGH — CVSS 7.5+

**Affects:** React 19 (Server Components)
**Disclosed:** December 2025

A crafted HTTP request to any App Router endpoint triggers an infinite loop, hanging the server and blocking all future requests (out-of-memory / excessive CPU). Variants of this DoS persist even in versions patched for CVE-2025-55182.

**Safe React versions:** 19.0.4, 19.1.5, 19.2.4
**Solvio:** `react: ^19.0.0` — must pin to ≥19.x.4 in the relevant minor line.

### References
- https://react.dev/blog/2025/12/11/denial-of-service-and-source-code-exposure-in-react-server-components
- https://www.ox.security/blog/react-cve-2025-55184-67779-55183-react-19-vulnerabilities/

---

## Finding 4 — CVE-2025-55183 (React Source Code Exposure): MEDIUM

**Affects:** React 19 (Server Components)
Attacker can call `.toString()` on a server function object via a crafted HTTP request, receiving the full compiled source code of Server Actions — exposing business logic, API keys referenced in closures, and secrets.

**Solvio risk:** Solvio Server Actions contain DB queries and may reference env vars. This is a direct risk if `react: ^19.0.0` resolves to an unpatched version.

### References
- https://vercel.com/kb/bulletin/security-bulletin-cve-2025-55184-and-cve-2025-55183

---

## Finding 5 — CVE-2026-23864 (Additional React RSC DoS): HIGH — CVSS 7.5

**Affects:** React 19 versions not yet updated to the latest patch
Discovered after the December 2025 wave. Additional DoS vector in React Server Components via crafted HTTP requests. Safe versions: 19.0.4, 19.1.5, 19.2.4.

---

## Finding 6 — CVE-2025-29927 (Next.js Middleware Auth Bypass): CRITICAL — CVSS 9.1

**Affects:** Next.js all versions before 15.2.3
**Disclosed:** March 21, 2025
**Status in Solvio:** `next: ^15.5.9` — above the fixed 15.2.3 threshold. **Likely not vulnerable.**

### What it is
The internal header `x-middleware-subrequest` (used to prevent infinite middleware loops) was not stripped from incoming external requests. An attacker could inject this header to **completely bypass middleware**, including all authentication and authorization checks.

### Why it matters for Solvio
Solvio's `middleware.ts` is the primary route-level auth guard for all `(protected)/*` routes. If an attacker bypassed middleware, they could access all authenticated routes and API endpoints without a valid session cookie.

### Impact
- Auth bypass on all protected routes
- CSP bypass (enabling XSS)
- Cache poisoning for DoS
- CVSS 9.1

### References
- https://projectdiscovery.io/blog/nextjs-middleware-authorization-bypass
- https://vercel.com/blog/postmortem-on-next-js-middleware-bypass
- https://securitylabs.datadoghq.com/articles/nextjs-middleware-auth-bypass/
- https://www.exploit-db.com/exploits/52124

---

## Finding 7 — Next.js December 2025 Security Update (Multiple CVEs)

**Source:** https://nextjs.org/blog/security-update-2025-12-11
A comprehensive security update released December 11, 2025, addressed multiple CVEs simultaneously. All Next.js users were advised to upgrade to latest patch versions in their release line immediately.

---

## Finding 8 — drizzle-orm: No Direct CVEs Found

**Status:** No direct CVEs against `drizzle-orm` itself found in 2025.

### Transitive dependency issues
- **CVE-2024-24790** in `esbuild` (transitive via `drizzle-kit`) — flagged by vuln scanners
- **GHSA-67mh-4wv8-2f99** in `esbuild` (moderate severity) — fixed by using esbuild ≥0.25.0
- `@esbuild-kit/esm-loader` is deprecated; drizzle-kit still depends on it

**Solvio:** `drizzle-kit: ^0.31.9` — check if esbuild ≥0.25.0 is resolved transitively.

**Note:** These are build-time (dev) vulnerabilities only — `drizzle-kit` is not part of the production bundle. Runtime `drizzle-orm` has no known direct CVEs.

### References
- https://security.snyk.io/package/npm/drizzle-orm
- https://github.com/drizzle-team/drizzle-orm/issues/4861

---

## Finding 9 — OpenAI Node.js SDK: No CVEs Found

**Current version in Solvio:** `openai: ^6.8.1`
No CVEs found for the openai npm package in 2025. No security advisories in the GitHub releases.

### Best practices to verify
1. **API key must only be used server-side** — never expose in client components or `NEXT_PUBLIC_*` env vars.
2. The SDK flag `dangerouslyAllowBrowser: true` must NOT be set (exposes key in client bundle).
3. If using webhooks from OpenAI: use `client.webhooks.unwrap()` to verify signatures.
4. Classic tokens revoked industry-wide; granular tokens now limited to 90 days + require 2FA.

### References
- https://github.com/openai/openai-node
- https://developers.openai.com/apps-sdk/guides/security-privacy

---

## Finding 10 — Vercel Serverless Security Best Practices

### Applicable to Solvio

| Practice | Status to verify |
|---|---|
| Environment variables never in repo | Must confirm `.env.local` is gitignored |
| Separate secrets for dev/preview/production | Check Vercel dashboard env var config |
| Security headers (CSP, HSTS, X-Frame-Options) | Not seen in `next.config.ts` — likely missing |
| Preview deployments protected | Default is public — check Vercel project settings |
| Rate limiting on API routes | Not implemented — all API routes are unprotected from brute force |
| WAF / custom firewall rules | Available on Pro plan — not configured |
| Static IPs / Secure Compute for DB | Neon DB accessed without IP allowlist currently |

### Headers likely missing from Solvio
Based on CLAUDE.md, no security headers are configured in `next.config.ts` or `vercel.json`. The following should be added:
- `Content-Security-Policy`
- `Strict-Transport-Security`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`

### References
- https://vercel.com/docs/security
- https://vibeappscanner.com/best-practices/vercel
- https://vercel.com/blog/vercel-security

---

## Summary: Priority Issues for Solvio

| # | CVE | Severity | Package | Action Required |
|---|---|---|---|---|
| 1 | CVE-2025-55182 | CRITICAL (10.0) | react ^19.0.0 | Pin to ≥19.x.4 in installed minor |
| 2 | CVE-2025-55184 / CVE-2025-67779 | HIGH (7.5+) | react ^19.0.0 | Same fix as above |
| 3 | CVE-2025-55183 | MEDIUM | react ^19.0.0 | Same fix as above |
| 4 | CVE-2026-23864 | HIGH (7.5) | react ^19.0.0 | Same fix as above |
| 5 | CVE-2025-66478 | CRITICAL | next ^15.5.9 | Verify resolved version ≥15.5.7 |
| 6 | CVE-2025-29927 | CRITICAL (9.1) | next (middleware bypass) | Verify resolved version ≥15.2.3 — likely OK |
| 7 | GHSA-67mh-4wv8-2f99 | MEDIUM | drizzle-kit esbuild (dev only) | Low priority, dev-only |
| 8 | Missing security headers | MEDIUM | next.config.ts / vercel.json | Add CSP, HSTS, X-Frame-Options etc. |
| 9 | Preview deployments public | LOW-MEDIUM | Vercel project settings | Enable deployment protection |
| 10 | No API rate limiting | MEDIUM | All /api/* routes | Add rate limiting middleware |

### Immediate action (Phase 2)
1. Run `npm list react next` to confirm actual resolved versions vs patched thresholds.
2. If `react` < 19.x.4 or `next` < 15.5.7: bump version constraints in `package.json`.
3. Add security response headers to `next.config.ts`.
4. Audit middleware.ts to ensure it cannot be bypassed (defense-in-depth beyond CVE-2025-29927).
5. Consider adding rate limiting to `/api/auth/*` and AI endpoints.
