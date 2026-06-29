# @bernouy/rate-limiter

Foundation fixed-window rate limiter. It must stay CMS-agnostic.

## Boundaries

- Root export exposes the `RateLimiter` contract and in-memory implementation.
- `@bernouy/rate-limiter/mongo` exposes `MongoRateLimiter` for composition
  roots that need cross-instance counting.
- Do not import CMS packages here.

## Rules

- Keep policy shape stable: `limit`, `windowSeconds`, result metadata, and retry
  information are consumed by auth flows.
- Mongo behavior should be atomic across concurrent requests.
- Tests for timing-sensitive behavior should use deterministic clocks or wide
  enough assertions to avoid flakiness.
