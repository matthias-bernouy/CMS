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
bun run ulvia -- release --all --root ./integrations
bun run ulvia -- release commerce --version 1.1.0 --root ./integrations
bun run ulvia -- status
bun run ulvia -- dev
bun run ulvia -- dev status
bun run ulvia -- dev credentials
bun run ulvia -- dev stop
```

`audit` discovers integration sources below the working directory (or `--root`),
builds canonical packages, and compares them with immutable repository
baselines. It first runs the integration-owned Bun suites under `tests/`, then
verifies a fresh installation and an upgrade from each older, installable
version in disposable CMS, MongoDB, and Supabase services. Required legacy
connector baselines are explicitly adopted before migration. `audit` never
stores the candidate package. With no local history for a kind, it may discover
remote baselines; missing required dependencies may also be pulled into the
persistent local repository.

This audit proves package compatibility, integration-owned source behavior,
real resource application, fresh installation, and upgrades. Source tests are
authoring inputs: they are executed from the current source tree but never
copied into runtime package bytes. Persisting their exact release evidence as a
separate immutable verification bundle remains a later publication milestone.

Migration-aware candidates receive an additional resilience matrix. For each
distinct persisted connector state, the audit injects a crash after every
migration phase, restarts the CMS against the same MongoDB and Supabase state,
and requires the exact journaled operation to complete once. It verifies that
pre-activation failures keep the source release active, that activation remains
separate from the drain and point of no return, and that post-activation work is
resumable. A lost declarative-reconciliation receipt must fail closed and pass
through the explicit administrator retry protocol before it can continue.

## Business upgrade fixtures

An integration can declare upgrade-specific business state in
`tests/integration-contracts/upgrade-fixtures.ts`. The module exports a suite
created with `defineUpgradeScenarios` from
`@bernouy/cms-integration-verification/upgrade-fixtures/v1`. Each scenario has
only four authoring fields: `name`, a supported `from` SemVer range, optional
integration `dependencies`, and the two required hooks `seedBeforeUpgrade` and
`assertAfterUpgrade`.

The seed hook runs against the installed immutable baseline. Its bounded I-JSON
return value is snapshotted and passed to the assertion hook after the target
release is active. The context exposes versioned capabilities for parameterized
PostgreSQL queries, authenticated local CMS requests, local Auth users, Storage
objects, and Edge Function invocation. Supabase service credentials remain
inside the runtime implementation.

When this module exists, every audited immutable baseline must match at least
one scenario. Matching scenarios run for both the normal upgrade and every
crash-recovery phase. The fixture source is trusted author code, like the other
integration-owned Bun tests; the capability contract is an API boundary, not
an operating-system security sandbox.

Breaking or unproven schema and Function changes require a migration-aware
connector even for a major release. A release cannot introduce both expansion
and contraction migrations, and a contraction must refer to an expansion that
shipped in an earlier version. These rules keep destructive cleanup out of the
release that first introduces a replacement shape.

`release` uses the same audit engine and stores the candidate only after every
scenario succeeds. A source coordinate already present locally or remotely is a
no-op when its digest is identical and an error when its digest differs.
`release --all` processes every discovered integration in deterministic order:
unchanged local coordinates are no-ops, while changed sources are audited and
stored. Failures are reported per integration and make the batch fail.

When a kind already has pulled local history, `audit` and `release` use that
history without contacting the remote repository. Pulling additional history
is an explicit `pull` operation; a later remote `push` will still have to reject
any coordinate that conflicts with immutable remote bytes.

Existing remote coordinates cannot be reused with different bytes. `push` is
deliberately disabled. Exact package bytes are stored by SHA-256 digest, and
immutable `kind@version` references make corruption or coordinate reuse visible.

## Source history transition

Source discovery accepts both legacy versioned indexes and one current
authoring tree per integration. A current tree uses `path: "."`; its
`integration.json`, `tests/`, and `.registry/` roots are excluded from runtime
package bytes. Immutable local and remote repositories retain released history.
A historical source directory can be removed only after its exact package is
recoverable from a repository.

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
