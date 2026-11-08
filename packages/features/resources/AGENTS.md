# @bernouy/resources

CMS resource ZIP validation and one-time copy into ordinary content. This package
must never grow an installed release catalogue, version selection, dependency
resolution, upgrades, uninstallation or remote publication mechanism.

- A ZIP digest identifies the exact bytes reviewed for an import; it is not an
  installed product coordinate. Completed rendering must not need the archive.
- Codec and manifest validation do no business writes and execute no browser code.
  Root definitions do no filesystem scanning or environment reads.
- Reuse ordinary Content artifacts, theme validation and Page writes. Keep complete
  Bloc semantics, styles, slots, defaults, browser authority and source bundles.
- Static asset bytes and texts are ordinary resource entities after import. Do not
  keep a CollectionStore or replace it with a renamed archive-installation view.
- Hosts own authorization, per-instance storage, durable intents, queue workers,
  maintenance fencing and leases. Fresh actor/scope authority precedes receipt
  access, replay and recovery. Preview and exact reviewed evidence precede writes.
- Snapshot mutable input before awaits. Bound archive, entry, metadata, resource
  and aggregate bytes/counts. Reject ambiguous paths and missing/extra asset files.
- Preserve existing protocol semantics, including UTF-16 string lengths. Public DTOs
  derive from schemas; internal Content and persistence models remain distinct.

- `artifacts/` owns ZIP/manifest/reference/style validation. `storage/` owns ordinary
  resource assets and text records; optional adapters are explicit published subpaths.
- Metadata adapters are scope-bound. Mongo queries must retain the scope predicate,
  asset batches stay within 512 references, and text snapshots refuse above 32 sources.
- Persisted entity/text protocol fields and revisions are mandatory. Never infer or
  backfill missing records. Exact asset retries refuse missing or inconsistent bytes.
- Text defaults occupy at most 256 KiB per namespace; defaults plus site overrides
  occupy at most 512 KiB. Host initialization serializes creation under its write fence.

- `initialization/` owns one-time review/copy semantics. The host supplies the
  maintenance fence, durable intents, retained ZIP, verifier, disposable preview,
  current execution and worker guard. Do not choose adapters or create queues here.
- Capture the public review before awaits. Authorize before intent/receipt reads
  and again in recovered execution. Browser risk acknowledgement covers its digest.
- Explicit provisioning creates initialization state. Missing state must fail.
  Persist monotonic checkpoints using scoped compare-and-swap; never repair a
  missing completed resource or replace reviewed evidence during recovery.
- Candidate validation must exercise ordinary Page writes before the append-only
  raw Bloc copy port is used. Complete the ordinary entity copy before removing
  retained ZIP bytes; rendering must not depend on those bytes.

- `./feature` defines `ulvia/cms.resources` through the SDK. Keep its public Zod DTOs,
  bindings, docs and default execution in `application/`; never import Repository
  or a surface. Contract artifacts are generated projections of this one feature.
- The public entry may read the minimal site activity marker, not a durable
  operation payload/receipt. Administrator APIs require a verified human alias,
  current site grant and matching instance/site invocation before private reads.
- Default initialization apply is a host-owned durable operation. Its authorize
  hook runs before receipts/replay; the service independently reauthorizes copies.

- `./build` is explicit authoring tooling, never a runtime startup import. It reads
  ordinary `ulvia-resource-source/v1` folders and composes explicit source snapshots;
  never import collection admission, stores, installation or publication here.
- Require `bun --no-macros` before compiling authored TypeScript. Validate fixed and
  default markup, all retained examples, CSS ownership, state reads/writes/scopes,
  cycles, casts/fallbacks and synchronized producer schema compatibility. Preserve
  exact capability-output references and UTF-16 bounds. Compilation calls no services.
- Source snapshots own immutable asset Blobs. Bound files, bytes, tree entries/depth,
  roots and runtime imports. Build-only source translation keys do not define runtime
  IDs. The CLI owns profile composition and the bounded one-process official ZIP cache.

- `./delivery` owns ordinary static asset expression resolution and streaming HTTP
  representations. Keep namespace/ID/digest URLs independent of releases. Resolve
  at most 512 references per metadata batch; HEAD/304 never open bodies. Preserve
  byte-range conditions, exact observed lengths, cancellation and reader release.
  Static inline SVG reads require the verified profile in addition to media type.
