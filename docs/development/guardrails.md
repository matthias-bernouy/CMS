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
through the working tree, including untracked files. Failed Git discovery
fails the command instead of claiming an empty review scope. Path matching
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
Bloc styles. It gates Mongo commands, internal fetches and response bytes,
records p50 elapsed response-body time, and executes 200 anonymous views in
one minute without 503. The initial mean budgets are 30/35/30 Mongo commands
and 6/7/6 internal fetches respectively, with a 512 KiB response ceiling.
The asset budget includes Provider control-database reads, which were absent
from the initial 20-command estimate. Reports include counts by collection.
Background journal activity can add fractional operations to these averages.
Latency remains diagnostic to avoid hardware-dependent CI failures.

Profiling is enabled only in the disposable Mongo container. Background Docker
healthchecks are disabled in this measured fixture; explicit readiness probes
still run, and the other integration fixtures keep normal healthchecks. A test-only
preload records outbound paths, never tokens or bodies. Reports live in
`artifacts/delivery-performance/latest.json`. No public Repository is used.

The zero-503 prerequisite caches capability descriptions per instance for
five seconds, coalesces loads and never caches failures/misses. Retention is
capped at 64 entries/256 KiB of serialized metadata, 64 KiB per entry, with 16 pending distinct loads.
Snapshots are immutable. This cache only classifies Page access; actual
invocations retain their existing authorization checks. Classification may lag
a selection change by five seconds. No SSR query data is introduced.

`verify:full` runs the CLI browser smoke and this Docker budget journey. PR/push
CI on `codex/alpha-v0` and nightly/manual smoke reuse explicitly built candidate
images. Edge response caching, cache-hit budgets and zero Provider/Mongo work
per hit remain part of the subsequent delivery performance phases.
