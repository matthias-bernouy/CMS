# Initialization Plan Performance — 2026-11-17

This focused assessment tests `ulvia/cms.installations` capability
`initialization.plan`, HTTP path `/initialization/plan`, over HTTP and MCP.
The broader capability assessment remains paused. No application implementation
or contract was corrected and no commit was created.

## Evidence And Reproduction

The final run is `20261117T143548Z-4b12e777358e-1f5bcae4`, measured against
revision `4b12e777358e302d23d0d6647a6445e5ed3530a6` with uncommitted tests.
Its source fingerprint remained stable during execution:
`96f59bccc7f762a24f69135807f3e477e8b2881c5f18620a3c9fc15a98e141ee`.
Sealed JSON/HTML artifacts are in `artifacts/performance/runs/<run-id>/`.
The seal was verified and Chromium checked the report's 38 scenario rows,
ten coverage rows and interactive filtering.

```sh
bun run tests/performance/assessment/initialization.ts 0.1.0-capability-assessment
```

The internal runner accepts an optional reference run ID after the version.
There is no complete regression reference yet; these are initial measurements,
not evidence of a regression relative to an earlier release.

The local isolated stack used Linux x64, Ryzen 7 6800H, 16 logical CPUs,
29,148,069,888 bytes host RAM, Bun 1.4.4 and MongoDB 7.0.37. Limits were Provider
2 CPUs/2 GiB, Edge 1 CPU/1 GiB and MongoDB 2 CPUs/1 GiB. Probe digest:
`07f5271328c7caf05a42f1029ebbc7309f5e120daefa6de83322910a19a5e77c`.
Both image IDs and the complete resource profile are retained in results.json.

## Results

All 38 scenarios were attempted, producing 352 measured requests and 18 excluded
warm-up requests. Twenty-six scenarios had complete valid business results and
postconditions. Twelve concurrent scenarios failed. Eight of ten mandatory
binding/variant obligations have complete successful evidence; the two
concurrency obligations remain uncovered.

Values below are client p50/p95 in milliseconds, including full consumption of
the response. Each ordinary case has ten samples; consequently its nearest-rank
p95 is the largest observed sample. Cold cases have three samples. These small
local samples and profiling overhead are not production service-level targets.

| Dataset | HTTP p50 / p95 | MCP p50 / p95 | HTTP maximum Mongo commands / documents examined |
| --- | ---: | ---: | ---: |
| Empty plan, nominal | 223.87 / 301.90 | 173.65 / 232.51 | 27 / 25 |
| One Page, nominal | 204.36 / 680.53 | 247.45 / 294.38 | 37 / 40 |
| 25 Pages | 240.64 / 614.88 | 263.26 / 317.45 | 37 / 40 |
| 100 Pages | 333.20 / 669.83 | 376.87 / 409.27 | 37 / 40 |
| Nine included collections, 65 Pages | 647.94 / 1110.51 | 673.28 / 751.22 | 85 / 120 |
| One Page and 512 KiB asset | 219.24 / 568.57 | 264.39 / 354.65 | 40 / 45 |
| Exact older pin among 16 versions | 188.00 / 582.41 | 240.72 / 272.60 | 37 / 40 |

Cold empty-plan p95 was 582.37 ms HTTP / 761.58 ms MCP. Cold one-Page p95 was
1706.86 ms HTTP / 1887.35 ms MCP. Restart/readiness time is excluded; the first
target request includes lazy instance composition. An independent restart and
read-only snapshot confirmed Mongo's startup-only settings revision increment.
Cold postconditions require exactly that increment and preserve all other state.

Both invalidation scenarios passed: after an actual site settings mutation, the
review observed the new system revision and a changed review digest. Across all
measurements the tenant remained pending, without created Pages or installed
collections. Plans were never applied.

## Findings For Future Corrections

