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

For contracts, strict schemas, evolution checks, mocks and fixture assets already
exist. Conformance suite authoring supports scenarios, actors, captures,
assertions, dependency profiles and reasoned coverage exemptions pinned to an
exact contract digest. `@bernouy/cms-gateway/conformance` exposes
`LiveConformanceRunner` with an injected `ConformanceEnvironmentFactory` that
provides fresh disposable environments and cleanup. Admission and coverage
reports do not prove that a live provider passed.

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

No new generic authoring sandbox or collection-authored test DSL is implemented
by the community Repository change. Its MCP tools expose the same admitted
Repository operations and exact results; they do not authorize arbitrary builds.

## Prioritized implementation proposal

### P0: reusable validation and disposable preview capabilities

Extract the CLI's source assembly into an explicit authoring-tool subpath with
an injected filesystem reader, limits and compiler. Keep it outside the normal
admission path. Expose structured `validate-source` and `build-release` results
with bounded path/line diagnostics, source digest, artifact digest, dependency
pins and browser-risk report. Use fixed compiler entrypoints, not a client-
supplied command string. This seam should serve CLI and agent tools equally.

Add a preview environment port that creates, describes and destroys a disposable
tenant with an exact collection/dependency graph and a bounded lease. The
runtime chooses container/worker isolation, a read-only base image, temporary
storage, CPU/memory/process limits, deadlines and denied-by-default network
access. Give every run/profile its own environment, including failure cleanup.
Do not mount the Docker socket or production secrets into the authoring worker.

### P1: declared collection scenarios and evidence

Define an independently versioned suite pinned to the collection release digest.
Start with bounded fixtures: Page source, selected exported Blocs, locale,
settings, viewport, user actor and exact capability mocks. Declare expected
rendered DOM/accessible roles, query/mutation outcomes, asset references and
console/network failures. Avoid arbitrary JavaScript assertions in the public
format. Bound steps, retries, screenshot sizes and total runtime.

Reuse contract scenarios for capability setup and verification rather than
copying their actor/capture/assertion language. Keep rendering assertions in a
small collection-specific extension. Add migration scenarios that install an
old exact release, preserve representative Page state, apply the declared
adjacent migration and verify rollback/resume behavior.

Return evidence with source/artifact/suite/dependency/image digests, runner
version, environment policy, test outcomes and bounded logs/screenshots. Store
large outputs as immutable resources and return authorized links over MCP.
Build/admission, passing scenarios and human review remain separate claims.

### P2: source workspaces and contract extension

Introduce remote source workspaces only when remote authoring is needed. Key
every workspace by `(namespace, artifact kind, artifact ID, workspace ID)`;
use revision-checked writes and owner proofs bound to the source digest. Build
from canonical bounded snapshots containing every declared authoring file,
asset, text and theme. Reject traversal, symlinks, duplicate normalized paths,
undeclared material, excessive counts/depth/bytes and unstable concurrent reads.
Publish immutable source snapshots separately from compiled runtime artifacts.

Extend the same validator/worker ports to contract source assembly, schema
evolution, suite admission and dependency-profile coverage. Execute providers
only through the existing conformance environment port. Provider code needs
its own sandbox profile; contract metadata itself is declarative. Reuse the
generic MCP binding to expose these capabilities after they have admitted
contracts and enforceable limits.

A future skill can teach source organization, diagnosis, preview iteration and
which evidence to request. It adds repeatable guidance and examples. It cannot
replace schema validation, filesystem boundaries, namespace authorization,
worker isolation, test assertions or review. Write and evaluate that skill only
after the tool contracts and representative success/failure fixtures stabilize.
