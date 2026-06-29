# @bernouy/cms-analytics

Feature package for privacy-first server-side analytics.

## Boundaries

- Root export exposes event/store contracts, in-memory store, validation, page
  view event building, and dashboard HTTP handlers.
- `@bernouy/cms-analytics/mongo` exposes `MongoAnalyticsStore` for composition
  roots.
- Keep raw request handling in surfaces or HTTP helpers. Core analytics logic
  should operate on typed event/store inputs.

## Rules

- Do not store direct personal identifiers. Visitor IDs are derived and salted.
- Preserve bucket/counter semantics when changing write paths; dashboards read
  from counters-at-write data.
- HTTP handlers are mounted by surfaces behind the appropriate guard.
- Mongo adapter changes need tests for initialization and aggregate reads.
