# Official Integrations Test Migration

Status: Proposed

Scope: `@bernouy/cms-official-integrations`

Date: 2026-07-23

This single document contains:

1. the durable test ownership and boundary decision;
2. the dated migration inventory and execution plan;
3. the deferred runtime versioning and upgrade design.

## Decision

Tests owned by an official integration are stored outside publishable resources
and identify:

- the integration category and kind;
- the version that introduced a public contract;
- or the exact integration version and provider whose implementation is under
  conformance test.

Public contract ownership and execution targets are separate. A contract
introduced by `commerce@1.1.2` must first pass against exactly `1.1.2`. A later
compatible target such as `1.3.15` must also pass that contract, without copying
the test into the later version.

The current migration moves and classifies the existing `1.0.0` tests, makes
definition resolution exact, isolates stateful bindings, and replaces
hard-coded test discovery. It does not implement runtime release inheritance,
dependency ranges, resource authoring overlays, or persistent-data upgrades.

## Sources of truth

There is no `tests/version-support.json`.

`integration.json` is the source of truth for:

- published versions;
- `stable` and `latest` channels;
- resource paths.

The test tree is the source of truth for contract and conformance ownership.
Automated checks derive expected coverage from integration indexes and resolved
definitions. They reject unknown kinds or versions, missing required owners,
and tests that follow a channel unintentionally.

Minimum obligations are derived rather than declared twice:

- every version with a public Source has an API contract owner and executable
  binding;
- every version with public non-Source artifacts has an artifact contract
  owner;
- every implementation-sensitive artifact test has an exact-version artifact
  conformance owner;
- every declared connector has exact-version provider conformance ownership;
- every version participates in package catalogue and integrity checks.

All currently declared versions are installable and must satisfy their
applicable contracts. There is no `full` versus `catalog-only` test policy and
no coverage opt-out in `integration.json`. BAN therefore receives a minimal
behavioral Source contract during this migration.

If the product later retains versions that are deliberately unsupported, that
requires product-level lifecycle metadata with runtime semantics, such as
`supported` or `archived`. Test coverage metadata must not stand in for a
runtime support policy.

## Ownership model

| Class | Subject | Version selection | Implementation knowledge |
| --- | --- | --- | --- |
| API contract | Observable installed Source behavior | Contract introduction version, then compatible targets | Hidden behind a binding |
| Artifact contract | Public Blocs, Dashboards, workflows, Functions, Triggers, and Relations | Contract introduction version, then compatible targets | None by default |
| Artifact conformance | Bundle contents, generated code, source structure, and other release implementation details | Exact version | Allowed and explicit |
| Connector conformance | Provider, persistence, protocol, security mechanism, and recovery | Exact version and provider | Allowed and explicit |
| Catalogue | Indexes, channels, exports, bundles, and resource graph | Package-wide | Package structure only |
| Composition | One concrete graph of integration releases | Exact version for every participant | Hidden unless deployment is the subject |
| Live smoke | A real external provider connection | Exact version and provider | Explicit |
| Support | Test-only code with several genuine owners | Call-site supplied | Test-only |

A public contract covers stable endpoints, shapes, access metadata, public
errors, artifact identifiers, and observable behavior. It excludes internal
tables, RPC names, PostgREST headers, provider SDK calls, and helper structure
unless those details are deliberately published.

The same risk may require evidence at two layers. For example, an idempotent
public outcome belongs to the API contract; the database constraint or lock
that produces it belongs to connector conformance.

## Target layout

```text
packages/resources/official-integrations/
|-- integrations/                         # Published immutable resources
`-- tests/
    |-- integrations/
    |   |-- domains/
    |   |   `-- commerce/
    |   |       |-- contracts/
    |   |       |   `-- introduced-in/
    |   |       |       `-- 1.0.0/
    |   |       |           |-- api/
    |   |       |           `-- artifacts/
    |   |       |-- artifact-conformance/
    |   |       |   `-- versions/
    |   |       |       `-- 1.0.0/
    |   |       `-- connector-conformance/
    |   |           `-- versions/
    |   |               `-- 1.0.0/
    |   |                   `-- supabase/
    |   |-- extensions/
    |   |-- foundation/
    |   `-- providers/
    |-- catalog/
    |-- compositions/
    |-- smoke/
    `-- support/
