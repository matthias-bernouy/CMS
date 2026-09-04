# @bernouy/ulvia-cli

Local-first Ulvia developer CLI.

## Responsibilities

- Own the persistent local integration repository and development runtime.
- Submit only locally released immutable packages through the authenticated
  remote admission protocol.
- Compose local infrastructure without depending on removed site-folder sync
  or template tooling.

## Rules

- CLI commands, help text, errors, and tests are written in English.
- Bind development-only HTTP services to loopback interfaces.
- Never print session secrets, encryption keys, or infrastructure credentials.
- Treat pulled package coordinates and digests as immutable.
- Keep external process invocation behind the runtime process abstraction so it
  remains testable without Docker or Supabase.
