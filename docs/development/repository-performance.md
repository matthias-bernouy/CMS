# Repository performance

Run deterministic HTTP and admission-work budgets with the normal test suite:

```sh
bun test tests/performance/repository
```

The tests cover collection, contract and Provider catalogue pagination with
1, 256 and 1,200 releases, no artifact downloads while listing remote metadata,
four concurrent collection asset downloads, concurrent admission reuse, retry
following failure, changed digests, catalogue removal, the 1,024-release
installation catalogue limit, and fresh site-scoped installation revisions.
They assert work counts rather than fragile wall-clock limits. HTTP clients can
consume 1,200 releases; the CMS installation catalogue currently rejects more
than 1,024 instead of exposing a paginated UI contract.

Run the measured Repository journey separately:

```sh
ULVIA_PERF_SAMPLES=3 bun run test:performance:repository
```

It builds the current bootstrap, loads every indexed official contract and the
Provider manifest, and admits the complete official collection with its assets.
An isolated filesystem Repository serves real loopback HTTP. Installed state
uses `MemoryCollectionStorage`; the reported storage counts are method calls,
not measured MongoDB operations. No public Repository or production mutation is
used. The generated JSON report is written to
`artifacts/performance/repository/report.json`.

The benchmark separates cold index creation, the three catalogue types, bundle
and asset downloads, installed-state snapshots, graph/example validation, cold
available collections and warm listings for installed and empty sites. Median,
p95, request counts, bytes and storage reads are reported. Generous time
ceilings detect major regressions; they are not production latency objectives.
The warm-listing work budget requires one catalogue HTTP request, one site
read, at most one installed release metadata read, and zero asset/bundle reads
for this one-installed-collection fixture.

The instance Docker journey also lists the newly published `mcp-kit` twice
before installation and twice afterwards. It checks identical warm results,
verified browser-risk digests and fresh `install`/`current` actions, and records
authenticated timings. It also records identity, namespace claim, rejected and
valid collection preparation, publication, installation and private source-read
timings through the authenticated Edge/Provider flow. Existing authorization and instance-isolation checks
remain part of that journey.

## Investigation on 2026-10-29

The deployed Edge and Provider were both 1.0.3, revision `4d6cac938`.
Read-only production probes and retained capability logs showed:

| Measurement | Observed duration |
| --- | ---: |
| Cold `list-available-collections`, Provider capability log | 9,063 ms |
| Repeated warm calls, Provider capability logs | 1,144–1,311 ms |
| Collection catalogue fetched inside the Provider | 16–91 ms |
| Installed-state snapshot inside the Provider | 1,317–3,341 ms |
| Graph and example validation alone inside the Provider | 1,063–1,504 ms |

Each measured snapshot made two Mongo reads: installation state and the one
installed release metadata document. The official collection had 98 Blocs,
105 examples and 54 assets. `CollectionStore.snapshot()` calls
`assertCollectionResourceIsolation()`, which validates dependencies, markup and
all expanded example documents on every read. This CPU work dominates the warm
listing. These checks are valuable at admission and installation changes, but
the listing currently repeats them for an unchanged installation.

Local loopback measurements on the same collection produced a 460 ms median
warm listing on the installed site versus 0.25 ms on an empty site. A cold
listing downloaded 56 responses and 2,582,646 bytes: one catalogue, one release
and 54 assets. Its median was 2,446 ms. The immutable admission promise avoids
those downloads on subsequent calls, but not the installed snapshot validation.
The local and production figures use different hardware and instrumentation;
they must not be treated as directly comparable network latency.

The source also shows repeated metadata work on asset reads:
`LocalCollectionRepository.getAsset()` calls `getMetadata()` for each asset.
That reads the entire release JSON, compares its cached bytes and clones the
complete verified metadata. The asset directory is then derived by hashing the
whole canonical JSON again. Thus 54 small asset responses repeatedly process
the same roughly 1.47 MB manifest. The real loopback benchmark measured a
1,617 ms median to download the complete bundle, even though individual warm
catalogue reads were below 0.5 ms. This identifies amplification in the read
path; it does not attribute every millisecond to one filesystem operation.

## Original investigation priorities (before implementation)

1. Introduce a lightweight installed catalogue view. Read current site state and
   the exact required release metadata without rendering or validating all
   example documents. Preserve full admission, dependency and example validation
   on installation, upgrade and relevant mutations.
2. List verified release metadata without fetching every binary asset. Derive
   browser-risk details from the exact verified release, never solely from
   untrusted catalogue claims. Fetch and verify assets for an explicit install,
   upgrade or preview. Keep each installation's live revision authoritative.
3. Serve individual assets from a verified narrow asset manifest without cloning
   and hashing the whole release per asset. Preserve exact asset identity,
   content verification, immutable coordinates and current-byte integrity checks.
4. Deduplicate pending `source.list()` reads inside one `prepare()` batch.
   Its current map is populated after awaiting the network call, so concurrent
   targets from one source can each fetch the same catalogue.
5. Bound immutable admissions by entries and retained bytes. The current
   `CollectionSources.admitted` map has no eviction; the 1,024-listing limit does
   not bound historical entries retained over a long-lived instance.
6. Add cursor/search inputs to the installation catalogue before exposing large
   repositories. Raw HTTP pagination is already present, but the CMS listing
   aggregates all pages and validates every available bundle at cold start.