```

The resource category remains in the path so ownership maps deterministically
to the package catalogue.

Fixtures stay with their narrowest owner:

- public request and response fixtures under `api/`;
- Bloc and declarative fixtures under `artifacts/`;
- generated bundles, source strings, and compiler fixtures under exact-version
  artifact conformance;
- database rows and provider protocols under connector conformance;
- root `support/` only for code used by several real owners.

Compatibility and migration directories are added only when a second version
creates a concrete transition to test.

## Version and contract selection

### Current migration

Every migrated suite resolves the exact target version. Helpers require both
`kind` and `targetVersion`, and verify the resolved definition identity.

Only catalogue tests intentionally call `repository.get(kind)` without a
version. A version-owned test must never combine a raw
`versions/<version>/...` path with a default-channel definition.

### When a second version exists

For a target version `T`, the contract runner:

1. parses semantic versions with one shared implementation;
2. selects contract suites for the same kind and major;
3. includes suites introduced at a version less than or equal to `T`;
4. runs every selected suite against the exact resources of `T`.

Every suite under `introduced-in/X` must also pass against exactly `X` in
isolation. This prevents an old contract from accidentally depending on a
field, endpoint, or helper introduced later.

Connector conformance remains exact-versioned. Old implementation assertions
do not become cumulative merely because public contracts do.

Artifact conformance is also exact-versioned. A test that inspects `editorJS`,
`style.css`, generated source, or bundle layout is not a cumulative public
artifact contract merely because it lives beside behavioral Bloc tests.

Cross-major contracts are never inherited automatically. A supported
cross-major transition requires an explicit compatibility suite and runtime
dependency rules from the deferred versioning design.

## Public Source test boundary

Public non-system Source behavior runs through `handleSourceRequest`. The test
adapter remains thin and accepts an exact integration reference:

```ts
type OfficialIntegrationTestReference = {
    kind: string;
    targetVersion: string;
    provider?: string;
};
```

The context:

- resolves and verifies that exact definition;
- installs only the selected definition and exact dependencies;
- exposes installed Sources through their public HTTP boundary;
- restores authentication context explicitly when authorization is asserted;
- hides provider execution behind a test-only binding;
- cleans up through `dispose()`.

A declared connector uses its real connector entrypoint. A direct-upstream
Source such as BAN uses the installed Source with an injected upstream
transport. Public scenarios do not import production connector paths, SQL,
provider SDKs, or provider observation types.

`handleSourceRequest` is an execution boundary, not an authorization policy by
itself. Contracts asserting HTTP authorization supply an explicit authorizer
and actor. Surface-owned session-to-role behavior stays in surface tests.

## Isolation

Current harnesses mutate `globalThis.fetch`, install `globalThis.Deno`, and load
handlers with module-level registration. A launcher must isolate bindings whose
globals or module cache cannot be reset reliably.

- Reusable scenarios use non-entrypoint modules.
- Binding descriptors are not auto-discovered by Bun.
- One child process owns one stateful Edge Function binding when required.
- The aggregate launcher executes each binding exactly once.
- `dispose()` and `finally` restore local state.
- Coverage merges child-process LCOV output.

Database descriptors receive dedicated disposable databases. Schema-only
isolation is insufficient until a contract proves it creates no roles,
extensions, fixed production schemas, or other database-global objects.

## PostgreSQL conformance

PostgreSQL contracts belong to an exact `(kind, version, provider)` conformance
owner. The package runner:

- discovers descriptors and rejects orphaned `contracts.pg.sql` files;
- reports kind, version, provider, and contract label;
- assembles the declared production SQL bundle;
- receives a launcher-created disposable database;
- runs ordered steps and cleanup.

The runner does not treat an arbitrary `DATABASE_URL` as proof of a disposable
target. CI provisions and destroys databases, pins required extensions, and
requires an explicit destructive-test guard.

Test SQL stays outside production connector directories.

## Immediate runtime correctness dependency

The production rerun path currently asks the repository for
`repository.get(kind, body.version)`. Without a version, this follows the
current default channel and places that definition before the stored snapshot.
A rerun can therefore retarget an installation silently.

For catalog-backed installations, rerun must:

```text
repository.get(kind, installation.definitionVersion)
```

- reject a caller-supplied target version;
- verify the returned kind and version;
- reconcile only the active release;
- leave version changes to a future explicit `upgrade` operation.

Manual definitions are currently persisted as `definitionVersion:
"unversioned"`. Their rerun keeps a separate, explicit snapshot path:

- require a stored definition snapshot;
- reject a replacement definition or version;
- support only resources fully represented by that snapshot;
- fail closed for connector resources whose SQL or Function files are external.

The stored definition snapshot remains useful for audit, CSP, and display. It
is not a complete offline release because connector SQL and Edge Function
files remain external resources. A missing exact release must fail closed
unless a future content-addressed release bundle stores all executable assets.

## Runtime dependency limitation

Current integration dependencies identify only a `kind`. Exact-version
composition tests are deterministic evidence, but they are not runtime
compatibility enforcement.

Before publishing a second version of any integration used by another
integration, the runtime must implement the dependency-range contract described
in [Deferred runtime versioning and upgrades](#deferred-runtime-versioning-and-upgrades).
This requirement is not part of the physical test migration.

## Automated enforcement

| Invariant | Check |
| --- | --- |
| Catalogue versions are known | Parse every `integration.json` |
| Required test owners exist | Derive expectations from indexes and resolved definitions |
| Contract owners are valid | Match kind and introduction version to the catalogue |
| Artifact conformance owners are valid | Match kind and exact version to the catalogue |
| Connector conformance owners are valid | Match kind, exact version, and declared provider |
| Version suites never follow channels | AST check for repository loads and helpers |
| Introduction contracts are temporally valid | Run every suite against exactly its introduction version |
| API suites stay public | Import-graph or AST check for connector paths, SQL, SDKs, and provider observations |
| Compositions are deterministic | Require an exact version for every participant |
| PostgreSQL contracts are registered | Reject missing descriptors and orphaned SQL |
| Tests remain unpublished | Inspect packed contents and public subpaths |
| Suites execute exactly once | Compare aggregate discovery with the inventory |
| Stateful bindings are isolated | Require declared isolation and cleanup |
| Live tests are opt-in | Guard non-auto-discovered smoke descriptors |

Enforcement starts with a shrinking ownership-path allowlist. A migrated owner
receives its final rules immediately, and the allowlist cannot grow without an
explicit review of a newly identified pre-existing path.

## Delivery scope

### Implement now

- exact version references and identity checks in tests;
- contract, artifact conformance, connector conformance, catalogue,
  composition, smoke, and support ownership;
- public Source bindings;
- Edge Function and database isolation;
- generic PostgreSQL discovery;
- exact-once aggregate execution and coverage merging;
- package-content and import-boundary guardrails;
- BAN behavioral coverage;
- production rerun pinning.

### Specify now, implement when triggered

- cumulative SemVer selection once a second version exists;
- explicit version activation with the first additional release;
- dependency ranges before a depended-on integration gains another version;
- resource overlays and materialization before the next Commerce release;
- persistent-data migration machinery with the first state-changing release.

The deferred items are runtime versioning work, not hidden tasks in the current
test migration.

## Definition of done

The migration is complete when:

- every declared version has valid public contract ownership and every required
  exact artifact or connector conformance owner derived from its definition;
- every migrated load and composition is exact;
- every introduction contract passes against its introduction version;
- public, artifact-conformance, and connector boundaries are enforced;
- stateful bindings and PostgreSQL databases are isolated;
- all PostgreSQL contracts are descriptor-owned;
- live tests are opt-in;
- every deterministic suite executes exactly once;
- coverage and packed contents remain correct;
- the ownership-path allowlist is empty;
- workspace quality gates pass.

## Non-goals

This migration does not:

- copy tests for every target version;
- make historical implementation assertions cumulative;
- add test-support metadata to integration indexes;
- implement runtime dependency ranges;
- introduce resource inheritance;
- build an upgrade ledger or migration saga;
- promise downgrade or cross-major compatibility.

## Execution plan

### Purpose

This section contains the dated inventory, migration order, and exit criteria
for the official integration test migration. The durable ownership and boundary
rules remain the source of truth for every implementation slice.

The plan deliberately avoids a package-wide folder move followed by a second
semantic rewrite. Apart from the initial version-safety step, each slice moves
one owner to its final structure, establishes the correct boundary, validates
it, and enables its guardrails.

This plan does not implement dependency ranges, resource authoring, or
persistent-state upgrades. Those features have explicit future triggers in the
deferred runtime section.

### Baseline

The source inventory recorded on 2026-07-22 is:

- 12 `integration.json` indexes;
- one `1.0.0` version for each current integration;
- 991 files below the package test tree;
- 199 `*.test.ts` entrypoints;
- 104 `*.contracts.ts` modules;
- 218 SQL files;
- 40 test entrypoints with a direct `versions/1.0.0` path;
- 46 locally constructed filesystem repository `get` calls, all currently
  using one argument;
- 117 connector-aware entrypoints when transitive imports, dynamic paths, and
  direct connector reads are included;
- five entrypoints reaching `handleSourceRequest` transitively.

The workspace baseline recorded on 2026-07-23 is:

- `bun run check:all`: 6 checks passed, 0 failed;
- repository shape: informational findings, 0 blocking fanout errors.

Representative evidence:

- [package test tree](packages/resources/official-integrations/tests)
- [package instructions](packages/resources/official-integrations/AGENTS.md)
- [resource layout and immutability](packages/resources/official-integrations/README.md)
- [package publication boundary](packages/resources/official-integrations/package.json)
- [filesystem definition repository](packages/features/cms-integrations/src/default-implementation/fs-definition/repository.ts)
- [coverage discovery](quality/ci/coverage/measurement/measurement.ts)
- [mixed Commerce version test](packages/resources/official-integrations/tests/commerce-account-offers.1.0.0.test.ts)
- [connector-coupled Commerce harness](packages/resources/official-integrations/tests/commerce/harness.ts)
- [installed-Source User Account harness](packages/resources/official-integrations/tests/core-integrations/user-account/harness/create.ts)
- [installed-Source Stripe Connect requests](packages/resources/official-integrations/tests/stripe-connect/runtime/source-requests.ts)
- [hard-coded PostgreSQL runner](packages/resources/official-integrations/tests/helpers/runPostgresContracts.ts)
- [kind-only dependency resolution](packages/features/cms-integrations/src/core/import/dependencies.ts)

### Current owners

| Current location | Files | Entrypoints | Target owner |
| --- | ---: | ---: | --- |
| `tests/core-integrations/user-account/` | 15 | 2 | User Account `1.0.0` |
| `tests/core-integrations/basic-blocs/` | 18 | 1 | Basic Blocs `1.0.0` artifacts |
| `tests/mondial-relay/` | 112 | 22 | Mondial Relay `1.0.0` plus smoke |
| `tests/stripe-connect/` | 310 | 1 | Stripe Connect `1.0.0` |
| `tests/commerce/` | 304 | 117 | Commerce `1.0.0` |
| `tests/commerce-integrations/commerce-negotiation/` | 12 | 6 | Commerce Negotiation `1.0.0` |
| `tests/commerce-integrations/commerce-mondial-relay-delivery/` | 17 | 8 | Matching extension `1.0.0` |
| `tests/commerce-integrations/commerce-stripe-payments/` | 81 | 14 | Matching extension `1.0.0` |
| `tests/commerce-integrations/commerce-mondial-relay-fulfillment/` | 88 | 18 | Matching extension `1.0.0` |

Additional mappings:

| Current location | Target |
| --- | --- |
| `tests/core-integrations/public/resourceBundles.test.ts` | `tests/catalog/bundles/` |
| `tests/core-integrations/public/exports.test.ts` | `tests/catalog/exports/` |
| `tests/commerce-account-offers.1.0.0.test.ts` | Commerce `1.0.0/artifacts/` |
| `tests/emailer/` | Separate Newsletter and Emailer owners plus composition |
| `tests/commerce-integrations/combined-installation.test.ts` | `tests/compositions/protected-commerce/` |
| `tests/helpers/` | Narrow version owners or `tests/support/` |
| `tests/helpers/runPostgresContracts.ts` | Generic runner plus version-owned descriptors |

BAN has no dedicated version suite. Because `1.0.0` is its current `stable` and
`latest` target, it needs a small public or artifact contract.

### Rules for every migration slice

Each slice follows the same sequence:

1. inventory the entrypoints, registered contracts, fixtures, global state,
   connector imports, SQL, and live-provider dependencies;
2. record either the public contract introduction `(kind, version)` or exact
   connector conformance `(kind, version, provider)` owner;
3. move files with history preserved and without compatibility entrypoints;
4. make definition resolution explicit;
5. separate API, artifact, and connector assertions;
6. bind API scenarios to the real connector, or to the installed direct
   upstream Source, through test-only code;
7. isolate Edge Function or database state;
8. run the slice alone and in the aggregate;
9. verify entrypoints execute exactly once;
10. inspect coverage and packed contents;
11. enable the migrated-path guardrails;
12. remove the slice from the legacy allowlist.

Structural moves and semantic boundary changes should remain separately
reviewable even when they belong to the same vertical slice.

Before the isolated launcher exists, standard validation is:

```bash
bun test packages/resources/official-integrations/tests/<migrated-path>
bun test packages/resources/official-integrations/tests
git diff --check
bun run check:all
```

PostgreSQL slices also run `test:postgres` against dedicated disposable
databases provisioned by the launcher. Every slice compares entrypoint
discovery, coverage, and packed contents with its baseline. From the User
Account pilot onward, the package aggregate launcher becomes authoritative and
coverage merges its child LCOV outputs. JavaScript or TypeScript changes
additionally run `bun run format`, followed by diff inspection.

### Step 0: complete the execution baseline

Before changing test behavior:

- run the current package tests and record duration;
- enumerate all Bun entrypoints and registered contract modules;
- run the seven currently registered PostgreSQL contracts in disposable
  databases;
- inventory the seven additional `contracts.pg.sql` files and define their
  required bundle, order, and destructive guards before trying to execute
  them;
- record coverage;
- inspect the package archive;
- classify each entrypoint by final owner.

There are currently 14 `contracts.pg.sql` files and seven central runner
registrations. The unregistered set contains Mondial Relay seller handoff, four
Commerce contracts, and two extension contracts.

Gate: results, duration, coverage, archive contents, and entrypoints are
recorded; every PostgreSQL contract is classified; pre-existing failures are
identified.

### Step 1: install global version safety

This is the only intentionally horizontal implementation step because it
removes the silent-retargeting risk before the longer folder migration.

Actions:

- introduce the required `{ kind, version }` reference type;
- add a definition helper that always calls `repository.get(kind, version)` and
  verifies the resolved identity;
- classify all current one-argument repository loads;
- convert version-owned loads to explicit versions;
- move or mark intentional channel checks as catalogue behavior;
- fix tests combining a raw version path with a default-channel definition;
- derive API, public artifact, exact artifact-conformance, connector, and
  catalogue ownership obligations from `integration.json` and resolved
  definitions;
- make catalog-backed rerun resolve `installation.definitionVersion`, reject a
  caller-supplied target version, and preserve an explicit snapshot-only path
  for supported manual `unversioned` definitions;
- add an AST check with no version-owned lookup exception;
- add a separate shrinking ownership-path allowlist for versions not yet moved
  into the mirror.

Gate: only catalogue tests follow channels; rerun cannot retarget through a
channel; every declared version has derived ownership expectations or remains
on the shrinking migration allowlist; existing same-version rerun behavior is
preserved; and the AST check blocks new implicit test lookups.

Index integrity and channel rules apply globally immediately. Contract,
binding, and API-boundary enforcement applies only to migrated owners.
Unmigrated owners remain on the ownership-path allowlist until their slice
completes.

### Step 2: Source API pilot — User Account

User Account is the first pilot because it is small and its harness already
installs the definition and invokes requests through `handleSourceRequest`.

Target:

```text
tests/integrations/domains/user-account/
|-- contracts/
|   `-- introduced-in/
|       `-- 1.0.0/
|           |-- api/
|           `-- artifacts/
`-- connector-conformance/
    `-- versions/
        `-- 1.0.0/
            `-- supabase/
```

