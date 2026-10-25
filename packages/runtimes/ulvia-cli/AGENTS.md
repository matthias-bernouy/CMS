# @bernouy/ulvia-cli

Ulvia CMS installation runtime.

## Responsibilities

- Orchestrate shared services and independent named Kernel instances through Docker Compose.
- Keep runtime data and generated credentials private and persistent.
- Expose lifecycle commands for starting, inspecting, and stopping the stack.

## Rules

- CLI commands, help text, errors, and tests are written in English.
- Keep Repository and Provider management endpoints bound to loopback; expose
  only the shared proxy according to the persistent installation configuration.
- Never print session secrets, encryption keys, or infrastructure credentials.
- Keep external process invocation behind the runtime process abstraction.
- Lifecycle commands must never start the Kernel, Provider, Repository, or MongoDB directly;
  it only manages their production-shaped containers.
- `release` reads an explicit authored resource folder and dispatches by its
  `definition.json` kind: collection, contract, or provider-manifest. It stores
  immutable releases below the persistent user data directory. Provider
  manifests require their exact contract releases locally; release never probes
  a provider or handles credentials.
- `release --recursive` discovers bounded authored resource roots and stops at
  each owning definition. Reject symbolic links and duplicate coordinates. Plan
  contracts against the local catalogue before providers and collections, and
  validate all authored sources before storing the batch. Keep writes atomic per
  resource; the batch is not a cross-resource transaction. Never implicitly push.
- Collection release sources merge recursive JSON fragments below each
  `translations/<locale>/` directory and discover theme category files
  recursively by stable ID. Reject duplicate translation keys, duplicate theme
  IDs, filename/ID mismatches and files absent from the theme manifest.
- Collection text sources recursively merge definition arrays separately from
  `locales/<locale>/` value objects. Bloc discovery recursively traverses pure
  grouping directories and stops at a folder-owned `definition.json`.
- Collection assets are discovered recursively below `assets/`; the normalized
  lowercase relative path is their stable collection-local ID. Do not declare
  them in the collection `definition.json`. An optional root
  `assets/definition.json` contains only per-path generation overrides.
- Safe presentation-only SVG assets are admitted with the `inline-svg` profile
  automatically. Invalid or richer SVG files remain ordinary downloadable
  assets and cannot be expanded through `cms-svg`.
- Authored collection exports may use `"*"` globally or for one resource kind.
  Expand it to exact public resource IDs before admission, never place a wildcard
  in the immutable release, and never accept wildcard dependency imports.
- Collection migrations are recursive JSON files below `migrations/`, named
  `<from>-to-<to>.json`. Release admission enforces a cumulative adjacent chain.
- Contract sources may split capabilities and mocks recursively below
  `capabilities/` and `mocks/`. Conformance sources use recursive `scenarios/`
  and `exemptions/` trees below `conformance/`. Sort assembled records by their
  declared stable IDs, never by paths, reject duplicate or dangling ownership,
  and validate a present suite before making its contract release visible.
- Before storing a collection release, validate namespaced CSS variable
  references against its local tokens, selective dependency imports and
  Bloc-owned custom-property declarations.
- The local Repository serves only stored releases on loopback; it must never read authored folders.
- `push` infers one local release kind from its coordinate; an explicit kind
  resolves collisions. `push all` sends every non-yanked local cached release,
  ordered by contract dependencies, then providers and collection dependencies.
  Validate all local artifacts and namespace keys before the first upload. Stop
  on failure; exact retries are idempotent and the batch is not transactional.
  `pull` transfers one explicitly typed exact release.
  Re-admit remote bytes locally and let the receiving repository re-run all
  publication and evolution rules. Never trust a remote digest without
  recomputing it.
- Repository writes use Ed25519 namespace owner credentials, including official
  publishers. Persist local identities and the active Repository connection;
  configuration contains public keys and private file references only. Push
  metadata first, stream separately signed assets and finish with an idempotent
  commit. Preserve write serialization, durable replay rejection, abandoned-session
  cleanup and artifact-last atomic visibility. Ed25519 owner proofs are the only
  publication authentication; never reintroduce operator-token/HMAC support.
  Namespace key files are private, bounded regular files, opened without following
  symlinks. Never expose private keys to the Repository or tool arguments.
- `repository` lifecycle commands manage one default Repository deployment and
  pinned published images without a deployment name. Keep their volumes separate
  from shared services. Do not support historical states or named deployments.
  Deployment network configuration is independent of local client identities.
  All namespaces, including official publishers, use public first claim.
  Never replace ownership or recover revoked/lost keys during startup.
- A yank is reversible repository metadata. It removes a release from new
  catalogue resolution without deleting immutable bytes or breaking historical
  exact-coordinate reads.
- `prune` clears the local repository without touching shared services or instances.
- Do not reintroduce the removed integration repository or Supabase bridge.

- Import collection source assembly directly from
  `@bernouy/cms-repository/collections/build`; do not retain CLI forwarding files
  merely to preserve obsolete internal paths.
