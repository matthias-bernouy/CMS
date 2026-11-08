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