- move its 15 files and two entrypoints to the mirror;
- bind the context to `user-account@1.0.0`;
- bind requests to the installed `user-account` Source;
- split public responses from Supabase/PostgREST observations;
- load the real Edge Function only in the Supabase binding;
- add an explicit authorizer to scenarios that claim HTTP authorization;
- introduce the package aggregate launcher and a non-auto-discovered binding
  descriptor;
- implement `dispose()` and a child process for the binding's global state;
- update package coverage to merge the binding process's LCOV output;
- add package-content and exact-once discovery checks for the pilot;
- prove every `introduced-in/1.0.0` contract against exactly
  `user-account@1.0.0`.

Do not extract a large shared factory yet. Stabilize only the smallest
Source-bound interface supported by this real harness.

Gate: User Account has its final owner; API code has no direct connector
import; the real connector still executes; provider assertions are
conformance-owned; isolated and aggregate runs execute once without leaked
state; coverage, packing, and workspace checks remain valid.

### Step 3: artifact pilot — Basic Blocs

Basic Blocs validates version-owned resources that do not need a Source driver.

- split its 18 files between public behavior under
  `tests/integrations/foundation/basic-blocs/contracts/introduced-in/1.0.0/artifacts/`
  and implementation assertions under
  `tests/integrations/foundation/basic-blocs/artifact-conformance/versions/1.0.0/`;