The priorities above record the original investigation. The implemented changes
are described below. No publication or installation operation was benchmarked
against production; write journeys use an isolated local Repository.

The global `test:performance` suite was subsequently repaired to use current
examples, read-only upgrade analysis and resolved Gateway contracts. It now
runs in `verify` and CI. See [guardrails](guardrails.md) for the independent
Docker delivery journey and remaining performance limits.

## Authenticated local write journey

A separate isolated Docker run recorded individual operations through the Edge:
identity 172 ms, namespace claim 100 ms, valid preparation 65 ms, publication
1,525 ms, installation 1,432 ms and private source retrieval 53 ms. Listing the
installed collections alone took 581 ms, consistent with the expensive snapshot
validation above. These are one-run observations on a local fixture, not
production measurements or latency percentiles. The integration test prints
these phases on subsequent runs so publication and installation costs remain
visible rather than being folded into one large test duration.

Initial investigation validation completed with 16 new work-budget tests, the dedicated benchmark,
TypeScript/style checks and 25 Docker tests passing. The newly instrumented
Docker journey was also rerun independently. The `verify:full` unit phase passed
2,603 tests (six skipped), but its browser smoke is not green: an initial local
Docker address-pool exhaustion was followed by an isolated retry timing out on
the redirect after a collection upgrade. No runtime changes were made to mask
that failure.

## Implemented optimizations

- `CollectionStore.listInstalled()` reads live site state and batches narrow
  release summaries. Mongo computes counts in one projection without returning
  markup, example documents, translations or asset declarations. The memory
  adapter has the same DTO. `readInstalled()` validates mutable configuration and
  text overrides for detailed reads without auditing unrelated examples.
- `snapshot()` and mutation graph validation remain complete. Provider
  authorization, Edge transport and per-instance stores are unchanged. The new
  read methods are explicitly classified by the runtime site write policy.
- `CollectionRepositorySource.getMetadata()` reads untrusted release JSON without
  downloading assets. The catalogue recomputes its exact digest and derives
  browser-risk details from the verified release. Full bundle/asset verification
  is retained for explicit preparation and installation. Mutable contract
  dependency availability is rechecked even when an immutable bundle is cached.
- Metadata projections are cached per instance, bounded to 256 entries and a
  4 MiB serialized payload budget. Bundle admission retains at most eight entries
  and 32 MiB of canonical text plus Blob payloads. Each cache allows at most 16
  distinct pending loads, shares same-key work, retries failures and never
  retains an oversized payload. These budgets bound payloads, not exact VM heap.
  Preparation batches share pending catalogue reads and use four workers.
- Filesystem asset reads clone only one verified asset definition and derive
  its directory from the verified digest. They still compare current release
  bytes, reject invalid UTF-8/noncanonical documents and verify asset contents.
  The metadata cache has entry and serialized-payload limits too.
- The browser upgrade test now observes the real acknowledgement without
  intercepting/replaying the response. A navigation can discard that response
  body, so the isolated test identifies exactly one new durable operation via
  `list-operations`, checks its terminal result, then checks navigation. Old or
  ambiguous operations fail the test. No browser timeout was increased.

The benchmark preserves the original `report.json` and writes current results
separately to `artifacts/performance/repository/optimized.json`. Warm listing
budgets now require zero full release metadata/asset reads and one summary batch;
a cold one-collection listing allows two HTTP responses. The warm local business
path also has a generous 100 ms p95 ceiling.

Pagination/search for the installation catalogue remains future work: its
existing 1,024-release bound is unchanged. The older global performance fixtures
mentioned above are outside this optimization; the dedicated Repository runner
continues to be checked independently.

The CollectionStore facade and filesystem reader retain their cohesive read/write
responsibilities despite file-size warnings; new summary, cache and catalogue
logic is grouped into focused modules rather than enlarging those facades.

## Results after optimization

Local medians on the complete official collection, using the same dedicated
loopback benchmark:

| Phase | Before | After |
| --- | ---: | ---: |
| Cold available collections | 2445.68 ms | 603.52 ms |
| Warm available collections, installed site | 460.29 ms | 0.21 ms |
| Complete bundle and asset download | 1617.01 ms | 678.86 ms |

The cold listing changed from 56 HTTP responses / 2,582,646 bytes to two
responses / 1,467,930 bytes. Warm listings fetch one fresh catalogue page and use
one site read plus one batched summary read. They do not read full installed
releases, download binary assets or audit example documents.

The final authenticated Docker journey measured warm listings at 39.9 and
37.0 ms after installation; the earlier fixture measured roughly 0.5 seconds.
These timings include the real Edge/Provider authorization and transport path.
They are local observations, not deployed production results. The final suite
also preserves existing MCP authorization across a real 1.0.0 instance upgrade.

## Final validation

`check:all` passed all ten checks before and after the changes. The dedicated
Repository benchmark and typecheck passed. `verify:full` passed 2,618 tests
(six opt-in tests skipped), followed by the real browser journey with 24
assertions. The complete local Docker suite passed 28 tests / 402 assertions,
including a real 1.0.0 instance upgrade. The upgrade-submission guards passed
five focused tests, including stale and ambiguous operation inventories.

The three local candidate images were checked against all 18 changed/new
production source paths; the removed source path was absent. No production
source changed after that check. Receipts and source hashes are retained in
`artifacts/performance/repository/`. No commit, publication or production
upgrade was performed for this optimization.
