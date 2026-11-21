# Maintainability centralization — 2026-11-21

Implementation commit: `ac84aa4e9`, directly on `v1.0.22`, based on `c8c018100`.
This is a behavior-preserving extraction of three existing rules.

## Implemented rules

- Email Templates owns one frozen limits object in
  [core/limits.ts](../../packages/features/email-templates/src/core/limits.ts).
  Schemas, expansion preflight and final render validation consume it. String
  bounds explicitly use UTF-16 code units; serialized JSON bounds use UTF-8
  bytes. All values, validation order and pre-allocation refusal remain unchanged.
- Content's existing attribute binding module now owns the shared
  `implementationAttributeBindingKind` classifier. Page host and native element
  validation consume it. Static values, declared settings, contextual errors and
  native dynamic ARIA routing retain their separate validation paths.
- Providers calls the public Contracts `matchesStringFormat` predicate for
  date-time validation. Its parser preserves the non-empty string requirement,
  64-character bound, original accepted value, error code, message and field path.
  Email Templates' narrower UTC date profile is unchanged.

## Evidence

The starting and final `bun run check` passed all ten checks, including architecture,
cycle detection and typechecking. `bun run format` was applied and its changes
reviewed. No blocking directory-fanout finding was introduced.

Focused coverage passed 385 tests across 58 files, with 1,455 assertions. An
additional exact rendered-JSON boundary case was then added and the complete
four-test limits file passed. The full suite includes all 32 new boundary tests.

New regression coverage:

- [Template limits](../../packages/features/email-templates/tests/limits.test.ts):
  exact field/declaration bounds, 65,536-byte source JSON and 262,144-byte rendered
  JSON, rejection one byte above budget, UTF-16 lengths and HTML literal overhead.
- [Implementation attributes](../../packages/features/content/tests/blocs/markup/bindings/implementationAttributes.test.ts):
  both actual callers, boolean/string bindings, reserved attributes and preserved
  context-specific static/ARIA behavior.
- [Provider date-time](../../packages/platform/providers/tests/dateTime.test.ts):
  leap years, invalid dates and clocks, offsets, fractions, trailing whitespace,
  exact length bounds, unchanged error metadata and no normalization.

A before/after experiment compared 1,272 timestamp inputs (106 accepted and
1,166 refused), including calendar/clock/offset boundaries, fractional-second
lengths and non-string inputs. The complete results, including error messages
and paths, were identical.

All 62 generated official bootstrap files remain byte-for-byte identical to the
starting snapshot, including admitted contracts and Provider manifests. There is
no schema, contract version or digest change.

Full `bun run verify` completed successfully (exit status 0), including the
shared-hosting journey (215 assertions) and TLS on fresh installation (18
assertions) and persisted-state restart (19 assertions).

The general suite passed 4,538 tests, with 93 skips and no failures. The dedicated
collection browser suite passed four tests, capture browser suites passed 11 and
Mongo integration passed 18. The performance plan and compatibility checks passed:
249 executors and 1,933 scenarios, without measured latency/throughput results.
The first sandboxed verification attempt was stopped after local listener and
subprocess operations returned `EPERM`; the full command was restarted with the
permissions required by the repository's local integration tests.

## Runtime impact and limits of this review

No authorization, isolation, persistence, cache or network behavior changes.
Successful rendering retains the same four budget-related JSON serializations
(source, normalized source, preflight framing, final result). When HTML is present,
the unchanged HTML token-integrity check performs two additional serializations.
Expansion work and HTML classifier call counts are unchanged. Valid date-time parsing
still performs one regex match and one calendar check; dispatch through the shared
format predicate adds two small function-call layers, with no I/O.

Affected date callers include manifest publication policies, installation
creation/update/approval timestamps, installation clocks and Repository's Mongo
observation record parser. The shared HTML classifier has exactly two production
callers. The final suite exercises these domains; no performance improvement is
claimed and no measurement campaign was run for these small extractions.

The two existing large HTML validators became ten lines smaller each (201 and
273 lines). They remain cohesive and were not split beyond the requested scope.
Pre-existing user documentation changes were preserved byte-for-byte.

Local verification logs, timestamp corpus and bootstrap fingerprints are retained
under `artifacts/verification/2026-11-21-maintainability-centralization/`.
