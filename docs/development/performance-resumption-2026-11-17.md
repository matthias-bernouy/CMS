# Performance Assessment Resumption — 2026-11-17

The exhaustive assessment goal was explicitly resumed. This is an in-progress
work log, not a completed assessment or a performance improvement claim.
Application code and published contracts must remain unchanged. No commits
are authorized for this resumed goal.

## Current User-Approved Scope — 2026-11-18

The user explicitly resumed with performance coverage focused on capabilities
actually implemented by the Provider, without duplicating the full matrix for
older contracts sharing the same execution path. Those contracts receive light
compatibility checks. The runtime SDK loader reuses captured handler factories
and verifies retained schemas, bindings, access and behavior; SDK tests exercise
retained execution and live authorization. Independent executor paths still need
full performance scenarios. No application fixes or commits are authorized.

The default performance inventory now uses current SDK implementation views.
Compatibility records map each admitted old target to its current executor and
are not measured performance credit. Historical matrices, measurements, exact
source snapshots and exports below are preserved as dated evidence of the older
scope. The old version-specific stacks, preparation hooks and automatic retained
scenario generator are removed from active testing; their source is preserved in
the sealed historical exports. The worktree is
`/tmp/cmscore-performance-coverage-development`; the principal checkout remains
unchanged until the final review and transfer.

The multi-catalogue campaign prototype is also removed from active code: the
existing complete run report, checkpoint, comparison and source/export machinery
already serves the current executor matrix. `verify` therefore runs one main
performance assessment and one separate light compatibility check, preserving
the existing run-reference interface. Original prototype indexes remain static
historical artifacts with their complete frozen source exports.

The revised inventory has 219 performance targets, all with scenario definitions,
1,608 mandatory binding/variant obligations, 1,503 mandatory obligations planned
and 105 still missing. There are 1,563 scenario definitions (some deliberately
exercise the same obligation through different datasets). All 452 admitted old
targets across 15 retained claims map to captured current executors through the
SDK compatibility loader. These mappings grant no measured performance credit.
Twenty focused inventory/orchestration/SDK tests passed (1,441 assertions),
performance TypeScript and all ten static stages passed after simplification.
The former legacy setup and multi-catalogue prototype comprised 37 task-owned
files removed from active source after byte-verified archival; their original
source is also present in the sealed historical exports. The unfinished three-file
OAuth read draft remains archived; the completed active fixtures now add four
HTTP list/resolver volume, retained-history and revocation-invalidation cases.
They share one bounded OAuth dataset per scenario and respect the unchanged
public 32/minute preparation limit, with paced waits excluded from timing.
Exact pagination, revoked-state visibility, invalid input, foreign-account and
cross-instance refusals are verified outside the timed read.
Nine focused tests passed (1,399 assertions), performance TypeScript passed, and
all ten static stages passed after this addition.
Run `20261118T101958Z-c4d018ad50e0-0342a559` subsequently passed all four
OAuth read cases (40 measured samples), with no budget findings or runtime
failures. P50/P95 milliseconds: large list 35.92/44.62; history list 32.58/43.14;
list after revocation 35.79/55.94; resolver after revocation 19.16/28.97.
Each list used nine Mongo operations; examined documents were 38, 59 and 274
respectively as retained grant history accumulated. Resolver refusal used two
Mongo operations and four examined documents. Exact pagination, foreign-owner
mutation refusal, invalid list input, active cross-instance token rejection and
owned cleanup passed. The result/source export seals and all 3,889 source files
were verified. Shared-host measurements remain reference-ineligible.

Twelve further current HTTP/MCP settings-reader invalidation definitions now
cover site settings, languages, both text readers and both theme readers.
Preparation primes each selected reader and mutates through its real command;
only the refreshed read is timed. Independent field/revision oracles, stale-write
refusal, foreign-session refusal, unchanged state after refusal and lease cleanup
are tested. Twelve focused settings/coverage tests passed (70 assertions).
Run `20261118T103335Z-c4d018ad50e0-55449c3b` passed all twelve settings
cases (120 measured samples, twelve witnessed obligations), with six internal
request budget findings on MCP. HTTP P95 ranged from 44.47 to 136.52 ms; MCP
P95 ranged from 191.80 to 389.20 ms. MCP used nine more Mongo operations per
read than HTTP; observed internal requests reached 17–19 against the unchanged
budget of 15. No latency ceiling was exceeded. This partial shared-host run is
not a complete assessment or reference. Its export/source seals and all 3,892
source files were verified, with no runtime or cleanup findings. Performance
units at the measured source had 206 passes plus the enabled known DELETE
application reproduction failure (207 tests, 3,002 assertions); performance types
and all ten static check stages passed. Application paths have no task diff.
The coverage matrix also now requires a
passed scenario before displaying an obligation as covered: raw successful
invocations remain visible when final verification or cleanup blocks a run.

The simplified current-only runner was exercised against the pinned candidate
images by run `20261118T101409Z-c4d018ad50e0-b39448b9`: all eight selected
HTTP/MCP page-read cases passed, with eight witnessed obligations and three
budget findings. This deliberately partial diagnostic run does not pass the full
assessment or qualify as a performance reference. Its exported run/source seals
and all 3,882 source files were verified. The full local performance unit suite
after simplification had 194 passing tests and the one enabled known application
DELETE transport reproduction failure. No application changes were made.

## Namespace Read Expansion — 2026-11-18

Twelve further mandatory definitions cover Authoring `get-connection` invalidation
on HTTP/MCP, Authoring `list-namespaces` volume/history/invalidation on HTTP/MCP,
Repository `namespace-list` volume/history/invalidation and `namespace-get`
invalidation. One fresh owned publisher per namespace scenario respects the
unchanged 32-name account quota. Large datasets contain 32 active reservations;
history contains 31 suspended reservations and one active reservation. Invalidation
primes the reader, suspends its selected namespace and measures the new state.

Oracles verify exact ordered DTOs, all bounded pages plus an exhausted cursor,
suspension revisions and absence of private fields. Foreign-account lists and
mutation refusals, invalid pagination input, unchanged owned records after refusal
and exact restoration of the original test PAT are checked outside timing.
Five focused tests passed (255 assertions); performance TypeScript passed.
Run `20261118T105306Z-c4d018ad50e0-f381008c` attempted all twelve cases:
the two connection and four native Repository cases passed; all six Authoring
list cases failed their final probe. The fixture incorrectly expected HTTP 422
for a schema-invalid pagination limit. The common Gateway input validator maps
`invalid_input` to HTTP 400 (`CapabilityGateway.snapshotInput` and
`handleHttpCall.errorStatus`), before the domain executor. That expectation is
corrected to exactly 400, with Authoring list scenarios advanced to version 2
and safe test-owned failure codes preserved. The original failing measurements
remain sealed and receive no complete scenario coverage. Replay
`20261118T105902Z-c4d018ad50e0-cc29ca14` passed all six version-2 cases
(60 measured samples), with six unchanged internal-request budget findings and
no runtime or cleanup findings. HTTP P50/P95 milliseconds: large 185.05/223.54,
history 193.83/227.16, invalidation 140.86/225.29. MCP: large 196.21/267.04,
history 192.26/255.81, invalidation 178.35/258.20. HTTP reads used 20 Mongo
operations and 16–20 internal requests; MCP used 29 Mongo operations and
23–31 internal requests. The 15-request budget was not raised. The refined
source passed five focused tests (257 assertions), performance TypeScript and
all ten static stages; full performance units had 210 passes plus the one
known enabled DELETE application reproduction failure (211 tests, 3,245 assertions).
Both original and replay run/source seals and all 3,898 source files passed
verification, with seven budget findings and no runtime/cleanup findings.

Before this run, Docker rejected the previous exact image IDs as unavailable,
before any stack or measurement existed. That refusal is recorded separately
with zero coverage. Dedicated images were rebuilt from unchanged application
paths at `c4d018ad`, under `0.1.0-perf-c4d018ad-20261118`: Edge
`sha256:8a5f2e47110a71fbc3bbca7055002ef5c58ff60b49e98910db8877e6a8489082`
and Provider
`sha256:b6966dae9e14a4ed1fc539f1cb0416cf013089338a2d4707c317ba061548457d`.
Their component/revision labels and dedicated receipt are verified; they are
not silently compared with measurements using previous image identities.
A portable Docker archive is retained under ignored
`artifacts/performance/images/0.1.0-perf-c4d018ad-20261118/`: 446,370,961 bytes,
SHA-256 `483638ab4cd1dad0c0230103d29efd2ee763f043946697c47205917ef61aa8e2`.
All 37 archived OCI blob hashes, including both exact pinned image manifests,
were independently checked. The receipt records image IDs, source, revision and
`docker image load --input candidates.tar.gz` restoration. No image or daemon
state was changed by export or verification.
No application source, contracts, production state or performance budgets changed.

## Publication Read Expansion — 2026-11-18

Eight additional current HTTP invalidation definitions cover upload progress,
publication state, immutable contract/documentation downloads, both retained
contract source readers, retained collection sources and collection preflight.
An owned upload is read before and after its asset is submitted. Publication
state is read before and after an ordinary yank; exact pinned release/asset
bytes and retained owner sources must remain unchanged after that state change.
Foreign ownership and stale-revision refusals cannot change the resulting state.

Collection preflight is primed before publication and checked again after its
exact release is committed. The identical admitted canonical document remains
valid; a different, locally parsed valid document at the now-immutable same
coordinate must be refused, rather than receiving a cached successful preflight.
The original release bytes and owner source remain exact. Upload cleanup is
covered for both successful preparation and a failed prime. Four focused tests
passed (49 assertions), and performance TypeScript passed. Run `20261118T111351Z-c4d018ad50e0-db6d94ac` passed all eight definitions
(80 measured samples and eight witnessed obligations), with no budget findings,
runtime failures or cleanup failures. Its run/source export seals and all 3,903
source files were verified. Full performance units at the measured source had
214 passes plus the known enabled DELETE application reproduction failure
(215 tests, 3,294 assertions); performance types and all ten static stages passed.
The run remains a partial shared-host diagnostic, not a complete assessment or
regression reference. No application changes, contract edits or
budget changes are included.

## Page Scale Expansion — 2026-11-18

Thirty-four additional mandatory definitions cover all eight native Page
capabilities over HTTP/MCP at large/history workloads, plus `pages.get`
invalidation on both bindings. Large cases retain 64 independently created live
Pages while the measured Page carries 256 KiB of controlled valid Bloc content.
History cases retain the route history of 32 deleted Pages, each moved three
times: 128 gone routes. Original and latest paths are checked as HTTP 410 outside
timing. The measured existing Page also receives sixteen ordinary revisions;
creation is measured against the retained route-history context.

One owned dataset is shared only across the ten measured samples of its scenario.
API-created IDs, unique titles and paths scope cleanup, including partial creates
whose responses were lost. Live fixtures are removed; domain-owned gone route
history remains until the disposable stack is removed. Setup has a 180-second
budget and cleanup a 120-second budget, plus bounded per-request timeouts. Actual
loaded volume, work and errors remain measured; historical data from earlier
samples is not silently deleted or repaired.

Independent revision/content assertions, stale-write refusals, invalid-body
refusals and cross-instance session refusals occur outside the timed call. Failed
postconditions or cleanup prevent complete coverage. Existing baseline recipes
keep their workload defaults. Five focused tests passed (616 assertions), and
performance TypeScript passed. Run `20261118T113417Z-c4d018ad50e0-70d96778` attempted all 34 definitions
(340 measured samples): 30 passed and four rename cases failed the stale-retry
oracle, with 16 MCP internal-request budget findings and no runtime or cleanup
findings. All original run/source seals and 3,909 source files were verified.
The rename contract explicitly declares natural idempotency: repeating the same
title with the immediately previous revision correctly returns the unchanged
result. These four failures are fixture expectations, not application defects.
The refined version-2 rename scenarios require that retry to preserve its result,
then use a different valid title with the stale revision and require HTTP 409.
They also retain foreign/invalid-input refusal and unchanged-state checks.

Six focused tests passed after refinement (637 assertions), and performance
TypeScript passed. Existing baseline recipes retain their defaults; the larger
workload preparation and refusal/idempotency checks have distinct helpers.
Run `20261118T115348Z-c4d018ad50e0-e040915a` replayed all four corrected
rename definitions successfully, with two MCP internal-request budget findings
and no runtime or cleanup findings. Run/source seals and all 3,910 captured files
were verified. The original failed fixture-oracle results remain immutable.
No application source, contracts, quotas, resources or performance budgets changed.

## Page List Expansion — 2026-11-18

Six new definitions cover `pages.list` over HTTP/MCP with large, history and
invalidation workloads. Large scenarios use 64 real API-created Pages, paginate
in batches of 16, and rotate the timed read through the first and continuation
pages. History scenarios retain 128 gone routes from 32 deleted Pages and a
separately owned live anchor. Invalidation scenarios prime the selected binding,
rename the anchor using its authoritative revision, and time the refreshed list.

Expected IDs, titles, paths and visibility come from successful command receipts,
not the reader under test. Exact result comparison rejects omitted, duplicated,
foreign, stale or excessive fields, including an unexpected terminal cursor.
Every pagination page and an exhausted cursor are checked outside timing, along
with foreign-instance session and invalid-limit refusals and unchanged stored
Page state. Cleanup handles lost creation receipts without touching unrelated
Pages. Preparation, negative probes and postconditions grant no timing credit.
The initial ten-stage check passed before these changes. Eleven focused tests
passed (1,232 assertions), performance types and the ten-stage post-edit check
passed. The broader suite recorded 225 passes and the enabled known DELETE
application reproduction failure (226 tests, 4,526 assertions).

The user interruption stopped run `20261118T120606Z-c4d018ad50e0-84181eb0`
after its first successful scenario. Its checkpoint was copied and hash-verified
under ignored `artifacts/performance/interruptions/`; it was not promoted to a
sealed complete run or comparison reference. The controller was confirmed absent
from the host process table before removing exactly its five owned containers,
two ownership-labeled networks and two temporary directories.

Fresh-stack replay `20261118T121946Z-c4d018ad50e0-ae1ff06b` passed all six
scenarios (60 samples), with no runtime or cleanup findings. HTTP P50/P95 were
72.17/93.72 ms (large), 31.13/44.85 (history) and 31.21/36.91 (invalidation).
MCP was 129.07/212.59, 129.19/222.23 and 125.39/149.90 ms respectively.
HTTP used 6–7 Mongo operations and five internal requests; MCP used 15–16
Mongo operations and 12–19 internal requests. Two MCP cases exceeded the
unchanged internal-request budget of 15. The run remains a partial shared-host
diagnostic; its report/source seals and all 3,916 captured source files were
verified in the principal checkout's ignored export directory.

## Bloc Reader Expansion — 2026-11-18

Fourteen new mandatory definitions cover `site-blocs.list` and
`pages.editor-catalogue` with large/history/invalidation workloads, plus
`site-blocs.get` invalidation, on both HTTP/MCP bindings. Large datasets create
and publish 64 independent compositions through their real APIs. Historical
datasets retain 64 archived unpublished drafts plus a live published anchor.
Invalidation creates a fresh draft, primes the selected reader, then publishes
before the measured read. The expected details and full owned list come from
command receipts; editor insertion metadata is asserted independently.

Only published artifacts enter the editor catalogue; the current implementation
retains an already published artifact when its draft is archived. Historical
drafts deliberately remain unpublished. Global catalogue ordering, exact owned
items, draft/publication visibility, invalid inputs, stale publication attempts,
foreign sessions and unchanged state are checked. Cleanup archives only owned
compositions, including recovery of lost create receipts; archived domain data
remains until stack teardown. Budgets and application code remain unchanged.
The initial ten-stage check passed before applying this expansion. Five focused
tests passed (261 assertions), performance TypeScript and all ten post-edit static
stages passed. The broader suite recorded 230 passes and the enabled known DELETE
application reproduction failure (231 tests, 4,787 assertions). New files remain
below 150 lines and the reader directory has seven entries.

Run `20261118T122655Z-c4d018ad50e0-28e69f1d` passed all fourteen scenarios
(140 measured samples), with five MCP internal-request budget findings and no
runtime or cleanup findings. All run/source seals and 3,923 captured source files
were verified. HTTP P95 ranged from 60.84 to 98.10 ms; MCP ranged from 184.83
to 278.84 ms. HTTP used 7–8 Mongo operations and 5–7 internal requests; MCP
used 16–17 Mongo operations and 12–18 internal requests. None exceeded its
latency budget. The five findings retained the original ceiling of 15 internal
requests; no budgets or application code changed.

Archived records and published artifacts from earlier scenarios intentionally
remain in this disposable instance. Actual scanned volume and response sizes
therefore increase with scenario order: `site-blocs.list` reached 579 examined
documents and a 379,283-byte MCP response. Per-scenario latency comparisons
require identical execution order and fixture versions, as enforced by the
report comparator. These partial shared-host runs are diagnostics, not timing
regression references.

## Observability Reader Expansion — 2026-11-18

Fourteen mandatory definitions add HTTP/MCP large/history/invalidation for
`logs.query` and `logs.aggregate`, plus `logs.get` invalidation. Large datasets
ingest 128 independent events through `logs.append`, in batches of at most 50,
using real narrowly scoped machine invocation authority. Historical datasets
ingest 128 events whose event time is seven days old plus eight fresh events.
Their reception time is current: this measures retained old event timestamps,
not seven days of elapsed ingestion age or TTL expiry. An explicit eight-day
event-time window is fixed across each scenario's cursor traversal.

Ingestion payloads establish exact identifiers, times, levels, event names and
attributes. Server reception times must fall within the ingestion call bounds
(with a one-second clock margin). Query summaries must omit attributes and
private storage fields. Full details must contain the expected sanitized
`[REDACTED]` password marker. Every pagination page is verified, including global
reception-time/ID order, exact complete identities, unique scoped cursors and
the terminal null cursor. Large aggregations exercise more than 50 event groups
and exact truncation; history/invalidation also check level counts.

