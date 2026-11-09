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
- Keep public origins and Repository identity/PAT bindings unchanged when choosing
  a private transport. `ULVIA_HOSTING_PROXY_URL` optionally names an operator-owned
  private HTTP pool. Before each hosted request, read the exact domain and ready
  instance; known inactive or mismatched origins refuse without external fallback.
  Preserve Host from the registered origin, never caller headers. Bound 64 active
  response streams and retain capacity until EOF/cancel/abort. The shared CLI uses
  Caddy's unpublished internal port 8080, which proxies without public HTTPS
  redirects. All traffic still uses admitted bindings and scoped credentials.
  Never forward a publication PAT across logical origins or follow redirects.
- Give each secret-consuming contract implementation its own least-privilege
  `secrets` namespace adapter. Only bootstrap credentials required to open
  those namespaces may use the runtime's encrypted root secret store directly.
- Mount only the `@bernouy/ulvia-provider` surface; never mount or start the
  CMS Edge.
- Never log Provider tokens or instance secrets.

- Stream startup instance and retained-transition metadata through indexed cursors
  with batches of at most 50 and close them on refusal or early exit. Validate exact
  pins without hydrating idle tenants. Probe operation recovery with one projected
  identifier, including unexpired running work; only pending instances open their
  runtime. Documentation preparation is lazy and keeps its bounded queue.
- Require explicit valid Repository settings in every persisted instance. Missing
  or malformed configuration must refuse before reads or writes can repair it.

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

- Startup composes `@bernouy/hosting`, reserves/provisions Control and mounts its
  management services before accepting requests. `ULVIA_CONTROL_ORIGIN` is an
  explicit canonical origin. `ULVIA_CONTROL_BOOTSTRAP_FILE` names a bounded JSON
  file containing exactly `email` and `password`, supplied by the operator for
  initial provisioning; ready restarts do not read it or reset the administrator.
  `ULVIA_HOSTING_MANAGED_SUFFIXES` is an optional bounded JSON array of operator-
  owned DNS suffixes. Localhost domains are admitted only on local deployments.
- The installation phase is distinct from instance readiness and domain/TLS
  readiness. Missing hosting state on a populated database refuses startup.
  Resolve signed Provider subject aliases through the current instance Gateway
  before reading administrator grants; subject strings are not CMS account IDs.
- The ordinary system plan excludes Hosting and Registry. The explicit Control
  plan adds Hosting, without collections, Pages or named application profiles.
  Protect an enabled exact Hosting selection from removal or redirection.

- `ULVIA_EDGE_ROUTING_SECRET` authenticates only the admitted host routing machine
  contract. Derive control-lease signing separately from Provider-owned key
  material. Recheck domain/instance state before accepting an Edge lease for a
  report or Installations broker call; never substitute an instance from headers.
  The technical routing account is not a CMS tenant and grants no user identity.
  Resolve its resource revision from the exact ready instance's database using
  four bounded indexed metadata reads; do not hydrate a CMS runtime or list
  tenants. Fence exposed Files mutations and asynchronous derivative publication
  alongside Content, collections and selections so every Edge sees completion.

- Creation provenance is mandatory persisted state. The provisioning authorizer
  resolves the original Control actor through the same current Hosting authority,
  including on recovery and completed retries. Compose this callback before
  recovery; its lazy access to hosting ports fails closed before composition.
  Operator bootstrap provenance comes only from internal authenticated entry
  points, never the tenant input DTO. Do not backfill missing provenance.

- Mount the exact admitted TLS permission GET in its isolated anonymous hosting
  runtime; caller headers never supply identity. CMS plans exclude both TLS and
  Routing. Configure `ULVIA_TLS_ENTRYPOINTS` (at most eight host/port objects),
  `ULVIA_TLS_PUBLIC_ADDRESSES` (at most 32 addresses) and optional absolute
  `ULVIA_TLS_TRUST_FILE` (bounded PEM). HTTPS Control requires explicit nodes
  and explicit non-local DNS address configuration. An explicit empty address
  array allows DNS-pending bootstrap but denies permission until configured.
  DNS must resolve entirely to this installation.
- Start TLS reconciliation only after the permission listener is accepting
  requests. Abort/drain it before listener shutdown, but still clean up other
  resources if it fails. Probes connect only to configured private entrypoints;
  tenant domains supply SNI, never a socket destination. Keep TLS chain/hostname
  validation enabled. Certificate readiness is separate from backend health.
