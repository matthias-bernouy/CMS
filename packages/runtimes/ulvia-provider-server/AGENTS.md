# @bernouy/ulvia-provider-server

Production runtime for the official Ulvia Provider.

- Read and validate Provider environment configuration here.
- Compose only the persistence and provider-management adapters required by
  the official contracts. Never depend on the Edge runtime or a shared
  aggregate instance runtime.
- Reopen ready instances from their approved persisted manifests, observations,
  selections and exact admitted contracts. Check every release against the
  build's explicit implementation support matrix; persistence or SemVer alone
  never grants executable support. Compile HTTP bindings per authenticated instance.
- Load bundled installation profiles lazily for provisioning and unfinished
  transitions. A ready or disabled instance must not require its original recipe
  or bundled collection resources. Missing installation resources refuse a new
  installation rather than silently fetching replacements.
- Enable `ulvia/repository` only for its explicit instance profile. Registry
  ownership uses ordinary CMS accounts and PATs, never a parallel signing-key
  authority. Bootstrap installation is not public catalogue publication and
  must not replace the configured Repository connection.
- Give each secret-consuming contract implementation its own least-privilege
  `secrets` namespace adapter. Only bootstrap credentials required to open
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

- SDK implementations attach the surface's shipped runtime artifact; never compile
  authored Zod definitions or read feature Markdown/fixture directories at startup.
  The artifact is code-owned execution evidence, independent of installation kits.
  Installed releases must still match exact approved pins and build support.
- Durable Secrets creation/rotation persist hashes and metadata outcomes only.
  Recheck namespace credentials before receipt access; revoked/expired/foreign keys
  cannot reuse a completed receipt. Never persist secret values or namespace keys.
