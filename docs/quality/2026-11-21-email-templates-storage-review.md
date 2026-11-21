# Email Templates storage follow-up review

Historical storage validation; its suite did not cover the pre-Templates upgrade or
preallocation rendering refusal. See the
[upgrade and rendering follow-up](2026-11-21-email-templates-upgrade-review.md).

Date: 2026-11-21. Branch: `codex/email-templates`, following `4288834be`.
The [initial review](2026-11-21-email-templates-review.md) records the prior
embedded-history implementation and its validation. This follow-up replaces that
unpublished storage protocol without migrating historical prototype state.

## Behavior and storage

Total template and publication quotas are removed. Each model retains metadata,
a current draft and at most one small pending publication marker. Each immutable
publication has its own document and semantic primary key. Creation uses one exact
identity read plus one insert, with an extra identity read on a concurrent duplicate;
it performs no catalogue scan, slot allocation or count query.

A publication reserves the draft by revision CAS, inserts its immutable document,
then advances the visible version by another CAS. Readers check the model's committed
version before loading one publication. Restart recovery retries the same publish
request; staged versions stay invisible and draft/archive mutations refuse until
completion. Reads do not repair state. No transaction, lease or background worker is
required. Existing committed publications continue working during pending publication.

Only per-operation bounds remain: source 64 KiB, 32 declared variables, 8,192
characters per value, rendered output 256 KiB, list pages at most 100 and Mongo query
maxTimeMS 2 seconds. Version/revision counters stop at the largest safe integer,
9,007,199,254,740,991, with no overflowing write. Access association versions and
configuration revisions follow the same technical ceiling.

## Evidence and cost

- Starting `bun run check`: 10 passed, 0 failed, in this worktree before changes.
- [Count and counter tests](../../packages/features/email-templates/tests/counts.test.ts):
  130 models, 129 publications, retained old/new snapshots and unchanged state on
  version/revision overflow.
- [Access counter tests](../../packages/features/auth/tests/email/templates/counters.test.ts):
  safe large association versions accepted, revision overflow refuses without
  a write or publication lookup.
- [Real Mongo tests](../../tests/integration/email-templates/mongo.docker.test.ts):
  129 models, 65 publications, concurrent duplicate publishers, keyset pagination,
  instance isolation and query projections. Model size stays below 4 KiB for the
  fixture after 65 publications; this demonstrates absence of embedded history,
  not a universal model-size limit.
- [Interrupted writes](../../tests/integration/email-templates/recovery.docker.test.ts):
  injected failures after reservation, before/after insertion and before/after the
  visibility CAS. A new adapter resumes each request, stores one immutable row and
  exposes no staged publication.

A version/render read now uses two Mongo point reads instead of one embedded-array
projection. Rendering plus one list page uses three finds instead of two; tests
inspect Mongo commands and confirm summaries exclude draft bodies and input values.
An enabled account send still uses two admitted Templates queries and one Emailer
command; the Templates queries now load four bounded documents instead of two.
Normal publication changes from two finds plus one update to three finds, one
reservation (`findAndModify`), one insert and one update: six Mongo operations
instead of three. Duplicate/recovery paths may add exact identity reads. Creation
removes the old extra slot scan; ordinary draft/archive writes retain one record
read plus one CAS update and no longer load historical bodies. These are operation
counts, not latency or throughput measurements. No publication cache or measured
performance campaign is introduced.

The 173-line lifecycle facade remains cohesive; its file-size informational finding
is retained rather than splitting the shared revision/publication rules. There are
no blocking repository-shape findings.

## Final validation

- `bun run verify`: exit 0 in this task worktree.
- Static checks: 10 passed, 0 failed, compared with the passing starting baseline.
- General suite: 4,496 passed, 93 skipped, 0 failed across 1,195 files. Opt-in
  browser, Mongo and TLS journeys execute separately below.
- Collection browser stage: 4 passed; capture/browser stage: 11 passed.
- Dedicated Mongo stage: 18 passed, including growth and interrupted-publication
  recovery. The focused Mongo run also passed both tests (334 assertions).
- Focused feature, Access, runtime and release-digest tests: 26 passed, 0 failed.
  Retained Access 1.0 definitions and digest remain unchanged.
- Performance plan: 249 executors, 1,933 scenarios, no missing definitions/budgets.
  Compatibility validation passes with `measuredPerformance: false`.
- Shared-hosting installation, actual SMTP delivery, restart and two-Edge acceptance:
  215 assertions passed. Real Pebble TLS fresh/restarted journeys: 18 and 19
  assertions passed respectively.
- `git diff --check` and the edited documentation's local links pass.

The complete verification log is retained outside tracked source at
`/home/matthias/Documents/Codex/2026-11-21/CmsCore-email-templates-unbounded-verify.log`.
The original checkout remains untouched. No merge, publication or deployment is
performed.