- resolve and hydrate exactly `basic-blocs@1.0.0`;
- compile or consume declared artifacts through their public resource shape;
- classify `editorJS`, CSS, generated-source, bundle-layout, and narrow helper
  assertions as exact-version artifact conformance.

Gate: no artificial Source abstraction is introduced; public artifact behavior
and exact implementation coverage are distinguishable; isolated and aggregate
runs pass; the layout respects fanout guidance.

### Step 4: small Source owners — BAN, Newsletter, and Emailer

Recommended order:

1. give BAN a minimal Source contract using its installed direct-upstream
   Source and injected `fetchImpl`;
2. migrate Newsletter as the second Source implementation;
3. extract shared Source driver behavior from User Account and Newsletter;
4. migrate Emailer;
5. move Newsletter-and-Emailer behavior into a composition with both versions
   pinned.

Emailer is not the first pilot because its current folder contains two
integration owners and their combined behavior.

Gate: BAN has behavioral coverage; Newsletter and Emailer have separate
owners; the extracted driver reflects two integrations; their composition pins
both versions; fixtures have their narrowest owner.

### Step 5: taxonomy and PostgreSQL pilot — Mondial Relay

Mondial Relay is the first complete API, artifact, connector, PostgreSQL, and
live-smoke slice.

- separate public Source behavior from provider protocol assertions;
- move bloc behavior under artifacts;
- move PostgreSQL and provider behavior under Supabase conformance;
- create the first version-owned PostgreSQL descriptor;
- include the currently orphaned seller-handoff contract;
- place real-provider requests under opt-in smoke;
- name live files `*.smoke.ts` and run them only through guarded `test:smoke`;
- measure isolated PostgreSQL runtime in CI.

