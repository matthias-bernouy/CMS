
# CmsCore Agent Instructions

These rules apply to the whole CmsCore workspace. When working inside
`packages/<layer>/<package>/`, also read that package's own `AGENTS.md`.
Package instructions override or specialize the rules below.

## Language

- Code, comments, identifiers, CSS classes, HTML attributes, page labels, and
  tests are written in English.
- Repository documentation is written in English by default.

## Workspace Shape

Packages live under five layers:

```text
runtimes -> surfaces -> resources -> features -> foundation
```

- `foundation/` contains generic utilities with no CMS-domain knowledge.
- `features/` contains CMS domain modules, contracts, validation, default
  implementations, and optional HTTP handlers or registrars.
- `resources/` contains versioned, declarative CMS resources such as official
  integration packages. Resource packages may depend on feature contracts but do
  not mount HTTP routes, connect to databases, or choose runtime adapters.
- `surfaces/` mounts features into HTTP applications. Surfaces receive
  dependencies through constructors or config; they do not pick production
  adapters.
- `runtimes/` are executable composition roots. They read environment,
  instantiate adapters, mount surfaces, and start listeners.

Never introduce dependencies against the direction above. Feature-to-feature
dependencies are allowed only through the published package exports.

## Imports

- Import workspace packages through their package name or declared subpath:
  `@bernouy/cms-content`, `@bernouy/cms-content/mongo`, etc.
- Inside a package, prefer the local path aliases already configured for that
  package (`cms-control/...`, `cms-content/...`, `http-runner/...`, and so on)
  over deep relative paths.
- Do not import another package through `packages/.../src/...`.
- Network and persistence adapters (`./mongo`, `./s3`) are composition-root
  imports. Keep them out of surfaces and browser bundles unless the package
  instructions explicitly say otherwise.

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
  Directories above eight entries deserve extra review, but cohesive structures
  may remain wider when another level would make navigation worse.
- Use the repository-shape diagnostics as guidance. Group entries by real
  responsibility and do not create vague catch-all folders merely to satisfy a
  number.
- Generated or inherently declarative trees may naturally exceed these
  guidelines.

## Commands

Use Bun commands from the workspace root unless a package says otherwise:

```bash
bun install
bun run build
bun run typecheck
bun test
bun run clean
```

`bun run build` is intentionally sequenced: `@bernouy/components` builds first,
then TypeScript project references, then `@bernouy/cms-control`.

## Documentation

- [docs/README.md](docs/README.md) is the documentation index.
- [docs/Structure.md](docs/Structure.md) is the workspace architecture guide.
- Package `AGENTS.md` files are the source of truth for package-local contracts
  and gotchas.
- Keep docs factual and source-backed. If code and docs disagree, inspect the
  code before editing the doc.
- Use exact package names, export subpaths, route paths, and command names.
- Do not preserve stale names such as removed packages or old directory layouts
  when a source file shows a newer contract.

## Tests And Safety

- Match the existing test style. Add focused tests when behavior changes.
- For docs-only changes, `git diff --check` is enough unless generated docs or
  examples are meant to compile.
- Do not overwrite unrelated dirty work. Read existing changes before touching a
  modified file.
