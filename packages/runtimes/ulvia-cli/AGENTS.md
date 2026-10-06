# @bernouy/ulvia-cli

Local Ulvia CMS development runtime.

## Responsibilities

- Start the local CMS and its MongoDB dependency.
- Keep local runtime data and generated credentials private and persistent.
- Expose lifecycle commands for starting, inspecting, and stopping the stack.

## Rules

- CLI commands, help text, errors, and tests are written in English.
- Bind development-only services to loopback interfaces.
- Never print session secrets, encryption keys, or infrastructure credentials.
- Keep external process invocation behind the runtime process abstraction.
- `release` reads an explicit authored resource folder and dispatches by its
  `definition.json` kind: collection, contract, or provider-manifest. It stores
  immutable releases below the persistent user data directory. Provider
  manifests require their exact contract releases locally; release never probes
  a provider or handles credentials.
- Collection release sources merge recursive JSON fragments below each
  `translations/<locale>/` directory and discover theme category files
  recursively by stable ID. Reject duplicate translation keys, duplicate theme
  IDs, filename/ID mismatches and files absent from the theme manifest.
- Collection text sources recursively merge definition arrays separately from
  `locales/<locale>/` value objects. Bloc discovery recursively traverses pure
  grouping directories and stops at a folder-owned `definition.json`.
- Collection assets may live recursively below `assets/`; their authored
  `source` path is compilation-only and remains independent from the stable
  public asset ID.
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
- `dev` serves only stored releases on loopback; it must never read authored folders.
- `push` and `pull` transfer one exact collection, contract or provider release.
  Re-admit remote bytes locally and let the receiving repository re-run all
  publication and evolution rules. Never trust a remote digest without
  recomputing it.
- Repository writes use a bearer token plus a timestamped, nonce-bound
  HMAC-SHA-256 request signature. Keep tokens in environment or private runtime
  files, never command arguments. Push metadata first, stream one separately
  signed raw asset at a time, and finish with an idempotent commit. Keep write
  serialization, durable replay rejection, abandoned-session cleanup and
  artifact-last atomic visibility intact.
- A yank is reversible repository metadata. It removes a release from new
  catalogue resolution without deleting immutable bytes or breaking historical
  exact-coordinate reads.
- `prune` clears the local repository without touching the persistent dev stack.
- Do not reintroduce the removed integration repository or Supabase bridge.