Gate: API scenarios expose no SQL, RPC, or provider encoding; protocol and
security coverage remains; all Mondial Relay PostgreSQL files are
owner-discovered on dedicated launcher-controlled databases; smoke is opt-in;
the required PR job covers migrated descriptors and registered legacy
contracts.

### Step 6: Stripe Connect

Stripe Connect already uses an installed-Source request pattern, but its 310
files are registered through one test entrypoint. Double discovery and module
state are the principal migration risks.

- preserve provider-neutral registered API scenarios;
- create the second version-owned PostgreSQL descriptor;
- remove the remaining hard-coded version map from the central runner;
- isolate handler registration per binding process;
- ensure no old and new entrypoint both register the same contracts;
- separate provider observations, webhook protocols, reconciliation, and
  persistence.

Gate: every registered contract executes once; handler registration is
isolated; the public driver exposes no provider observation; PostgreSQL
ownership no longer uses a central integration registry.

### Step 7: Commerce in cohorts

Commerce moves after the driver, isolation, and PostgreSQL descriptor patterns
are proven. It moves before its extensions to avoid making extension suites
follow temporary Commerce fixture paths twice.

Recommended cohorts:

1. establish the final stable Commerce driver and binding import boundary,
   updating all 113 current harness consumers once;
2. split `commerce-account-offers` and other artifact suites into public
   contracts and exact-version artifact conformance;
3. cart and catalogue;
4. selling and orders;
5. protected behavior;
6. Supabase SQL, the four Commerce PostgreSQL descriptors, and connector
   conformance.

Each entrypoint moves with its local dependencies. No compatibility alias may
allow Bun to discover both paths.

