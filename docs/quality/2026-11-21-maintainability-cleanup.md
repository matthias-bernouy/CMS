# Maintainability cleanup — 2026-11-21

This review records a scoped cleanup based on `bf97128d214a586eae90f16aee95ba5071e44c14`.
Implementation commits: `c7f7d6057` and `fb0cbe22e`, on
`codex/maintainability-cleanup`. No integration into `v1.0.22` is included.

## Implemented scope

- Removed `selectedQueryCapabilityResolver`. Its selection, exact-digest and
  refusal tests now exercise `selectedCapabilityResolver` with `effect: "query"`.
- Removed the unused browser `submitForm` transport and its exclusive options
  type. Form serialization and shared result types remain. Five tests now cover
  the live `MutationRequest` transport: success, declared refusal, network
  failure, cancellation and malformed responses. Removed the obsolete transport's
  UI network-policy exemption.
- Removed the unused bundled `collectionSource` input and collection adapter from
  official bootstrap provisioning. The runtime's HTTP collection repository
  remains in use for authored collections and is unchanged.
- Broke two contract parsing/admission import cycles by using the existing
  Foundation SHA-256 predicate directly. Broke the Content native HTML validation
  cycle by moving the unchanged binding-attribute predicate into an independent
  leaf module and preserving its public re-export. Enabled Knip cycle findings in
  the maintained check to prevent recurrence.

## Behavior and operation evidence

The removed resolver and form sender had no production callers. Live HTTP and
Mongo operation counts are unchanged. Bootstrap now constructs one fewer unused
collection adapter; no I/O reduction is claimed because that adapter was not read.

Digest validation calls the same underlying predicate, without the forwarding
wrapper. Binding-attribute validation still uses the same case normalization and
Set lookup. No authorization policy, cache behavior, persisted format, schema
value or template rendering limit was changed.

All **62 generated official bootstrap files** were compared by SHA-256 before
and after regeneration and again during final verification. They are byte-for-byte
identical, including contract definitions, Provider manifest and documentation
assets. No contract version or digest change is required.

## Validation

Frozen dependency installation succeeded. The baseline and final `bun run check`
both passed all 10 checks. `bun run format` was applied and its diff reviewed.
Knip's explicit cycle report is empty; the normal check now includes cycles.

Focused suites passed:

- Removal and live transport coverage: 101 tests, 295 assertions, 22 files.
- Contract and Content validation/browser coverage: 592 tests, 1,896 assertions,
  87 files, including immutable release and official Provider artifact tests.
- UI network policy tooling: 16 tests, 43 assertions, two files.

Full `bun run verify` completed successfully (exit status 0). Both TLS journeys
passed: 18 assertions on fresh installation and 19 after restart.

The general suite passed 4,506 tests with 93 skips and no failures. Additional
browser suites passed four collection tests and 11 capture tests. Dedicated Mongo
coverage passed 18 tests. The shared-hosting journey passed 215 assertions,
including account email delivery, isolated sites, persisted-state restart and two
Edge processes. The performance compatibility check passed, covering 249
executors and 1,933 planned scenarios. This validates the harness and plan; no
latency or throughput measurements were performed.

The pre-existing large native binding validator became smaller (249 to 245
lines). It was not split further because that would broaden the cleanup; no new
blocking directory-fanout issue was introduced.

The durable verification log is
`/home/matthias/Documents/Codex/2026-11-21/CmsCore-maintainability-verify.log`.

## Proposed next centralization, not implemented

### Email Templates limits

The schema, expansion preflight and final render validation repeat related
limits. Define one pure limits module owned by Email Templates and import it from
all three places. Preserve the current values and distinguish UTF-16 string
lengths from UTF-8 serialized JSON bytes, including JSON escaping overhead.
Keep checks before allocation and final validation. This is a source-of-truth
cleanup, not a limit increase or new instance configuration.

### Content HTML attribute classification

`dynamicImplementationAttributeKind` and
`implementationAttributeBindingKind` currently duplicate the same classification:
`hidden` is boolean; `id`, `tabindex`, supported ARIA and non-CMS `data-*`
attributes are strings. Share that pure classifier within Content. Retain each
caller's separate static-value rules, declared Bloc settings and contextual
refusals. Email HTML allowlists and dynamic/static escaping rules serve different
purposes and should not be merged mechanically.

### Ulvia date-time validation

Providers duplicates Contracts' calendar, leap-year, clock and offset checks.
Reuse the published `@bernouy/ulvia-contracts/validation` predicate through the
Provider parser. Preserve its 64-character field limit, error code and path.
Prove acceptance parity with boundary tests before removing its local predicate;
do not substitute `Date.parse` for validation.

### Lower-priority duplication

A common retained-memory estimator could replace the duplicated estimators in
Contracts and Gateway, while preserving each cache's keys, invalidation and
bounds. This estimator must remain distinct from serialized rendering budgets.
Shared Mongo revision/head primitives may also be useful, but contract and
Provider admission rules should remain separate and CAS race coverage is needed.
