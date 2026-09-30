# Development And Validation

Run workspace commands from the repository root. `package.json` pins Bun 1.4.2.
In a fresh checkout or worktree, install the locked dependencies:

```bash
bun install --frozen-lockfile
```

## Local CMS

```bash
bun run ulvia -- dev
bun run ulvia -- dev status
bun run ulvia -- dev credentials
bun run ulvia -- dev stop
```

The CLI manages a persistent local CMS stack with MongoDB. `ULVIA_DATA_DIR`
overrides its data directory; `ULVIA_DEV_CONTROL_PORT`,
`ULVIA_DEV_DELIVERY_PORT` and `ULVIA_DEV_MONGO_PORT` override the local ports.
Its current command surface is `dev`; collection build, push, publication and
installation commands are not implemented.

## Checks And Build

| Command | Purpose |
| --- | --- |
| `bun run check:all` | Architecture, UI contracts, repository shape, style, workspace types and tooling types. |
| `bun run check:style` | Read-only Biome check. |
| `bun run format` | Apply Biome formatting and configured safe/unsafe fixes; inspect the diff. |
| `bun run typecheck` | TypeScript project-reference check/build. |
| `bun run build` | Build components, TypeScript references, then the Control browser bundle. |
| `bun test` | Run the test suite. |
| `bun run clean` | Clean TypeScript build outputs through `tsc --build --clean`. |

`check:all` is an aggregate static check; it does not execute the application
test suite or browser scenarios. Run focused tests for behavior changes and the
build when generated browser assets are affected. Browser/network integration
tests require an environment that permits Chromium and local listeners.

For code changes, capture `check:all` before and after the work in the same
workspace. Address introduced errors and inspect new warnings in scope.
Documentation-only changes normally need a diff whitespace check and validation
of moved links; check executable examples when their behavior changes.

The [root agent instructions](../../AGENTS.md) define editing/validation rules.
[UI contracts](../quality/ui-contracts.md) explains scanner scope and limitations.
[Commit messages](commits.md) records the suggested convention.
