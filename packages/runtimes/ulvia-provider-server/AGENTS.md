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
- Default `ulvia@1.4.0` and `repository@1.4.0` initialization installs system APIs
  and an administrator only. Never enumerate optional collection sources, create
  Pages or publish the public catalogue during profile provisioning. Persist the
  explicit initialization marker only for a newly provisioned supporting profile.
  Native site setup then runs through admitted Gateway capabilities; never infer
  pending state from zero Pages or backfill ready instances. Production image
  generation uses `--core-only`; exact `1.0.0` starters require explicit resources.
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

- `HostPreparationPool` is the single bounded CPU worker shared by host instances.
  Resource archive verification and disposable ordinary Page previews use its
  `resources` ports; no live persistence, authorization or authored code execution
  belongs in the worker. Keep cancellation, timeout, retained-byte/count bounds and
  shutdown draining across both resource jobs and remaining collection callers.
- Preparation snapshots selected execution and system settings before awaits.
  Observe disk-backed ZIP bytes under a limit before worker transport; do not
  trust file stat or allocate an unbounded arrayBuffer. Completed initialization
  replay must remain independent of both the source ZIP and preparation worker.

- Core 1.4 selects `ulvia/cms.resources@1.0.0` from generated manifest 1.3.
  Explicit provisioning creates the scoped Resource initialization marker. Ready
  reads never backfill it. The host injects current administrator aliases/grants,
  maintenance intents, Mongo entities, private local archive retention and the
  existing preparation pool; no second worker or installed ZIP catalogue.
- Base inputs are image-owned `resources/<profile>/<locale>.zip` files with an
  exact `.zip.sha256` sidecar under the bootstrap root. Missing files refuse base
  setup, while empty setup and completed replay remain independent of them.
  Private instance storage is owned by one host process. Retention compositions
  share a writer guard; two 64-MiB archives plus one atomic-write temporary are
  the filesystem budget. Do not mount that private root on competing hosts.

- Public Content resolves ordinary resource metadata and streams instance-owned
  files without reopening base ZIPs. SVG expansion has a separate 64-entry cache
  and at most eight distinct pending loads per instance cache, with 64-KiB bodies.
  Public capability SVG cache keys include the selected execution revision; static
  resource URLs pin immutable digests. Scope and cache lifetime remain instance-local.
  The explicit collection fallback is temporary until published API retirement.
