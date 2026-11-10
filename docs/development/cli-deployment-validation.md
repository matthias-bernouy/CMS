# CLI deployment validation — 2026-11-10

This report covers the root CLI deployment lifecycle implemented on `v1.0.9`,
in a working tree based on `a27c47b51`. It records that checkout's evidence,
not a guarantee about later releases. See the [lifecycle guide](deployment-lifecycle.md).

## Passed checks

- Initial and final `bun run check:all`: 10 checks passed, none failed.
- Final `bun run verify`: 3,585 tests passed, 53 skipped, none failed;
  the performance suite also passed its budgets.
- Native Docker/browser journey with freshly built
  `0.1.0-deployment-test` Provider and Edge images: one test passed,
  142 assertions. It creates empty Control and isolated logical sites,
  restarts them and applies a second shared Edge.
- ACME/Pebble journey with the same candidate Provider: fresh and restart phases
  passed, 37 assertions in total, including certificate persistence on both entrypoints.
- Docker delivery performance journey with the candidate images: one test passed,
  1,517 assertions, including both sustained 200-page-views/minute campaigns.
- CLI npm archive built locally; its actual tar member was read through the
  release parser and passed version, exact inventory and digest validation.
- Changed Markdown local links resolve; `git diff --check` passed.

The deployment tests additionally verify that a newer compiled CLI starts the
old snapshot without image pulls or Compose regeneration, pending configuration
is only consumed by apply, missing containers require apply, corrupt artifacts
refuse without repair, and a failed upgrade resumes its exact recorded target.
The log tests cover filter semantics, reads without CMS authentication, UTF-8
line bounds, cancellation and absence of a following-reader mutation lock.
Upgrade failure recovery uses the Docker fixture; the native browser journey
does not claim an actual published-version upgrade or database rollback.

The delivery samples measured 29.5/28.1/20.8 MongoDB operations per request for
literal Pages/image Pages/immutable assets (including seven routing reads),
and 3.4/3.9/3.8 internal calls. Warm cache hits used seven MongoDB operations,
one internal call and no Content operations per request. The two load campaigns
each completed 420 requests in about 125.7 seconds, including 105 authenticated
administrator requests. These are candidate measurements, not a before/after
claim about this CLI refactor.

## Extended Docker failures

An additional `verify:full` invocation supplied the candidate image variables
globally. This also enabled older image/integration suites during the initial
`verify` stage: 3,587 tests passed, 45 skipped and six failed. That invocation
therefore did not reach its later stages. The failures remain unresolved and
are outside the CLI lifecycle paths changed here:

| Test | Observed failure |
| --- | --- |
| Repository website image journey | Account deletion returned 503 where the test expected 409. |
| Repository runtime image journey | Its publication fixture failed contract identity validation. |
| Repository CLI image journey | Its authored fixture tried to create a nested directory without its parent. |
| Repository permissions image journey | Expected manifest 1.3.0; candidate contains 1.4.0. |
| Repository Authoring image journey | An administrator assertion returned false. |
| CMS MCP image journey | Expected 68 tools; candidate exposes 94. |

The permissions failure was reproduced separately with the pre-existing
`0.1.0-hosting-test.8` Provider image. The remaining failures were not independently
reproduced on a baseline image. No changes were made to these tests or their
Provider/Edge business implementations to hide the failures.

## Review decisions

The file-size advisory remains for `infra/cli/build.ts` (189 lines) and
`src/runtime/stack/installation.ts` in the CLI package (204 lines). Their cohesive
build pipeline and installation model were retained rather than split solely
for the advisory. No directory-fanout errors remain.

Deployment snapshots intentionally remain private and retained for recovery;
automatic historical snapshot pruning is not implemented. Older flat launch
state requires explicit recovery and is not silently imported. The tested CLI
archive and Docker tags are local test artifacts; this task publishes neither.
