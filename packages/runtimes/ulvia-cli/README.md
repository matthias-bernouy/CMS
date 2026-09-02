# @bernouy/ulvia-cli

The new local-first Ulvia CLI. It is intentionally independent from the legacy
`@bernouy/cms-cli` package, which remains available during the transition.

## Commands

```bash
bun run ulvia -- pull commerce
bun run ulvia -- pull commerce --version 1.0.0
bun run ulvia -- pull commerce --all-versions
bun run ulvia -- pull --all
bun run ulvia -- status
bun run ulvia -- dev
bun run ulvia -- dev status
bun run ulvia -- dev credentials
bun run ulvia -- dev stop
```

`push` is deliberately disabled. The local repository contains only packages
that were explicitly pulled. Exact package bytes are stored by SHA-256 digest,
and immutable `kind@version` references make corruption or coordinate reuse
visible.

## Persistent data

Data is stored under `$XDG_DATA_HOME/ulvia` when `XDG_DATA_HOME` is set, or
`~/.local/share/ulvia` otherwise. `ULVIA_DATA_DIR` provides an explicit absolute
override. This is application data rather than an expendable cache and must not
be committed to a project repository.

`ulvia dev` starts a persistent local Supabase project, a persistent MongoDB
container, an internal loopback-only repository bridge, and the current CMS
runtime. The CMS sees only locally pulled integrations. Supabase is prepared as
local infrastructure; wiring connector deployment and migrations to it is the
next milestone, so Supabase-backed integration installs are not yet claimed as
fully local.
