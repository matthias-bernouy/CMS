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
runtime. The CMS sees only locally pulled integrations. Supabase connector SQL,
Data API schema configuration, Storage bucket migrations, function secrets, and
Edge Function bundles are applied to that local project. The local management
bridge exists only while `ulvia dev` is running and never accepts remote hosts.
