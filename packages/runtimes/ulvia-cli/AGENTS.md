# @bernouy/ulvia-cli

Local-first Ulvia developer CLI.

## Responsibilities

- Own the persistent local integration repository and development runtime.
- Keep remote repository access read-only until publishing is implemented.
- Compose local infrastructure without importing the legacy `cms-cli` package.

## Rules

- CLI commands, help text, errors, and tests are written in English.
- Bind development-only HTTP services to loopback interfaces.
- Never print session secrets, encryption keys, or infrastructure credentials.
- Treat pulled package coordinates and digests as immutable.
- Keep external process invocation behind the runtime process abstraction so it
  remains testable without Docker or Supabase.
