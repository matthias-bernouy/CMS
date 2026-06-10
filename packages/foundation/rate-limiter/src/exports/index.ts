/**
 * @bernouy/rate-limiter — fixed-window rate limiting.
 *
 * Root export = the `RateLimiter` contract + the in-memory implementation.
 * The Mongo-backed counter lives under `@bernouy/rate-limiter/mongo` for
 * composition roots that need cross-instance counting.
 */

export type { RateLimiter, RateLimitResult, RateLimitPolicy } from "rate-limiter/interfaces/RateLimiter";
export { InMemoryRateLimiter } from "rate-limiter/default-implementation/InMemoryRateLimiter";
