# @bernouy/ulvia-provider

Provider-facing surface for the official `ulvia.cms.*` contracts. It publishes
the authenticated runtime report and serves the exact HTTP bindings declared by
admitted contract releases.

## Public API

- `@bernouy/ulvia-provider` exposes the surface, dispatch registry, operation executor,
  and injected dependency contracts.
- `/capabilities` exposes registration helpers for official capability adapters.
- `/sdk/node` exposes the connection capability registrar and `createConnectedProviderLogger`; the runtime injects the client and storage.

The surface maps transport to injected feature operations, including the
official Access capabilities. Login and logout may return a typed semantic
session effect; they never set a browser cookie directly. It does not select
persistence, read environment configuration, start listeners, or bypass the
normal gateway used by the site Kernel.

See the [workspace package map](../../../docs/architecture/packages.md). Licensed
under the repository [MIT License](../../../LICENSE).
