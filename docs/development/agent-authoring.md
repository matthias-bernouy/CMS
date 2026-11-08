# Agent collection authoring and verification

## Existing enforceable tools

The CLI `release <resource-directory>` already compiles recursive authored
collections, contracts and provider manifests, re-admits their complete immutable
artifacts, and stores exact local releases. It validates paths and authored file
ownership, merges translations/texts/theme metadata, expands explicit resource
exports, compiles optional Bloc behavior, verifies assets and checks dependency
references. A purely declarative collection is valid; JavaScript is optional.

`@bernouy/repository/collections/build` exposes `buildCollectionBloc`,
`validateBloc` and `compileBlocStyle`. The compiler materializes bounded source
files into a temporary directory, restricts imports through its boundary plugin,
and builds a browser runtime against the declared ABI. Static forbidden-API and
markup/style policies are admission checks, not an OS sandbox or proof that
arbitrary JavaScript is harmless. Repository publication never executes an
author's build scripts or arbitrary test commands.

Existing collection tests cover admission, styles, assets, dependency graphs,
installation evolution and reviewed release upgrades. The CLI's
`packages/runtimes/ulvia-cli/tests/stack/edgeSmoke/` journey exercises empty native
setup, explicit collection installation, Page publication, restart and instance
isolation in a production-shaped Docker stack. `bun run verify:full` runs this
local Edge browser journey after normal verify. These are repository tests, not
a generic collection-authored browser scenario format.