Invalidation primes the selected reader before appending; detail reads first
require the declared not-found result. Cross-instance IDs and cursors, changed
cursor filters, foreign sessions, invalid bodies and duplicate ingestion are
checked outside timing. Duplicate ingestion must preserve the exact stored
detail and scoped counts. Journal records remain immutable retained data until
the disposable stack is removed. Setup has a 180-second deadline and at most
256 owned events; preparation, negative probes and verification grant no
measurement credit. All application code, quotas and budgets remain unchanged.

The initial ten-stage check passed before this expansion. Fourteen focused
scenario/planning tests passed (86 assertions), performance TypeScript and all
ten post-edit static stages passed. The broader performance suite recorded
237 passes and the enabled known DELETE application reproduction failure
(238 tests, 4,863 assertions). New files remain below 150 lines and the directory
has seven entries.

Run `20261118T124930Z-c4d018ad50e0-23d1f592` attempted all fourteen cases
(140 raw measured samples), but all failed a cross-instance verification oracle.
The Registry session used for the other-instance check belongs to its ordinary
publisher, whereas journal readers require an administrator. No coverage was
granted. All four budget findings and the original fourteen failures remain in
the sealed diagnostic export; run/source seals and 3,931 files were verified.
This is a fixture authority error, not evidence of an application defect.

The version-2 scenarios now use a lazy, memoized administrator login to the
separately provisioned named CMS, and require its administrator aggregation
preflight to succeed before preparing any events. The Registry publisher cookie
remains only for the foreign-session refusal probe. Same-origin/production
targets and unbounded private login diagnostics are refused. Cross-instance
empty data, missing IDs and invalid cursors remain mandatory assertions.
Sixteen focused tests passed (100 assertions), performance TypeScript and all
ten static stages passed. The broader suite recorded 239 passes and the enabled
known DELETE application reproduction failure (240 tests, 4,877 assertions).
Version-2 replay `20261118T125727Z-c4d018ad50e0-19f90b3a` passed all fourteen
scenarios (140 measured samples), with four MCP internal-request budget findings
and no runtime or cleanup findings. All report/source seals and 3,933 captured
source files were verified in the principal checkout's ignored export directory.
HTTP used six Mongo operations and 5–6 internal requests; MCP used fifteen
Mongo operations and 12–20 internal requests. None exceeded its latency budget.

| Reader / workload | HTTP P50 / P95 ms | MCP P50 / P95 ms |
| --- | ---: | ---: |
| Query / large | 72.45 / 107.69 | 122.65 / 200.38 |
| Query / history | 70.00 / 91.67 | 128.04 / 167.88 |
| Query / invalidation | 27.68 / 34.83 | 116.36 / 141.67 |
| Aggregate / large | 32.25 / 39.68 | 125.53 / 184.84 |
| Aggregate / history | 28.79 / 33.91 | 122.56 / 138.61 |
| Aggregate / invalidation | 29.88 / 48.65 | 113.88 / 191.30 |
| Get / invalidation | 28.92 / 35.03 | 122.71 / 134.37 |

Each cell describes ten local shared-host samples; P95 is the largest observed
value in that small series. The four budget findings are 19–20 internal requests
against the unchanged ceiling of 15. The original version-1 fixture failures
remain separate historical evidence and grant no coverage. Neither run is a
timing regression reference; no application code, quotas or budgets changed.

## Example Reader Expansion — 2026-11-18

Eight mandatory definitions add HTTP/MCP large/history/invalidation for
`examples.list` and invalidation for `examples.get`. Each scenario owns one
initialized tenant across ten reads. Its collection contains 65 admitted
examples, including 64 independently authored additions and a document exactly
64 KiB long, the current collection-admission markup ceiling. The reader schema's
higher response ceiling does not authorize larger authored documents; no limits
are raised. English and French metadata have distinct versioned labels.

Large reads rotate through all five pagination positions; samples alternate
English/French. History completes eight real asynchronous collection upgrades,
checks every durable upgrade receipt, and reads the newest collection only.
Invalidation primes the selected reader, upgrades to the next immutable version,
then times only the refreshed read. A bounded publisher caches at most 21
immutable releases across the profiles and shares these artifacts across bindings.

Exact page contents, translated labels/descriptions, preview frames, global
installation revision, complete documents, continuation and exhausted cursors
are checked against independently compiled/admitted source. Both locales are
traversed outside timing. Invalid cursor/offset combinations, invalid locales,
invalid bodies, foreign sessions and a legitimate secondary administrator with
no matching collection are checked without changing installation state.
Unrelated installations must remain byte-for-byte unchanged throughout upgrades
and refusals. Cleanup disables and discards only the single-use owned tenant.
Resource preparation has a 180-second deadline; preparation and asynchronous
upgrade completion receive no measurement credit.

Seven focused tests passed (117 assertions), including SDK source admission,
65-document pagination oracles, stale/truncated data rejection, eight completed
upgrade receipts, pending resource coalescing, environment isolation and all
21 bounded resource coordinates. Performance TypeScript and the ten-stage
static check passed. The broader suite recorded 246 passes and the enabled
known DELETE application reproduction failure (247 tests, 4,994 assertions).
All new files remain below 150 lines; the Example reader directory has seven
immediate entries.

Run `20261118T132925Z-c4d018ad50e0-f05a0570` passed all eight business
scenarios (80 measured samples), but its final Provider lifecycle inspection
reported `Running=true`, `ExitCode=0`, `OOMKilled=true` under the unchanged
2 GiB Provider limit. Three MCP internal-request budgets were also exceeded.
The report remains failed and reference-ineligible. Run/source seals and all
3,946 source files were verified. An OOM flag while the container remains running
does not establish that its main process stopped, identify a victim process, or
prove an application memory leak. A bounded Docker event-history query no longer
contained the event, so no timestamp or victim was inferred.

A test-only collector now reads fixed cgroup memory current/peak/limit values and
OOM counters before owned-container cleanup, only when Docker already reports
an OOM. It uses one read-only `cat` process and retains only numeric counters;
unavailable evidence is reported explicitly. No container environments, limits
or application implementations change. Eleven focused tests passed (144
assertions), performance TypeScript and all ten static stages passed. The full
performance test tree recorded 248 passes and the known enabled DELETE
application reproduction failure (249 tests, 5,011 assertions). The same eight
scenarios will be repeated on a fresh stack at the original limits; the first
run remains immutable diagnostic evidence.

## Comparison Completion Guard — 2026-11-18

A focused test reproduced a reporting weakness: valid raw timing witnesses could
still produce a comparable result when the enclosing scenario was failed or
blocked by a business postcondition or fixture cleanup. The comparator now
requires a passed scenario before using its raw samples for comparison, and a
stack cleanup finding also prevents comparison eligibility. Raw diagnostic
measurements remain preserved. This changes only the performance test/reporting
infrastructure; no application implementation or historical report is modified.
Eight focused comparison tests passed (76 assertions), performance TypeScript
and all ten static stages passed. The full performance test tree recorded
231 passes and the enabled known DELETE application reproduction failure
(232 tests, 4,810 assertions). The original before-fix reproduction failed with
`comparable: true`, and the regression now passes for both candidate/reference
directions while preserving the original raw evidence.

## Workspace And Starting Matrix

Work continues in `/tmp/cmscore-capability-assessment-20261117`, branch
`codex/capability-performance-assessment`, based on application revision
`c4d018ad50e01e8250b43fbb04c26337027d77da`. The principal checkout is left alone.
Frozen dependencies were installed and the initial `bun run check` passed all
ten stages in this worktree.

The compiled inventory contains 219 current and 452 retained exact execution
targets. Policy requires 5,306 binding/variant obligations. At resumption,
710 scenario definitions planned 662 distinct required obligations; scenario
count and obligation count must not be conflated. The historical 296 successful
obligations in the earlier assessment do not describe the current checkout.

## First Test Expansion

The first expansion contained 816 scenarios and declared 759 required obligations.
The subsequent namespace and publication passes bring the plan to 872 scenarios
and 815 required obligations, with scenarios for 137 of 219 current capabilities.
These counts describe planned tests, not successful observed execution.

An additional fixture-development worktree at
`/tmp/cmscore-performance-fixture-development` preserves the source of the
running expansion campaign. Its initial frozen install and ten-stage check
passed before changes. It contains the same resumed work plus 104 new scenario
definitions: five remaining Repository collection-publication capabilities,
six Content settings mutations over HTTP/MCP, eight OAuth capabilities and
SMTP configuration persistence. Its plan now contains 976 scenarios, 919
required obligations and tests for 157 of 219 current targets. The remaining
62 current and 452 retained targets
still lack definitions; missing variants on otherwise planned targets remain
blocking too. None of these new definitions receives observed coverage before
real execution.

Settings and OAuth share a bounded pool of thirteen independently provisioned
tenants on the same Docker stack. Each lease owns its revision-controlled
sample; ten concurrent requests do not manufacture expected-revision conflicts
by sharing one document. Three warm-up leases plus ten measured leases cannot
allocate additional tenants. Published theme/text fixtures pass real collection
compilation and admission. Cross-instance session refusals, stale revisions,
one-time authorization codes, PKCE refusals and durable build results have
explicit postconditions. OAuth protocol errors inside successful HTTP envelopes
are rejected by nominal assertions. Settings cold samples read the current
revision in preparation immediately before the first mutation invocation in
each process epoch; that read is outside mutation latency and does warm common
routing/authentication state.

The pending initialization fixture now also rotates its own MCP session during
preparation, rather than retaining the initial token while the main session
refreshes. The public token lifetime is unchanged.

The expanded fixture tree's performance suite recorded 98 passes and the one
enabled DELETE reproduction failure across 99 tests. Six focused pool,
admission and protocol-oracle tests passed, as did performance TypeScript
checking. The latest completed static check passed ten stages. These checks
do not replace execution of the new scenarios against real local services.

SMTP configuration cases deliberately test persistence with delivery disabled;
they do not claim SMTP message delivery coverage. They verify exact public
configuration, password redaction, invalid-input and cross-instance refusals,
and unchanged business state after refusal. A controlled SMTP sink is still
required for delivery and account-recovery scenarios.

Test instrumentation now starts a fresh trace directory and metadata file at
each runtime epoch. Completed cold samples are collected before the next
restart; unmeasured predecessor preparation traces cannot accumulate across
thousands of restarts. Focused tests verify both ordering and cleanup. This
change affects instrumentation only, not application handlers or persistence.

Comparisons reject explicit measurement contamination, failed fixture setup
and source changes on either side. `ULVIA_PERFORMANCE_DIAGNOSTIC=1` marks future
development campaigns sharing a host; their results remain retained without
being eligible as timing regression references. Comparison tests keep these
failures blocking rather than computing misleading deltas.

- Existing query recipes now include three Provider-cold samples, using the
  shared sample harness. Evidence is collected before each subsequent restart.
- `examples.get` validates the pinned smoke fixture's exact example identity
  and authored Bloc reference.
- Delivery fixtures create independent published Pages. GET and HEAD are
  exercised; GET additionally tests 256 KiB content and sixteen prior
  publications. Invalidation primes the old representation, publishes new
  content, and rejects the stale marker in the measured response.
- Authoring connection fixtures measure configure/disconnect over HTTP/MCP and
  restore the exact original test publication credential after state checks.
  Credentials remain in closures and never enter measurement records.
- Namespace claim, suspension and transfer fixtures use fresh ordinary accounts,
  verify ownership and stale-owner refusals, and retain bounded reservations
  until the isolated stack is removed. They do not consume another family's
  32-namespace account quota. Authoring claim scenarios likewise use a fresh
  publisher per scenario, restoring the original publication credential afterward.
- A throwing scenario fixture now produces an explicit blocked result while
  unrelated scenarios continue. Raw error messages and credentials are excluded.
- Eleven additional Repository publication/download/source capabilities have
  nominal, cold, warm and concurrent definitions. Their contract fixtures pass
  real bundle admission and reject corrupted immutable documentation assets.
- Long-campaign MCP sessions renew through the real OAuth refresh endpoint during
  preparation. Access tokens last 900 seconds; credentials rotate in closures,
  never in reports. Failed refreshes remain blocking and never extend server TTLs.
- Each completed scenario is now flushed into a separate immutable checkpoint
  before the next scenario starts. Interrupted checkpoints are explicitly
  ineligible as regression references and do not masquerade as completed runs.

Fourteen focused harness/oracle tests and the performance TypeScript project
passed. The broader performance test tree recorded 88 passes and one existing
application-transport DELETE reproduction failure. The expanded static check
passed all ten stages.
The cold-evidence regression checks collection before the next process epoch;
the delivery oracle rejects stale content and nonempty HEAD bodies. The
connection test verifies restoration of the original credential.

## Execution Conditions And Remaining Work

A diagnostic campaign of the original 710 scenarios completed from the
principal checkout against local `1.0.19` images. Its source is separate from
the test-development worktree. Development checks share the physical host, so
this campaign must not be promoted as a clean timing regression reference.
All traffic targets disposable local instances; no production data is touched.

The sealed diagnostic run is `20261117T214021Z-c4d018ad50e0-97002d07` in the
principal checkout's performance history. All 710 definitions were attempted:
459 passed, 60 failed and 191 were blocked. It witnessed 453 of 5,306 required
obligations and recorded 98 budget findings. Its source fingerprint stayed
unchanged. These results include genuine DELETE failures and fixture problems:
the original single MCP token expired, and repeated namespace creation exhausted
the publisher's intentional 32-namespace quota. They must not all be attributed
to application regressions. The resumed fixtures address those preparation
problems without changing application limits or implementations.

The first expansion attempt is sealed as
`20261117T210622Z-c4d018ad50e0-3dc89986`. It recorded zero measured scenarios:
the stack could not allocate its second Docker network. A separate safe network
preflight confirmed `all predefined address pools have been fully subnetted`.
Only the preflight's own newly created networks were removed; existing networks
were left untouched. Campaigns will therefore run serially, reusing capacity
released by their predecessor, rather than changing daemon configuration.

The new definitions still require real execution before receiving observed
coverage credit. No successful coverage is inferred from passing harness tests.
The known DELETE transport reproduction remains enabled and unfixed.

A thirty-scenario pilot, `20261117T214854Z-c4d018ad50e0-4d48ada9`, retained
23 passes, six delivery preparation blocks and one publication-abort failure.
Delivery preparation initially used an unadmitted Page root; the fixture now
uses the installed smoke Bloc. The seven-scenario refinement
`20261117T215709Z-c4d018ad50e0-4de6629e` passed all six delivery cases, including
256 KiB content, publication history and invalidation. The abort case still
fails: after a successful abort, upload status responds 503 instead of a clean
not-found or conflict refusal. Its explicit `post-abort-upload-status-503`
failure remains enabled. Application error mapping has not been changed.
These pilots use different fixture fingerprints and are not combined into a
single coverage or regression-reference claim.

Long MCP scenarios reserve ten minutes of remaining token validity before
measurement through the existing refresh flow. The server's fifteen-minute
token lifetime is unchanged. Delivery markers occur in the authored content,
not merely the Page title; large-body assertions also require the intended
minimum response size.

Major gaps remain in retained-release fixtures, Hosting and internal machine
capabilities, installation/upgrade workflows, Repository publication workflows,
SMTP delivery, OAuth/recovery flows, large/history datasets and invalidation.
Missing obligations remain blocking findings. Establish an exclusive, matching
execution profile before choosing any regression reference; do not combine
incompatible historical runs or raise budgets merely to obtain passing results.

## Completed 170-Scenario Expansion

Run `20261117T220835Z-c4d018ad50e0-e08d2261` completed at
2026-11-17T22:45:56.929Z. All 170 selected definitions were attempted: 163 passed,
six failed and one was blocked. It witnessed 156 of the full inventory's 5,306
required obligations and retained 57 budget findings. The report seal was
verified. The source fingerprint remained
`4c64a7cf7f0751f11ad3841fb433ec0ac3f1abced5d0800a55ce2bfb9e9b0bc4`;
its complete working-tree archive is retained under that digest. Development
checks shared the host, so this is diagnostic evidence, not an exclusive timing
reference. Coverage from different fixture fingerprints is not added together.

All twelve Delivery GET/HEAD scenarios passed, including content size, history,
invalidation, cold and concurrent cases. Namespace claim/suspend/transfer and
ten of eleven contract-publication capability groups passed their variants.

The retained application backlog includes:

- `configure-connection` concurrent HTTP: six of ten requests returned 503;
  concurrent MCP: six of ten returned `CORE_UNAVAILABLE` inside HTTP 200.
  Instrumentation was complete. The largest observed request durations were
  817.5 ms and 856.63 ms respectively; these are diagnostic, shared-host values.
- `disconnect-connection` concurrent MCP also returned `CORE_UNAVAILABLE`.
  The corresponding HTTP concurrent scenario passed in this campaign.
- `publication-abort` nominal, cold and concurrent postconditions saw upload
  status return 503 after successful abort. Warm-up failed on the same check,
  leaving its timed scenario explicitly blocked.

These tests remain enabled. Application implementations and contracts are
unchanged, and no commit has been created.

## New-Family Pilot And Fixture Refinement

Run `20261117T224716Z-c4d018ad50e0-f9dac802` completed at
2026-11-17T22:53:41.924Z. All 29 selected scenarios were attempted: 24 passed,
two failed business assertions and three were blocked in preparation. Its
explicit shared-host diagnostic marker makes it ineligible for timing
regression comparison. Both completed campaigns were exported with verified
report seals and their exact working-tree source archives under the principal
checkout's ignored `artifacts/performance/exports/` directory.

The eight OAuth nominal workflows, asynchronous collection build and durable
build status, SMTP configuration persistence, theme mutations and text
overrides passed. The new epoch cleanup also passed real Delivery and site
mutation cold cases. These are scoped observations, not complete variant
coverage for those families.