Each cohort must resolve the exact version, avoid duplicate entrypoints, keep
public assertions on installed boundaries, keep Supabase observations in
conformance, and match the baseline. The final gate removes `tests/commerce/`
and the hybrid root test, assigns the 117 directory entrypoints plus the hybrid
entrypoint, and leaves no direct production connector import in Commerce API
contracts.

### Step 8: Commerce extensions and compositions

Migrate extensions after their Commerce and provider dependencies have stable
test owners.

Recommended order:

1. Commerce Negotiation;
2. Commerce Mondial Relay Delivery;
3. Commerce Stripe Payments;
4. Commerce Mondial Relay Fulfillment;
5. combined installation and protected-commerce compositions.

Gate: every extension has its own version owner; every dependency and final
composition participant is pinned; shared Commerce fixtures have deliberate
owners rather than fragile relative imports; the two extension PostgreSQL
contracts have version-owned descriptors.

The exact composition matrix is deterministic test evidence. It does not claim
runtime dependency compatibility until `versionRange` is implemented before a
depended-on integration publishes another release.

### Step 9: package-wide closure

Actions:

- move bundle, export, channel, and resource-graph checks to `catalog/`;
- derive expected versions and bundle counts from indexes instead of constants;
- finish `compositions/`, `smoke/`, and root `support/`;
- enable all consistency, API-boundary, composition, PostgreSQL, package, and
  coverage checks;
- reject every descriptor without files and every orphaned `contracts.pg.sql`;
- require the complete PostgreSQL matrix for every declared version and
  provider that owns PostgreSQL conformance;
- add separately reportable package commands while retaining one exact-once
  aggregate;
- update package `README.md` and `AGENTS.md`;
- remove the legacy allowlist.

Compatibility and migration suites are introduced only when the first second
version creates a real transition. Runtime dependency ranges and upgrade
semantics must exist before those tests are treated as operational guarantees.

Gate: the complete definition of done above passes.

### Guardrail rollout

| Point in migration | Enforcement |
| --- | --- |
| Step 1 | No implicit version lookup; derived index coverage; legacy ownership-path allowlist |
| User Account pilot | Final mirror, API import, binding, isolation, and package checks for User Account |
| Basic Blocs pilot | Public artifact and exact-version artifact-conformance ownership checks |
| First composition | Exact version-matrix validation |
| Mondial Relay | Its PostgreSQL descriptors, legacy PostgreSQL allowlist, and smoke opt-in checks |
| Stripe Connect | Exact-once registered-contract check |
| Each later slice | Remove paths from the shrinking legacy allowlist |
| Closure | Full-tree enforcement, complete PostgreSQL matrix, and empty allowlists |

Guardrails follow proven target shapes but immediately protect every migrated
slice. The allowlist can shrink but never grow without an explicit review of a
newly discovered pre-existing path.

### Completion report

The final migration report must list:

- every migrated public contract introduction `(kind, version)`;
- every migrated artifact conformance owner `(kind, version)`;
- every migrated connector conformance owner `(kind, version, provider)`;
- the derived coverage result for every declared version;
- execution bindings, optional providers, and isolation mode;
- PostgreSQL descriptors and CI coverage;
- live smoke commands and credential requirements;
- entrypoint and runtime comparison with the baseline;
- coverage and packed-content comparison;
- any intentionally retained white-box tests and why they remain useful.

## Deferred runtime versioning and upgrades

Status: Deferred design proposal

Scope: `@bernouy/cms-integrations` and official integration resources

This section records constraints for future releases. It is not the
implementation plan for the current test migration.

### Maturity and implementation triggers

The repository currently publishes one version, `1.0.0`, for every official
integration.

| Trigger | Required work |
| --- | --- |
| Current test migration | Exact test references and rerun pinning |
| First additional version of any integration | SemVer selection, release digest, release authoring, and explicit upgrade activation |
| Before an additional version participates in a dependency graph | Dependency ranges, legacy overrides, persisted bindings, and reverse checks |
| First version transition changing persistent state | Migrations, ledger, resume, and locks |
| First cross-major transition | Declared transition path and compatibility contract |

The first real release that triggers each row must pressure-test the design
before shared machinery is generalized.

### Model

Integration versioning separates four concerns:

| Concern | Model |
| --- | --- |
| Public contracts | Cumulative compatibility within one SemVer major |
| Published resources | Complete, immutable release |
| Release authoring | Exact base plus reviewable changes, then materialization |
| Persistent state | Explicit, append-only, checksummed migrations |

Contract inheritance does not imply implementation inheritance.

### Runtime dependency ranges

An integration dependency declares one SemVer range:

```json
{
    "name": "commerce",
    "kind": "commerce",
    "versionRange": ">=1.2.0 <2.0.0"
}
```

`compatibleMajors` is not a second source of truth. An integration may require
a contract introduced in a later minor, and a range can express that minimum.
Compatible majors may be derived for display.

The runtime must:

- validate dependency ranges when parsing definitions;
- compare every present dependency with its installed `definitionVersion`;
- reject a present but incompatible optional dependency;
- check reverse dependants before upgrade or uninstall;
- validate the final graph before a grouped upgrade;
- persist resolved bindings with dependency name, kind, installation id, and
  exact definition version;
