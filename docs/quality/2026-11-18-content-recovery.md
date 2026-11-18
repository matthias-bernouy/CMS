# Content correction evidence — 2026-11-18

This records the uncommitted candidate on branch `v1.0.20`, based on
`a424c0dee`. It is a historical task report, not evidence for future checkouts.
No production database was upgraded or recovered by these tests.

## Second-review corrections

| Reported problem | Resulting behavior | Regression evidence |
| --- | --- | --- |
| Populated Bloc databases cannot start | Explicit offline projection upgrade, durable cursor, full verification before readiness; no startup backfill | `tests/integration/content/recovery/maintenance.docker.test.ts` and `cli.docker.test.ts` |
| Applied Page insert retains its fence after lost acknowledgement | Exact persisted document proof clears only that operation's uncertainty | `recovery/outcomes.docker.test.ts` and Content `references/recovery/outcomes.test.ts` |
| Pre-send driver errors retain the fence | Correlated `commandStarted` evidence distinguishes unsent failures from sent unknown outcomes, including retries | `recovery/outcomes.docker.test.ts` |
| No safe recovery path | Offline command checks active writes, claims the inspected token, audits projections and published references, releases only its own fence | `recovery/maintenance.docker.test.ts`, `quiescence.docker.test.ts`, `cli.docker.test.ts` |
| Old compositions exceed new read constraints | Read preserves old structure within the byte bound; separate identity query permits safe deletion above that bound | Content `blocs/catalogue/editing/limits.test.ts`; Provider `content/editing/compositions.test.ts` |
| Update conflicts look like invalid JSON or duplicate tags | Retryable `STATE_CONFLICT` for concurrent lifecycle changes; published-slot validation remains a semantic refusal | Provider `content/editing/errors.test.ts` |
| Concurrent archive/delete looks like a service outage | Conditional-delete failure becomes a domain 409 conflict with no deletion | Content `references/conflicts.test.ts` |
| Undeclared `CORE_UNAVAILABLE` mapping | Feature mapper declines codes absent from the capability's error contract | Provider `content/editing/errors.test.ts` |
| Alternate Mongo write APIs bypass the fence | Find-and-modify and bulk APIs enter the guard; unsupported mutations, `$merge` and `$out` refuse before execution | `recovery/commands.docker.test.ts` |
| Lost guard still accepts compensating writes | Commit state changes only after a successful ownership transition; loss is sticky and each subsequent mutation checks ownership | Content `references/recovery/outcomes.test.ts`; `recovery/commands.docker.test.ts` |
| Unbounded 20 ms lock polling | Five-second acquisition deadline; exponential delay capped at 250 ms | Content `references/recovery/outcomes.test.ts`: at most 30 reads during a busy lease |
| Repeated full snapshot serialization | Read serializes once per returned snapshot; update parses once and serializes the normalized snapshot once for its exact UTF-8 check; preflight traversal has bounded nodes/depth/bytes | Source review of `editing/documents.ts`, `snapshot/budget.ts` and `snapshot/index.ts`; boundary/refusal tests in `editing/limits.test.ts` and `invalid.test.ts` |
| Rendering clones unused reference indexes | Mongo rendering projection excludes `contentReferences`, editorial snapshots and source bundles; ordinary document decoding excludes the index before cloning | Content `references/scope.test.ts`; existing rendering/catalogue tests |
| Draft saves invalidate public caches | Edge update policy is neutral; runtime draft saves still hold maintenance permits but neither invalidate the public resource clock nor make it temporarily uncacheable | Edge `resources/command-policy.test.ts`; Repository `upgrades/storage/resourceRevision.test.ts` and `writeFence.test.ts` |
| Duplicate favicon validation | Capability delegates to repository settings validation | Source review; Content `settings/favicon.test.ts` and Provider `content/editing/favicon.test.ts` |

Content test paths above are under `packages/features/content/tests/application/mongo`
unless the Bloc/settings path is stated. Provider paths are under
`packages/surfaces/ulvia-provider/tests/capabilities`. Repository paths are under
`packages/features/repository/tests/collections/installations`.

## Boundaries and limits

All new editorial capabilities require an administrator and retain instance
isolation and revision/definition identity checks. Access, malformed input and
foreign-instance cases are covered in Provider `content/editing/access.test.ts`.
Mutation refusals preserve business state; maintenance journals and fencing
metadata may still change. Recovery never rolls back an unknown business write.