The five remaining pilot results exposed two fixture mistakes, not established
application regressions. `TSystem.site.activeLanguages` contains active
additional languages; the default language is always active implicitly. The
fixture now supplies and requires only `en` alongside default `fr`. New
collection publication requires editable sources, as enforced by
`repository/filesystem/builds/collections.ts`; the collection fixture now uses
one source-retaining manifest for synchronous publication and asynchronous
build. No application normalization or publication policy was changed.

Settings verification now also attempts schema-valid business refusals: missing
Page references, invalid locale tags and missing theme/token identities. It
requires the declared 422/404 refusal, alongside stale-revision and
cross-instance refusals, and verifies that all leave business state unchanged.
A subsequent focused real campaign is required before those refined cases
receive successful coverage credit.

That refinement campaign is now sealed as
`20261117T225756Z-c4d018ad50e0-d53523b7`: all seventeen selected nominal
HTTP/MCP settings and Repository collection-publication scenarios passed.
They retain independent business postconditions, complete asset downloads,
durable asynchronous completion and applicable refusal checks. The report is
still a failed overall assessment because most mandatory obligations and a
matching reference are absent; successful scoped execution is not an exhaustive
or budget-compliance claim. These results supersede the affected pilot fixture
failures, without erasing the historical run or combining its coverage totals.

The initialization scenario planner remains a cohesive 190-line orchestration
file after adding its own token refresh preparation. Its size warning was
reviewed; no artificial split or formatting compression was introduced.


## Controlled Hosting Fixtures — 2026-11-18

The authoritative worktree remains frozen at source digest
`0da1d0a937a990c4a3840e323ed1ed5a71f5ab32d0c9e0bac15955bc7fee7f65`
while the full `verify` campaign runs. Its 976-scenario assessment checkpoint is
`20261117T231728Z-c4d018ad50e0-f067ee88`. This section describes additional
fixtures developed separately; it does not change that campaign's source or
claim execution coverage for the additions.

The secondary worktree was refreshed from that exact source archive before
adding 116 Hosting scenarios. All twelve current Hosting capabilities have
nominal, cold, warm and concurrent cases over their declared bindings; list
capabilities also have large/history datasets and queries have invalidation
cases. The draft plan has 1,092 scenarios, 1,035 distinct required obligations
and definitions for 169 of 219 current targets. Fifty current and all 452
retained targets still need definitions. Other missing variants remain blocking.

Hosting fixtures use the real Control administrator session and OAuth grant,
create disposable instances, and perform real domain/zone claims. Large/history
cases seed 64 records through actual capabilities. Pagination checks require
bounded, ordered unique results and truthful continuation. Invalidation primes
the same input, disables the record, and requires the changed state. Revision,
invalid-input, cross-instance and idempotency checks run outside measurement.

A private authoritative DNS sidecar serves only synthetic `.performance.test`
records. The Provider uses Docker's configured resolver; there is no public DNS
forwarder or external record mutation. A Bearer-protected loopback controller
owns bounded records and request/byte counters. Verification first refuses an
incorrect TXT proof without changing business state, then measures successful
verification using the exact claim proof. Reports contain DNS counts and bytes,
not names, proof values or credentials. Missing or malformed dependency evidence
cannot produce a successful witness. The bundled DNS program digest and its
0.25 CPU/64 MiB service limit participate in the environment fingerprint.

Seven focused DNS, dependency-provenance and pagination tests passed (47
assertions), and the expanded static check passed ten stages. The broader
performance test tree previously recorded 104 passes and the enabled DELETE
reproduction failure across 105 tests, before one additional bind-cleanup test
was added. TypeScript passed again after that addition. A separate candidate
container preflight verified the bundled service and default DNS resolver with
one real TXT exchange, without external networking or another Docker network.
That preflight is not a Hosting capability measurement. The complete 116-case
Hosting campaign still needs execution.

The metrics collector remains one cohesive 182-line file after integrating
actual dependency counts. Its size warning was reviewed; counter completeness
and business/common attribution remain together rather than being split to
satisfy a mechanical line limit. No application implementation, official
contract, production data or budget was changed.


## Installation Readers And Machine Calls — 2026-11-18

A further draft adds forty baseline scenarios for six Installation readers and
36 baseline scenarios for eight Gateway/Access/Observability capabilities.
The secondary plan now has 1,168 definitions for 1,111 distinct required
obligations and definitions for 183 of 219 current capabilities. Thirty-six
current and all 452 retained targets still lack definitions. The plan audit
retains 4,195 missing-obligation findings, including advanced variants on the
new readers and machine calls. These counts are planned, not observed coverage.

Reader fixtures discover the exact installed Provider and published smoke
collection. Documentation bytes come from independently compiled admitted assets;
Repository metadata comes from a verified immutable release download. Chunk
assertions require exact content, offsets, total and truthful continuation,
then consume all remaining chunks outside the timed first-page invocation.
Full multi-page traversal is a business postcondition; its duration and work
must not be presented as first-page latency. Invalid offsets, documentation path
traversal, digest mismatch, missing records and pagination limits have explicit
refusal checks.

The internal HTTP client uses the actual Provider mount with exact contract,
version, capability and UUID headers, plus a dedicated instance-control or real
signed invocation token. It accepts only loopback origins, refuses ordinary
cookie credentials, validates compiled inputs and never adds unsigned actor or
system identity headers. Five Gateway control scenarios cover route and
identity resolution, durable audit append, invocation issue and dispatch
preparation. Audit postconditions read only the synthetic event's indexed
identity from the disposable Mongo instance and require exactly one durable
record after replay and invalid-input refusal.

Issued invocation tokens must immediately authenticate their exact business
read and refuse a changed request ID with the transport's defined 400 input
refusal. These checks occur before later cold restarts can exhaust the
thirty-second token lease. Root client latency is fixed before these checks;
root work counters exclude their separate traces. Concurrent throughput still
measures completion of the entire sample send workflow, including these checks,
so it is not a raw isolated token-signing throughput claim.

Machine Access inspection and log ingestion obtain narrow system authority
through the real `gateway.invocation.issue` capability. Log tests verify durable
readback, emitter/instance identity, secret redaction, idempotent replay,
conflicting-entry and future-time refusal, and ordinary-user rejection. The
single-entry log reader is exercised over HTTP and MCP. Setup calls, including
token issue and log seeding, cannot receive coverage credit for those measured
capabilities. Cold evidence still requires the actual first target invocation
in the restarted process; setup cannot manufacture that witness.

The latest completed static check passed ten stages. The stable broader
performance test tree recorded 109 passes and the one enabled existing DELETE
transport failure across 110 tests (678 assertions). Plan regression tests
require all current Hosting bindings/variants, reject a removed definition and
prove that unexecuted plans never grant coverage; incomplete reader/machine
variants remain blocking. A later review adjusted only the short-lived token
postcondition ordering and its documented 400 refusal; TypeScript was rerun.
The new real Hosting, reader and machine campaigns still await the predecessor
Docker campaign. No application correction or commit has been made.


## Controlled SMTP And Account Recovery — 2026-11-18

The additional draft now contains 1,189 definitions for 1,131 distinct required
obligations, with definitions for 188 of 219 current targets. Thirty-one current
and all 452 retained targets still lack definitions. The audit retains 4,175
missing-obligation findings; no missing advanced variant is waived.

The SMTP sink runs from the immutable Provider candidate image on the private
stack network. It accepts authenticated synthetic `@performance.test` envelopes
only and has no forwarding transport. Its private controller retains at most
four messages per recipient, 512 mailboxes and 16 MiB of message content. A
message is bounded at 4 MiB; sixteen sockets, command/line limits, inactivity and
absolute deadlines bound pending work. Cleanup destroys unfinished sockets.
The bundled program digest and 0.25 CPU/256 MiB limit enter the run profile.
This fixture exercises plaintext authenticated SMTP on an isolated network;
it does not claim SMTP TLS coverage.

Actual acknowledged SMTP transactions and request/response bytes are observed
per unique recipient. Nominal Emailer sends and recovery requests cannot cover
an obligation without positive complete SMTP evidence. Failed auxiliary counter
collection preserves the original HTTP attempt and marks its metrics incomplete.
Messages, recipients, passwords and recovery tokens stay in closures or the
private in-memory controller; reports retain counts and fixed service labels.

The five Emailer scenarios include a 256 KiB text case, complete decoded text
and HTML, sender/reply-to identity, explicit keyed replay, disabled delivery,
invalid business input and cross-instance session refusal. Replays require the
same output without another SMTP transaction; an implementation violating this
contract remains a failing result. The shared HTTP/MCP clients now allow an
explicit fixture-owned key, validate its syntax and keep it out of observations.

Sixteen account-recovery scenarios cover the four request/confirmation
capabilities. Setup uses real signup and the actual emailed challenge. Password
reset must revoke the prior session, reject the old password and accept the new
one. Confirmation tokens must be single-use and refused on another instance
before local consumption; invalid-token and blank-password attempts preserve the
owned membership before the measured success. Requests exercise the real
five-minute cooldown and unknown-account branch without extra delivery.

A verification-request fixture needs an unverified member without an active
signup challenge. It seeds this valid state by deleting only its own fresh
signup challenge through the public `MongoAuthTokenStore` adapter in the
disposable Provider. Read-only discovery verifies one exact token digest and
exclusive owner before mutation. The plaintext token never crosses the Docker
command boundary. This is explicit fixture preparation; application cooldowns,
expiration policies and persisted formats are unchanged. These preparation
adapter calls never receive performance coverage credit.

A single `--network none` candidate-container preflight used the real public
Nodemailer adapter and verified complete message receipt: one acknowledged
transaction, 528 request bytes and 211 response bytes. Its bundled program
digest was `247d8dcfca8c91a54af3cabd2d5cbac97732942e18a5a450db1a513bae5719cf`.
The container was removed afterward. This confirms packaging and transport,
not the full Edge/Gateway/Provider capability workflow.

Fifteen focused tests passed initially, followed by a stable performance suite
with 117 passes and the single enabled DELETE reproduction failure across
118 tests (742 assertions). TypeScript passed and the completed static check
passed ten stages. The final fixture-ownership review is followed by another
static check. Offline frozen installation also passes. The only root dependency
change exposes the existing workspace SMTP adapter as a test devDependency;
no dependency versions or application package manifests change.

The new full-stack SMTP/recovery scenarios still await execution after the
predecessor 976-scenario `verify` campaign. No successful observed coverage,
performance improvement, application correction or commit is claimed here.


The final SMTP bounds test admits exactly sixteen real sockets, refuses the
seventeenth, and verifies destruction of all admitted sessions on cleanup.
Retention overflow leaves accepted counts unchanged and removal releases its
byte quota. The expanded suite then recorded 118 passes and the enabled DELETE
failure across 119 tests (747 assertions); the reviewed static check passed ten
stages. A repeated candidate-container preflight of final SMTP program
`e0364704124e196303b288427a75098a65632dd650da9cf69eabc4f0ffd21b37`
again retained one complete acknowledged message (528 request and 211 response
bytes), with the same image and resource limits. The final fixture-only review
also gives keyed-replay and recovery preparation failures explicit sanitized
codes, so a later full-stack failure is attributable without logging mail or
credentials.

## Installation and initialization fixtures, 2026-11-18

The development plan now contains 1,261 scenario definitions, with at least one
definition for 196 of 219 current execution targets. Of 5,306 required exact
binding/variant obligations, 1,201 are planned and 4,105 remain missing. All
452 retained-version targets still need exact execution fixtures. These are
planning counts, not successful observed coverage.

The additional workflows cover installing one or several admitted collections,
configuring and updating collection configuration, configuring a Repository,
creating a Repository on a fresh instance, listing initialization recipes, and
applying an initialization plan. Collection publication uses actual admitted
artifacts with configurable schemas and retained editable sources. Mutations
assert durable state, revision conflicts, invalid inputs and foreign-instance
refusals. Repository configuration is restored in cleanup.

Single-use initialization tenants share thirteen permits, are disabled in
cleanup and never reuse a completed initialization. Their databases remain
owned by the disposable stack until teardown. Recipe listing traverses bounded
pages and includes large, historical and invalidation datasets. Apply follows
the real initialization status operation to completion and reads the first and
last published pages through Edge. Cold apply replans after restart, outside
the measured root call, to use the actual post-startup settings revision.

Incremental Mongo profiling enables only new instance databases and preserves
existing profile collections. A real single-container MongoDB 7.0.37 preflight
under `--network none` preserved an earlier tagged query while enabling the
second database. The temporary container was removed. This validates the
instrumentation lifecycle, not capability performance coverage.

Gateway scope assertions now distinguish the logical site `default` from the
physical instance identity reported by Provider. A focused regression test
rejects wrong physical instances, confused site identities and changed
installation selections. No runtime identity behavior was changed.

The final performance harness unit run recorded 123 passes and the existing
enabled DELETE-body reproduction failure across 124 tests (773 assertions).
The ten-stage static check passed. The new full-stack workflows have not yet
been attempted; the frozen predecessor campaign must finish before another
stack starts. No application or contract implementation was modified and no
commit was created.

## Completed campaigns and measurement review, 2026-11-18

The frozen `0da1d0a937a990c4a3840e323ed1ed5a71f5ab32d0c9e0bac15955bc7fee7f65`
campaign `20261117T231728Z-c4d018ad50e0-f067ee88` finished at
01:53:32.841 UTC: 976 scenarios, 922 passed, 47 failed and seven blocked.
Its historical validator counted 877 covered obligations and 369 budget
findings. The run and its exact 3,715-file source archive were exported and
their hashes verified. It is a shared-host diagnostic, not a timing reference.

The surrounding full `verify` finished with the expected nonzero status in
the global tests and capability assessment stages. Global tests recorded
3,778 passes, 56 skips and the enabled DELETE-body reproduction failure.
Both actual Caddy/Pebble TLS phases passed: 18 assertions on fresh storage and
19 after restart. Those command results describe the frozen campaign source,
not the subsequent development draft.

The new nominal pilot `20261118T015531Z-c4d018ad50e0-db542ad7`, frozen at
`43fe8e4578f521ac288d91ee4b0f208e15c97e7449e359fa07e27b05c49d00ef`,
attempted 64 scenarios: ten passed, one failed and 53 were blocked. Four
account recovery workflows completed through actual locally received mail.
The exact inherited SMTP `emailer.send` HTTP target returned 404; its cause
is not established. MongoDB subsequently exited with Docker `OOMKilled: true`,
code 137, under the recorded 1 GiB memory limit. Later 503 and collection
failures cannot establish independent capability defects. The sealed results,
3,781-file source archive and a separate hashed infrastructure annotation are
preserved; none of the failing results was replaced.

Review also found that the historical collector matched a Mongo command to
any profiler row with the same trace. A profiled control database could thereby
conceal an unprofiled tenant database. Historical coverage counts above remain
facts about their original validator; they do not prove coverage under the
stronger database-scoped rule and must not be added to subsequent run counts.
These already diagnostic runs are not suitable references.

The updated probe records the actual Mongo command database. Profiling results
retain their database identity, and completeness now requires a matching
database and trace for every observed command. A real network-isolated MongoDB
preflight refused the two-database measurement while one database was
unprofiled, then accepted it after activation, preserving the earlier trace.
That draft generated a Mongo startup configuration intended to profile traced
commands even in databases created inside the measured request. An isolated
MongoDB 7.0.37 preflight confirmed capture of the first insert and query in a
new database. The subsequent full-stack preparation failure and replacement
are recorded below. Its cache
was 268,435,456 bytes under the 1 GiB container limit; the OOM cause is not
attributed to an unbounded default cache.

Single-use tenants now discard their own database after admitted disable and
measurement collection. Disabled catalogue records remain available for
history. Shared settings tenants, Control, Registry, ready tenants and foreign
origins are excluded; the in-container guard checks the exact instance, origin
and disabled state again before deletion. The serialized guard is tested in
an independent JavaScript context. This cleanup still needs a complete live
workflow validation. The 64-ready-instance large workload remains intact.

Another test-side issue concerned deliberately invalid DTOs: ordinary clients
correctly reject them before network IO. Dedicated bounded negative JSON
probes now send the invalid body through the compiled binding and consume the
actual refusal response. They return no performance Observation and cannot
earn nominal coverage. The corresponding initialization, reader and contract
upgrade negative assertions use this path.

The draft now defines 1,295 scenarios for 200 of 219 current targets. The 34
additional contract upgrade scenarios cover planning, actual grant changes,
durable upgrade reads and operation reads, including real authorization
postconditions, keyed replay, foreign-instance refusals and grant restoration.
Plan invalidation primes identical inputs before the mutation. Resume recovery
and retained exact-version fixtures remain unimplemented. There are still
4,071 missing required obligations, including all 3,698 retained obligations.

Validation after the instrumentation and cleanup changes recorded 128 passing
harness tests and the enabled DELETE failure across 129 tests (822 assertions).
TypeScript passed and the ten-stage static check passed. The later serialized
guard refinement also passed its focused tests. These checks do not replace
the outstanding live workflows or final full `verify`. No application or
contract implementation was changed, no performance budget was raised, and no
commit was created.

## Collection upgrades and Control-safe profiling, 2026-11-18

The next frozen pilot `20261118T021851Z-c4d018ad50e0-9f9084f3` defined 48
scenarios but failed stack preparation before executing any. Its failed report
and exact `e838f3a52fbcdb5069b1d45941874940f5c44fd968aa12d0705bd95709a8e685`
source were exported. No scenario received coverage credit. A separate local
preparation reproduction captured Provider's startup refusal: `HostingError`,
`CONFLICT`, "Hosting state is missing from a populated installation".

The test-only global profiler creates `system.profile` before Control's fresh
installation check. It has been removed rather than changing application
bootstrap behavior. The instrumentation now configures profiling when a tenant
Mongo client connects, before returning that connection to the caller. Only
the runtime-owned `ulvia_` tenant database prefix is eligible. The host Control
database remains untouched until the existing assessment profiler starts after
bootstrap. Setup creates a bounded 64 MiB profile collection without dropping
existing evidence, coalesces concurrent connections and closes failed loads
before retry. Setup commands are excluded from business operation counters;
their connection latency remains part of instrumented request timing. This
instrumentation revision therefore requires a new comparable reference.

