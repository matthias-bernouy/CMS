# Creating an integration release

This workflow applies to a new integration and to every subsequent version.
Run commands from the workspace root unless an integration documents an
additional requirement.

## 1. Synchronize known history

The local repository is the audit authority once it contains any version of an
integration. Pull the remote history explicitly before starting work:

```bash
bun run ulvia -- pull <kind> --all-versions
bun run ulvia -- status
```

For a new integration, the pull may report that the kind does not exist. That
is expected. For an existing integration, do not audit against an incomplete
local history: upgrade coverage is only meaningful for the baselines the CLI
knows.

## 2. Change the current source tree

Edit the integration directly; do not create a copied `versions/<version>`
tree. Keep tests in `tests/`, update `release-notes.txt`, and update the version
in both:

- `integration.json` (`stable`, `latest`, and its current version entry);
- the resolved definition, normally `definitions/root.json`.

Use `path: "."` for the current source entry. Runtime package construction
excludes author tests and registry evidence. The transitive source closure for
`tests/integration-contracts/upgrade-fixtures.ts` is stored separately in a
digest-bound verification bundle, so it can be executed again without placing
test code in the installed runtime package.

Mutable business policy does not belong in installation answers. Installation
inputs are appropriate for stable deployment settings, secret references, and
initial bootstrap identity. Documents, legal text, prices, feature state, and
other operator-owned values should live in runtime persistence and be managed
through an authenticated dashboard or API. An `afterInstallation` hook must be
idempotent and must not overwrite an existing runtime value.

Keep package responsibilities strict. A `source` contains backend/data
artifacts and their tests. A `collection` contains blocs, resource metadata,
endpoint bindings, and theme contracts. See the
[source and collection model](./model.md).

## 3. Choose the version

SemVer describes the public integration contract, not whether an old test
happened to fail.

| Release | Use it for | Typical examples |
| --- | --- | --- |
| Patch | A compatible correction | Fix an implementation that violated the existing contract; strengthen a test without changing supported behavior |
| Minor | An additive contract | Add an optional field, endpoint, dashboard, function, or expand-only schema capability |
| Major | A contract clients must change for | Remove or rename fields, add required input, narrow accepted behavior, or remove an endpoint |

If an old test was wrong, first decide which behavior is the intended contract.
Correcting the test alone does not force a major release. Changing behavior
that consumers could validly rely on does.

The compatibility evaluator calculates the minimum required level. A larger
version number does not make an unsafe migration safe: stateful connector
changes must still satisfy the migration policy.

## 4. Design stateful changes for live traffic

Use expand, migrate/backfill, activate, drain, and cleanup as separate phases.
Do not introduce expansion and destructive contraction in the same release. A
contraction must refer to an expansion shipped in an earlier version.

For Edge Functions, preserve the currently deployed HTTP contract while old
and new callers can overlap. Prefer one of these strategies:

- add a new route or function, switch callers, then retire the old boundary in
  a later release;
- make the existing handler accept both request shapes and return a response
  both client generations understand;
- use a migration-aware connector when an in-place replacement needs explicit
  activation, recovery, and drain evidence.

Keep database migrations idempotent. Preserve append-only evidence, use
optimistic concurrency for operator edits, and serialize singleton publication
when concurrent writes would otherwise lose state.

When a linking integration starts using a newer dependency contract, declare a
`versionRange`. Never let repository resolution silently select an older
provider that lacks the endpoint or schema being called.

Plan dependency-major transitions explicitly. The sandbox keeps an installed
dependency when it still satisfies the target range, which permits a dependent
package to upgrade before that dependency. If the new dependent cannot run
against both dependency majors, publish a bridge release or design an atomic
upgrade plan; do not bypass the installed-dependent guard.

## 5. Add tests and upgrade fixtures

Author tests under `tests/` should cover source contracts, authorization,
validation, retries, concurrency, and failure ordering. They run with a bounded
environment and no inherited project secrets.

Any stateful integration should also define
`tests/integration-contracts/upgrade-fixtures.ts`. Seed realistic business
state through the oldest supported baseline and assert both persistence and
observable behavior after the target is active. See
[Business upgrade fixtures](./upgrade-fixtures.md).

## 6. Audit without storing

```bash
bun run ulvia -- audit <kind>
```

`audit` builds the canonical candidate but does not store it. It checks:

1. package and SemVer compatibility;
2. staged migration policy;
3. integration-owned Bun tests;
4. a fresh installation in disposable CMS, MongoDB, and Supabase services;
5. every known, installable baseline upgrade;
6. business fixtures and migration crash/restart recovery where applicable.

No production Supabase credentials are required. The verifier starts disposable
local services and keeps service-role credentials inside its runtime boundary.
Docker and the local Supabase toolchain must be available.

## 7. Release to the local repository

```bash
bun run ulvia -- release <kind>
```

For a new local coordinate that is not already published remotely, `release`
runs the same audit and stores the exact canonical package and verification
bundle only after all scenarios pass. An already published identical package
is pulled as-is. The coordinate is immutable:

- identical `kind@version` and digest is a no-op;
- identical coordinate with different bytes is rejected and suggests the
  required next version;
- releasing an older coordinate after a newer version is rejected.

For the full source tree:

```bash
bun run ulvia -- release --all
```

The CLI orders integrations by dependencies. Unchanged local coordinates are
no-ops; failures are reported per integration and make the batch fail.

## 8. Exercise the local runtime

```bash
bun run ulvia -- dev
```

Install the locally released integration into the persistent development CMS,
exercise its Source endpoints, Storage, Auth, Edge Functions, and collection
blocs, then stop the stack with `bun run ulvia -- dev stop`.

For collections, begin with an exact source-free selection, then add one
source-backed resource and verify that only its dependency closure is installed.
Create and publish a real page, write business data through a Source, restart
the process, and perform at least one representative upgrade. The complete
acceptance sequence is documented in
[Local integration development](./local-development.md).

## Release checklist

- Remote baselines were pulled before authoring.
- Definition, index, release notes, and dependency ranges agree.
- The package declares exactly one current type: `source` or `collection`.
- Sources contain no blocs, dashboards, pages, or theme declarations.
- Collection resources use stable namespaced IDs and explicit endpoint,
  contract, binding, theme, and transitive resource requirements.
- Mutable business state is runtime-owned and survives reinstall/reload.
- Tests cover authorization, malformed input, retries, and concurrency.
- Fixtures cover every immutable baseline and valuable business state.
- Edge and SQL changes tolerate overlapping versions and restart safely.
- `ulvia audit <kind>`, `ulvia release <kind>`, and `bun run check:all` pass.
- The locally stored digest is the artifact intended for remote publication.
