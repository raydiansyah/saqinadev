# Public-Surface Caching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cache the public marketing/legal surface at the CDN so most public requests never reach the Vercel origin, cutting Fast Origin Transfer and Fluid Active CPU, while keeping every authenticated and agentic route fully dynamic.

**Architecture:** Switch the two public DB-backed catalog pages from `force-dynamic` to hourly ISR, send a `public, s-maxage, stale-while-revalidate` header for public paths only via `next.config.ts`, and harden the private route groups `(app)` and `(portal)` with `force-dynamic` so agentic/project state can never be prerendered or shared-cached.

**Tech Stack:** Next.js 16 App Router, next-intl, Vercel, Cloudflare (free) in front.

## Global Constraints

- Revalidate window for the service catalog: exactly `3600` seconds (1 hour). (Copied verbatim from the design decision.)
- Shared/public caching is allowed ONLY for routes whose content is identical for all visitors and session-independent: `/[locale]` landing, `/[locale]/themes`, `/[locale]/services`, `/[locale]/services/[slug]`, `/[locale]/privacy`, `/[locale]/terms`, and `sitemap`/`robots`/`manifest`.
- These routes MUST never receive a public cache header and MUST stay dynamic/`no-store`: `(auth)/*`, `(app)/dashboard/*`, `(app)/project/[slug]/*` (studio, agents, assistant, tasks, plan, prd, memory, and all descendants — live per-tenant AI agentic orchestrator state), `(portal)/portal/*`, and `/api/*`.
- Do not modify any API route. Do not add on-demand revalidation. Do not refactor unrelated code.
- Verify with `pnpm typecheck` and `pnpm build`; read the build render-mode table to confirm the classification.

---

## File Structure

- Modify: `src/app/[locale]/(marketing)/services/page.tsx` — swap `force-dynamic` for `revalidate = 3600`.
- Modify: `src/app/[locale]/(marketing)/services/[slug]/page.tsx` — swap `force-dynamic` for `revalidate = 3600`.
- Modify: `next.config.ts` — add public `Cache-Control` header rules scoped to public paths, keeping the existing security headers intact.
- Modify: `src/app/[locale]/(app)/layout.tsx` — add `export const dynamic = "force-dynamic"` safety net.
- Modify: `src/app/[locale]/(portal)/layout.tsx` — add `export const dynamic = "force-dynamic"` safety net.
- Modify: `docs/runbook.md` — add Cloudflare cache-rule guidance.

---

## Task 1: Cache the service catalog pages (ISR 1 hour)

**Files:**
- Modify: `src/app/[locale]/(marketing)/services/page.tsx`
- Modify: `src/app/[locale]/(marketing)/services/[slug]/page.tsx`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: both pages render as ISR with a 3600s revalidate window; the `Cache-Control` header in Task 2 relies on these paths being cacheable.

- [ ] **Step 1: Replace the dynamic directive in the list page**

In `src/app/[locale]/(marketing)/services/page.tsx`, replace:

```ts
// The catalog is read per request so published changes show up immediately.
export const dynamic = "force-dynamic";
```

with:

```ts
// The catalog is cached and rebuilt hourly; a published change shows up within the hour.
export const revalidate = 3600;
```

- [ ] **Step 2: Replace the dynamic directive in the detail page**

In `src/app/[locale]/(marketing)/services/[slug]/page.tsx`, replace:

```ts
export const dynamic = "force-dynamic";
```

with:

```ts
// Cached and rebuilt hourly per slug; a published change shows up within the hour.
export const revalidate = 3600;
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS, no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/(marketing)/services/page.tsx" "src/app/[locale]/(marketing)/services/[slug]/page.tsx"
git commit -m "perf: cache service catalog pages with hourly ISR instead of force-dynamic"
```

---

## Task 2: Send a public Cache-Control header for public paths only

**Files:**
- Modify: `next.config.ts`

**Interfaces:**
- Consumes: Task 1's pages are now cacheable, so the header on `/services` paths is honored instead of fighting `force-dynamic`.
- Produces: public routes carry `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`; private routes are untouched and keep only the existing security headers.

The current `headers()` returns one entry for `/:path*` with security headers. Add public cache headers as ADDITIONAL, path-scoped entries. Next.js applies every matching `headers()` entry, so the security headers still apply to all paths; the cache entries apply only to the listed public paths. Private paths match none of the cache entries, so they never receive a public cache header.

- [ ] **Step 1: Add a shared cache-header constant and public source rules**

In `next.config.ts`, replace the whole `async headers()` block:

```ts
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders(process.env.NODE_ENV !== "production") }];
  },
```

with:

```ts
  async headers() {
    // Public, session-independent pages: let Cloudflare and Vercel's CDN hold them.
    // s-maxage governs the shared cache; stale-while-revalidate serves a stale copy for a day
    // while a fresh one is fetched in the background. Browsers get no private max-age on purpose.
    const publicCache = [
      { key: "Cache-Control", value: "public, s-maxage=3600, stale-while-revalidate=86400" },
    ];
    // Locale-prefixed public pages. The matcher is explicit so no private path can ever match:
    // dashboard, project, portal, auth, invite and /api are absent by construction.
    const publicSources = [
      "/:locale(en|id)",
      "/:locale(en|id)/themes",
      "/:locale(en|id)/services",
      "/:locale(en|id)/services/:slug*",
      "/:locale(en|id)/privacy",
      "/:locale(en|id)/terms",
    ];
    return [
      { source: "/:path*", headers: securityHeaders(process.env.NODE_ENV !== "production") },
      ...publicSources.map((source) => ({ source, headers: publicCache })),
    ];
  },
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS, no errors.

- [ ] **Step 3: Build and read the route table**

Run: `pnpm build`
Expected: build succeeds. In the route table, `/[locale]/services` and `/[locale]/services/[slug]` are no longer marked as dynamic (ƒ); they show as ISR/revalidate or static. `dashboard`, `project`, and `portal` routes remain dynamic (ƒ).

- [ ] **Step 4: Commit**

```bash
git add next.config.ts
git commit -m "perf: send public Cache-Control for marketing and legal paths only"
```

---

## Task 3: Harden private route groups against caching

**Files:**
- Modify: `src/app/[locale]/(app)/layout.tsx`
- Modify: `src/app/[locale]/(portal)/layout.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: every route under `(app)` (dashboard, project, studio, agents, assistant, etc.) and `(portal)` is forced dynamic, so no future default change can prerender or shared-cache per-tenant agentic state.

- [ ] **Step 1: Force the app group dynamic**

In `src/app/[locale]/(app)/layout.tsx`, add after the imports and before the component (keep the existing doc comment and component unchanged):

```ts
// Every app route is per-user and reads live, per-tenant agentic state (dashboard, project,
// studio, agents, assistant). It must never be prerendered or held in a shared cache.
export const dynamic = "force-dynamic";
```

- [ ] **Step 2: Force the portal group dynamic**

In `src/app/[locale]/(portal)/layout.tsx`, add after the imports and before the component:

```ts
// The client portal is per-client data behind a validated session; never cache it.
export const dynamic = "force-dynamic";
```

- [ ] **Step 3: Build and confirm private routes stay dynamic**

Run: `pnpm build`
Expected: build succeeds; `(app)` and `(portal)` routes are marked dynamic (ƒ) in the route table.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/(app)/layout.tsx" "src/app/[locale]/(portal)/layout.tsx"
git commit -m "perf: force app and portal route groups dynamic so agentic state is never cached"
```

---

## Task 4: Document Cloudflare free cache configuration

**Files:**
- Modify: `docs/runbook.md`

**Interfaces:**
- Consumes: the public `Cache-Control` header from Task 2.
- Produces: operator steps so Cloudflare free actually holds the public HTML.

- [ ] **Step 1: Append a Cloudflare caching section to the runbook**

Append to `docs/runbook.md`:

```markdown
## Cloudflare (free) caching for public pages

Cloudflare free does not cache HTML by default; it must be told to, and it must respect the
origin's `Cache-Control`. The app sends `public, s-maxage=3600, stale-while-revalidate=86400`
on the public marketing and legal paths (see `next.config.ts`).

1. In the Cloudflare dashboard, add a Cache Rule matching the public paths
   (`/en`, `/id`, `/*/services*`, `/*/themes`, `/*/privacy`, `/*/terms`):
   set "Cache eligibility" to "Eligible for cache" and enable "Respect origin Cache-Control".
2. Do NOT add a cache rule for `/*/dashboard*`, `/*/project*`, `/*/portal*`, `/*/sign-in*`,
   `/*/sign-up*`, `/*/invite*`, or `/api/*`. These stay uncached.
3. Confirm the session cookie is not present on public requests (it triggers a cache bypass).
   Marketing and legal pages do not set or require it.

Verify after deploy: a second request to a public page returns `cf-cache-status: HIT`. Watch the
Fast Origin Transfer and Fluid Active CPU graphs in Vercel over a few days.
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbook.md
git commit -m "docs: Cloudflare free cache rules for public pages"
```

---

## Self-Review

- **Spec coverage:** Change 1 → Task 1; Change 2 (header) → Task 2; Change 3 (private safety net) → Task 3; Change 4 (Cloudflare doc) → Task 4. Classification table enforced by Global Constraints + Task 2/3 matchers. Verification section → Task 2/3 build steps. All covered.
- **Placeholder scan:** No TBD/TODO; every code step shows exact content.
- **Type consistency:** No cross-task type names; changes are config directives and a static header array. Matchers in Task 2 use Next.js named-param syntax `:locale(en|id)` consistent with the app's two locales.