An actual candidate-image Mongo driver preflight used two containers sharing
an otherwise network-isolated namespace. It proved pristine Control, one
profiled first tenant write, one recorded business command and a 64 MiB profile
collection. Both containers were removed. Unit tests cover coalescing, waiting
for setup, existing collections, failed-load cleanup and retry. Deployment
preparation errors now expose a fixed stage while keeping startup diagnostics
and original error details out of ordinary string and JSON reports. Missing
diagnostics cannot prevent the deployment cleanup path.

Twenty-six new collection upgrade definitions cover plan/apply/get over HTTP
and MCP, including plan invalidation. Each publisher owns at most twenty
immutable release artifacts, reused by thirteen independent leased tenants.
The source and target are real admitted versions 1.0.0 and 1.1.0 of the same
collection. Setup configures a unique value and publishes a Page using its
Bloc. Postconditions check exact installed digest/version, retained
configuration, unchanged Page documents and unrelated collections, actual
rendering, completed durable intents, keyed replay and conflicting-key
refusal. Invalid DTO and foreign-instance probes must preserve state. Plan
invalidation edits the Page after priming the same target input; the measured
plan is the first plan read after that mutation. Owned Pages remain until
stack teardown, with the finite scenario inventory bounding their count.

The development plan now contains 1,321 definitions for 203 current execution
targets, with 4,045 required obligations still missing. Sixteen current targets
and all 452 retained exact-version targets still lack definitions. The new
collection workflows have not yet been measured. Validation recorded 132
passing harness tests and the enabled DELETE-body failure across 133 tests
(852 assertions), passing performance TypeScript and ten passing static stages.
No application/contract implementation, performance budget or commit changed.

## Sequential lifetimes and prepared contract recovery, 2026-11-18

Pilot `20261118T024230Z-c4d018ad50e0-610feab1`, frozen at
`550388e56bb095528a0993fa49a60b147b81b7decb68fa75657da17cae04e741`,
completed with one passed scenario and 53 blocked scenarios. Preparation now
passes. Docker subsequently showed Provider as exited with code 137. Its
container was removed before `State.OOMKilled` could be read, so an OOM is
not established for this run. Its sealed results and 3,800-file source archive
were exported and verified. Later 503 failures are dependent stack failures,
not independent evidence of each capability's behavior.

The previous sampler prepared and retained ten tenant leases even for ten
sequential nominal requests. Sequential and cold samples now complete the
prepare/send/collect/verify/close lifecycle before preparing the next sample.
Warm-up samples follow that lifecycle too and remain excluded from measured
coverage. Concurrent scenarios still prepare ten independent samples and
start all ten sends together. Settled requests are awaited before cleanup,
including when another send throws synchronously. A barrier test proves the
ten-request concurrency rather than inferring it from configuration. Sample
counts, performance ceilings and runtime resource limits are unchanged.

Collection mutation and upgrade fixtures now use distinct admitted artifacts
per sample so tenant reuse cannot accidentally reinstall an already installed
release or downgrade one. Bounded publisher buckets hold sixteen resource
identities with at most two versions each. Resource and Repository fixture
helpers have been grouped under dedicated directories. Runtime caches may
still retain already opened compositions; this change does not claim to fix
application memory behavior or establish that the signal exit is resolved.

The report now captures safe Provider/Edge/Mongo lifecycle fields before
destroying a returned stack. A non-running process or unavailable lifecycle
proof prevents reference eligibility. No container environment or private
Docker error text enters that report. Comparisons also require identical
scenario execution order, because reordering can change cache and dataset
conditions. Fresh-instance Repository/initialization workflows run after the
other installation workflows; their load is preserved.

Eight new `resume-contract-upgrade` definitions cover HTTP and MCP over
nominal/cold/warm/concurrent variants. Preparation obtains an actual applicable
grant review and writes its exact typed prepared intent through the public
`MongoSiteUpgradeStorage` adapter in the owned tenant. Source/target digests
use the existing canonical revision protocol, pins remain unchanged and the
grant policy must actually differ. This explicitly models interruption after
durable preparation; adapter setup receives no capability coverage credit.
The intent is checked as prepared immediately before the measured resume.
The real asynchronous capability must complete it, apply the new grant,
preserve content, reject a foreign session and replay without another state
change. Cleanup may use the real resume API before restoring the prior grants;
that cleanup cannot make a failed root measurement successful.

The contract-plan invalidation scenario now performs its first plan read
after mutation inside the measured invocation, rather than priming the changed
answer during setup. The draft contains 1,329 definitions for 204 current
targets. Fifteen current targets and all 452 retained targets still need
definitions; 4,037 required obligations remain missing. Recovery and the revised
lifecycle still require live campaign evidence.

The last broad harness run recorded 140 passes plus the enabled DELETE failure
across 141 tests (923 assertions). The subsequent order-comparison and recovery
refinements passed twelve focused tests (93 assertions), performance TypeScript
and all ten static stages. Final full `verify` remains outstanding. No
application or contract implementation, performance budget, runtime resource
limit or commit was changed.

### 2026-11-18: serial pilot evidence and Provider administration definitions

The 56-scenario serial pilot sealed run
`20261118T031334Z-c4d018ad50e0-87874f1e` against source `989f1ef5…`:
22 passed, 14 failed and 20 were blocked, with 22 observed covered obligations
and sixteen budget findings. All 3,810 source-file hashes and both the source
and run seals were verified in the exported archive. The owned-container audit
recorded `OOMKilled=true` for the Provider, although it was running with exit
code zero when inspected. This proves an OOM event was recorded, without
establishing its time or attributing every failed postcondition to that event.
The hashed lifecycle annotation preserves that distinction. These shared-host
diagnostics remain ineligible as a timing reference.

The tests incorrectly expected domain status 422 for schema-invalid collection
listing inputs and empty upgrade targets. Gateway HTTP input validation maps
`invalid_input` to status 400 before domain execution. Negative probes now
assert that exact status for these schema refusals. Collection upgrade reads
with an empty ID still expect the domain's 422 because their DTO schema has no
minimum length. No refusal is counted as nominal execution. The client retains
explicit test-owned `ClientFailure` identifiers from business assertions while
discarding arbitrary assertion messages; tests prove private payload text does
not enter observations. Installation mutation and Provider read assertions now
identify the failing postcondition without persisting DTOs or credentials.

Twenty new definitions cover the five remaining Provider administration
capabilities over nominal/cold/warm/concurrent variants. They use the disposable
named Provider, independently downloaded and digest-verified manifest/contract
bytes, real preview tickets, approval, pairing and Gateway invocation. Manifest
import currently measures immutable re-admission, not first import. Preview
must leave installation and selection state unchanged; approval must establish
the exact observed account while preserving selected pins. The approval
revision expectation includes the real runtime's automatic pairing writes.
Rotation must invalidate the previous return token, make the replacement token
usable for an acknowledged log append, replay without mutation and reject a
different stale revision. Status scenarios measure disable, check token refusal
and restore enable in cleanup. Revoke remains additional unimplemented state
transition coverage; it is not inferred from disable. Foreign sessions are
tested, and no native selected Provider is disabled.

The new plan contains 1,349 definitions for 209 of 219 current targets. Ten
current targets remain without definitions, together with all 452 retained
targets. Missing required obligations total 4,017: 319 current and 3,698
retained. Planning tests verify the twenty new exact binding/variant definitions
and prove that none receives coverage without measured results. A broad harness
run recorded 145 passes and the enabled pre-existing DELETE failure across 146
tests, with 960 assertions. All ten static stages passed. Live execution of
the new Provider cases and final full `verify` remain outstanding.

### 2026-11-18: technical return-channel fixtures

Four additional definitions cover `ulvia/provider.connections:connections.configure`
over nominal/cold/warm/concurrent. The HTTP request uses the real production
`NodeGatewayHttpNetwork` account-signing path, the admitted binding and the
owned disposable account's credential. It does not fabricate system identity
headers. An actual local HTTP test verifies signature, account audience,
connection scope, exact version and complete JSON input; its synthetic server
is only a transport unit test and supplies no measured capability coverage.

Live scenario postconditions read the exact saved return channel through the
public `ProviderConnections` adapter. They exercise idempotent replay,
same-generation conflict, a mismatching signed connection identity, an invalid
account credential, separation of the same connection ID across the two real
accounts, higher-generation replacement and refusal of an older generation.
Credentials remain in closures. Unique resources are finite (one per sample
per account) and last until destruction of the owned stack. These scenarios
still await a real campaign; the plan must not count the unit test as coverage.

The 20-case live pilot of source `1750c2cd…` has confirmed both release-listing
bindings, the Provider installation reader, preview, collection configuration
update and the HTTP collection-upgrade plan. It also exposed an incorrect test
expectation: an install target whose exact digest is absent from its catalogue
is `NOT_FOUND` (404), as implemented by `CollectionSources.prepare`'s exact
`sameRelease` lookup. The test now expects 404, preserving the unchanged-state
assertion. Invalid collection configuration still returns 503 through
`configure-collection` in both bindings, while the corresponding
`update-collection-configuration` scenarios pass. That behavior remains an
application finding to investigate, not a reason to accept 503 as a valid input
refusal. Provider import/approval and pairing setup failures remain unresolved;
additional test-owned diagnostic identifiers distinguish their stages.

After this expansion, planning contains 1,353 definitions covering 210 current
targets. Nine current targets remain without definitions and 315 current
required obligations are missing, in addition to the 3,698 retained-version
obligations. The latest broad harness run recorded 146 passes and the enabled
DELETE failure across 147 tests (979 assertions). Performance TypeScript and
all ten static stages passed before the final assertion-only adjustments.
No application implementation, contract, budget or runtime resource limit was
changed, and no commit was created.

The 20-case pilot subsequently sealed as
`20261118T033748Z-c4d018ad50e0-e87b2400`: eight passed, eight failed and four
were blocked, with eight observed covered obligations and thirteen budget
findings. All 3,818 source-file hashes and all run/source seals were verified
after export. Its final owned-container audit again recorded Provider
`OOMKilled=true` while running with exit code zero. This diagnostic therefore
cannot establish a stable timing reference or attribute every failure to an
independent capability defect. It does not supersede prior immutable evidence.

### 2026-11-18: machine routing and evidence-backed Provider fixture corrections

Run `20261118T035023Z-c4d018ad50e0-70680ea0` sealed nine attempted scenarios
against source `bf9b4a0c…`: one passed, five failed and three were blocked,
with one observed covered obligation and one budget finding. All 3,821 source
file hashes and all run/source seals were verified after export. The final
runtime audit emitted no lifecycle finding; that is not a complete timeline of
every process event. No failed signed connection request receives coverage.

The signed connection fixture incorrectly used provisioning's instance access
token as an invocation signing secret. It now obtains the owned account's
actual invocation secret through the existing private integration helper.
The old 401 evidence is retained, not relabeled as an application regression.
The Provider approval oracle also omitted the workflow's explicit observation
write: Mongo approval/reapproval starts without an observation, the workflow
records one, and automatic pairing then modifies and observes the installation.
The exact expected delta is therefore four, not three. Immutable manifest
re-admission permits observation-only revision increases because
`RefreshingProviderRoutes` refreshes observations after thirty seconds. Its
oracle still refuses changed approvals, identities, selected pins, selection
revision, installation count or a regressed installation revision. A focused
test mutates each of those fields and requires refusal.

The host resolver returned `EAI_AGAIN` for the synthetic
`perf-settings-0.localhost` name. The return-channel postcondition now sends real
SDK JSON commands to the literal loopback ingress, preserving the fixture
tenant's Host header through an injected local network adapter. The production
SDK address policy remains unchanged: it rejects hostname-to-loopback answers,
even when private networks are allowed. This fixture tests the SDK envelope and
real Gateway authorization, not that default DNS policy. The local adapter is
limited to an isolated HTTP tenant, its exact ingress and POST JSON bodies; it
does not synthesize responses or bypass the Gateway. A real HTTP unit test
verifies the received Host, provider authority, credential, body and response.

Five new `ulvia/provider.routing:domains.resolve` definitions cover nominal,
cold, warm, concurrent and invalidation. They share Hosting's authenticated
Control context and one owned ready anchor. Each sample claims its own active
loopback alias, calls the admitted native binding with the actual configured
Edge routing secret through production SDK signing, and checks the origins,
instance/domain revisions, bounded lease and resource-revision shape. The
returned lease must authenticate the real account report for that anchor,
distinct from the primary instance. Invalidation measures the first read after
disabling the alias, requires null and refuses its still-unexpired old lease.
Missing/malformed domains, wrong machine authority and unchanged stored state
are checked; aliases are disabled in cleanup. These fixtures await live
measurement and receive no coverage from transport or planning unit tests.

Native mount resolution and SDK signing are shared by connection and routing
clients. The account and routing identities are distinct fixed branches; a
connection call cannot claim the routing machine identity. The root workspace
adds Hosting as a test-only workspace dependency, with frozen installation.
No production package, contract, implementation, budget or resource limit was
changed. The plan now has 1,358 definitions for 211 current targets; eight
current targets and all 452 retained targets still lack definitions. Required
gaps total 4,008 (310 current and 3,698 retained). The latest broad harness run
recorded 150 passes and the enabled DELETE failure across 151 tests, with
1,019 assertions. Performance TypeScript and all ten static stages passed;
final full `verify` remains outstanding. No commit was created.

### 2026-11-18: first complete routing/Provider pilot and Gateway authority definitions

Run `20261118T040751Z-c4d018ad50e0-d08945bc` sealed fourteen scenarios
against source `677f4d38…`. All fourteen passed their business and measurement
checks, producing 126 measured samples and fourteen observed covered
obligations. All 3,827 source-file hashes and the source/run seals were verified
in the portable export. The final runtime audit emitted no lifecycle finding.
The report remains failed overall: this shared-host diagnostic is ineligible
as a reference, most inventory obligations are unplanned, and immutable
manifest re-admission made 24 internal requests against its unchanged budget
of fifteen. That performance finding is retained without raising the ceiling.
For context, measured nearest-rank p95 was 328.90 ms for three cold connection
samples and 25.35 ms for three cold routing samples. These small diagnostic
samples establish neither a stable percentile estimate nor a regression
reference.

Thirteen new Gateway Provider definitions exercise resolve, authorize and
prepare over nominal/cold/warm/concurrent, plus authorization invalidation.
Each fixture pairs a real remote account in an owned settings tenant, reads
that tenant's actual control credential with an exact physical-instance guard,
and uses the native admitted control binding. Authorization checks the real
return-token fingerprint and denies undeclared capability, version, target and
credential changes. Its invalidation case primes allow, rotates through the
ordinary pairing API, measures refusal of the old fingerprint, and verifies the
replacement token. Preparation's returned token must append a real synthetic
Provider log, preserve provenance and refuse another request ID. Real journal
reads prove storage, while another instance must neither resolve the credential
nor read that entry. Approval/selection state must remain unchanged except for
permitted observation refreshes. Private credential extraction now refuses
non-test containers and foreign idempotency-key prefixes before Docker access.

Twelve delegation definitions cover issue/check/close over the four baseline
variants. They use the selected Content implementation's reviewed
`delivery.resolve-resource` delegation policy, its actual paired native return
credential, an anonymous actor and the exact public
`initialization.entry` destination. The real issuer, checker and closer must
create usable bounded tickets, preserve the root request identity, authorize
an actual signed child invocation, deny sensitive/admin and wrong-credential
targets, isolate another physical instance, ignore a wrong closure request ID,
and fence the ticket after proper closure. Tickets are closed in cleanup. No
delegation state, signature or caller role is fabricated.

Short-lived prerequisites now have an optional test-harness `beforeMeasure`
hook. Sequential samples refresh them after preparation; concurrent samples
prepare every fixture, await every prerequisite, then enter the existing real
send barrier. Cold lifecycle samples restart before refreshing these
prerequisites. Refresh calls do not produce target coverage or enter root
timing. The all-settled barrier prevents a failed prerequisite from racing
cleanup or yielding a partially prepared concurrent workload. Focused tests
cover ordering, all-pending completion on failure, no fabricated samples and
the three distinct warm-up phases. Counts, concurrency and budgets are unchanged.

Delegation-check invalidation remains an explicit blocking plan gap: closure
correctly produces a declared refusal, and the harness must represent that
expected non-nominal outcome without admitting validation errors as nominal
coverage. It is not claimed covered by the baseline postconditions. Planning
tests require this exact missing-plan row to remain visible. The plan now has
1,383 definitions for 217 current targets; `resume-collection-upgrade` and
`certificates.permit` still lack definitions. Missing required obligations
total 3,983 (285 current and 3,698 retained). The latest harness run recorded
155 passes plus the enabled DELETE application reproduction failure across
156 tests, with 1,066 assertions. Performance TypeScript and all ten static
stages passed. Live execution of the new Gateway cases and final full `verify`
remain outstanding. No application, contract, budget, resource limit or commit
was changed.

### 2026-11-18: Gateway fixture scope refusal

The first 25-case Gateway pilot, run
`20261118T043119Z-c4d018ad50e0-50e5d7a6` against source `89d4c101…`,
was blocked in fixture preparation: the credential scope guard expected a bare
UUID instead of the actual `instance:<UUID>` identifier used by provisioning
and the existing upgrade fixture guard. No required target invocation was
measured and coverage remains zero. The test-only guard and its unit fixture
now use the real identifier format; the unprefixed UUID is explicitly refused.
The original failed run is retained and is not an application regression.


### 2026-11-18: Real collection-upgrade recovery preparation

