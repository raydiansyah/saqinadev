# Performance and scalability

## Budgets (Planned: measured in CI on every preview)

| Metric | Budget |
|---|---|
| Largest Contentful Paint | < 2.5 s |
| Cumulative Layout Shift | < 0.1 |
| Interaction to Next Paint | < 200 ms |
| Lighthouse (key pages) | ≥ 90 Performance, Accessibility, Best Practices, SEO |
| API/route p95 | < 500 ms for reads, < 1 s for writes (excluding AI calls) |

A change that breaks a budget is fixed or the budget change is argued in an ADR; it is not waved through.
Key pages: landing, `/services`, sign-in, dashboard, project overview, requirements, tasks, memory.

## Database

- **Index every column you filter or sort on in a frequent query** (compound indexes in the order the
  query uses them, as in `ai_services_public_idx`). State why in the migration if you do not.
- **No N+1**: never query inside a loop over rows. Join, `IN (…)`, batch, or aggregate. Select only the
  columns a screen needs (the portal read models are the pattern).
- Paginate lists (`limit` + `offset`/cursor); cap unbounded reads (`limit(200)`).
- Profile new queries against realistic volume (thousands of projects, tens of thousands of tasks)
  with `EXPLAIN (ANALYZE, BUFFERS)` before merging a Red or Yellow change.
- Transactions are short; do not call a model or an external API inside one.

## Caching

- Start without a cache. When a read is measurably expensive, cache it keyed by what invalidates it:
  `projects.contextRevision` for project context, a content hash for documents.
- Use Postgres tables and Next's cache primitives first; add Redis only when a metric shows the need
  (record it in an ADR).
- Never cache anything per-user in a shared key; never cache authorization decisions.

## Frontend

- Server components by default; a client component only for interaction. Keep client bundles small:
  no heavy library for a small job (the graph view is hand-drawn SVG for that reason).
- `next/image` with explicit sizes, lazy loading, modern formats. Fonts through `next/font`.
- Defer non-critical work (`after()`), stream slow parts behind `Suspense` with a skeleton.

## Scalability

- Stateless request handling; shared state in Postgres (rate limits, locks, outbox), so more instances
  need no coordination. Long work runs in cron or `after()` jobs with a dirty flag and a lock.
- Hosting auto-scales (Vercel); the database connection use is bounded per request. Watch Neon
  connection and compute metrics in [observability.md](observability.md).
