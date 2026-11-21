# Email Templates upgrade and rendering corrections

Date: 2026-11-21. Branch: `codex/email-templates`, following `f9aefc2b1`.
The prior passing suites did not cover the four defects below. This review records
the corrected paths and their new evidence; earlier reports remain historical.

## Existing-instance upgrades

The exact previous primary manifest 1.9.0 is retained as a test artifact with digest
`sha256:8f04a28e10cb8f85f3347c4fd760136842ea7ac0d69d7c291f4e02fccd9a592e`,
produced before this branch at `7496cce8e`. Its Access 1.0 pin resolves to the exact
retained admitted release, not a rewritten current release.

Upgrade review now closes mandatory Provider/implementation requirements over exact
shipped implementations, accounting for inherited capabilities and version ranges.
The target retains every enabled family, may add required families and refuses
missing/ambiguous dependencies. Optional Hosting/Registry are not activated by
review, and cluster logs, Routing and TLS cannot enter an ordinary CMS plan.
New target pins also pass the explicit execution support matrix. The review remains
read-only, deterministic and bound to instance, administrator and source revision.

Account initialization now runs inside the durable `contracts` step, after selection
and Provider pairing. Readiness follows successful completion. A failure leaves
this step unfinished; recovery retries it without repeating completed manifest and
Provider steps. Initialization preserves existing associations, custom drafts,
setup, administrator and Repository configuration. There is no startup/read repair.
Registry activation and upgrades whose source already includes Templates cannot
recreate missing mandatory account configuration. An additional lease checkpoint
precedes missing-seed creation.

- [Exact upgrade review](../../packages/runtimes/ulvia-provider-server/tests/authentication/templates/upgrade/plan.test.ts):
  manifest 1.9 to 1.10, Access 1.0 to 1.1, required Templates added, ordinary and
  Control instances, stable plan digest and unchanged source state.
- [Dependency closure](../../packages/runtimes/ulvia-provider-server/tests/authentication/templates/upgrade/dependencies.test.ts):
  transitive SMTP/Secrets requirements through inherited Emailer, unavailable and
  incompatible dependencies, optional Hosting excluded.
- [Runtime application](../../packages/runtimes/ulvia-provider-server/tests/authentication/templates/upgrade/apply.test.ts):
  real seed/configuration services invoked after selection/pairing, lease interruption
  and retry, usable account composition, preserved customization and two unique seeds.
- [Durable transition](../../packages/features/hosting/tests/instances/provisioning/system-upgrade.test.ts):
  target with an added required family, unfinished-step retry, revoked administrator
  refusal, stale/foreign/drop refusals without business-state changes and retained
  Repository settings. Runtime selection is exercised separately above; this is
  not a claim of a full old-image-to-new-image Docker upgrade journey.

## Disabled email delivery

Only a validated `EMAIL_DISABLED` declared error from the exact Emailer send
invocation becomes `EmailDeliveryDisabledError`. No remote diagnostic message is
copied. Other declared failures and authorization/transport failures remain errors.

[Signed HTTP regression](../../packages/runtimes/ulvia-provider-server/tests/authentication/templates/disabled.test.ts)
uses a separate Provider relay and actual SMTP contract lineage. Disablement after
an enabled check preserves account signup verification policy and removes unusable
verification/reset tokens. Generic backend errors do not masquerade as disabled;
revoked machine authority prevents another backend call. The fixture executes fresh
keys directly; durable Emailer receipt behavior remains covered by its own tests.

## Rendering before allocation

Rendering now sizes all expanded fields before substitution. It counts UTF-16
length and UTF-8 JSON bytes without materializing escaped values or expanded bodies,
including HTML entities, JSON escaping and paired/unpaired surrogates at chunk
boundaries. Accepted HTML values are escaped once per distinct referenced variable.
The final bounded-output validation remains as a second check.