Eight definitions now exercise `resume-collection-upgrade` through both HTTP
and MCP, with nominal, cold, warm and concurrent variants. The private fixture
process composes the immutable candidate's own stores for one explicitly owned
`perf-settings-N.localhost` instance. It imports the real target artifact through
the public collection API, reproduces the reviewed upgrade plan, and interrupts
the real service immediately after `SiteUpgradeStorage.begin` has durably
written its prepared intent. The test does not fabricate the upgrade payload or
state hashes. A test-only wrapper validates the intent before writing, recognizes
only its own interruption, and restores the original adapter method in `finally`.
The ordinary Provider process is not patched.

Before measurement, including after cold restart, the public read must still
report a prepared upgrade at the reviewed revision. The measured resume must
complete through the real operation API, increment the catalogue revision once,
preserve configuration, Page data and unrelated installations, and serve the
Page through Edge. Postconditions check exact replay through the selected
binding, conflicting replay, schema refusal and foreign-instance credentials.
Cleanup may resume an unfinished owned intent through the ordinary API; this
cleanup does not create measurement credit.

The exact plan contains 1,391 definitions for 218 of 219 current targets. The
remaining current target without any definition is TLS `certificates.permit`.
There are still 277 missing current obligations and 3,698 missing retained
obligations; no new live coverage is claimed by these definitions. The current
performance tests recorded 159 passes and the enabled DELETE transport
application reproduction failure (160 tests, 1,090 assertions). Performance
TypeScript and all ten `check` stages passed. Live recovery execution and final
full `verify` remain outstanding. No application, contract, budget, resource
limit or commit changed.


### 2026-11-18: Gateway pilot completed and exported

Run `20261118T043630Z-c4d018ad50e0-bf424c9e`, source `b785f38f…`,
completed all 25 selected Gateway scenarios: 25 passed, none failed or blocked,
226 captured samples (208 measured and 18 preparation warm-ups), and 25 witnessed obligations. The report remains failed: a
cold `gateway.provider.authorize` sample used 125 Mongo operations against the
unchanged ceiling of 80, the exhaustive matrix is incomplete, and no eligible
reference was supplied. No final runtime lifecycle finding was emitted; this is
a final container-state observation, not a complete process timeline.

The portable export includes the exact source archive, patch, manifest, JSON
results, HTML report, comparison and completion seals. Every one of its 3,835
source-file hashes and all source/run seals were verified after export. These
shared-host measurements are diagnostic and reference-ineligible. Their coverage
is not summed with campaigns from other source or fixture fingerprints.

### 2026-11-18: Native TLS performance definitions

Five TLS permission definitions cover nominal, cold, warm, concurrent and
invalidation variants. The controlled service uses the pinned Caddy image from
the existing TLS integration fixture, the public Provider permission endpoint,
the ordinary shared Edge upstream and an internal issuer. Its ephemeral private
CA is mounted only into the disposable Provider; host trust is unchanged. The
image digest, full Caddy configuration and service limits form the immutable
service fingerprint. Caddy must generate its real CA before the Provider starts.

Each sample claims a unique synthetic HTTPS domain on a real ready instance,
proves ownership through the controlled UDP DNS service, and waits for the
ordinary TLS reconciler to report an active domain with a trusted certificate.
Only the subsequent anonymous native permission request supplies coverage.
Invalidation primes refusal with an incorrect A record, restores the real
entrypoint address and measures permission again. Postconditions check absent,
malformed, changed-DNS and disabled domains, including restoration and cleanup.

A and AAAA request/byte counters are both collected, including authoritative
NODATA responses. These per-hostname service-window counts can conservatively
include a background reconciliation lookup that overlaps the measured request;
they are not exclusive DNS attribution to its trace. Root HTTP timing excludes
service-control reads, and mandatory dependency evidence cannot be omitted.
Real UDP tests prove AAAA counter retrieval and cleanup without deleting A data.
The native adapter uses the admitted path/query and fully validates responses
without adding control credentials. Its loopback HTTP tests reject forbidden
responses and invalid success DTOs.

The first service preflight could not allocate a Docker network because the
host's predefined address pools were exhausted while the recovery campaign was
active. The active campaign was left running and unrelated networks were not
pruned. TLS live coverage remains unproven until an isolated real attempt.


The TLS service preflight was retried after the recovery stack terminated.
Caddy generated its real private CA, but Docker archive copying could not read
that tmpfs file even though the in-container file check succeeded. The fixture
now reads the bounded public certificate through `docker exec cat` and writes
only that certificate to the ephemeral trust mount. The final preflight
`/tmp/cmscore-tls-service-preflight.log` passed, and its container was confirmed
removed. This does not credit any permission scenario. The latest broad tests
recorded 162 passes plus the existing enabled DELETE transport failure across
163 tests and 1,144 assertions. All ten static stages and performance TypeScript
passed; final native TLS execution remains outstanding.

### 2026-11-18: Collection recovery pilot OOM evidence

Run `20261118T045515Z-c4d018ad50e0-10d6182a` against source `256f26ad…`
completed with three successful HTTP definitions (nominal, cold and warm),
26 captured samples including three preparation warm-ups, no budget finding,
and five blocked definitions. Concurrent HTTP preparation could not finish
cleanup, and the following four MCP definitions were blocked before returning
a result. No concurrent target sample was fabricated. The final runtime audit
recorded Provider `Running=true`, exit code zero and `OOMKilled=true`; this
invalidates timing-reference eligibility. The exported report and exact source
archive were retained, and all 3,840 source-file hashes plus all completion
seals were verified.

The sample harness prepares concurrent fixtures sequentially and only sends
the measured requests concurrently. Therefore this failure does not establish
that multiple private seeding processes ran simultaneously. Each private Bun
process still composes a full Provider store set inside the Provider container's
resource group, while ten separately prepared tenant instances remain loaded.
That fixture overhead and the actual multi-instance workload need to be
distinguished before attributing the OOM or changing the fixture. Production
resources, code and performance budgets remain unchanged.


### 2026-11-18: Separate recovery fixture worker and anonymous trace correlation

The private collection-recovery seed now runs in a separate short-lived
container using the already verified immutable Provider image, the owned
internal network, and the Provider's existing volumes. Its fixed limit is one
CPU and 1 GiB, recorded separately as `collection-recovery-worker` in the service
profile; production resource limits and measured concurrency are unchanged.
The worker is removed before measured execution. This removes auxiliary store
composition from the Provider's cgroup without changing the real resume path.
Live evidence is still required to distinguish that overhead from an
application workload memory limit.

Before copying runtime environment, the worker requires the exact test
container name, immutable image identity, live non-OOM state, Provider label,
owned network, internal Mongo URL and expected storage root. Environment
variables must be bounded, newline-free and unique. They exist only in a mode
0600 file under a private temporary directory; reports never receive them.
The process has a 60-second deadline, bounded output streams, and unconditional
container/file cleanup. Unit tests reject foreign names/networks, external
Mongo, duplicate or injected variables, exited/OOM runtimes and excess payloads.

The initial TLS pilot correctly refused coverage despite HTTP 200 and validated
permission DTOs: the public mount deliberately replaces incoming request
metadata, so client IDs did not correlate to its real dispatcher invocation.
The test-only preload now associates a valid client trace with that exact
static GET route through outer async-local instrumentation. Only the exact
`ulvia/provider.tls` / `hosting:tls` invocation can use that association; request
objects, server-generated request IDs and authorization context are unchanged.
A test using the real public mount and admitted implementation proves ten
concurrent traces remain isolated, forged authority headers remain ineffective,
the internal span ID remains server-generated, and a real declared service
failure is recorded as failure without retaining its private text. Unrelated
routes do not acquire the scope.

The broad performance tests recorded 165 passes plus the enabled known DELETE
transport reproduction failure (166 tests, 1,250 assertions). Performance
TypeScript and all ten static stages passed. Worker isolation and corrected
TLS correlation still require real candidate-stack executions. No application
code, contract, production resource limit, budget or commit changed.


### 2026-11-18: SMTP and Secrets advanced definitions

Eight additional definitions supply the missing SMTP configuration invalidation
and all seven missing current Secrets obligations. SMTP primes one disabled
configuration, changes sender and SMTP fields through the actual update
capability, then measures the first read of the replacement. Foreign-instance
credentials and invalid sender input must be refused without changing the saved
public configuration or exposing its password. Tenant ownership remains leased
until the sample has completed.

Secret metadata and value invalidation prime version one, rotate through the
real command, and require version two and the new value where appropriate.
List invalidation also adds a second secret and checks the exact ordered result.
Namespace invalidation rotates a previously used management credential; the
replacement must work and the old credential must be refused. An independently
created real foreign namespace credential must receive the source-backed
not-found refusal rather than return another namespace's data. Refusals must
leave the queried state unchanged. List limit refusal bypasses client schema
validation deliberately and cannot produce coverage.

Large and history lists each retain 100 live metadata records and measure an
exact sorted prefix of 25, followed by a bounded 100-record verification. The
history fixture additionally rotates a real namespace credential 64 times,
retaining 64 revoked key records, and rotates one secret through version nine.
This is credential history and current-value churn: the implementation does not
retain prior plaintext secret versions, and this fixture does not claim an
archive of them. A domain-adapter test proves the live count, actual revoked
records, current version, refusal of the old key and complete namespace cleanup.
The test-only root dependency on `@bernouy/secrets` is explicit; frozen install
passes. Unrelated CLI lock metadata normalized by non-frozen installation was
restored so only the three intended test dependency entries differ from base.

The broad tests recorded 168 passes plus the enabled known DELETE transport
application failure, across 169 tests and 1,280 assertions. Performance
TypeScript and all ten static stages passed. These eight definitions still
require a live candidate-stack attempt; no coverage is inferred from planning,
unit tests, fixture writes or negative probes. No application, contract, budget,
production resource limit or commit changed.


### 2026-11-18: Fresh independent recovery attempts

The source `92ab5cd9…` series ran six independent disposable stacks and exported
and verified each result before starting the next. The advanced Secrets/SMTP
run `20261118T053603Z-c4d018ad50e0-e9a5b64d` recorded six passing definitions
and two failures across 80 measured samples, with no budget finding. Its final
Provider audit nevertheless recorded an OOM flag. The named-secret foreign
namespace refusal failed its postcondition. Source inspection shows that this
nullable reader does not declare `NOT_FOUND`: a foreign-key namespace mismatch
throws that domain error, which the feature mapper converts to `CORE_UNAVAILABLE`.
The next diagnostic names the observed status and requires this reader's
declared authorization refusal; no application mapping or contract is changed.

The SMTP negative probe incorrectly kept `enabled:false`, for which the domain
intentionally accepts incomplete sender configuration. The fixture now sets
`enabled:true` when presenting its invalid sender, as the existing SMTP domain
test does. That failed campaign remains historical evidence of a fixture
expectation error, not an SMTP application regression.

The independent HTTP concurrent recovery run
`20261118T054120Z-c4d018ad50e0-0b2acf85` and MCP concurrent recovery run
`20261118T055020Z-c4d018ad50e0-5b989394` blocked before measured requests;
both final audits recorded Provider OOM flags despite fresh stacks and the
separate fixture worker. This is not explained solely by earlier scenarios'
accumulated collection state. A final `Running:true`, exit code zero and OOM
flag does not identify the killed process or prove that the main server exited.
Production resource limits and ten-request concurrency remain unchanged.

Independent MCP nominal (`20261118T054343Z-c4d018ad50e0-12b31c70`) and cold
(`20261118T054634Z-c4d018ad50e0-be7c4869`) captured ten and three measured
samples respectively but failed their conflicting-replay postcondition. Warm
(`20261118T054849Z-c4d018ad50e0-4b576026`) stopped after one preparation
sample. These three runs had no final runtime lifecycle finding. The fixture
incorrectly expected `REVISION_CONFLICT`; `ProviderOperationExecutor` declares
`IDEMPOTENCY_CONFLICT` for a changed payload with the same receipt key. The
corrected oracle requires that exact MCP code and full refusal-body consumption.
It rejects revision conflicts, unconsumed bodies and unexpected successes.
No prior failure is relabelled as covered. All six exports and all 3,856
source-file hashes in each were independently checked by the repository verifier.
Their coverage is not merged across differing selected scenarios or profiles.

### 2026-11-18: Source capture and portable archives integrated

`reporting/archive/` now owns source capture, per-member verification, full
report/source export and post-transfer verification. Assessment preparation
captures the exact Git revision, local patch, non-ignored untracked files,
normalized modes and deleted paths before acquiring listeners or measured
processes. Every member and completion seal is checked; changed source, symbolic
paths, duplicate members, corrupt files and excess byte/file counts fail closed.
Python 3's standard library supplies bounded deterministic tar/gzip handling;
bytecode generation is disabled. Existing immutable snapshots are verified,
never repaired or overwritten. Artifacts remain outside Git.

New checkpoint and report metadata pin the archive and manifest hashes. The
portable exporter checks those pins, reserves a new destination exclusively,
copies sealed run files and source, and re-verifies the copied archive. Its
reader verifies the transferred summary against raw sealed counts and optionally
against an externally trusted run-seal hash. Historical reports are unchanged
and explicitly lack a retroactive source pin. Initial complete baselines may
retain bad budgets, but missing coverage, incomplete concurrency evidence,
fixture failures and shared-host conditions prevent reference eligibility.
Nothing selects or promotes the newest report automatically.

Focused archive tests exercise the real dirty task checkout without creating
commits: capture/reuse, individual hash corruption even after manifest resealing,
unsafe paths, over-limit members, symlink artifacts, immutable reuse refusal,
source/report mismatches, incorrect source pins, incorrect trusted seals and
forged summary counts. MCP refusal parsing also now requires the matching
JSON-RPC envelope, a declared error code and the exact declared error-output
schema (including contracts with no error output). Negative replies never
become nominal success, and private service text is not retained.

The latest broad suite recorded 174 passes and the enabled known DELETE
transport application failure, across 175 tests and 1,354 assertions. Performance
TypeScript and all ten static stages passed. The assessment runner's 184-line
lifecycle remains cohesive around acquisition, execution, audit and cleanup;
its existing size warning is retained rather than splitting it mechanically.
The corrected SMTP and MCP recovery fixtures and integrated automatic source
capture still require a live candidate rerun. Final full `verify`, remaining
variants, retained execution fixtures and the exhaustive dated assessment
remain outstanding. No application code, contract, production resource limit,
budget or commit changed.

## 2026-11-18 — exact retained catalogues and read scenarios

The five source-124fae74 reruns completed and were independently exported with
verified run/source seals and automatic source pins. SMTP invalidation and MCP
collection recovery nominal/cold/warm passed (four passed scenarios). Named
secret cross-namespace invalidation failed with
`secret-cross-namespace-refusal-http-503`; it receives no covered obligation.
The runs remain independent shared-host diagnostics, not timing references.
Their IDs, seals and results are recorded in the immutable exports and the
continuation ledger. Application code, images, budgets and resource limits did
not change.

Recovered all 29 distinct documentation bodies referenced by the retained SDK
releases (69 references) from original Git blobs. Each body matched the exact
retained SHA-256 and byte length. The captured fixture includes blob/path
provenance and is consumed without Git or network lookup. Compressed fixture
SHA-256: `8639d867496b9b2d413766a9cd7a4766d7b1735016da5cbb02846a9a4248676e`.

The retained bootstrap builder uses real filesystem contract and Provider
admission. Each exact retained pin receives a separate disposable catalogue;
equal contract/version coordinates with different digests are never combined.
All unchanged implementation claims are preserved. Public fixture bytes are
readable by the candidate's UID, mounted read-only through the existing
`ULVIA_BOOTSTRAP_DIR` input. Existing destination directories and unsupported
pins are refused without mutation. Private Registry publication refuses
production or non-test origins before any request. The integration stack's new
optional publication callback preserves the default bundled publication path.

Fixture validation: four tests passed, 598 assertions, including every retained
catalogue, exact original documents through the public filesystem reader,
unchanged claims, destination preservation, corrupt/missing/duplicate assets,
bounded decompression and refused publication origins. Separate comparison,
profile and retained planning tests passed: 10 tests, 307 assertions. Retained
pin and synthetic Provider digest are included in the environment fingerprint;
profiles cannot compare against current or different historical manifests.

The main plan now includes 796 retained read scenarios reusing existing business
oracles with exact retained schemas, targets and distinct IDs. They refuse a
missing or different active retained pin before network or metric collection.
An unmounted retained fixture is explicitly blocked, never credited as nominal
coverage. The plan has 2,200 scenarios: 2,140 required obligations planned out of
5,306, with 264 current and 2,902 retained obligations still missing. No additional
measured coverage is claimed by this preparation or by unit tests. Full cohort
orchestration, remaining scenarios and the final complete campaign are still
required. The assessment runner stays cohesive despite exceeding the advisory
180-line review threshold; its added wiring selects the fixture and registers
cleanup, leaving domain fixture construction in separate modules.

### First measured retained Content execution

Frozen source `8bfef7781a962e96c83528cc43fc5b2894e0d613d90b7a507c9096f636b11bec`
produced run `20261118T063935Z-c4d018ad50e0-dbfb8635`: all eight HTTP/MCP
nominal/cold/warm/concurrent `site.get` scenarios passed under retained
`ulvia/cms.content@1.0.0`, digest
`sha256:48dac5e0805df0c3f669cd981f135980ca8d5cf6dc74a3bb5eea7c943212dd52`.
All 66 measured samples have exact successful invocation witnesses; six
preparation samples are kept separate. Three budget findings remain:
MCP internal requests nominal 18, cold 20, warm 20, each against 15. No final
runtime or cleanup findings were recorded. The targeted report covers eight
obligations out of the full 5,306 inventory, with no union against other reports.
It remains a shared-host diagnostic and is not reference eligible.

