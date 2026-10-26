# Agent collection authoring and verification

## Existing enforceable tools

The CLI `release <resource-directory>` already compiles recursive authored
collections, contracts and provider manifests, re-admits their complete immutable
artifacts, and stores exact local releases. It validates paths and authored file
ownership, merges translations/texts/theme metadata, expands explicit resource
exports, compiles optional Bloc behavior, verifies assets and checks dependency
references. A purely declarative collection is valid; JavaScript is optional.

`@bernouy/cms-repository/collections/build` exposes `buildCollectionBloc`,
`validateBloc` and `compileBlocStyle`. The compiler materializes bounded source
files into a temporary directory, restricts imports through its boundary plugin,
and builds a browser runtime against the declared ABI. Static forbidden-API and
markup/style policies are admission checks, not an OS sandbox or proof that
arbitrary JavaScript is harmless. The Repository server never executes an
author's build scripts or arbitrary test commands.

Existing collection tests cover admission, styles, assets, dependency graphs,
installation evolution and migrations. `quality/official-repository` tests
exercise authored official controls and Page-editor behavior. The CLI's
`tests/stack/kernelSmoke` journey exercises installation, provider access,
Pages, files and collection upgrades in a production-shaped Docker stack.
`bun run verify:full` runs the local Kernel browser journey after normal verify.
These tests are repository tests, not a generic collection-authored browser
scenario format.

Contracts provide strict schemas, evolution checks, mocks and fixture assets.
The Gateway validates each invocation against its selected immutable release.
Provider implementations own their unit and integration tests; publishing a
contract does not execute a provider or certify its behavior.

## Recommended agent workflow today

1. Give the agent a source-only Git worktree and read-only admitted dependencies.
   Keep namespace signing keys and production credentials in a separate host.
   Start from a declarative collection unless behavior is actually needed.
2. Author `definition.json`, recursive Bloc folders, translations, texts, themes
   and immutable assets using current collection conventions. Run the explicit
   local release command; inspect its admission/compiler diagnostics.
3. Run focused admission and browser tests relevant to the changed behavior.
   Use a dedicated named preview instance and disposable data for rendering,
   accessibility, settings, locales, assets and dependency interactions.
4. Review release digest, browser-risk summary, dependency pins, migrations and
   declared exports. Run normal workspace verification; use the complete Kernel
   journey when installation/rendering is affected.
5. Promote the exact reviewed local artifact. An authorized signer claims or
   uses its namespace and pushes the already admitted metadata/assets. Agents
   without publication authority may prepare the artifact and verification
   evidence but cannot mint an owner signature.

No generic authoring sandbox or collection-authored test DSL is implemented.
Instance MCP uses fixed collection compilation entrypoints; it does not accept
arbitrary build commands.

## Current instance authoring and next work

The shared compiler extraction and bounded source preparation are implemented.
The [Instance MCP V1](../architecture/instance-mcp.md) guide documents the exact
tools, OAuth connection, source snapshot format and explicit publication /
installation workflow. The Repository is HTTP-only. Agents connect to their CMS
instance; the host retains namespace signing credentials.

Persistent source workspaces, disposable preview workers, collection-authored
browser scenarios and packaged skills remain future work. A future preview
worker should isolate compilation and rendering from signing credentials with
bounded CPU, memory, temporary storage, network and deadlines. Current static
admission and Bun macro disabling do not provide an OS sandbox.
