# @bernouy/auth

Provider-owned authentication primitives for local credentials, personal access
tokens, persistent sessions, public account flows, and membership persistence.

## Public API

- `@bernouy/auth` exposes adapter-light contracts, in-memory implementations,
  session-token handling, credential resolution and account-flow composition.
- `/feature` exposes `accessFeature`, its service and governance ports, and schema-derived public DTOs.
- `/oauth` exposes delegated MCP authorization and its ports.
- `/management` contains administration operations.
- `/mongo` contains composition-root persistence adapters.

Delivery transports belong to `@bernouy/email`. Authentication only
composes account-specific messages and sends them through the Emailer port.

`application/feature.ts` authors `ulvia/cms.access`: actor inspection, sessions,
account flows, membership administration, self-service PATs and delegated MCP
exchanges. Its `schemas/`, grouped `capabilities/`, and package `docs/` compile
into the existing immutable release. Capabilities own default execution and a
feature error classifier; Provider surfaces select that implementation and inject
`AccessServices`, including the separate `AccessGovernance` port. The package
starts no HTTP listener and chooses no production adapters.

The admitted Provider path validates wire inputs/outputs and session effects.
The browser-facing Edge applies those validated effects to its cookies. Local
SDK JSON execution deliberately refuses session capabilities before calling
services. OAuth protocol refusals retain their successful `resultJson` envelope;
unexpected exceptions remain private.

Authorization policy is deliberately outside this package. Never log credentials,
session material, PATs, or one-time tokens.

See the [workspace package map](../../../docs/architecture/packages.md). Licensed
under the repository [MIT License](../../../LICENSE).