Export and every source/run seal were verified: 3,876 source files; archive
`379f1230b0c3e66425542854a0c81296f7003ad82cc2c4c278116e9edd8db26e`;
manifest `dcbd1d2a38be44474a186f6ad15e48b22be95c21186e4131a466a3311872d58d`;
run seal `772cfedf208f72554cdda261647fca76c221a325c12a6b399b63bc520d8a8600`.
The full performance harness tests at this source finished with 181 passing and
one enabled, known application DELETE-body reproduction failure (182 tests,
2,206 assertions). All ten static check stages and performance TypeScript passed.
No final full `verify` is claimed.

A sequential diagnostic campaign was started from the same frozen source for
all 796 retained read scenarios, grouped into eleven independent exact-pin
stacks (117 retained targets). Each group exports and verifies its own source
and run seals before the next starts. This cohort controller currently lives
in the agent's temporary orchestration; integrating and testing the reusable
full current/retained cohort command remains outstanding. The refreshed plan
audit leaves 335 retained targets without definitions, with 264 current and
2,902 retained missing mandatory obligations. A declared scenario is never
reported as measured coverage.

## 2026-11-18 — current access volume, retained state and invalidation

Added nine current mandatory variants: PAT lists large/history/invalidation;
member lists large/history/invalidation; member reads, actor resolution and
signed machine actor inspection invalidation. No application implementation,
contract, quota, image or resource limit changed.

The large PAT dataset uses the actual 32-token account bound. Its history case
creates future-expiring tokens through the ordinary API, waits for real expiry
outside measurement and retains all 32 expired records. Revocation physically
removes PATs and is deliberately not used as proof of retained history. Quota
refusal, expired-credential refusal, account-scoped metadata and unchanged
metadata after negative probes are checked. Invalidation primes a two-token
list, revokes one and measures the first subsequent list.

Member volume uses 100 individually registered accounts. History retains eight
actual administrator revisions for eight accounts (64 mutations), all verified
before the measured list. Complete pagination is checked through the actual
capability, including the first empty terminal page, exact IDs/order, totals,
limits, authority revisions and duplicate prevention. Authority invalidation
primes the target query, changes the owned account's grant and measures its
first read after the change. Ordinary and cross-instance credentials are
checked separately; system inspection uses a real issued invocation token.
No post-mutation target read is used to prepare the expected result.

Ownership cleanup tracks attempted emails before signup so an account created
before a failed login can still be found by an exact owned lookup. It never
falls back to scanning/deleting unrelated accounts and continues attempting
other owned deletions after an error. Unit coverage verifies the failed-signup
and retry path, retained expired domain PAT records and quota, full membership
pagination, stale/foreign/duplicate records and the mandatory scenario plan:
13 tests passed, 146 assertions. Performance TypeScript passed. Docker execution
of these nine additions remains outstanding at this entry.

The unchanged source-8bf historical campaign completed its first full cohort:
run `20261118T064338Z-c4d018ad50e0-ce777828`, 72 passed, 72 covered obligations,
594 measured samples, 29 budget findings, no final runtime/cleanup findings.
Export seal `e30d54137b32178b934a8a02f21809474f7708164e60e773ebe06b3c157bd3b1`
and all 3,876 source files were verified. Group two started independently under
the different retained Content 1.0.0 digest. These are shared-host diagnostics;
no merged total or timing reference is claimed.

### Access pilot preparation failure and Docker address allocation

The first nine-case access pilot at source `4e941630404f66b7811c41470db64d260cdadcbebc1d9eea730c390153983bae`
produced run `20261118T065842Z-c4d018ad50e0-1c682245`: shared fixture setup
failed, zero scenarios executed and zero obligations covered. The exported
run/source seals and all 3,884 source files were verified. Run seal:
`ff1735b8b2f6c41909355b8bdade5215a68f76acae1fcc2286105d21ce4c1305`.
Its generic failure report does not preserve the original exception text.
A preparation-only reproduction then failed at Docker network creation with
`all predefined address pools have been fully subnetted`, before application
processes started. Detailed local reproduction evidence is private mode 0600;
no credentials or application logs are added to the public report.

Added a test-only network allocator fallback for this reproduced prerequisite
failure. Ordinary allocation is retained. On the specific pool-exhaustion error,
it reads bounded Docker IPAM and Linux IPv4 host-route inventories and chooses
a non-overlapping `/24` within `10.253.0.0/16`. Missing inventories, conflicting
VPN routes, unrelated Docker failures and non-test names are refused. Up to
four atomic subnet races can be retried. Test ownership labels and the original
internal/ingress split are preserved. No pre-existing network was removed and
no daemon configuration changed.

Five allocator tests passed (27 assertions). A real two-network preflight
allocated one normal `192.168.224.0/20` network and one checked fallback
`10.253.0.0/24` network, verified ownership/empty attachments/internal flags,
then removed only those newly created networks. The real result is retained
in `/tmp/cmscore-test-network-preflight.log` during development. This is
infrastructure preparation evidence, not capability performance coverage.
The full harness suite before this allocator addition had 187 passing tests
and the one enabled known DELETE application reproduction (188 total,
2,322 assertions). A fresh access run is required after validating this change.

## 2026-11-18 — complete cohort planning and trace storage boundaries

A third isolated worktree was created at the same application revision while
both measurement worktrees remained frozen. Frozen dependencies and all ten
initial check stages passed before transferring the verified source-1f28 fixture
snapshot. The new worktree changes tests and assessment orchestration only.

The campaign planner now enumerates all 671 executable targets in 16 independent
runtime cohorts, including four entirely unplanned retained releases (three
Authoring pins and Hosting 1.0.0). Every declared scenario is assigned exactly
once, while missing mandatory scenarios remain blocking findings. Equal
contract/version coordinates with distinct digests remain distinct cohorts.
A cohort-scoped inventory cannot silently borrow another version's targets.
Unknown bindings, duplicate IDs and mixed independent catalogues are refused.
A cohort/bootstrap mismatch fails before images, listeners or containers are
acquired. Three planning/scope tests passed (56 assertions), with performance
TypeScript and all ten check stages passing. The reusable complete campaign
executor and its integration into `verify` are still outstanding; the planner
alone does not add measured coverage. The current plan remains 2,209 scenarios,
with 255 current and 2,902 retained missing mandatory obligations.

The source-1f28 nine-case access run finished as
`20261118T071012Z-c4d018ad50e0-136e5ec6`: PAT large/history/invalidation and
member-list large passed; the other five scenarios were blocked by preparation
503 responses. Four covered obligations, no budget findings and no final
runtime lifecycle findings were recorded. Its export and every run/source seal
were verified, including all 3,886 source files; run seal
`b5ea86cd22bad3385d8cfb158caa92a9c2266eeabcc0804b1f534f2b65f64b4f`.
This is a shared-host diagnostic, not a timing reference or a claim that the
remaining cases passed.

A separate unchanged-source five-case prefix diagnostic was launched to inspect
only filesystem counts and space between scenarios. After the three PAT cases,
the Provider held 14,408 trace files; after member-list large it held 51,478,
with 50,769,920 bytes remaining in its 268,435,456-byte `/tmp`. The byte summation
was explicitly truncated above 50,000 files (`oversized: true`); its raw zero
`traceBytes` value means unavailable, not zero storage use. The complete
failure cause remains under investigation until that diagnostic finishes.
The writer currently bounds individual traces and its in-memory counter map,
but preparation/verification trace files outlive measured-sample collection.

Added controller-side trace cleanup at the quiescent measurement boundary:
after fixture readiness/restart and before any measured send, once per
concurrent batch. Previously collected samples remain in the controller, while
unmeasured predecessor files are removed from the exact two owned containers.
Global instrumentation/mount metadata stays outside the cleaned directory.
Unexpected names, links, directories, foreign stack names and excessive entry
counts are refused before deletion. Cleanup failure blocks measurement and
still releases all prepared fixtures. This changes test storage management,
not application handlers, resource limits or performance ceilings.

Seventeen focused storage/lifetime tests passed (139 assertions), including the
serialized candidate cleanup program, refusal without partial deletion,
sequential warm-up separation, concurrent readiness and trace preservation
through collection, and teardown after reset failure. Performance TypeScript
passed. A real fresh access replay and final complete verification remain
required before any successful coverage can be attributed to this change.

### Storage exhaustion reproduced and cleanup replay started

The unchanged source-1f28 storage diagnostic completed as
`20261118T073256Z-c4d018ad50e0-d51431bf`: four scenarios passed and the member
history case was blocked. Its final Provider observation reported 63,701 trace
files and exactly zero bytes available in the 268,435,456-byte `/tmp` filesystem.
The process remained running; this provides a concrete test-instrumentation
resource failure behind this access-prefix blockage, without classifying the
503s as an application performance regression. The sealed storage annotation
retains the intermediate counts. Summed trace bytes remain unavailable when
`oversized: true`; those raw zero values must not be interpreted as empty files.

The diagnostic's run/source export was verified (3,886 source files), with run
seal `4e6f2bc9a635e03bc67236edd8466a5c73b90805f69b724ef1eb4f4e5b94f072`.
Its storage annotation is under the same run ID in
`artifacts/performance/annotations/`. It is independent shared-host evidence.

After the cleanup boundary changes, the complete harness suite passed 201 tests
with the one enabled known application DELETE-body reproduction still failing
(202 total, 2,463 assertions). Performance TypeScript and all ten static check
stages passed. Source
`123b2464b7677241c0d5a74468b26cc2c52a2b7dda8c7bc3cdacb2b3d7da727c`
was archived and verified (3,893 files); archive
`7dc6bf408372c8b9d37025035e1af527b59def806e6dada8cabff08893deab88`,
manifest `2f21c76cd9e0ea38b6b513038b379e3cc91e1f25512a67526fe42adc1a0268d0`.
A fresh nine-case replay started from that frozen source in the coverage
worktree, preserving the same images, resource limits, quotas and budgets.
No results from that ongoing replay are claimed here. The editable development
worktree was synchronized from this verified snapshot only after the preceding
storage diagnostic was terminal. The older historical campaign remains on its
own frozen source.

### 18 November 2026: completed access replay and retained setup receipt

The nine-case access replay completed as run
`20261118T075111Z-c4d018ad50e0-ee2fc1f7`: nine passed and covered, no latency/work
budget finding, and no final runtime finding. Its source and all 3,893 files were
verified during export, with run seal
`16e6351cd630900a3b10a8d42bfd037764e4dbfa1dc489c95df24f5f1cf085c8`.
This remains shared-host diagnostic evidence, not a regression reference.

The retained read campaign also terminated. The three Content catalogues
completed 72 scenarios each. Installations 1.3.0 completed 106/108 and 1.4.0
122/124; their concurrent `repository.search` cases failed in both bindings.
Repository 1.2.0 completed all 28 cases. Other retained preparation failures
remain explicitly uncovered. Counts from different catalogues/profiles are not
combined into one measured coverage percentage.

Exact Installations 1.0.0, 1.1.0 and 1.2.0 lack the current Repository setup
capabilities. Test-only setup hooks now configure their disposable instances
through existing candidate domain operations in a bounded private worker. The
Registry is activated through its approved manifest and actual provisioner;
persisted selections are not fabricated. The worker terminates and the ordinary
Provider reopens the instance before target timing. Releases without the newer
initialization lifecycle are distinguished explicitly from pending releases.

The first eight-case 1.0.0 pilot, run
`20261118T082825Z-c4d018ad50e0-6cc0f99e`, collected no samples: the worker's
ordinary domain logs preceded its successful JSON receipt, breaking the fixture
parser. All 3,901 source files and the run seal
`a1be58db3e2604939d91165a104119dec2b657b1267020ab798fb8d5911e7792`
were verified. A separate disposable preflight confirmed four JSON stdout lines,
including exactly one successful Registry receipt. The receipt now has an exact
stack frame and bounded strict parsing; missing, duplicate, foreign and malformed
receipts refuse without returning logs. A fresh measured replay is still required.

The latest plan still has 2,209 scenario definitions over 671 executable targets.
All 219 current targets have definitions, but 255 current mandatory variants
remain missing. Of 452 retained targets, 335 still lack definitions; 2,902 retained
mandatory variants remain missing. Neither fixture improvements nor preparation
calls grant measured coverage. No application changes or commits were made.

The corrected receipt implementation passed six focused tests (70 assertions),
performance TypeScript and all ten static checks. The complete suite passed 207
tests with the enabled known application DELETE-body reproduction failing
(208 total, 2,533 assertions). Frozen test source
`4c1756efe0272e9b53c0b7f37f7d3320af8280699a7bd459bc0f14a0ddf7776b`
contains 3,903 files; archive
`7c1cfeff7d563b35a9e1cb4d6a4e9b9653980cdc606648c1bc356da8aa63050c`,
manifest `9eebad5a38fcb3bc6666bc0c92297c7a5431a00e1f2186ec5728491ffa44dab8`.

The fresh 1.0.0 pilot completed as run
`20261118T083945Z-c4d018ad50e0-b315acae`: eight scenarios passed with eight
covered obligations and no final runtime finding. All source files and run/source
seals were verified, with run seal
`d9b70ebf745f4b1772ea4f5fd62faddcd1875dabbaf6f2eaffaf6a1665907a59`.
The report remains failed: each of its four MCP variants exceeded the declared
15-internal-request budget (observed maxima 20–23). These findings were retained;
no budget or application implementation changed. Shared-host diagnostics remain
ineligible as regression references. A new 268-case series over the exact 1.0.0,
1.1.0 and 1.2.0 catalogues started from the same frozen source. No result from
that ongoing series is claimed here.

### 18 November 2026: serial cohort execution controller

The campaign controller now executes the inventory-derived cohorts serially and
awaits evidence persistence before acquiring the next stack. Exact candidate
revision, source/archive pins, image identities, catalogue, scenario definitions,
order and retained bootstrap pin must match the assigned cohort. Coverage and
budgets are recomputed from samples rather than trusting cached coverage or a
reported passing status. Reused run IDs cannot satisfy separate catalogues.
Identical findings are deduplicated after the independent audits.

Catalogues without definitions remain explicit blocking outcomes and acquire no
empty stack. An execution/report-validation error records a fixed safe failure
and allows later catalogues to proceed; persistence failure aborts before the next
invocation. Eight focused campaign tests passed (83 assertions), including the
existing inventory and bootstrap-scope tests. Performance TypeScript passed.
Synthetic executor fixtures are confined to unit tests and never enter measured
scenario inventory. Persisted campaign manifests, the production assessment CLI
bridge and the `verify` switch remain to be implemented; this controller is not
yet evidence that `verify` executes all retained cohorts.

### 18 November 2026: sealed campaign history and verification bridge

The first old Installations cohort completed as run
`20261118T084245Z-c4d018ad50e0-59749326`: 74/76 scenarios passed with 74 covered
obligations. Both concurrent `repository.search` bindings failed (HTTP 503 and
MCP `CORE_UNAVAILABLE`); 41 work/latency budget findings remain. There was no final
runtime finding. Its 3,903 source files and run/source seals were verified, with
run seal `65a9aa82d791f6d4f35c5a882a58cbd8e9155d6fe6c90ddd82869ffeff2e1e6a`.
The same frozen 4c1756 source continues the 1.1.0 and 1.2.0 cohorts. These are
independent shared-host diagnostics and cannot serve as timing references.

Campaign history now writes an exclusive header and flushed per-cohort outcomes
before acquiring the next stack, then seals the JSON/HTML index and checkpoint
chain. It preserves candidate revision, dirty state, source/archive fingerprints,
image identities, exact assignments and each original run's completion hash.
Readers verify every checkpoint, refuse incomplete/modified/symbolic/foreign
entries and validate child run seals. JSON evidence is bounded to 32 MiB per file
and a campaign to 128 catalogues. The existing scenario checkpoint writer now
shares the same exclusive flushed JSON primitive; business request paths are
unchanged.

The new `assessment/campaign.ts` bridge regenerates family fixtures against the
complete inventory, then selects only the exact assigned scenario IDs for each
cohort-scoped child report. It invokes the existing real assessment stack and
reads the sealed report back before recording an outcome. Source changes prevent
later stack acquisition. Empty catalogues remain explicit blocking outcomes.
The `verify` assessment stage now invokes this campaign entrypoint; its Knip
entry and workspace orchestration test were updated explicitly.

Reference campaigns must be supplied explicitly. Their source snapshot and child
run seals must verify, and each exact child must have complete eligible evidence.
Complete initial budget failures may be references; shared-host measurements may
not. Missing, incompatible or invalid references remain findings rather than
silently selecting recent history. Twenty focused tests passed (147 assertions),
including real source-archive integrity checks and synthetic reference-admission
fixtures. Performance TypeScript passed. Full checks and a real bridge pilot
remain required; the unit fixtures grant no performance coverage.

The subsequent complete harness validation passed 219 tests, with the one enabled
known application DELETE-body reproduction failing (220 total, 2,598 assertions).
Performance TypeScript and all ten static stages passed. Frozen source
`8601837531fc0b443718dc1116c015ff33b6f7f3ffbc3915eb61a521af47632d`
was archived and verified (3,916 files); archive
`dfe8740f8bf0788e8534ec32e11b1aa97aa2b9e1db0c18f053cdbb79ec153597`,
manifest `558f6ec87ee3a35a223956316e1d9f9988aa5f024fb5ad898351303398232cc5`.

The real bridge pilot completed as campaign
`20261118T091447Z-c4d018ad50e0-f19bfc65`, seal
`63f540b62255b5fa1fcb9e914b7f8301ca3ce39326ad3c04b224b0ad1c78309f`.
Its sole selected cohort produced child run
`20261118T091452Z-c4d018ad50e0-b4e0d8ba`: all eight scenarios passed with eight
covered obligations out of the exact old catalogue's 318 required obligations.
Four MCP internal-request budget findings remain. The 15 other catalogues are
explicit unplanned outcomes in this deliberately focused harness pilot. The
campaign correctly remains failed because coverage/reference requirements and
budgets are not satisfied; this is not a full `verify` acceptance claim.

