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
- `dev` serves only stored releases on loopback; it must never read authored folders.
- `prune` clears the local repository without touching the persistent dev stack.
- Do not reintroduce the removed integration repository or Supabase bridge.