[Budget regressions](../../packages/features/email-templates/tests/budget.test.ts)
prove oversized text/HTML refuses before any substitution callback, using a valid
request smaller than 9 KiB. They also cover near-limit accepted/rejected output,
HTML entities, UTF-8, JSON escaping and surrogate pairs split across substitutions.

An isolated local comparison used Bun 1.4.4, five fresh processes per implementation,
20 small warmups and full GC before each measured refusal. The 8,643-byte request
contains 880 `{{x}}` tokens and a 4,096-character ampersand value. The old renderer
materializes approximately 18 million HTML characters before rejecting it.

| Measurement | Before (`f9aefc2b1`) | Corrected |
| --- | ---: | ---: |
| Median refusal time | 217.83 ms | 3.43 ms |
| Additional process maximum RSS, median | 51,988 KiB | 0 KiB observed |
| Refusals | 5/5 | 5/5 |

Zero observed RSS increase means the process did not exceed its warmed high-water
mark; it does not mean zero allocations. This is one synthetic rejection case,
not a throughput, general latency or production memory guarantee. Raw samples are
retained outside tracked source in
`/home/matthias/Documents/Codex/2026-11-21/CmsCore-email-templates-render-comparison.json`.

Planning adds no catalogue/network operations beyond the cached admitted snapshot;
it traverses the bounded manifest dependency graph. Selection steps initialize
account state only for creation or an upgrade that introduces Templates; other
transitions add no account-configuration reads. A first explicit initialization
creates at most the two seeded models/publications and one association document;
retries reuse immutable identities. Render/preview add sizing scans over bounded
source/value input, then at most one escape per referenced HTML variable; their
Mongo/network operation counts are unchanged.

The 187-line runtime provisioning file remains cohesive around the durable target
and official connection handshake; its size warning is retained after review. The
existing 762-line Host and 187-line composition test retain localized changes rather
than an unrelated structural rewrite. No blocking fanout finding is accepted.

## Validation

- Starting `bun run check`: 10 passed, 0 failed in this task worktree.
- Focused regression and affected lifecycle suite: 61 passed, 0 failed, 530 assertions.
- Final static checks: 10 passed, 0 failed.
- General suite: 4,502 passed, 93 skipped, 0 failed across 1,200 files. Dedicated
  browser/Mongo/TLS stages execute the relevant opt-in journeys separately.
- Collection browser: 4 passed. Capture/browser: 11 passed. Real Mongo: 18 passed.
- Performance plan: 249 executors, 1,933 scenarios, no missing definitions/budgets;
  compatibility passed with `measuredPerformance: false`.
- Shared-hosting installation, actual SMTP delivery, restart and two-Edge journey:
  215 assertions passed. Fresh/restarted Pebble TLS: 18 and 19 assertions passed.
- Edited documentation links and `git diff --check` pass. Original checkout unchanged.

All maintained `verify` stages passed across the primary run and targeted resume.
The primary `bun run verify` exited 1 during Provider image export because Docker's
local store lacked a parent extraction snapshot (image layer index 10, above the
base image). Compilation and all preceding validation stages had passed. Regenerating
only the Provider's `runtime` stage with `docker buildx build --no-cache-filter runtime
--load` succeeded without pruning global Docker state. Both candidate images then
passed the maintained image inspection, and the final two workspace steps were
resumed through `executeWorkspace(workspaceSteps("verify", []).slice(-2))`, exit 0.
The original command's exit status is not represented as an uninterrupted pass.

Logs are retained outside tracked source at:

- `/home/matthias/Documents/Codex/2026-11-21/CmsCore-email-templates-review-baseline.log`
- `/home/matthias/Documents/Codex/2026-11-21/CmsCore-email-templates-review-verify.log`
- `/home/matthias/Documents/Codex/2026-11-21/CmsCore-email-templates-review-acceptance.log`

Work remains on the separate task branch. No merge or production deployment is
performed.