The campaign index, checkpoints and original child report were copied into the
user workspace's ignored performance artifacts and read back against their
trusted completion hashes. The child/source export was independently verified
over all 3,916 source files, with run seal
`eeb7b72c97dfe50b45775d661e7e21a4f48c03463532a334e158edd1a794e12d`.
Timing remains shared-host diagnostic evidence. Subsequent history hardening
bounds aggregate retained checkpoint bytes and HTML output to 32 MiB; an escaped
oversized HTML index must fail without writing a completion seal.

The 268-case old Installations series subsequently terminated: 1.0.0 completed
74/76 scenarios, 1.1.0 completed 90/92 and 1.2.0 completed 98/100. All six failures
are the HTTP/MCP concurrent `repository.search` cases; no scenario was blocked by
preparation. The respective reports retain 41, 49 and 56 budget findings, with no
final runtime finding. All three run/source exports verified 3,903 source files
from the same frozen 4c1756 test tree. The final 1.2.0 run is
`20261118T091017Z-c4d018ad50e0-fbf96873`, seal
`d33f7f58c8b00f76e628360647512d525558021112ce6cbebc87341a14a413d0`.
These diagnostic counts describe that three-catalogue series, not exhaustive
repository coverage or a timing regression reference.

After the aggregate/HTML bounds, the complete harness validation passed 220 tests
with the enabled known application DELETE-body reproduction failing (221 total,
2,601 assertions). Performance TypeScript and all ten static stages passed.
Source `bdfad3e1d2b4f0b174a53a60dd3a6545ca997d3e2bbaa32f53f3b757e3edc59e`
was archived and verified (3,916 files); archive
`10191233bf1eb20d6378416b2fb6d06317def77ccf0a76c90e0c3db59cbc2761`,
manifest `1e9e386d603fec5445c93ca6a4b8c690322ea8e83f8626493295ace924e65dba`.


### 2026-11-18: Example bounded memory replay

Run `20261118T134821Z-c4d018ad50e0-3648c356` repeated the same eight
Example cases at the unchanged resource limits. Two scenarios passed and six
were blocked after the Provider exited with code 137 and `OOMKilled=true`.
The read-only cgroup counters were unavailable after container exit. This proves
an OOM termination in the isolated instrumented campaign, without establishing
a leak, the responsible invocation, or production impact. No further repeat is
used to obtain green results. The run and all 3,948 source members were verified
in the portable export; seal
`0d17909dd8ae6455406c9ec95eea7eb9c393c9ec62be4ecde49c13423cb2a8c7`.

### 2026-11-18: Files advanced reader preparation

Twelve current-binding variants complete the planned Files matrix: metadata and
byte reads after generation replacement, list volume/history/invalidation,
representation list volume/history/invalidation, representation byte reads,
namespace reads after child-key rotation, and HTTP/MCP workspace reads after
rename. A large namespace has 64 independent file identities. History contains
33 distinct content-addressed generations of one identity; each generation is
created by a different valid raster body, not repeated uploads of identical bytes.

Derivatives finish all three bounded thumbnail widths before measurements or
refusal snapshots. Original bodies are compared byte for byte with authored PNG
fixtures; WebP bodies are checked against the pinned local encoder and decoded
dimensions. Metadata derives from upload receipts and independently constructed
paths. Full pagination, exhausted pages, historical bodies, revoked child keys,
public/private authorization invalidation, cross-namespace keys, another real
instance administrator and invalid JSON mutations are checked outside timing.
Workspace identity is confirmed using a unique authored text body, with unrelated
rows preserved. Namespace root keys remain valid for guarded owned cleanup.

Nine focused tests passed (56 assertions), including stale metadata, truncated
bodies, duplicate pagination, real generation construction, priming order, key
rotation, refused privacy invalidation and partial cleanup. Performance TypeScript
passed. All ten static stages passed. The complete performance test tree passed
256 tests, with the enabled known DELETE application reproduction failing
(257 total, 5,039 assertions). A sandbox-restricted attempt was kept separately:
local listener and subprocess refusals are environment failures, not application
findings. Real Docker execution remains pending at this preparation checkpoint.
Application code, contracts, image identities and resource limits are unchanged.


Run `20261118T140252Z-c4d018ad50e0-080881ec` completed all twelve Files
scenarios (120 samples), with no business failure, budget finding, runtime alert
or cleanup finding. Export seal
`071b1f152688301de30ecdbbed9c509969eb9744b1889aa27f606406b77ca545`
and all 3,960 source members verified. HTTP P95 ranged from 21.13 to 120.36 ms;
workspace MCP P50/P95 was 129.09/147.88 ms. Workspace Mongo operations were
9 over HTTP and 18 over MCP. These are shared-host diagnostic measurements,
with ten samples per case and nearest-rank P95 equal to the maximum.

The first list definition rotated offsets 0/16/32/48/64 even when only one
latest file existed. Although each request still scanned the expected history,
most history/invalidation responses were empty. Its timing remains preserved
but is not used as the final nonempty-page list result. Definition version 2
cycles only existing pages: all 16-row pages for the 64-file dataset, offset zero
for a single file with 33 retained generations. Exhausted pages remain explicit
outside-timing postconditions. A bounded replay selects only these three list
cases; unrelated successful readers are not rerun. No application changes.


The nonempty-page replay `20261118T141039Z-c4d018ad50e0-929b5265` passed
all three cases (30 measured calls), without budget, runtime or cleanup findings.
Run/source export seal
`3c3bed4ed610c3e23f43246d10abe2b7d9257b77c5a83e6ad99b42e18b769316`
verified all 3,960 source members. The ten focused Files tests passed (60
assertions), performance TypeScript and all ten static stages passed.

| Files.list HTTP dataset | P50 ms | P95 ms | Mongo operations | Documents examined |
| --- | ---: | ---: | ---: | ---: |
| 64 latest files, nonempty 16-row pages | 55.26 | 104.20 | 7 | 74 |
| One latest file, 33 retained generations | 31.31 | 33.46 | 7 | 43 |
| Latest file after each generation replacement | 30.30 | 34.73 | 7 | 12–21 |

The large responses were 9,816–9,826 bytes and all history responses were 645
bytes, confirming the intended nonempty bodies. Exhausted pagination and all old
generation bodies still passed their separate postconditions. Neither focused
run represents global coverage: their report status remains failed for unselected
obligations, shared-host conditions and the absent eligible reference. No timing
regression is inferred between changed definitions.

Source-backed preparation for the next 26 Authoring variants also proved local
admission of approximately 256 KiB authored sources for collections, contracts
and Provider manifests. The isolated draft under ignored artifacts is not a
scenario definition and receives no measured coverage. Large JSON whitespace
measures retained source byte volume, not semantic capability complexity.


### 2026-11-18: Authoring source and durable status reader preparation

Twenty-six current-binding variants complete the planned Authoring matrix:
HTTP/MCP collection, contract and Provider-manifest source readers plus expanded
source snapshots each have large, history and invalidation datasets; publication
operation status adds pending-to-terminal invalidation. These definitions do not
yet grant measured coverage. The remaining missing variants are Installations
(93) and Repository (12).

One isolated publisher owns at most 26 new namespaces for these scenarios, below
the unchanged 32-name account quota. Each scenario restores the main publisher
and disconnects its temporary secondary-site publisher; an unknown pre-existing
secondary connection is refused before mutation. Another real instance
administrator connects to a distinct Repository account before private-source
and operation denials are checked. Registry publisher cookies are never used as
secondary CMS administrator sessions. Immutable reservations/releases survive
only until the disposable stack is removed. Each owned preparation is discarded
after publication, with bounded outstanding preparations and cleanup after failure.

Named reader volume is approximately 256 KiB. The expanded reader exercises
retained source strings beyond the old named 1 MiB output promise for collections
and contracts; their definition files remain at the real 1 MiB per-file limit.
Provider manifests have a stricter real 512 KiB admission limit and allow only
definition.json, so their expanded fixture stays at that ceiling. An initial
1 MiB Provider fixture correctly failed admission; the test fixture was corrected
without changing any limit. JSON whitespace measures retained source byte volume,
not semantic capability complexity. All six kind/volume combinations pass the
real local admission/compiler paths and preserve exact file strings.

History publishes eight distinct semantic versions per kind. Invalidation primes
the exact absent version as a valid null, publishes it, then measures its exact
private source digest and authored files. Expanded snapshots rotate collection,
contract and Provider kinds over ten samples. Postconditions read every retained
version, reject a truncated or duplicate file list, verify old named-reader size
refusals, foreign sessions, distinct publishers, invalid JSON and unchanged
connection/namespace state. Publication status must first be observed queued or
running for the same operation ID, then measured after durable success; an
already-completed initial read is an explicit fixture failure, not coverage.

Eleven focused tests passed (509 assertions), including real source admission,
strict source/result projections, stale-null invalidation, pending-to-terminal
ordering, namespace bounds and restoration after partial failures. Performance
TypeScript and all ten static stages passed. The complete performance test tree
recorded 268 passes plus the enabled known application DELETE reproduction
failure (269 total, 5,552 assertions). Application code, contracts and image/resource
limits remain unchanged. Real Docker execution is the next required step.


### 2026-11-18: Authoring namespace-evidence oracle correction

Initial run `20261118T142602Z-c4d018ad50e0-607df64c` attempted all 26
cases (260 measured calls), but its raw namespace-inventory snapshot included
checkedAt. Runtime `NamespaceInventory.namespaceInventory` deliberately assigns
a new timestamp on every query. All 26 cases consequently failed the unchanged
state comparison: this is a harness assertion defect, not established evidence
of an application mutation. Coverage remains zero in that immutable report.
All 3,974 source members and the run/source export verified, seal
`07e92a1f9a119e70524439ff4a14bd02bceb8e623eccae0df4eed84141b05dcd`.
There was no runtime or cleanup finding. Both operation readers did observe real
pending-to-terminal transitions before their timestamp postcondition failed.

The initial report also retains 24 internal-request budget findings: source
readers reached 28–29 HTTP internal requests and up to 41 over MCP against the
unchanged ceiling of 15. These diagnostic findings are not removed or interpreted
as healthy reference measurements; reproduction with the corrected oracle is
required. Neither latency budgets nor application code change.

Definition version 2 reuses the existing namespaceEvidence/assertAuthoringPage
helpers. It compares public namespace-get reservation metadata with the exact
claim receipt, validates checkedAt bounds separately, and excludes only that
observation timestamp from the stable namespace-inventory projection. Namespace
revision, access, repository identity, cursor, state and domain updatedAt remain
strict checks. The new regression test changes checkedAt between valid snapshots
and separately mutates reservation revision/state/updatedAt or supplies a stale
observation date; only the legitimate observation-date change is accepted.
The 26 real scenarios will be replayed after targeted and complete harness checks.


After the evidence correction, all twelve focused tests passed (550 assertions).
Performance TypeScript and all ten static stages passed. The full performance
test tree recorded 269 passes and the unchanged known DELETE application
reproduction failure (270 total, 5,593 assertions). The owned-context module is
129 lines; its unit model and behavior tests are separate cohesive files. No
application, contract, image or budget changes accompany the version-2 replay.


The version-2 run `20261118T144542Z-c4d018ad50e0-fdadab2b` completed all
26 Authoring scenarios successfully, with 260 measured calls and 26 covered
obligations within this focused cohort. No runtime or cleanup finding occurred.
All 3,975 source members and run/source seals verified; export seal
`57c290d8a3487adc182946c88c9c5f3aec6fcb374caa583936cf5ee057645897`.
The initial false-oracle run remains separate and grants no coverage.

All 24 source-reader cases still exceed the unchanged 15-internal-request budget:
HTTP has 27–29 requests and MCP 34–41. A representative HTTP collection-source
sample has 4 business and 25 common internal requests, 11 business and 23 common
Mongo operations (34 total). Network evidence includes two Repository identity
reads, one namespace read and one private-source read, plus routing/actor/dispatch
work; a gateway route response pair totals 542,138 bytes in that sample. This is
a repeated cost pattern across cases, not 24 independently diagnosed bugs.

| Reader / profile | P50 ms | P95 ms |
| --- | ---: | ---: |
| get-collection-sources.http.large | 325.99 | 365.57 |
| get-collection-sources.http.history | 136.73 | 171.16 |
| get-collection-sources.http.invalidation | 137.49 | 148.67 |
| get-collection-sources.mcp.large | 270.13 | 365.59 |
| get-collection-sources.mcp.history | 252.50 | 315.82 |
| get-collection-sources.mcp.invalidation | 245.28 | 303.97 |
| get-contract-sources.http.large | 152.69 | 163.14 |
| get-contract-sources.http.history | 140.06 | 176.55 |
| get-contract-sources.http.invalidation | 146.75 | 158.21 |
| get-contract-sources.mcp.large | 268.62 | 325.68 |
| get-contract-sources.mcp.history | 300.72 | 367.07 |
| get-contract-sources.mcp.invalidation | 241.94 | 396.90 |
| get-provider-manifest-sources.http.large | 151.64 | 163.34 |
| get-provider-manifest-sources.http.history | 139.48 | 182.60 |
| get-provider-manifest-sources.http.invalidation | 149.48 | 207.63 |
| get-provider-manifest-sources.mcp.large | 246.79 | 359.56 |
| get-provider-manifest-sources.mcp.history | 264.56 | 311.97 |
| get-provider-manifest-sources.mcp.invalidation | 259.17 | 286.02 |
| get-source-snapshot.http.large | 182.48 | 201.79 |
| get-source-snapshot.http.history | 139.41 | 156.86 |
| get-source-snapshot.http.invalidation | 136.35 | 164.45 |
| get-source-snapshot.mcp.large | 302.41 | 580.01 |
| get-source-snapshot.mcp.history | 288.93 | 394.19 |
| get-source-snapshot.mcp.invalidation | 242.26 | 321.01 |
| get-publication-operation.http.invalidation | 29.50 | 34.44 |
| get-publication-operation.mcp.invalidation | 122.98 | 135.79 |

The expanded MCP snapshot response reached 2,101,453 bytes. Publication-status
readers remained within their budgets (HTTP 5 internal requests; MCP 12–13).
Percentiles use ten samples per case, so nearest-rank P95 equals the maximum.
These shared-host measurements are diagnostic and not an eligible regression
reference. The focused report remains failed for its 24 budget findings,
unselected obligations and absent eligible reference. No application performance
improvement or resolution of earlier OOM findings is claimed.

### Repository discovery coverage prepared (2026-11-18)

Twelve current HTTP variants now cover catalogue listing/search, collection
catalogues, bootstrap recipes, repository identity and publication build status.
The independently admitted corpora contain 64 identities or 33 versions for
each of contracts, Providers and collections. Invalidation publishes a new
version outside timing and requires the updated projection during measurement.
Pagination and refusals are checked outside timing, including foreign ownership
and a separate real Registry for build-status isolation. Public reads use an
anonymous client; private status checks use the upload owner's session.

Bootstrap expectations combine authored fixtures with separately downloaded,
digest-verified background releases. Background discovery has page, byte and
time bounds. Fixture admission caught a documentation-title mismatch before the
live run; only the test factory was corrected. No application change was made.

The focused suite passes 11 tests with 133 assertions. The complete performance
harness has 277 passes and the existing real DELETE-body failure (278 tests,
5,707 assertions). TypeScript and repository checks pass. These are harness
checks, not measured capability coverage. The current plan contains 1,575
scenario definitions and 1,515 of 1,608 mandatory executor obligations.

Remaining implementation work is 93 mandatory Installations variants, followed
by real execution, complete validation/reporting and safe transfer of the
isolated test work. Repository measurements are still pending.

### First Repository campaign and fixture correction (2026-11-18)

Run `20261118T152443Z-c4d018ad50e0-5093e2af` attempted all twelve cases:
one passed (repository identity), ten blocked during corpus preparation, and
build-status invalidation blocked because its first observation was already
terminal. The corpus fixture incorrectly required `version` in the publication
receipt; the actual strict output contains only `kind`, `added` and `digest`.
The unit model had invented extra receipt fields. Both test defects are corrected;
the model now validates the receipt against the real output schema.

Build-status preparation now compiles 65 real components and 65 examples, with
bounded CSS/source complexity, to make the intermediate state observable. It
still refuses coverage if the first observation is terminal. No artificial
operation delay or application change is used. These eleven definitions advance
to version 2; the identity case and its measured result remain version 1.
Twelve focused tests and 137 assertions pass, including actual admission of the
larger build fixture below the existing 512 KiB canonical-document limit.

The initial run also recorded a Provider OOM signal while it was running:
`OOMKilled=true`, peak 2,147,561,472 bytes versus a 2,147,483,648-byte limit,
five cgroup OOM events and two cgroup OOM kills. This identifies neither the
victim nor the responsible request. The report remains failed and reference
ineligible. The limits are unchanged; this is not evidence of a resolved OOM.

Its 3,997-file source snapshot is
`54a96cf4afba92091d8dd79c35e5843ec8f78cb96d31e33699c06de930c31aaf`;
the verified export seal is
`4133919df2bafec945a7e9029cb051799614d9baff1d0b4f0461bfbfab4bd6e1`.
The affected eleven cases require a new source-pinned run; the failed campaign
is retained unchanged.

### Corrected Repository measurements and remaining work (2026-11-18)

Run `20261118T153139Z-c4d018ad50e0-fbef385d` completed eleven version-2
scenarios with 110 measured samples: ten business passes and one failed
build-status isolation postcondition. No runtime or cleanup finding was
recorded in this run. Two latency budgets were exceeded; they remain unchanged.
The 3,998-file source is
`77a85b537f8653ca99d4995f9cd0154517f646c0f787f47f553f94118be5e176`;
the verified export seal is
`8f47643f9ed928a013daef01ad06d7139b469a814c394e8d05139b6120818692`.

The table keeps the earlier identity result separate by run. Listing/search
measurements rotate collection, contract and Provider-manifest kinds within
each scenario. History corpora contain 33 versions per identity; latest-only
readers correctly return only the latest version rather than 33 duplicate IDs.
All values are diagnostic shared-host observations, not a regression reference.