Maintenance requires all instance writers to be stopped. Active-operation checks
do not prevent an independent process from starting after inspection. The
operator must inspect the exact fence token. A failed audit retains its new token.
Scans use closed cursors with batches of one BSON document and a bounded
512-entry publication availability cache; an individual BSON record can still
reach Mongo's document limit. The runtime must enable command monitoring.
See the [operator procedure](../development/content-storage.md).

Reverse-reference deletion still uses two bounded indexed ID queries, with a
one-second deadline per query and at most 17 reported consumers before truncation.
The real Mongo budget includes 512 unrelated Blocs and caps examined documents at
32. Rendering keeps its existing full-catalogue list contract, but no longer
loads or clones the unused reverse-reference array or editorial snapshots.

The snapshot optimization removes redundant serialization; it does not remove
the necessary domain validation or the exact normalized byte check. Structure,
generic traversal and input-byte budgets remain in force for new writes.

The changed aggregate repository/facade files remain above the source-size
guideline. Their existing adapter/interface responsibilities were retained;
maintenance and command observation live in separate cohesive modules. The
final shape check has no directory-fanout errors.

## Validation

- `bun run check`: **10 passed, 0 failed** on the final source and tests.
- Combined Content, Provider, affected Repository, Edge resources and workspace
  regression scope: **1,321 passed, 0 failed** across 289 files. Authorization,
  foreign-instance access, invalid input, cache neutrality and lock outcomes are
  included. Additional final focused fence tests: **31 passed, 0 failed**.
- Real Mongo lifecycle suite: **15 passed, 0 failed**, 97 assertions across nine
  files. After tightening malformed-source refusal, migration/resume/recovery
  was rerun separately: **3 passed, 0 failed**.
- `bun run verify` completed with a nonzero result. Its ordinary suite recorded
  **3,873 passed, 71 skipped, 1 failed**: the existing pinned-transport DELETE
  body test at `tests/performance/harness/transport/payload.test.ts:43`.
  Transport implementation and that test were not changed by this task.
- General and Repository benchmark budgets passed. Their supplementary reports
  are `20261118T153218Z-a424c0dee702-7c1d61e7` and
  `20261118T153338Z-a424c0dee702-587b638d`; both record `sourceChanged: false`.
- Candidate images were rebuilt from the dirty checkout. Chromium acceptance
  initially could not allocate a Docker network. After removing exactly two
  inspected empty integration-test networks left since November 7, the rerun
  passed: **1 passed, 0 failed**, 142 assertions, including restart and two Edges.
  The 66 changed package source/configuration files were compared by SHA-256
  with both built images: no mismatches.
- TLS/ACME passed on fresh startup and restart: **1 passed** in each journey,
  with 18 and 19 assertions respectively.
- The full capability performance assessment failed during fixture allocation
  with Docker address-pool exhaustion (**0 executed scenarios**). It is not
  validated by the passing supplementary benchmarks or focused tests above.
- The delivery work-budget/cache journey passed after the same local network
  cleanup: **1 passed, 0 failed**, 1,529 assertions. Both 420-request load passes
  sustained approximately **200.4 requests/minute**, with **zero errors and zero
  timeouts**. Each pass included 105 authenticated administrator requests.
  Public response work stayed inside the existing ceilings: literal Page 22.8,
  image Page 20.4 and immutable asset 12.9 Mongo operations/request after the
  separately measured seven-operation routing floor; internal calls/request were
  4, 3.8 and 3.8 (ceiling 5). Cleanup reported no findings. Report:
  `20261118T153916Z-a424c0dee702-403750c0`.
  This supplementary run records `sourceChanged: true` because this task report
  was edited during the journey. Package code/configuration matched both images
  by hash. Treat these measurements as diagnostic evidence, not a stable
  performance reference or full capability coverage.

For the shipped Provider runtime, the collection installation scope is
`--site-id default`; the selected Mongo database identifies the instance.
Custom composition roots must supply their actual installation scope explicitly.

The exact command logs for this task are `/tmp/cmscore-recovery-final-check.log`,
`/tmp/cmscore-recovery-final-broad.log`, `/tmp/cmscore-recovery-verify.log`,
`/tmp/cmscore-recovery-browser.log` and `/tmp/cmscore-recovery-delivery.log`.
These logs are local ephemeral evidence. `git diff --check` and links in changed
documentation were checked separately.
