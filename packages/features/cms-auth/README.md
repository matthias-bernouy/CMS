# @bernouy/cms-auth

Provider-owned authentication primitives for local credentials, personal access
tokens, signed sessions, public account flows, and membership persistence.

## Public API

- `@bernouy/cms-auth` exposes adapter-light contracts, in-memory implementations,
  session-token handling, credential resolution and account-flow composition.
- `/management` contains administration operations.
- `/mongo` and `/smtp` are composition-root adapters.

The package exposes no HTTP routes. Provider surfaces map its operations to an
admitted access contract; the browser-facing Kernel only applies validated
semantic session effects.

Authorization policy is deliberately outside this package. Never log credentials,
session material, PATs, or one-time tokens.

See the [workspace package map](../../../docs/architecture/packages.md). Licensed
under the repository [MIT License](../../../LICENSE).