1. **Concurrent preparation is rejected, even for an empty plan.** Each batch
   starts ten requests on the same tenant. Across twelve batches, 12 requests
   succeeded and 108 were refused: 54 HTTP 423 responses and 54 MCP declared
   `UPGRADE_IN_PROGRESS` errors. The latter have transport HTTP 200 and are
   still business failures. `SiteInitializationService.plan()` uses
   `exclusive()`, whose busy branch immediately refuses another preparation.
   This is current explicit behavior, not evidence that an upgrade was running.
   Any future queuing/coalescing/concurrency change must preserve review scope
   and application fencing.
2. **A large common routing payload dominates simple plans.** Every nominal
   empty HTTP request consumed 3,632,274 internal response-body bytes through
   nine internal calls. Four `/gateway/route` calls account for 3,629,100 bytes,
   over 99.9% of that volume. In a representative request the handler took
   13.73 ms, versus a client median of 223.87 ms. This points to a substantial
   common routing/transport cost; handler wall time is not a CPU profile.
   Body counts exclude headers and are not a packet-level bandwidth measure.
3. **Included graphs amplify dependency/control work.** The nine-collection
   case reached 86 internal calls over HTTP and 96 over MCP, with 85/94 Mongo
   commands and 120/133 examined documents respectively. The pure Page-count
   increase from 25 to 100 did not increase maximum Mongo command count in this
   fixture. Investigate graph retrieval, verification and common control calls
   separately before choosing an optimization.

The assessment is red: 43 provisional budget findings (33 internal-call,
six latency and four Mongo-command ceilings), twelve load-error findings,
incomplete concurrency coverage and a missing regression reference. Business
validity does not override these failures. No budget was raised to make the run
pass.

## Validation And Limits

Initial and final `bun run check` each passed all ten stages. Performance-tree
TypeScript checks and targeted fixture/harness tests passed. The Docker stack
and authentication browsers were cleaned up. The global `verify` campaign was
not restarted because the user paused the exhaustive assessment; its earlier
application failures are not claimed resolved by this focused run.

Fixtures use one pending tenant and a controlled local Registry. They cover
static recipes without dynamic business queries; different queries, dependency
graphs, assets and machine profiles can change costs. Dataset publication and
snapshots are outside timing and cannot receive nominal coverage credit.
See [scenario details](../../tests/performance/scenarios/initialization/README.md).

## Production Incident: QB Formation / Mossa Administration

After the synthetic assessment, a user reported HTTP 502 on
`https://qb-formation.fr/.cms/call/ulvia/cms.installations/initialization/plan`.
The exact input was:

```json
{
  "root": {
    "bootstrapId": "administration",
    "collectionId": "ulvia/mossa",
    "digest": "sha256:c9e14a512f09aa4f680ff4447cb5253040533d9e17c3756738696089535de41a",
    "publisherId": "ulvia",
    "version": "1.18.0"
  }
}
```

One read-only MCP replay reproduced `transport_failure` in 15,669 ms.
Its trace ID is `e7abb7ca-f62e-4a38-8466-12359013a871`; the target invocation
is `e92a5bc5-b63e-4ad9-ae6f-030054f3136c`. The selected Installations
contract version was `1.4.1`. Gateway dispatch took 15,068.80 ms, within a
15,126.93 ms invocation, ending at `2026-11-17T14:45:26.329Z`.
The Provider subsequently rejected the same invocation with `CORE_UNAVAILABLE`
(503) at `14:45:30.436Z`, approximately four seconds after the Edge failure.
An earlier browser HTTP request, trace
`52e38b71-193b-4aad-b807-22271199a98a`, explicitly logged HTTP 502 after
15,262.20 ms at `14:14:04.292Z` on the same date.

