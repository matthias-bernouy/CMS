# @bernouy/ulvia-cli

The new local-first Ulvia CLI. It is intentionally independent from the legacy
`@bernouy/cms-cli` package, which remains available during the transition.

## Commands

```bash
bun run ulvia -- pull commerce
bun run ulvia -- pull commerce --version 1.0.0
bun run ulvia -- pull commerce --all-versions
bun run ulvia -- pull --all
bun run ulvia -- audit commerce
bun run ulvia -- audit --all --root ./integrations
bun run ulvia -- release commerce
bun run ulvia -- release commerce --version 1.1.0 --root ./integrations
bun run ulvia -- status
bun run ulvia -- dev
bun run ulvia -- dev status
bun run ulvia -- dev credentials
bun run ulvia -- dev stop
```

`audit` discovers integration sources below the working directory (or `--root`),
builds canonical packages, and compares them with immutable repository
baselines. It verifies a fresh installation and an upgrade from each older,
installable version in disposable CMS, MongoDB, and Supabase services. Required
legacy connector baselines are explicitly adopted before migration. `audit`
never stores the candidate package. It may pull missing immutable baselines and
dependencies into the persistent local repository.

This runtime audit currently proves package compatibility plus real resource
application, fresh installation, and upgrades. General workspace unit tests are
not copied into the local repository, and author-owned business verification
suites are not yet part of this command. Those suites need a separate immutable
verification bundle bound to the package and baseline digests.

`release` uses the same audit engine and stores the candidate only after every
scenario succeeds. A source coordinate already present locally or remotely is a
no-op when its digest is identical and an error when its digest differs.

Existing remote coordinates cannot be reused with different bytes. `push` is
deliberately disabled. Exact package bytes are stored by SHA-256 digest, and
immutable `kind@version` references make corruption or coordinate reuse visible.

## Source history transition

Source discovery still accepts the existing versioned integration indexes. The
target layout is one current authoring tree per integration, while immutable
local and remote repositories retain released history. Historical source
directories must not be removed until their published package digests are
recoverable and the authoring manifest can live outside the packaged bytes.
Moving files alone must preserve the package digest and never justify a SemVer
bump.

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
