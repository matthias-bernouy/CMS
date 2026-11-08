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
- Load one admitted SDK system snapshot lazily for provisioning. Persist exact plans
  for unfinished transitions; ready/disabled instances reopen approved execution.
  Missing installation resources refuse without remote fallback or data repair.
- New instances receive system APIs, an administrator and an explicit pending
  initialization marker, with no collections, Pages or public catalogue publication.
  Native setup uses ordinary Access and admitted Installations capabilities.
- Repository settings are per instance. No named profiles, global Repository URL
  environment variable or CLI profile catalogue exists. The three setup choices
  are a custom address, the official Repository and a new Registry on this instance.
  Enable Registry through its actual installed/selected contract, never by URL.
  Registry creation uses the already approved manifest and its exact Registry pin,
  including after image replacement. Resolve recovery plans from stored admissions,
  never the current image's bootstrap. The instance transition is the sole durable
  creation owner; commit the self-origin URL only on success. Recheck the current
  local administrator grant during recovery.
- Keep public self-origin settings distinct from the known private Edge transport.
  Never forward a publication PAT across origins or relax redirect refusal.
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
