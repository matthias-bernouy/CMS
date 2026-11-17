# Security And Performance Guardrails

These controls supplement review; passing them does not establish that all
security or performance properties have been checked.

## Fast checks and evidence

`bun run check` prints check results first, then changed-file guidance.
Errors are always visible. Other advisory findings are counted unless they
concern changed paths. `--verbose` prints complete tool output. Full text and
JSON reports are saved to `artifacts/check-all/latest.{txt,json}`; a report
write failure fails the command.

Local scope includes staged, unstaged and untracked files. Use
`bun run check --base <ref>` for committed work: its scope is the merge base
through the working tree, including untracked files. An unavailable or unrelated base (including a force-push) widens scope to all
indexed and untracked paths, including local deletions. It never substitutes
HEAD^ or an empty scope. Actual Git discovery failures still fail the command. Path matching
only selects reminders; also review affected callers of shared code.

`AGENTS.md` defines proportionate evidence, including forbidden actor/instance
cases and refusals without business-state changes. Security journaling is
allowed on refusal. Documentation changes need accuracy and link checks.

## Body-read regression guard

The architecture check rejects direct `json`, `text`, `arrayBuffer`, `blob`,
`bytes` and `formData` calls on receivers proven to be the built-in DOM
`Request`. Use `readBoundedRequestBody` or `readBoundedFormData` from
`@bernouy/http-runner`. The bounded-reader implementation owns its exception.
Responses, same-named domain methods and shadowed names remain valid.

The rule is deliberately limited: unresolved/`any` receivers, extracted
methods and low-level stream consumption still need review. It is not a
complete denial-of-service detector. Blanket bans on synchronous crypto and
heuristic Mongo-loop rules remain deferred until their cases are precise.

## Work and timing budgets

`verify` runs ordinary tests (including `tests/performance/repository` and
Content rendering budgets), then typechecks `tests/performance/tsconfig.json`
and runs the supplementary microbenchmarks in `tests/performance/benchmarks/run.ts`.
That suite uses synthetic collection/compiler fixtures, read-only upgrade analysis and resolved
Gateway contracts. Upgrade scans are capped at 500 Pages per batch and two
passes. The validation growth ceiling is 12x for 4x the Blocs and examples;
measured ratios depend on the current synthetic fixture and host.
This is a regression ceiling, not a linear-growth guarantee.

`bun run tests/performance/delivery/run.ts` builds two local candidate images,
checks their component/API/revision labels and runs an isolated Docker/Mongo
journey. Supplying both image variables documented in
[instance tests](../../tests/integration/instance/README.md) reuses images;
partial sets and revisions other than HEAD fail. Labels identify the commit;
local uncommitted source is included when building images in this checkout.

The journey measures warm literal Pages, image-capable Pages and immutable
Bloc styles. It gates Mongo operations, internal HTTP requests and response bytes,
records p50 elapsed response-body time, and executes 420 requests over 126
seconds across three Pages and administrator reads with the Edge cache disabled,
then repeats with it enabled. The previous delivery ceilings remain 26/30/22 Mongo
operations after charging the separately verified shared-routing floor of seven
indexed reads: one domain, two instance records and four revision/fence reads.
The fixture asserts the four revision/fence operations for every ingress.
Internal HTTP requests remain bounded to 5, with a 512 KiB response ceiling. Unused roots
must perform neither delegation writes nor a standalone closure control call.
Cache-hit probes require 100% hits, exactly one routing HTTP call and seven
routing metadata reads per request, with zero Content reads or queued telemetry.
Routing forwards the active diagnostic request ID so its work is charged to the
originating ingress independently of its signed machine request identity.
Reports include counts by collection and internal route. Background journal
activity can add fractional operations to these averages. Latency remains
diagnostic to avoid hardware-dependent CI failures.

Profiling is enabled only in the disposable Mongo container. Background Docker
healthchecks are disabled in this measured fixture; explicit readiness probes
still run, and the other integration fixtures keep normal healthchecks. A test-only
preload records both fetch controls and the native pinned HTTP business
transport. Its regression uses the actual transport, including a streamed body;
records contain paths only, never query parameters, tokens or bodies. Reports live in
immutable `artifacts/performance/supplementary/<run-id>/` directories, with
sealed JSON and HTML, source provenance and candidate image identities. No public
Repository is used. Supplementary journeys do not grant capability coverage.

The zero-503 prerequisite caches capability descriptions per instance and
selection revision. Misses reread that revision after the through-Edge call;
changed revisions and failures are never cached. Verified missing selections
are cached as negative descriptions under their revision; saturated pending
coordination bypasses storage rather than making the Page unavailable. Retention is capped at 64
entries/256 KiB of serialized metadata, 64 KiB per entry, 16 distinct pending
loads and 256 waiters per load. Immutable snapshots classify Page access;
actual invocations retain fresh authorization. Dynamic indexing remains live
and private/no-store, including after a capability restriction.

`verify` runs the CLI browser smoke and this Docker budget journey locally
with candidate images. See [Content delivery](../architecture/content-delivery.md#shared-edge-response-cache)
for the implemented response cache, invalidation and process-local limits.


The Docker freshness journey also primes anonymous Page hits before collection
installation/configuration, a reviewed selection-grant operation and Files
completion/rename/visibility/deletion. It checks a revoked grant refuses a real
command without changing its state, invalid configuration is unchanged, and
private/deleted file bytes are not returned by fresh origin reads. These checks
run in the delivery budget and in `tests/integration/instance/freshness.docker.test.ts`.
The fixture uses the mounted HTTP and MCP bindings; it does not bypass authority
or publish to the public Repository.
