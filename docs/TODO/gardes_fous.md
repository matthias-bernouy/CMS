# Agent Guardrails For Security And Performance

Status: initial implementation, 2026-10-29. See the
[operating guide](../development/guardrails.md) for exact commands, budgets and
limits. Implemented controls do not replace security and performance review.

## Implemented

- The shared setup action uses current browser/bootstrap commands. Quality runs
  on `codex/alpha-v0`; PR/push smoke is no longer duplicated by the standalone
  nightly/manual workflow. Candidate image versions are explicit.
- `test:performance` uses examples and read-only upgrade analysis rather than
  removed collection Page/migration APIs, and resolves current Gateway types.
  It runs in `verify` and CI. Existing deterministic Content/Repository work
  budgets run with the ordinary tests.
- `check:all` prints a compact summary, preserves blocking failures and relevant
  changed-file guidance, and saves complete text/JSON reports. `--verbose` and
  merge-base-based `--base <ref>` are supported. Failed Git discovery or report
  persistence cannot produce a successful command.
- `AGENTS.md` requires proportionate evidence for authorization, instance
  isolation, persistence cost, resource bounds and cache behavior. Refusals must
  preserve business state; security journal entries remain legitimate.
- A blocking, type-aware rule detects direct built-in Request body convenience
  reads outside the bounded reader. Fixtures distinguish aliases, Response
  reads and shadowed domain methods. Unresolved types and stream consumption
  remain review responsibilities.
- A Docker journey records real Mongo operations (including control databases),
  internal HTTP calls, transferred bytes and latency. It tests 200 image-capable
  Page views per minute without 503, authenticated response privacy and cold/
  warm trace correlation with cross-instance isolation. It runs in
  `verify:full` and the CI smoke workflows; reports are retained as artifacts.
- The prerequisite description cache is per instance, immutable, bounded and
  valid for five seconds. It coalesces loads and retries failures. It changes
  rendering classification only; actual invocation authorization is unchanged.

## Remaining

- Add precise, fixture-tested rules for expensive synchronous server operations.
  Do not ban all synchronous hashes or cryptography indiscriminately.
- Consider Mongo-in-loop advice only if its signal justifies the noise.
- Add Edge cache-hit/zero-Provider-work gates when an Edge response cache exists;
  tighten work budgets after each measured delivery optimization.
- Replace the interim five-second classification delay with the exact revision
  invalidation required by the revised [delivery plan](performance.md). Extend
  the load gate across multiple Pages and two quota windows as specified there.
- Execute the configured workflows remotely after review. Coverage-baseline
  reconciliation, advisory checks and broader persistence/recovery scenarios
  remain separate items in [the platform TODO](../TODO.md).

## Original Design Proposal (Historical)

The following proposal is preserved for context. Its targets and example paths
are not statements of current implementation; the status above and operating
guide describe what is implemented.

### Problem

Agents check that a change works, respects the architecture and passes the
existing tests. They do not reliably ask whether it stays safe and efficient.
The review of 2026-10-29, measured on images built from `4d6cac938`, found:

- Every view of a Page using image-capable Blocs calls
  `ulvia.cms.installations/capabilities.describe` through the Edge. That call
  consumes the Provider call budget of 120 calls per minute per source, so such
  Pages and `/admin/pages` return 503 after about 120 views per minute.
- Journal ingestion upserts entries one at a time into a collection with 12
  indexes (`MongoJournalStore.ts`): about 50 ms for a batch of 15 entries.
- `compress()` computes synchronous Brotli at the default quality 11: 7 ms for
  a 7.5 KB Page and 65 ms for 71 KB of JavaScript. Public delivery never serves
  that output.
- `bun run test:performance` has failed since `9234fcfd7` and runs in no gate.
  The shared CI setup still invokes the removed `prebuildAdmin.ts`, and push
  workflows target `master` only.

One question exposes the first three: does this code run on every request, how
many times, and against which limit or quota?

### Principle

Remind agents of the review questions where they decide that work is done,
require evidence proportionate to the change, then automate the checks that can
be expressed precisely. A reminder does not prove that a review happened;
required evidence and automated tests make it verifiable.

### 1. Review Reminder In `check:all`

On 2026-10-29 the report had 515 lines. Repository-shape guidance produced 446
of them (204 file-size warnings, 150 file-size infos and 86 directory-fanout
infos), UI contracts 35, and Bun's `$ bun run …` echoes about 20.

Target report:

- one summary line per check, first;
- details only for failures and for findings on changed files, as `AGENTS.md`
  already scopes review to new findings in the task; other findings as counts;
- the complete report in `artifacts/check-all/latest.txt` and `latest.json`
  (`artifacts/` is ignored by Git), with `--verbose` printing everything;
- check scripts spawned directly, without Bun's command echoes;
- changed files taken from the working tree against `HEAD` plus untracked
  files, or from `--base <ref>` for committed work and CI;