- expose exact bindings to audit and drift diagnostics.

Composition tests pin exact versions and prove one tuple works. Runtime ranges
decide whether that tuple is allowed.

#### Existing kind-only releases

Published `1.0.0` definitions currently declare dependencies without ranges and
must not be edited in place. Before the first dependency version transition:

- add an integration-root, cross-version compatibility manifest that assigns
  ranges to those immutable legacy releases;
- treat that manifest as a migration-only override and reject conflicts with a
  range declared by the release itself;
- require every new release to declare `versionRange` directly;
- persist the exact bindings of existing installations during adoption;
- fail closed on a dependency version change when neither a declared range nor
  an approved legacy override exists.

This preserves release immutability without allowing a kind-only dependency to
authorize every future version.

### Published resources

A published release must not use runtime inheritance such as:

```json
{
    "extends": "1.3.14"
}
```

Runtime inheritance makes deletion, array merging, partial Function
replacement, and SQL ordering ambiguous. It also couples a release to an
unbroken chain of historical files.

Resolving `(kind, version)` depends only on that immutable release and
explicitly pinned external packages. Definitions, Blocs, assets, connector
files, and Edge Functions are complete in the packaged release.

Shared executable code belongs in a separately versioned dependency. It must
not be imported from another integration release or a mutable shared folder.

### Release authoring

Small integrations may initially clone an exact previous release. Tests are not
part of that copy: contract tests remain owned by their introduction version.

Commerce already contains 683 resource files, including 197 SQL files.
Beginning with its first later release, Commerce should use a file-level
authoring overlay:

```text
authoring/domains/commerce/releases/1.0.1/
|-- release.json
|-- overlay/
`-- deleted-paths.json
```

`release.json` pins an exact base and digest and carries the target catalogue
entry. Channel changes remain separate and intentional. The build:

- replaces whole files and applies explicit deletions;
- rejects generic deep JSON merging;
- detects cycles and escaping paths or symlinks;
- verifies kind, version, and the base digest;
- materializes a complete package release;
- produces a path-to-SHA-256 inventory;
- fails when repeated generation differs.

Committing both a small overlay and hundreds of generated copies does not solve
review noise. The implementation must make the overlay the primary review
surface and materialize the complete release into a deterministic package or
staging output. The packaged result remains self-contained at runtime.

The current package exposes `./integrations` directly, so overlay support must
also define its build wiring:

```text
packages/resources/official-integrations/
|-- integrations/              # Canonical non-overlay source releases
|-- authoring/                 # Overlay inputs, excluded from publication
`-- .generated/integrations/   # Complete local materialization, ignored by Git
```

- generation runs before integration tests, development runtimes, and packing;
- the workspace integration-root resolver uses the generated tree once
  overlays exist;
- every contract runs against the generated exact release;
- pack uses a staging package that publishes generated contents as
  `integrations/`, preserving existing public export paths;
- CI compares generated inventories and packed contents;
- source `integration.json` entries cannot point to an overlay release until
  generation and packaging wiring are active.

### Lifecycle operations

| Operation | Meaning |
| --- | --- |
| `install(targetVersion)` | Create an installation from an exact release |
| `rerun()` | Reconcile the exact active release |
| `upgrade(targetVersion)` | Change release through a migration plan |
| `resume(attemptId)` | Continue a durable interrupted operation |
| `uninstall(dataPolicy)` | Detach artifacts or explicitly purge owned state |

Catalog-backed rerun resolves `installation.definitionVersion` from the
immutable repository and rejects a target-version argument. A manual
`unversioned` installation may rerun from its stored snapshot only when every
required resource is embedded there. It fails closed for external connector
SQL or Function assets. The snapshot otherwise supports audit, CSP, and drift
diagnostics; it is not a general fallback for a missing release.

Uninstall does not apply automatic down migrations. Its safe detach policy:

- disables or removes owned Triggers, workers, webhooks, Edge Functions, and
  other executable external resources;
- revokes no-longer-needed secrets and active provider configuration;
- removes owned CMS artifacts;
- retains persistent data and the migration ledger;
- writes an auditable tombstone containing connector identity and bindings.

Reinstallation must explicitly verify and adopt a compatible tombstone and
ledger. Destructive purge is a separate policy with reverse-dependency checks,
preconditions, backup requirements, and an audit record.

### Persistent state identity

Integration SemVer and connector migration revision are related but
independent. Avoid the ambiguous name `schemaRevision`; use
`migrationRevision`.

Every connector gains a stable `connectorKey`; provider alone is not an
identity because one definition may contain several connectors for the same
provider. Every migration chain also declares a stable `lineageId`.

The revision is scoped by:

```text
(integration kind, connectorKey, lineageId)
```

Application state is further scoped to a persisted `connectorInstanceId`.
A major release must explicitly continue an existing lineage or declare a new
one and its transition. Two integrations sharing one physical Supabase database
have separate migration lineages, but still require explicit ownership and
ordering rules for shared database objects.

The ledger, rather than the numeric revision alone, is authoritative.

### Migration descriptors and ledger

An illustrative migration descriptor is:

```json
{
    "id": "commerce-supabase-0007",
    "connectorKey": "primary",
    "lineageId": "commerce-supabase-v1",
    "fromRevision": 6,
    "toRevision": 7,
    "introducedIn": "1.3.0",
    "transaction": "atomic",
    "path": "migrations/0007-add-order-revision.sql",
    "checksum": "sha256:..."
}
```

Connector resources distinguish:

```text
connectors/supabase/
|-- install/       # Complete target state for a fresh installation
|-- migrations/    # Exactly-once state and data transformations
|-- repeatables/   # Safe target-state reconciliation
`-- functions/     # Complete Edge Function bundles
```

Backfills, destructive statements, and one-time transformations are forbidden
in repeatables.

Each connector instance maintains an applied-migration ledger with the logical
key:

```text
(connectorInstanceId, integrationKind, connectorKey, lineageId, migrationId)
```

It stores provider, checksum, revision, introduction version, timestamp, and
attempt id. Migration SQL and ledger insertion commit in the same database
transaction.

- Recorded id and matching checksum: skip.
- Recorded id and different checksum: block.
- Failed transaction: record neither state nor ledger entry.

Published migration files are append-only. Repository CI must reject edits to
already published ids by comparing their paths and hashes with the release
baseline. Formatter exclusions alone are insufficient; the current Biome
configuration does not format SQL anyway.

A fresh-install manifest declares its baseline revision, digest, and the
immutable migration ids and checksums it covers. Successful bootstrap records
that baseline atomically with its final database step. The planner treats the
covered migrations as applied; an empty ledger is never assumed to mean a
bootstrapped target. A partially completed bootstrap remains an incomplete
installation that must be inspected or resumed.

### Upgrade execution

No global transaction covers PostgreSQL, provider management APIs, Edge
Functions, CMS repositories, and external systems. Upgrade is a durable saga:

1. Resolve exact source and target releases.
2. Validate SemVer direction, dependency graph, manifests, checksums, files,
   preconditions, and migration continuity.
3. Acquire an installation lease and provider-specific locks.
4. Apply backward-compatible expansion migrations.
5. Run resumable data backfills.
6. Deploy repeatable database resources, configuration, and target Functions.
7. Reconcile CMS artifacts to the complete target snapshot.
8. Verify target behavior.
9. Atomically activate the target definition version and bindings.
10. Perform destructive or obsolete-resource cleanup only when safe.

Operation state records at least:

```text
currentVersion
targetVersion
operation
phase
attemptId
fencingToken
leaseExpiresAt
```

It also contains a durable step journal. Every step records its id, target
digest, idempotency key, status, attempt, external operation id when available,
and confirmation timestamp.

Database advisory locks protect connector changes. A repository lease with a
fencing token prevents an expired worker from committing after another worker
takes over. Advisory locks are reacquired around database steps; they do not
protect the complete external saga. Every external mutation must therefore
support either a stable idempotency key or read-after-write reconciliation
against the target digest. The worker verifies its lease before and after each
external action.

Operators need inspect, resume, abort-before-activation, and audited
force-takeover operations.

If database work succeeds but Function or CMS deployment fails,
`currentVersion` remains unchanged. The ledger and step journal let a retry
confirm remote state and resume without repeating successful transformations.

### Rollback and destructive changes

Automatic down migrations are not the default. Prefer roll-forward schema with
rollback-compatible code:

- add before removing;
- backfill before adding strict constraints;
- use dual-read or dual-write during renames;
- keep the previous runtime compatible with expansion work;
- remove deprecated state in a later release;
- chunk large backfills and persist progress;
- require backup and explicit acknowledgement for irreversible work.

Destructive cleanup occurs after durable target activation, never before.

### Fresh and migrated equivalence

Fresh installation applies the complete target bootstrap. Upgrade applies the
declared migration path. CI compares their canonical state and behavior.

For every implemented target, tests cover:

- fresh installation;
- every supported earlier origin in the same major;
- explicit cross-major paths;
- second execution as a no-op;
- checksum and ordering failures;
- interruption and resume at every external phase;
- a crash after remote success but before the local success record;
- concurrent-operation serialization;
- preservation and transformation of existing data;
- downgrade rejection by default;
- reverse dependency rejection;
- safe uninstall retention and explicit purge.

### Dashboard and Bloc boundaries

Dashboard resources are declarative configuration. The host owns rendering and
the widget registry. An integration declares the supported Dashboard format and
required capabilities, and unsupported combinations fail during installation
or composition.

Bloc resources are different: the integration release owns executable
`viewJS`, `editorJS`, and its complete source bundle. The host owns the compiler,
loader, and runtime contracts that execute those pinned assets. Shared browser
clients belong to explicitly versioned package exports; a Bloc must not import
another integration release or a mutable shared directory.

Neither boundary turns integration resources into implicit host plugins.

### Deferred design non-goals

This design does not:

- infer migrations from snapshot diffs;
- introduce runtime release inheritance;
- make exact composition tests replace runtime range checks;
- promise automatic downgrade;
- provide a global transaction across independent systems;
- require persistent-state migration machinery before a version transition
  changes persistent state.
