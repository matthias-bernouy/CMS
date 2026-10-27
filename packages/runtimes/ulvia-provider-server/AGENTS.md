# @bernouy/ulvia-provider-server

Production runtime for the official Ulvia Provider.

- Read and validate Provider environment configuration here.
- Compose only the persistence and provider-management adapters required by
  the official contracts. Never depend on the Kernel runtime or a shared
  aggregate instance runtime.
- Load exact admitted contract bindings before mounting the Provider and import
  the pinned official profile into each instance during provisioning.
- Give each secret-consuming contract implementation its own least-privilege
  `cms-secrets` namespace adapter. Only bootstrap credentials required to open
  those namespaces may use the runtime's encrypted root secret store directly.
- Mount only the `@bernouy/ulvia-provider` surface; never mount or start the
  CMS Kernel.
- Never log Provider tokens or instance secrets.

- Run Bun with `--no-macros`; startup must fail without this flag because remote
  authored sources pass through the shared compiler. This is not an OS sandbox.
- Keep the Repository publisher key in its dedicated encrypted secret namespace,
  pin its Repository identity and never regenerate a missing persisted key.

- Bind observability stores to the authenticated instance during composition. Keep host-wide diagnostics operator-owned, and suppress receiver self-collection. Local direct ingestion must use the same feature service as the contract adapter.