- a final review block printed on success and on failure. It separates the
  automated checks result from the security and performance review that remains
  to be done. Documentation-only changes get one line.

```text
━━ Automated checks: 9/10 passed. This is not a security or performance review.
━━ Review before handoff (3 changed files)
For any changed code: does it run on every request? How many times, against which limit or quota?
Mongo persistence — MongoJournalStore.ts
  · Operations per call before/after? Awaited writes in loops? Unbounded queries? Indexes?
HTTP boundary — publicResource.ts
  · Bounded input? Access by actor class and site isolation?
  · Sensitive data in responses, caches or logs? Do refusals have no side effect?
Report: one test (path and name) with a before/after figure, or a short justification, per point.
```

Risk areas are declared and tested in `quality/ci/review/riskAreas.ts`:

| Area | Paths | Questions |
| --- | --- | --- |
| HTTP boundary | `**/http/**`, surfaces, `*Resource*`, `handle*` | input bounds, actor access, site isolation, side-effect-free refusal, sensitive data |
| Persistence | `**/mongo/**`, `Mongo*.ts` | operations per call, awaited loops, limits and pagination, indexes |
| Authority | `**/gateway/**`, `**/access/**`, `**/authority/**`, `**/authentication/**` | fresh checks, quota consumers and rate, delegation, token claims |
| Caches | `*Cache*.ts` | byte bounds, complete key, invalidation, negative entries |
| Contracts | `packages/official-repository/contracts/**` | version bump, access levels, per-request cost |
| Browser and collections | `**/browser/**`, `packages/official-repository/collections/**` | trusted JavaScript, network calls, bundle weight |

Check semantics do not change: a directory-fanout error remains the only
blocking repository-shape finding.

### 2. Definition Of Done In `AGENTS.md`

Expected checks stay proportionate to the change:

| Change | Expected evidence |
| --- | --- |
| Command or route that modifies data | authorization, input validation, refusal without any write |
| List read from persistence | pagination, read count, loaded volume |
| Upload or download | size limits, concurrency, interruption, resource release |
| Cache | bound, key, invalidation |
| Code on a per-request path | operations and internal calls per request, before and after |
| Label correction | no new security or performance test, with a one-line justification |

The handoff report covers security, performance, tests and remaining limits.
Each statement names a test (path and name) or a before/after measurement, for
example: "the test checks that an actor of site A cannot modify site B and that
the refusal performs no write". A generic "security verified" is not evidence.

### 3. Behavior Tests And Work Budgets

- Security tests attempt the forbidden case (another site, a weaker actor, an
  oversized input) and assert both the refusal and the absence of writes.
- Performance tests count work instead of wall-clock time: persistence reads
  and writes, HTTP calls, bytes, peak concurrency and cache bounds. Existing
  examples are `packages/features/cms-content/tests/application/renderingBudget.test.ts`
  and `tests/performance/repository`.
- A system-level Docker journey gates operations and internal calls per view
  and a load scenario such as 200 views per minute without 503. Only this level
  exposes defects that emerge between components, such as the quota 503. It is
  phase 0 of the [delivery performance plan](performance.md).

### 4. Static Rules

A rule becomes blocking only when it recognizes its cases precisely. Each rule
has fixtures it must reject and legitimate uses it must accept, and its
diagnostic names the expected alternative.

| Rule | Level | State on 2026-10-29 |
| --- | --- | --- |
| Synchronous compression or crypto in server code, excluding build tooling | blocking | 5 occurrences to triage, including `http-runner/src/core/compression/content.ts` |
| Request body read that bypasses `readBoundedRequestBody` (`http-runner/src/core/request/body.ts`) | blocking regression guard | no direct read found |
| Awaited Mongo call inside a loop | informational | 17 heuristic matches, many legitimate migrations or recovery loops |

Example diagnostic: "This read does not use the bounded reader. Use
`readBoundedRequestBody` or document the applicable limit."

### 5. Running The Guardrails

- Replace the removed prebuild step in `.github/actions/setup-workspace/action.yml`
  and run workflows on the active delivery branch.
- Repair `test:performance` and include it in `verify`, or remove it.
- Run work budgets in `verify`, and the Docker journey in `verify:full` and a
  nightly CI job.

These items overlap [Delivery And Verification](../TODO.md#delivery-and-verification).

### Delivery Order

1. About one day: the `check:all` report and review block, and the definition
   of done in `AGENTS.md`. Tests cover success and failure output, filtering by
   changed files, `--verbose` and documentation-only changes.
2. About one day: CI repair, `test:performance` and the first static rules.
3. The Docker budget journey, shared with performance phase 0.

Each batch runs in an isolated worktree, with `check:all` before and `verify`
after the change.

Exit condition: an ordinary change produces a `check:all` report of about one
screen ending with a targeted review block; `AGENTS.md` defines done with
proportionate evidence; at least one blocking static rule has fixtures; work
budgets and the Docker journey run in `verify`, `verify:full` and CI on the
active branch.
