# @bernouy/ulvia-provider-server

Production runtime for the official Ulvia Provider.

- Read and validate Provider environment configuration here.
- Compose only the persistence and provider-management adapters required by
  the official contracts. Never depend on the Edge runtime or a shared
  aggregate instance runtime.
- Load exact admitted contract bindings before mounting the Provider and import
  the pinned official profile into each instance during provisioning. Bundled
  admitted snapshots must suffice without a reachable remote Repository; missing
  bundled resources fail rather than silently fetching replacements.
- Enable `ulvia/repository` only for its explicit instance profile. Registry
  ownership uses ordinary CMS accounts and PATs, never a parallel signing-key
  authority. Bootstrap installation is not public catalogue publication and
  must not replace the configured Repository connection.
- Give each secret-consuming contract implementation its own least-privilege
  `cms-secrets` namespace adapter. Only bootstrap credentials required to open
  those namespaces may use the runtime's encrypted root secret store directly.
- Mount only the `@bernouy/ulvia-provider` surface; never mount or start the
  CMS Edge.
- Never log Provider tokens or instance secrets.

- Run Bun with `--no-macros`; startup must fail without this flag because remote
  authored sources pass through the shared compiler. This is not an OS sandbox.
- Keep the Repository publication PAT in the authoring contract's encrypted secret
  namespace. Pin its origin and Repository identity; never generate credentials
  implicitly or forward a PAT across origins or redirects.

- Bind observability stores to the authenticated instance during composition. Keep host-wide diagnostics operator-owned, and suppress receiver self-collection. Local direct ingestion must use the same feature service as the contract adapter.
