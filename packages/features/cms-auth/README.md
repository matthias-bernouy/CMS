# @bernouy/cms-auth

CMS-owned authentication for local credentials, OIDC, personal access tokens,
signed sessions, public account flows, and membership persistence.

## Public API

- `@bernouy/cms-auth` exposes adapter-light contracts, in-memory implementations,
  session handling, and authentication assembly.
- `/management` contains administration operations; `/http` contains route
  handlers and registrars.
- `/mongo` and `/smtp` are composition-root adapters.
- `/browser` contains browser-safe helpers only.

Authorization policy is deliberately outside this package. Never log credentials,
session material, PATs, or one-time tokens.

See the [workspace package map](../../../docs/architecture/packages.md). Licensed
under the repository [MIT License](../../../LICENSE).
