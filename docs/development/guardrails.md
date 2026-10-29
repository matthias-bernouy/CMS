# Security And Performance Guardrails

These controls supplement review; passing them does not establish that all
security or performance properties have been checked.

## Fast checks and evidence

`bun run check:all` prints check results first, then changed-file guidance.
Errors are always visible. Other advisory findings are counted unless they
concern changed paths. `--verbose` prints complete tool output. Full text and
JSON reports are saved to `artifacts/check-all/latest.{txt,json}`; a report
write failure fails the command.

Local scope includes staged, unstaged and untracked files. Use
`bun run check:all --base <ref>` for committed work: its scope is the merge base
through the working tree, including untracked files. An unavailable or unrelated base (including a force-push) widens scope to all
indexed and untracked paths, including local deletions. It never substitutes
HEAD^ or an empty scope. Actual Git discovery failures still fail the command. Path matching
only selects reminders; also review affected callers of shared code.

`AGENTS.md` defines proportionate evidence, including forbidden actor/instance
cases and refusals without business-state changes. Security journaling is
allowed on refusal. Documentation changes need accuracy and link checks.

## Body-read regression guard

`check:architecture` rejects direct `json`, `text`, `arrayBuffer`, `blob`,
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
Content rendering budgets), then the checked `test:performance` suite.
That suite uses current examples, read-only upgrade analysis and resolved
Gateway contracts. Upgrade scans are capped at 500 Pages per batch and two
passes. The validation growth ceiling is 12x for 4x the Blocs and examples;
the new valid fixtures measure about 8–9x, unlike the removed Page fixtures.
This records a baseline, not a linear-growth guarantee.

`bun run test:performance:delivery` builds three local candidate images,
checks their component/API/revision labels and runs an isolated Docker/Mongo
journey. Supplying all three image variables documented in
[instance tests](../../tests/integration/instance/README.md) reuses images;
partial sets and revisions other than HEAD fail. Labels identify the commit;
local uncommitted source is included when building images in this checkout.

The journey measures warm literal Pages, image-capable Pages and immutable
Bloc styles. It gates Mongo operations, internal HTTP requests and response bytes,
records p50 elapsed response-body time, and executes 420 requests over 126
seconds across three Pages and administrator reads with the Edge cache disabled,
then repeats with it enabled. The mean origin ceilings are 26/30/22 Mongo
operations and 5 internal HTTP requests, with a 512 KiB response ceiling. Unused roots
must perform neither delegation writes nor a standalone closure control call.
Cache-hit probes assert 100% hits, zero internal calls and zero Mongo work.
Reports include counts by collection and internal route. Background journal
activity can add fractional operations to these averages. Latency remains
diagnostic to avoid hardware-dependent CI failures.

Profiling is enabled only in the disposable Mongo container. Background Docker
healthchecks are disabled in this measured fixture; explicit readiness probes
still run, and the other integration fixtures keep normal healthchecks. A test-only
preload records both fetch controls and the native pinned HTTP business
transport. Its regression uses the actual transport, including a streamed body;
records contain paths only, never query parameters, tokens or bodies. Reports live in
`artifacts/delivery-performance/latest.json`. No public Repository is used.

The zero-503 prerequisite caches capability descriptions per instance and
selection revision. Misses reread that revision after the through-Edge call;
changed revisions and failures are never cached. Verified missing selections
are cached as negative descriptions under their revision; saturated pending
coordination bypasses storage rather than making the Page unavailable. Retention is capped at 64
entries/256 KiB of serialized metadata, 64 KiB per entry, 16 distinct pending
loads and 256 waiters per load. Immutable snapshots classify Page access;
actual invocations retain fresh authorization. Dynamic indexing remains live
and private/no-store, including after a capability restriction.

`verify:full` runs the CLI browser smoke and this Docker budget journey. PR/push
CI on `master` and `codex/alpha-v0`, plus nightly/manual smoke reuse explicitly built candidate
images. See [Content delivery](../architecture/content-delivery.md#shared-edge-response-cache)
for the implemented response cache, invalidation and process-local limits.


The Docker freshness journey also primes anonymous Page hits before collection
installation/configuration, a reviewed selection-grant operation and Files
completion/rename/visibility/deletion. It checks a revoked grant refuses a real
command without changing its state, invalid configuration is unchanged, and
private/deleted file bytes are not returned by fresh origin reads. These checks
run in the delivery budget and in `tests/integration/instance/freshness.docker.test.ts`.
The fixture uses the mounted HTTP and MCP bindings; it does not bypass authority
or publish to the public Repository.