The complete replay trace contains 61 Registry HTTP responses: one catalogue,
two reads of the same Mossa release and 58 assets. Every response header reports
HTTP 200. Summed time to headers was 1,321.76 ms, with a maximum of 204.87 ms;
these overlapping durations do not measure total download, verification or
planning time. Release response headers arrived at `14:45:11.592Z` and
`14:45:17.701Z`; the last asset headers arrived at `14:45:20.047Z`.
Neither CPU attribution nor the Provider's underlying exception is exposed by
these logs. Successful Registry responses alone do not establish why planning
failed.

The local Edge source sets a 15-second response deadline for this capability;
only `plan-collection-upgrade` receives its administrative 60-second exception
in `responseTimeout.ts`. The observed cutoff matches that deadline. Increasing
it alone would not explain or resolve the later Provider failure. Production
image revision and resource limits were not independently verified.

The instance remained `pending`, revision 0, with zero completed Pages and no
initialization operation before and after the replay. No plan was applied.
Sanitized trace evidence is saved locally in
`artifacts/performance/incidents/20261117-qb-formation-mossa/evidence.json`
(ignored generated evidence, separate from sealed benchmark runs).

This is a confirmed coverage gap: the synthetic static fixtures above do not
reproduce the actual Mossa administration recipe. Their sub-second nominal
results cannot establish that this production recipe works. An isolated replay
of this exact pinned artifact with phase timing, capability-binding validation
and persistence counters is still required before attributing the internal
failure or claiming a fix. No application correction was made.

## Isolated Mossa Regression Campaign — 2026-11-17

Run `20261117T151407Z-4b12e777358e-53f8056b` adds fourteen administration
scenarios to the existing 38-case suite. The focused command is:

```sh
bun run tests/performance/assessment/administration.ts 0.1.0-capability-assessment
```

The exact public Mossa release and its 58 assets are archived as immutable
[test input](../../tests/performance/fixtures/administration/README.md), verified
against the reported production digest. No production request is made during
the run. The bundle is restored into the actual test Registry outside timing;
the ordinary Edge, Provider, Mongo, HTTP/MCP, worker verification and disposable
Content preview paths execute during measurement. Restoration is not an
editable-source publication test. The original recipe has 107 blocs, 117
examples and 21 administration Pages. A separate prerelease retains those
resources and adds 0/1/21-static-Page controls. Those controls isolate library
cost; they are not equivalent subsets of the real administration Pages.

The source revision and image identities match the earlier campaign above.
The working-tree fingerprint stayed stable throughout measurement:
`addd00a56fb44d0f5597eaf71535fd00b1cb7e6bdf46a5a9e9d19fde7dae99ce`.
The new probe digest is
`473532cf529d56517efb8e40f7e1ec03cdc03be58806f6f0107d091b79a2ede2`;
the environment fingerprint is
`c39d6fe014d3f97ddff2bb7c3e5206cff18dd14379653597555a7a49f0c463aa`.
Resource limits remain Provider 2 CPUs/2 GiB, Edge 1 CPU/1 GiB and Mongo
2 CPUs/1 GiB. Sealed JSON/HTML reports are under
`artifacts/performance/runs/20261117T151407Z-4b12e777358e-53f8056b/`.
Earlier fixture-preparation failures remain separate failed runs, not latency
evidence or regression references.

### Results

There were 56 measured requests and six excluded warm-ups. Thirty-six measured
requests passed business assertions; two returned HTTP 502 and eighteen were
refused under concurrency (nine HTTP 423, nine MCP `UPGRADE_IN_PROGRESS`). Ten
scenarios completed all their business assertions; four contained failures.
All successful and failed requests preserved the durable initialization state:
pending, no Pages, no installed collections and unchanged settings, apart from
the independently calibrated startup revision increments in cold cases.

