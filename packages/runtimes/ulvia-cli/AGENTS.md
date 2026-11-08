# @bernouy/ulvia-cli

Ulvia CMS installation runtime.

## Responsibilities

- Orchestrate shared services and independent named Edge instances through Docker Compose.
- Keep runtime data and generated credentials private and persistent.
- Standard Provider connections default to `https://repo.ulvia.fr`. Persist the
  selected Repository connection with installation configuration. Local tests
  must explicitly select their isolated Repository and opt into HTTP; never
  let their default setup contact the public Repository.
- Expose lifecycle commands for starting, inspecting, and stopping the stack.
- Shared services are proxy, MongoDB and Provider. A Repository is an explicitly
  profiled named CMS instance with its own Edge, not another shared server or
  image. Keep `upgrade` targets limited to Edge and Provider.
- Source CLI startup requires an explicit initial image version. Bundled profile
  provisioning must work without remote Repository access, while later discovery
  and publication still use the persisted Repository connection.

## Rules

- CLI commands, help text, errors, and tests are written in English.
- Keep Provider management endpoints bound to loopback; expose
  only the shared proxy according to the persistent installation configuration.
- Never print session secrets, encryption keys, or infrastructure credentials.
- Keep external process invocation behind the runtime process abstraction.
- Load command-specific authoring, preview and publication code only after
  dispatch. Local instance operations use the narrow filesystem lock and
  publication transport exports; they must not initialize collection tooling.
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
- Deploy Repository as an ordinary named CMS instance with an explicit application
  profile. `repository` commands manage client PAT connections only. Do not add a
  standalone runtime, image, Compose service or lifecycle forwarding alias.
  The Provider advertises supported exact profile references through its protected
  operator endpoint; the CLI persists the selected reference without duplicating
  the profile catalogue. A profile update must retain its application ID and only
  persist after the Provider acknowledges the exact target. Image updates retain
  Provider data and credentials; never reassign namespace ownership at startup.
- First services/Edge startup must reuse cached exact-version images after the
  normal component, stack API, version and digest checks. Pull only when absent;
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
