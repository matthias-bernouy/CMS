# Initialization Plan Performance

This campaign targets only the current exact `ulvia/cms.installations`
`initialization.plan` implementation and its HTTP/MCP bindings. Its scoped
coverage report does not claim repository-wide performance coverage.

Run candidate images built from current HEAD:

```sh
bun run tests/performance/assessment/initialization.ts 0.1.0-capability-assessment
```

An optional second argument supplies an immutable reference run ID. Reports are
sealed under `artifacts/performance/runs/<run-id>/`. Missing references and
budget violations remain explicit failures; a successful business response does
not mean the performance budget passed.

The 52 scenarios cover empty and one-Page plans in nominal/cold/warm/concurrent
states; 25/100 Pages, nine included collections and a 512 KiB asset under volume
and concurrency; an exact older pin among 16 versions; and review invalidation
after a real settings revision change. Concurrent scenarios issue ten in-flight
requests. Their burst throughput is not a sustained production capacity claim.

Fixtures publish authored collections to a disposable local Registry and create
a separate pending tenant. No initialization is applied. Every response checks
scope, exact root, translated Page metadata, proposed paths and cryptographic
plan/review digests. Postconditions retain pending state, zero Pages, zero
installed collections and unchanged site settings.

Cold cases restart the Provider for each of three samples. The current Mongo
route-recovery initializer increments settingsRevision once whenever its instance
runtime opens, even without calling initialization.plan. A separate restart and
read-only snapshot calibrates that effect before measurement. Cold postconditions
require exactly that increment per restart and preserve all other state; they
do not silently discard revision checks.

Client latency includes the fully consumed result; work counters include actual
Mongo commands/documents and internal requests/bytes. Per-route counts identify
network-heavy control paths. Preparation, publication, snapshots and warm-up
calls cannot contribute nominal coverage. Test probes add overhead, so compare
matching fixture/instrumentation/resource fingerprints.

## Administration Regression Cases

Fourteen scenarios replay the pinned `ulvia/mossa@1.18.0` administration recipe
over HTTP and MCP: nominal, cold, warm and concurrent, plus 0/1/21-static-Page
controls retaining the entire library and all assets. Normal and control cases
have three measured samples; concurrency has ten in-flight requests. Warm cases
have three separate preparation calls. These small samples are diagnostic, not
precise capacity estimates. The broader 52-case campaign retains the existing
settings-invalidation scenarios; the administration-only subset does not claim
those obligations.

```sh
bun run tests/performance/assessment/administration.ts 0.1.0-capability-assessment
```

An optional second argument supplies a previous run ID. The
[fixture provenance](../../fixtures/administration/README.md) documents the exact
digest, archived asset bytes, historical Registry restoration and explicit
control differences. Tests never fetch production or apply initialization.
Successful reviews check exact translated metadata, paths, root identity, actor,
instance, login role and cryptographic digests. Failed requests also check that
the durable pending state, Pages, collections and settings remain unchanged.

The preload measures actual metadata/artifact verification, Registry access,
execution snapshots, disposable storage, Content Page writes and contract reads.
Each sample retains phase call counts, inclusive wall time and failed calls;
the HTML report displays them. Inclusive nested times must not be added. The
probe never records Page contents, credentials or exception messages. This
measures validation of real query/mutation bindings, not execution of the Pages'
business queries or commands.

After a client failure, collection waits up to 75 seconds for the original
Provider plan to finish. This settlement time stays outside client latency and
prevents late work from leaking into the next request. Cold samples settle and
collect their trace before another Provider restart. Missing settlement is an
explicit failure, never a successful sample or zero-duration phase.
