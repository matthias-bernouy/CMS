# Creating an integration release

Use this workflow for every integration version, from the workspace root.

## 1. Synchronize known history

The local repository is the audit authority once it contains any version of an
integration. Pull the remote history explicitly before starting work:

```bash
bun run ulvia -- pull <kind> --all-versions
bun run ulvia -- status
```

For a new kind, a missing pull is expected. For an existing kind, do not audit
against incomplete local history: the CLI can verify only known baselines.

Pulling synchronizes immutable bytes and reviewed connector-schema evidence.
Repeating it refreshes evidence for existing coordinates. This private local
repository data never belongs beside integration sources.

## 2. Change the current source tree

Edit the integration directly; do not create a copied `versions/<version>`
tree. Keep tests in `tests/`, update `release-notes.txt`, and update the version
in both:

- `integration.json` (`stable`, `latest`, and its current version entry);
- the resolved definition, normally `definitions/root.json`.

Use `path: "."` for current source. Runtime packages exclude author tests and
source-only metadata. The transitive closure of
`tests/integration-contracts/upgrade-fixtures.ts` becomes a separate,
digest-bound verification bundle rather than installed runtime code.

Keep mutable business policy in runtime persistence behind an authenticated
Source settings view or API. Official installations have no questionnaire.
Connection fields store secret references, resolved only for authorized server
management calls. Integration code validates and applies changes; the CMS
provides generic secret storage, runtime synchronization, and lifecycle UI.
Saved and applied revisions distinguish persisted settings from active behavior.

Keep package responsibilities strict: a `source` owns backend/data artifacts
and operator views, while a collection owns blocs, bindings, and theme
requirements. Ulvia is theme-only and has zero bloc resources, artifacts, or
categories. See the [source and collection model](../model.md).

## 3. Choose the version

SemVer describes the public integration contract, not whether an old test
happened to fail.

| Release | Use it for | Typical examples |
| --- | --- | --- |
| Patch | A compatible correction | Fix an implementation that violated the existing contract; strengthen a test without changing supported behavior |
| Minor | An additive contract | Add an optional field, endpoint, dashboard view, function, or expand-only schema capability |
| Major | A contract clients must change for | Remove or rename fields, add required input, narrow accepted behavior, or remove an endpoint |

If an old test was wrong, first decide which behavior is the intended contract.
Correcting the test alone does not force a major release. Changing behavior
that consumers could validly rely on does.

The current authored official catalog starts at `1.0.0` for all 14 integrations.
This source baseline is intended for a fresh local repository; it does not
replace different bytes at existing immutable coordinates or downgrade deployed
installations. Historical releases and their evidence remain in their original
repositories. No old-version alias, legacy-adoption claim, or same-coordinate
upgrade fixture is implied by resetting authoring metadata. Future releases
follow ordinary SemVer and stateful migration guarantees.

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

Keep migrations idempotent, evidence append-only, operator edits optimistic,
and singleton publication serialized when concurrent writes could lose state.

Declare a `versionRange` when a linking integration adopts a newer dependency
contract; resolution must not choose a provider missing the called capability.

Plan dependency-major transitions. The sandbox retains a dependency while it
satisfies the target range; otherwise publish a bridge or use an atomic plan.

## 5. Add tests and upgrade fixtures

Author tests under `tests/` should cover source contracts, authorization,
validation, retries, concurrency, and failure ordering. They run with a bounded
environment and no inherited project secrets.

A stateful integration with a supported prior release should also define
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

The verifier needs Docker and the local Supabase toolchain, but no production
credentials. Service-role keys stay inside its disposable runtime.

Package digests change when runtime resources, release notes, or compatibility
metadata change. Remove stale digest-bound verification bundles from the
authoring tree; retain reusable suite source and produce new bundles and
receipts through a real audit. Updating a target digest alone is not evidence
that an earlier audit covered the new bytes. The Forms storage-boundary suite
remains under `tests/verification/`; its obsolete package binding was removed.

Refresh declared connector schema projections from the current SQL in a
disposable PostgreSQL database using `readSupabaseObservedSchemaContract` from
`@bernouy/cms-integrations/supabase` and `projectObservedSchemaContract` from
`@bernouy/cms-integrations`. Update declared HTTP routes from the callable
connector boundary. These authored contracts are not historical verification
receipts. Recompute any `migration.install.digest` from loaded SQL bundles.

## 7. Release to the local repository

```bash
bun run ulvia -- release <kind>
```

`release` never contacts the remote repository. For a coordinate not already
stored with identical bytes, it runs the same audit and stores the exact
canonical package and verification bundle only after every scenario passes.
The local coordinate is immutable:

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

Install the release in the persistent CMS; exercise Source endpoints, Storage,
Auth, Edge Functions, and blocs, then run `bun run ulvia -- dev stop`.

For collections, test a Source-free selection, then a Source-backed resource
and its closure. Publish, write through a Source, restart, and upgrade. Follow
[Local integration development](../local-development.md).

When reproducing a customer site, keep branding and pages out of the
collection, use fictional local business data, and document any simulated
third-party callback. Follow [Site acceptance with local data](../site-acceptance.md).

## Release checklist

- Remote baselines were pulled before authoring.
- Definition, index, release notes, and dependency ranges agree.
- The package declares exactly one current type: `source` or `collection`.
- Sources contain no blocs, dashboard shells, pages, or theme declarations;
  their operator UI is published as `dashboard-view` artifacts.
- Bloc collection resources use stable namespaced IDs and explicit endpoint,
  contract, binding, theme, and transitive resource requirements.
- A theme-only collection has no bloc resource, artifact, or category.
- Collection category labels do not repeat old package or collection names.
- Mutable business state is runtime-owned and survives reinstall/reload.
- Tests cover authorization, malformed input, retries, and concurrency.
- Fixtures cover every immutable baseline and valuable business state.
- Edge and SQL changes tolerate overlapping versions and restart safely.
- `ulvia audit <kind>`, `ulvia release <kind>`, and `bun run check:all` pass.
- The locally stored digest is the artifact intended for remote publication.
