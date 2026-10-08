# @bernouy/rate-limiter

CMS-agnostic fixed-window rate limiting behind a substitutable `RateLimiter`
contract.

The root entrypoint includes the contract and in-memory implementation. `/mongo`
provides atomic cross-instance counting for composition roots. Keys are defined
by callers, while the shared policy shape remains `limit` plus `windowSeconds`.

See the [workspace package map](../../../docs/architecture/packages.md). Licensed
under the repository [MIT License](../../../LICENSE).
