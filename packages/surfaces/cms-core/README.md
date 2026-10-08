# @bernouy/cms-core

Provider-facing surface for the official `ulvia.cms.*` contracts. It publishes
the authenticated runtime report and serves the exact HTTP bindings declared by
admitted contract releases.

## Public API

- `@bernouy/cms-core` exposes the surface, dispatch registry, operation executor,
  and injected dependency contracts.
- `/capabilities` exposes registration helpers for official capability adapters.

The surface maps transport to feature operations. It does not select persistence,
read environment configuration, start listeners, or bypass the normal gateway
used by Control and Delivery.

See the [workspace package map](../../../docs/architecture/packages.md). Licensed
under the repository [MIT License](../../../LICENSE).
