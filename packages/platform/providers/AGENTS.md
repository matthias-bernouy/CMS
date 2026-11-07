# @bernouy/ulvia-providers

Platform models and validation for Ulvia Providers and selected exact releases.

- Depend only on Platform and Foundation, never business features or runtimes.
- Preserve exact manifest claims, ownership, endpoints and delegation boundaries.
- Reports are observations; they never approve a manifest or grant authority.
- Readiness derives from approved status, exact releases and fresh observations.
- Read ports do not expose approval, revocation, publication or selection replacement.
- Administrative workflows, mutation stores, discovery clients and persistence
  adapters remain in `@bernouy/cms-repository`.
- Selection validation never chooses versions or installations, changes grants,
  writes state or proves runtime readiness.
- Keep common state errors and parsing bounds stable during extraction.
