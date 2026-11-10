# @bernouy/ulvia-cli

Ulvia CMS installation runtime.

## Responsibilities

- Orchestrate one installation with Provider, MongoDB, Caddy and a configured pool of shared Edge processes through Docker Compose.
- Keep runtime data and generated credentials private and persistent.
- Site Repository settings default to `https://repo.ulvia.fr`. Keep each site's
  source selection separate from CLI publisher PAT configuration. Local tests
  must explicitly select their isolated Repository and opt into HTTP; never
  let their default setup contact the public Repository.
- Expose lifecycle commands for starting, inspecting, and stopping the stack.
- A Repository is an ordinary logical CMS instance with explicitly installed
  Registry. It uses the shared Edges and proxy, without another server or image.
  Treat Provider, Edges, Caddy and MongoDB as one exact stack release.
- Source CLI first apply requires an explicit initial image version. Bundled system
  provisioning must work without remote Repository access, while later discovery
  and publication still use the persisted Repository connection.

## Rules

- CLI commands, help text, errors, and tests are written in English.
- Keep Provider management endpoints bound to loopback; expose
  only the shared proxy according to the persistent installation configuration.
- Never print session secrets, encryption keys, or infrastructure credentials.
- Keep external process invocation behind the runtime process abstraction.
- Load command-specific authoring, preview and publication code only after
  dispatch. Infrastructure mutations use the narrow native filesystem lock at
  the data root. Preserve its inode through reset; status and following logs
  must not hold that mutation lock. Never initialize collection authoring on startup.
- Reuse immutable catalogue evidence only within one push preflight. Re-read
  current file bytes and local yanks, verify every asset and let each receiving
  publication recheck current ownership and admission. Never retain credentials
  or authorization decisions in this read context.
- Lifecycle commands must never start the Edge, Provider, or MongoDB directly;
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
  `assets/definition.json` contains only per-path `deprecations` metadata.
- Safe presentation-only SVG assets are admitted with the `inline-svg` profile
  automatically. Invalid or richer SVG files remain ordinary downloadable
  assets and cannot be expanded through `cms-svg`.
- Authored collection exports may use `"*"` globally or for one resource kind.
  Expand it to exact public resource IDs before admission, never place a wildcard
  in the immutable release, and never accept wildcard dependency imports.
- Collection upgrades use reviewed release switches. Authored `migrations/`
  directories and resource generation fields are rejected.
- Contract sources may split capabilities and mocks recursively below
  `capabilities/` and `mocks/`. Sort assembled records by their declared stable
  IDs, never by paths, and reject duplicate or dangling mock ownership.
- Before storing a collection release, validate namespaced CSS variable
  references against its local tokens, selective dependency imports and
  Bloc-owned custom-property declarations.
- Local release storage contains admitted immutable releases; publishing must never serve authored folders directly.
- `push` infers one local release kind from its coordinate; an explicit kind
  resolves collisions. `push all` sends every non-yanked local cached release,
  ordered by contract dependencies, then providers and collection dependencies.
  Validate all local artifacts and account namespace credentials before the first upload. Stop
  on failure; exact retries are idempotent and the batch is not transactional.
  `pull` transfers one explicitly typed exact release.
  Re-admit remote bytes locally and let the receiving repository re-run all
  publication and evolution rules. Never trust a remote digest without
  recomputing it.
- Repository writes use ordinary CMS personal access tokens and account-owned
  namespaces, including official publishers. Persist one private, bounded
  `ulvia.client.v1` connection pinned to its origin and Repository identity.
  Login reads a PAT from the environment or bounded stdin, never a command-line
  argument. Refuse redirects and cross-origin credential forwarding. Re-read the
  saved generation before each protected request so logout or replacement
  invalidates active credential resolvers. Never silently generate credentials.
  Push metadata first, stream separately verified assets and finish with an
  idempotent commit. Preserve bounded transfers and artifact-last atomic visibility.
- Create logical sites through Control's admitted hosting capabilities. No
  instance command may provision a tenant or start a dedicated Edge. Provider
  bootstrap creates empty Control; the CLI writes its protected initial
  administrator to a private file before recording runtime keys. Ready restarts
  must not recreate a removed administrator file or missing operator credential.
- Persist mandatory hosting settings and both exact image pins. Missing settings
  over existing launch or database state require explicit recovery, never defaults.
  Save launch intent before Compose can create durable database state. Resize
  shared Edges without creating any per-site deployment or Docker discovery labels.
- Deploy Repository as an ordinary logical CMS instance. Native setup activates
  Registry after creation. Do not add profiles, profile discovery/upgrade commands,
  a standalone runtime, or a global Repository URL to service configuration.
  `repository` commands manage client PAT connections only. Keep those independent
  from per-instance source settings. Image updates retain data and credentials.
- First services/Edge startup must reuse cached exact-version images after the
  normal component, stack API, shared hosting API, version and digest checks. Pull only when absent;
  an invalid cached image must refuse rather than silently replace itself.
  Explicit image upgrades still pull their requested tag. The fresh Compose
  smoke test must not pre-seed installation or image-pin state.
- A yank is reversible repository metadata. It removes a release from new
  catalogue resolution without deleting immutable bytes or breaking historical
  exact-coordinate reads.
- `prune` clears local repository data without touching shared services or instances.
  Retain the shared native lock file's inode so concurrent CLI processes cannot
  acquire locks on different files while pruning.
- Do not reintroduce the removed integration repository or Supabase bridge.

- Import collection source assembly directly from
  `@bernouy/repository/collections/build`; do not retain CLI forwarding files
  merely to preserve obsolete internal paths.

- Use `@bernouy/repository/repository/authoring/build` for contract source assembly
  shared with CMS Authoring. Keep source scanners and compilation in the feature.
- Compile contract `docs/**/*.md` into a generated manifest plus separate digest-verified
  assets. Require one real H1 per document; paths identify documents. Preserve
  exact bytes through bootstrap, release, push and pull. Reject authored
  manifests, source symlinks and dangling capability or internal document links.

- Official bootstrap generation uses only the SDK feature inventory and Provider
  metadata. Never scan an authored official repository or bundle starter collections.
  Explicit user collection release/build/publication remains supported.

- `configure` records desired settings only; `apply` reconciles them. Root `start`
  starts existing containers using the last applied private artifact snapshot,
  without pulling images, regenerating artifacts or consuming pending settings.
  Missing containers require apply; incomplete operations require their recorded
  apply/upgrade recovery. Keep desired, applied and in-progress state separate.
- Stack releases ship in the co-versioned CLI npm archive and include digest-pinned
  Caddy/MongoDB images and exact Compose files. Verify metadata audience, archive
  SHA-512, bounded download/decompression and release version/digest before use.
  Do not extract caller archive paths onto disk. Keep the operation intent durable
  before Docker writes and update applied state only after successful activation.
- Technical `logs` reads Docker streams from the exact owned project, with bounded
  lines/container selection and cancellation. Do not revive CMS journal clients
  in the CLI or hold the mutation lock while following logs.
