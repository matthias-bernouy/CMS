# CmsCore Agent Instructions

These rules apply to the whole CmsCore workspace. When working inside a package,
also read that package's own `AGENTS.md`.
Package instructions override or specialize the rules below.

## Language

- Code, comments, identifiers, CSS classes, HTML attributes, page labels, and
  tests are written in English.
- Repository documentation is written in English by default.

## Workspace Shape

Reusable CMS packages live under four layers:

```text
runtimes -> surfaces -> features -> foundation
```

- `foundation/` contains generic utilities with no CMS-domain knowledge.
- `features/` contains CMS domain modules, contracts, validation, default
  implementations, and optional HTTP handlers or registrars.
- `surfaces/` mounts features into HTTP applications. Surfaces receive
  dependencies through constructors or config; they do not pick production
  adapters.
- `runtimes/` are executable composition roots. They read environment,
  instantiate adapters, mount surfaces, and start listeners.

Direct product packages may live at `packages/<product>/` when they are not a
CMS layer. `packages/official-provider` owns the official provider product and
declares its dependency rank in `package.json`. `packages/official-repository`
contains authored official releases only; it is not a runtime dependency and
does not mount routes, connect to databases or choose adapters.

`official-provider` may import generic packages from Foundation and the public
provider-protocol/contract facades it implements. CMS features and surfaces must
not import the official provider. The local CLI may depend on its `./server`
entrypoint solely to compose the complete development environment.

Never introduce dependencies against the direction above. Feature-to-feature
dependencies are allowed only through the published package exports.
New environment reads belong in runtimes. Existing `process.env.MODE` exceptions
are recorded in `quality/architecture/repository/repositoryPolicy.ts`; do not
expand that baseline to bypass dependency injection.

`cms-content` owns the content persistence facade named `CmsRepository`.
`cms-repository` owns contract/provider artifacts, site installation/selection
models and collection admission. `cms-gateway` owns live invocation,
provider-wide identities and media. Generic secret storage and image transforms
belong to Foundation. See the [package map](docs/architecture/packages.md).

## Imports

- Import workspace packages through their package name or declared subpath:
  `@bernouy/cms-content`, `@bernouy/cms-content/mongo`, etc.
- Inside a package, prefer the local path aliases already configured for that
  package (`cms-control/...`, `cms-content/...`, `http-runner/...`, and so on)
  over deep relative paths.
- Do not import another package through `packages/.../src/...`.
- Network and persistence adapters are composition-root imports. Keep them out
  of production surface code and browser bundles. Tests may compose adapters;
  follow any stricter package-local instructions.

## Public Boundaries

- Every exported subpath must be declared in the package's `package.json`.
- Root exports should stay adapter-light. Put optional adapters and browser-only
  surfaces in explicit subpaths.
- `interfaces/` files define contracts and types. Keep executable logic in
  `core/`, `default-implementation/`, `http/`, or surface code.

## File Size

- Aim to keep handwritten source, test, style, template, workflow, and
  configuration files near 150 physical lines. Files above 180 lines deserve
  extra review, but size alone is not a reason to split a cohesive file.
- Use the repository-shape diagnostics as guidance. Decide whether a split
  improves responsibilities and readability; do not split mechanically or
  compress formatting merely to satisfy a number.
- Generated artifacts, lockfiles, and genuinely atomic declarative contracts
  such as schemas may naturally exceed these guidelines.

## Directory Shape

- Aim to keep each directory near seven immediate files and subdirectories.
  Eight entries produce an informational finding; more than eight produce a
  blocking error.
- Directory fanout checks cover each real package root
  (identified by its `package.json`), all descendants, and `quality/`. Repository,
  layer-grouping, documentation, and infrastructure directories outside those
  roots are not subject to this structural limit.
- Group entries by a clear responsibility. Do not create vague catch-all
  folders merely to move entries below the limit.

## Code Style

- Run `bun run format` after editing JavaScript or TypeScript. It applies the
  workspace formatter and the configured safe and unsafe style fixes; inspect
  the resulting diff before handoff.
- Use braces for control-flow bodies and keep executable block contents on
  separate lines. Keep one executable statement per physical line and do not
  add empty statements or duplicate semicolons.
- Inline braces remain valid for object literals, destructuring, imports,
  exports, and types. The two semicolons in a `for (;;)` header are syntax, not
  empty statements.
- Generated bundles and files governed by an external format may be excluded
  narrowly in `biome.json`. A handwritten exception requires a local Biome
  suppression with a concrete reason; do not disable a rule for an entire
  package to avoid formatting code.

## Commands

Use Bun commands from the workspace root unless a package says otherwise:

```bash
bun install
bun run check:all
bun run check:style
bun run format
bun run build
bun run typecheck
bun test
bun run clean
```

`bun run build` emits TypeScript project references, then builds the
`@bernouy/cms-control` browser host runtime from `@bernouy/cms-content/browser`.

## Agent Validation Loop

- In a new worktree, make frozen dependencies available with
  `bun install --frozen-lockfile` before running the initial check.
- For code changes, run `bun run check:all` before making changes and again before
  handoff. Run it in the same task workspace both times so the final report can
  be compared with that task's starting state.
- When concurrent work may modify the same checkout, create or use an isolated
  Git worktree before the initial check. Read-only reviews can share a checkout.
  Do not fix findings from another worktree or unrelated pre-existing findings
  merely to make the global report cleaner.
- Address errors introduced by the task. Review new `INFO` and `WARNING`
  findings in the task's scope as guidance. A directory-fanout `ERROR` is
  blocking and must be resolved.
- A file-size finding may remain when the file is clearer without an artificial
  split; mention that decision in the handoff when the task introduced it.

## Documentation

- [docs/README.md](docs/README.md) is the documentation index.
- [Workspace architecture](docs/architecture/README.md) explains package boundaries.
- [Development](docs/development/README.md) documents current commands and validation.
- Package `AGENTS.md` files are the source of truth for package-local contracts
  and gotchas.
- Keep docs factual and source-backed. If code and docs disagree, inspect the
  code before editing the doc.
- Distinguish implemented domain APIs, mounted runtime flows and planned work.
  An admitted artifact is not necessarily executable, installed or published.
- Use exact package names, export subpaths, route paths, and command names.
- Do not preserve stale names such as removed packages or old directory layouts
  when a source file shows a newer contract.

## Tests And Safety

- Match the existing test style. Add focused tests when behavior changes.
- For documentation-only changes, the before/after `check:all` loop is optional:
  run `git diff --check` and verify local links after moves. Check generated docs
  or executable examples when the change requires it.
- Do not overwrite unrelated dirty work. Read existing changes before touching a
  modified file.
