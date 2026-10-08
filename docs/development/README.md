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
`ULVIA_DEV_DELIVERY_PORT`, `ULVIA_DEV_MONGO_PORT`, and
`ULVIA_DEV_REPOSITORY_PORT` override the local ports. `release` validates an
authored collection, contract, or provider manifest into the local immutable
repository. `push` and `pull` transfer exact coordinates to and from a compatible
HTTPS repository; `yank` and `restore` manage reversible catalogue availability.
`dev credentials` prints the local repository write token. Site installation is
performed through Control rather than the CLI.

## Local KEK Rotation

`CMS_KEK_HEX` remains the backward-compatible key named `legacy`. A versioned
deployment may additionally set `CMS_KEK_ACTIVE_ID` and a
`CMS_KEK_RING_JSON` object whose values are 64-character hexadecimal AES-256
keys. At startup, the server scans every persisted DEK and refuses readiness if
one references a key absent from the configured ring.

A supported rotation is an explicit maintenance operation:

1. stop all CMS replicas and verify a restorable backup;
2. keep the old keys configured, add the new key to `CMS_KEK_RING_JSON`, select
   it with `CMS_KEK_ACTIVE_ID`, and set `CMS_KEK_ROTATE_ON_START=true`;
3. start one CMS process and wait for the `cms_kek_rotation_audits` record to
   reach `completed`; listeners are not opened while the rotation runs;
4. set `CMS_KEK_ROTATE_ON_START=false` and restart the normal replica set with
   both the active and historical keys still configured;
5. remove a historical key only after a later backup and startup verification
   prove that no `cms_deks` row references it.

The operation rewraps DEKs in bounded batches; it does not re-encrypt stored
secret values. Replaying it is idempotent. Historical keys are never deleted
automatically.

## Checks And Build

| Command | Purpose |
| --- | --- |
| `bun run check:all` | Architecture, UI contracts, repository shape, style, workspace types and tooling types. |
| `bun run check:dead-code` | Report unused declarations, exports, exported types and package dependencies. |
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

`check:dead-code` is separate from `check:all`. It exits with a failure while
findings remain, so use its report to review and remove findings deliberately
before making it a required aggregate check. Public exports can be intentional;
confirm their package contract before removing them.

For code changes, capture `check:all` before and after the work in the same
workspace. Address introduced errors and inspect new warnings in scope.
Documentation-only changes normally need a diff whitespace check and validation
of moved links; check executable examples when their behavior changes.

The [root agent instructions](../../AGENTS.md) define editing/validation rules.
[UI contracts](../quality/ui-contracts.md) explains scanner scope and limitations.
[Commit messages](commits.md) records the suggested convention.