| HTTP scenario | Business result | Samples | P50 ms | P95 ms | Max Mongo | Max internal requests |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| repository-info.invalidation | passed | 10 | 118.88 | 197.49 | 1 | 8 |
| catalogue-list.large | passed | 10 | 19.72 | 689.44 | 1 | 3 |
| catalogue-list.history | passed | 10 | 22.16 | 597.34 | 1 | 4 |
| catalogue-list.invalidation | passed | 10 | 890.73 | 1013.94 | 1 | 3 |
| catalogue-search.large | passed | 10 | 62.01 | 386.84 | 1 | 3 |
| catalogue-search.history | passed | 10 | 42.55 | 71.52 | 1 | 3 |
| catalogue-search.invalidation | passed | 10 | 811.22 | 1280.71 | 1 | 4 |
| collection-catalogue.large | passed | 10 | 25.93 | 89.05 | 1 | 3 |
| collection-catalogue.history | passed | 10 | 17.96 | 23.20 | 1 | 3 |
| collection-catalogue.invalidation | passed | 10 | 26.98 | 32.74 | 1 | 4 |
| bootstrap-recipes.invalidation | passed | 10 | 28.47 | 54.30 | 1 | 4 |
| publication-build-status.invalidation | failed | 10 | 64.87 | 165.37 | 9 | 7 |

Post-publication catalogue-list/search invalidation reached P95 1,013.94 and
1,280.71 ms against 1,000 ms. Both retain one Mongo operation and three to four
internal requests; filesystem/index refresh is a hypothesis to profile later,
not a diagnosed cause. The pinned build-status operation completed through a
real pending-to-terminal transition in all ten samples, but the separate
Registry refusal did not match the expected 404. It earns no successful coverage
despite valid nominal timings. Diagnostic status recording now checks all
refusals and durable owner state before reporting the failing boundary.
`FilesystemRepositoryPublicationUploadStore.readDocument` can expose an uncaught
missing-file error before the operation lookup; a live status capture is still
needed before attributing the observed failure to that path. No refusal was
relaxed and no application code was changed.

Eight additional current Installations invalidation definitions are integrated:
repository settings (HTTP/MCP), Provider installation/access (HTTP), and
initialization entry/status (HTTP/MCP). They reuse real configuration, pairing
and initialization workflows outside timing, then measure the changed reader
projection with foreign-session or public-minimal-output checks and cleanup.
Initialization expected results come from the separately validated apply output;
completed status intentionally exposes no active operation identity. These new
definitions have not yet earned runtime coverage. Remaining implementation is
85 mandatory variants, followed by complete current-source execution and final
validation/transfer.

The historical latency summary is now reproducible with
`tests/performance/reporting/summary/cli.ts`, documented in the performance README.
Its original draft rendered 68 runs and 2,910 rows; Chromium verified search,
variant/binding filters and descending P95 order without JavaScript errors.
Those counts describe that dated input snapshot, not final current coverage.
The integrated summary includes the corrected Repository export as a separate
run. Its unit tests reject corrupt/symbolic evidence, unsafe report links and
unknown exact targets; failed timings stay visible without pooled percentiles.

### Installations reader campaign and bounded follow-up (2026-11-18)

Run `20261118T154418Z-c4d018ad50e0-a020a8c6` is exported with verified
4,010-file source `61a0a6afab7c5fef9ac389f33389b2c4cf13c4c10ee6a27355834cb21299a55b`
and seal `7b39515bc1601e59cd0a5b40db510ff00551b2b4fb630bd1b386f597b6ecde10`.
Nine cases were attempted: four business passes, two failures and three blocked.
The Provider was running with `OOMKilled=true` at teardown; memory counters were
unavailable. No claim about the OOM victim or root cause is made.

- Repository settings: HTTP P50/P95 171.54/305.49 ms, MCP 282.42/349.92 ms,
  ten samples each. MCP reached 26 internal requests against a ceiling of 15.
- Provider installation: ten passes, P50/P95 121.10/124.43 ms.
- Public initialization entry: HTTP ten passes, P50/P95 106.77/200.25 ms.
  MCP retained eight samples (154.05/301.91 ms) before fixture preparation failed;
  this remains blocked and does not earn successful coverage. Both status-reader
  cases were blocked without measured samples in that campaign.
- Build isolation: all ten cross-Registry probes returned 503; foreign-account
  probes returned 409 and missing-operation probes 404. Owner state was checked
  unchanged before reporting the failure. This confirms the wrong refusal status,
  not a cross-instance data disclosure. The missing-upload `readDocument` path
  remains a source-backed cause hypothesis; no implementation is corrected.

The Provider-access fixture had a separate expectation defect: disabling the
source makes its requested capabilities unauthorized (`requests[].selected=false`)
as well as advancing its revision. Pairing remains present. The test now expects
that complete public projection, with a regression test rejecting the stale
selected flags. Only that definition advances to version 2. Other unchanged
definitions retain version 1. Shared lifecycle planning accepts an explicit
scenario version with the original default preserved. Mismatch diagnostics retain
only changed public field names, never values or credentials.

A fresh bounded cohort will measure the corrected access reader and the two
status readers that had no samples. It keeps the same images, sample counts and
resource limits, preserves the earlier OOM evidence, and does not turn a partial
or failed campaign into a timing reference. The partially measured entry reader
is not silently marked covered. Forty collection-reader variants are being
authored separately; they remain outside current planned coverage until their
executable scenarios and focused checks are integrated.

### Reader follow-up and Collections coverage authored (2026-11-18)

Follow-up `20261118T160048Z-c4d018ad50e0-fbdaa96b` has verified source
`ce8350742a3111a03867fa0796a4d412332fc624de5160a441385007f81aeafe`
and export seal `ffee1cc5660773f6bc4167889a7eb34128aa9c352b239410dcfc2dc88f862b87`.
The status HTTP reader passed ten samples, P50/P95 188.60/233.54 ms. MCP retained
nine valid samples at 181.54/277.94 ms, then preparation failed. Provider teardown
again reported `OOMKilled=true` while running; memory evidence was unavailable.
The incomplete MCP case remains blocked and reference ineligible.

The access-reader version-2 payload expectation passed, but its cross-instance
postcondition still incorrectly expected 404. That status is not declared by
`get-provider-access`: the implementation throws TypeError for a missing
installation and its mapper classifies that as INVALID_INPUT (422). The separate
`get-provider-installation` reader declares NOT_FOUND (404). The test now uses
these exact distinct refusals, verifies each is present in its admitted binding,
and records the observed status if it differs. Only access advances to version
3. This is a fixture correction, not an application correction; version-2 results
remain failed and unchanged.

Forty additional current binding/variant definitions are now under
`tests/performance/scenarios/installations/read/collections/`. They cover five
collection lists plus installed details, installation and release review. The
large corpus has 64 identities, 96 publications, 32 actual completed upgrades and
a collection containing 65 admitted components/examples. History has 33 versions
and 32 completed upgrades of one identity. Immutable sources are actually
compiled/admitted locally, uploaded and committed to an owned real Registry;
installation and upgrade mutations run through authenticated CMS APIs outside
reader timing.

One owned Registry and three tracked profile tenants are shared by the entire
family, with MCP connected after initialization. Mutable coordinates advance
monotonically across both bindings. The full sixteen-case invalidation schedule
is tested to remain at 121 unique publications, 41 installed identities, 20
completed upgrades and revision 101. Bounds are three publisher namespaces,
400 Registry releases, 128 resources per profile, 64 installed identities and a
240-second corpus preparation deadline. All objects disappear with the exact
owned Docker stack; failed tenant preparation additionally disables/discards
that tenant. Failed corpus loads remain latched rather than retrying unknown
mutation outcomes. This fixture reuse does not erase the separate single-use
initialization campaigns' OOM findings.

Timed pages are always nonempty and include the relevant profile's identities;
full pagination, EOF, unique coordinates, authored metadata and dynamic per-site
actions are checked outside timing. Configuration invalidation does not call
the target detail reader again between mutation and measurement. Refused foreign
sessions and instance-scoped missing installations are checked without changing
the owner's expected state. Unit DTOs validate all generated inputs/outputs
against the actual SDK; unit models never produce capability coverage. The
198-line unit API model remains cohesive despite the file-size advisory.

Focused Installations checks pass eleven tests and 121 assertions; TypeScript
passes. The complete performance suite has 291 passes and the existing real
DELETE-body failure (292 tests, 5,852 assertions). The plan now has 1,623
definitions and 1,563 of 1,608 mandatory obligations: 45 mandatory variants remain
to be authored. Collections runtime measurements and the corrected access case
are still pending. No application, image or contract source was changed.

### First shared Collections campaign: setup diagnosis required (2026-11-18)

Run `20261118T161946Z-c4d018ad50e0-003af292` attempted 41 cases. The corrected
Provider-access version 3 passed ten samples (P50/P95 164.59/241.79 ms), including
the declared 422 missing-access refusal. All forty Collections cases blocked
before measurement on their shared preparation. No runtime/OOM or budget finding
was recorded. This does not establish an application failure or any measured
Collections coverage.

Its verified source is
`41e5534c60fe42405992d8ded54bc693b941793e231875153c88bd8b265caec3`
(4,032 files), and its verified export seal is
`965d31b3f97c9e0a39656468646f704a7cdb16ad357356947cb8fbd1814df956`.
The original generic setup failure is retained. Explicit safe phase codes are
now added around Registry creation/postconditions, publisher setup, namespace
claim, tenant readiness and corpus creation. Shared Repository-creation test
assertions now have specific diagnostic labels without changing their checks.
Arbitrary exception messages and DTOs are excluded; a focused test protects that
redaction. A single large-reader diagnosis precedes any full Collections replay.

The single diagnosis `20261118T163314Z-c4d018ad50e0-402b25de` confirmed that
Registry creation, its existing postconditions, publisher registration and tenant
provisioning succeeded. It failed inside tenant readiness, still before any root
measurement. Verified source `ba86337255d3a329a674d24a5c3d8681646490e764c8b41c38bf0e8e4a4ca30c`
and seal `c3031bd04c7f7aa190cb3ca532fc44d6688782914d53de4edc5f5a437e03bce3`
retain this evidence, without runtime findings. Readiness phases now separately
identify planning, empty initialization, settings/configuration, installed state,
source discovery and MCP connection. All existing assertions remain enabled.

### 2026-11-18 — approved initialization review and reader invalidation

The tenant diagnosis `20261118T164108Z-c4d018ad50e0-724fd557` located the
Collections fixture failure in empty initialization. The fixture incorrectly used
`digest` on the plan response, whose public fields are `planDigest` and
`reviewJson`. Preparation now reuses the existing independent review validator
(instance, actor, plan, revisions and canonical digests) before applying its exact
approved digest. A regression test rejects a mismatched response digest before
any command can run. No application implementation changed.

The next large-corpus diagnosis `20261118T164648Z-c4d018ad50e0-57338024`
passed tenant readiness, then failed at installation after publishing the large
catalogue. The unchanged Provider limit remained 2 GiB. Runtime evidence reports
`OOMKilled=true`, peak/limit both 2147483648 bytes, three cgroup OOM events and
one kill. This establishes a resource failure during preparation, not a measured
reader latency or a proven memory-leak cause. Its verified export seal is
`5e0b3eae5a726ec0f573ad100bd4448c3ce4bf64f966e95cfba055cd2952118c`.

The separate invalidation cohort `20261118T165131Z-c4d018ad50e0-ffe887f0`
completed all twenty cases: sixteen collection readers, operation lists and site
usage, through HTTP and MCP. All 200 timed samples passed their business,
authorization, pagination and retained-state postconditions. There were no runtime
or cleanup findings. Its ten budget findings remain blocking: eight internal
request-count overruns and two Mongo-operation overruns. Site usage reached
119 HTTP / 128 MCP Mongo operations against a budget of 80. The observed P95
range was 122.69–628.47 ms; these are ten-sample shared-host diagnostics, not a
calibrated regression reference. Source digest
`a6bbe594f816e30ead92bc8f7fcb11daf2de4ec6a268e160978117159dafe214`,
archive hash `a6d43abdf6fac7a79173f34f8b0192646c82a1a8c80c0091d1b036e8c25eba84`
and verified seal
`94239853c759ad9a98362a815da214e2b74389c2f6848de6a8352f20546d3edb`
retain the complete source and measurement evidence.

Operation-list expectations use independently witnessed completed writer receipts,
not the list response itself. Site-usage expectations derive from admitted
fixture identities, authored/published pages and twelve explicit runtime consumer
references. Invalidation changes disjoint component references, checks a changed
digest and rejects the stale cursor. Their three bounded profile tenants are
shared with Collections. The full performance suite at this source reported
300 passes and the existing pinned-transport DELETE-body failure (301 tests,
5997 assertions); that application/transport reproduction remains enabled.

Subsequent test-only work adds eight selected-repository discovery variants with
64 public identities or 33 immutable versions, without unrelated installation.
The public aggregator deliberately ranks at most fifty candidates per source;
tests traverse that bound and separately check exact reachability of all known
identities. Metadata continuation checks the complete independently expected
projection and preserves older immutable references after newer publication.
Unknown corpus write outcomes are latched, preventing another case from implicitly
retrying the same publication or installation. With these definitions registered,
25 mandatory current-executor variants remain undefined. This is an intermediate
state, not completion of the current-source matrix or final `verify`.

### 2026-11-18 — complete definition inventory and remaining execution

Discovery cohort `20261118T170254Z-c4d018ad50e0-9a177cee` passed the large HTTP
search before the Provider exited with code 137 and `OOMKilled=true`. Seven
subsequent scenarios were blocked; they earn no coverage. Verified export seal:
`a109aa4f488f5e32238026f83d10542139707d96dea801e4e71a8ff436902749`.
The unchanged 2 GiB Provider limit and the original failed preparation evidence
remain part of the report.

Recovery reader cohort `20261118T171042Z-c4d018ad50e0-441e0011` passed six cases:
contract upgrade, collection upgrade and maintenance status, through both HTTP
and MCP. The real public resume operation completed between the primed prepared
read and the timed terminal read of the same identity. There were two budget
findings and no runtime findings. Its verified seal is
`18185472605b21cc34f7764ddf3d78a3eba5a2b7f4a54e1ede8ae08a3f981a3c`.
The two completed-job identity cases failed a fixture grant-restoration assertion:
a standalone journal seeded one extra toggle. Version 2 now seeds an even pair
of genuine completed writer receipts; a focused regression test verifies parity
and prevents reseeding an existing journal. The original failed cases remain
archived and do not receive healthy coverage before replay.

The current definition audit reports 219 current executors, 1,668 scenario
definitions, 1,608 mandatory obligations and zero missing mandatory variants.
Fifteen lightweight compatibility claims cover 452 shared aliases separately;
they are not additional measured executor coverage. This proves plan completeness,
not execution completeness. The full current-source campaign, final `verify`
and final evidence audit remain pending. The user explicitly excluded integration
into the principal checkout's newer `v1.0.20`; this assessment remains on
`c4d018ad50e01e8250b43fbb04c26337027d77da` in its isolated worktree.

The final metadata fixtures use an owned Registry and three bounded profile
sites. Their large profile has 64 real admitted documentation assets and 64
approved metadata connections; history publishes 33 exact contract/manifest
versions and performs actual domain reapproval/status transitions. Controlled
connection reports are fixture observations seeded through the validated
installation lifecycle and Mongo adapter, not evidence that those fixture
Providers execute business handlers. None of their synthetic capabilities is
counted in the executable inventory. Site selections change through the real
review/apply APIs. Documentation checks selected release identity, authored
excerpts, exact capability associations and complete continued reads; metadata
readers also check foreign-instance authority. The host fixture worker is bounded
and removed before timing; production hosts and non-owned aliases are refused.

### 2026-11-18 — reader identity, delegation and metadata diagnosis

The fixture's generated secret reference now uppercases UUID letters, as required
by the real installation parser. A lifecycle regression test verifies that the
lowercase reference is refused and the normalized reference is accepted. The
selection fixture also retains the API's normalized `review.selections` after a
completed switch, so subsequent source comparisons use the same canonical order.
Applicability, revision and source failures have distinct diagnostics. No
application parser, plan implementation or contract changed.

Cohort `20261118T175005Z-c4d018ad50e0-24eb60da` attempted nineteen cases.
Both version-2 operation-identity cases and delegation invalidation passed their
thirty timed samples and business/authority postconditions. MCP operation reads
retain one budget finding: 21 internal requests against 15. The sixteen metadata
cases were blocked after the large profile encountered a cgroup OOM event. At
inspection, the Provider root process was still running with exit code 0;
`OOMKilled=true`, six OOM events and two kills do not prove that the root process
exited or establish a memory-leak cause. Peak memory was 2147581952 bytes against
the unchanged 2147483648-byte limit. The bounded worker refused further seeding
after that event. Verified export seal:
`44d92baea9a7bbd58481caa4aa4b557343a72e336ab4a27c41131f60f180f829`.

The separate small-fixture diagnosis
`20261118T175544Z-c4d018ad50e0-4e4e90b5` then passed documentation-get
invalidation, including all ten complete continued-read samples and repeated
selection switches, with zero budget or runtime findings. This validates the
small fixture; it does not replace or clear the large-profile OOM evidence.
Verified export seal:
`6389ea586cf783fb91bb8e1bddcb79adc005488e6c375c2d6852a81297f9d48a`.
Both exports pin source digest
`277dfad534d23ccd8f341f12795c6e7fea498ea46b7b63919a24cc3f4c30fb9e`.
They are shared-host diagnostics and cannot be promoted as timing references.

The next acceptance command is `ULVIA_PERFORMANCE_DIAGNOSTIC=1 bun run verify`
in the original isolated worktree. It includes the complete 1,668-scenario plan,
independent compatibility evidence, browser delivery and TLS. Its results must
still be inspected and archived before this assessment can be declared complete.