| Case | HTTP p50 / p95 ms | MCP p50 / p95 ms | HTTP / MCP valid samples |
| --- | --- | --- | --- |
| Exact Mossa, nominal | 8961.66 / 15157.13 | 7041.14 / 7210.17 | 2/3, 3/3 |
| Exact Mossa, cold | 12040.10 / 15541.89 | 11978.96 / 12784.35 | 2/3, 3/3 |
| Exact Mossa, warm | 6918.89 / 7052.57 | 7288.81 / 7416.04 | 3/3, 3/3 |
| Same library, 0 static Pages | 5940.41 / 6795.74 | 5545.13 / 5612.26 | 3/3, 3/3 |
| Same library, 1 static Page | 5906.62 / 5918.66 | 6044.28 / 6202.61 | 3/3, 3/3 |
| Same library, 21 static Pages | 6084.41 / 6179.05 | 6289.91 / 6341.03 | 3/3, 3/3 |

The exact recipe's concurrent cases each admitted one of ten requests. Their
p95 was 7633.97 ms HTTP / 8033.06 ms MCP; fast refusals make their medians
unsuitable for describing successful plan latency.

### Work Attribution

Warm HTTP plans performed three `verify.metadata` calls and two
`verify.artifact` calls. Artifact verification itself includes metadata
validation. Their median aggregate times were 1958.27 ms and 1310.59 ms
respectively. The full `source.get` call took 1294.22 ms and the disposable
preview 3054.94 ms, including its 648.82 ms storage import. These inclusive
timings overlap and must not be summed. Within the preview, 21 inserts and
42 ordinary Page updates were observed, together with 84 contract reads across
the full request. Contract-read aggregate median time was 67.19 ms; that count
alone does not establish that Mongo latency dominates the request.

Even the zero-Page control retained a roughly 5.9-second HTTP median, confirming
a substantial collection-wide cost before any Page content is proposed. The
static controls are not a monotonic Page-count benchmark: caching and sample
noise remain visible, and every control retains all 117 original examples and
all 58 assets.

A representative warm HTTP plan caused 254 internal HTTP exchanges and
13,345,518 consumed response-body bytes, with 313 Mongo commands and 432
examined documents. The breakdown attributed 61 outgoing business requests
and 193 common exchanges. The 1,759,522-byte manifest was read twice; counting
both instrumented HTTP hops records 7,038,088 bytes for those transfers. Five
`/gateway/route` calls added 3,968,250 bytes. These are hop-level counters, not
unique downloaded bytes or a production bandwidth measurement. The zero-Page
control still reached 254 exchanges and 210 Mongo commands.

The two local timeouts were preserved with their late Provider phases. The
nominal failure stopped during bundle retrieval, with `plan.total` failing at
15026.50 ms. The cold failure completed its preview successfully but the plan
failed at 18226.38 ms, after the client had already received 502. This is
consistent with cancellation being checked after preview; the probe deliberately
does not export exception messages. A live production CPU profile and the exact
underlying production exception remain unavailable.

### Acceptance And Limits

The report remains failed: 42 budget violations, concurrent load errors,
incomplete obligations and no compatible regression reference. No budgets or
application code were changed. This fourteen-case subset covers four of ten
required binding/variant obligations; the existing settings-invalidation cases
are included in the broader 52-case suite, not this subset. Three samples per
ordinary case are an initial diagnostic, not a precise distribution estimate.
The new instrumentation adds overhead and changes the profile fingerprint, so
the earlier synthetic run is not a compatible regression reference.

Initial and final `bun run check` passed all ten stages. The ten focused
fixture/probe/metric/review tests passed, and the performance TypeScript project
passed. The immutable report seal was verified; Chromium checked fourteen
scenario rows, 168 phase rows, ten coverage rows and the four-row covered filter.
A broader harness run passed 44 tests and retained
the existing failing DELETE-body transport test. `bun run verify` was attempted:
its unit stage reported 3560 passes, 56 skips, 154 failures and one error in the
sandbox, including listener restrictions; the command then stopped at Docker
image construction because the sandbox could not access the Docker socket.
Browser delivery, Docker delivery and TLS were not completed by that command.
The isolated administration campaign ran separately with the necessary local
permissions and cleaned up its containers. No application correction, commit
or deployment was made.
