# Public Page Cache Measurements

This supplementary journey measures public HTML processing without changing runtime
cache policies. It complements capability benchmarks; it grants no capability
coverage credit. Only disposable local instances are mutated or restarted.

```sh
bun run tests/performance/public-cache/run.ts --list
bun run tests/performance/public-cache/run.ts --scenario public.warm
bun run tests/performance/public-cache/run.ts --scenario public.context-idle --scenario public.styles-after-restart
bun run tests/performance/public-cache/run.ts --samples 30 --epochs 3
```

Exact IDs are validated before building images or acquiring Docker. Repeated IDs
are deduplicated in plan order. `--samples` controls repeated warm/reload/private
requests (1–200); `--epochs` controls independent expiry, idle, restart, mutation
and asset trials (1–30). Defaults are 30 and 3. Every cold trial has five separate
following reads. Thirty cold trials can take over half an hour; select only the
needed scenarios. This command is separate from `verify` and the exhaustive
capability campaign. Ordinary verification checks its types and harness tests,
without performing these timed journeys.

Both candidate images can be supplied through `ULVIA_MCP_EDGE_DOCKER_IMAGE` and
`ULVIA_MCP_PROVIDER_DOCKER_IMAGE`; both must carry the current HEAD revision.
Without overrides, the command builds local `0.1.0-public-cache` images after
bootstrap and browser preparation. No publication or deployment occurs.

| Scenario | Preparation and measured operation |
| --- | --- |
| `public.warm` | Prime, then repeated anonymous cache hits |
| `public.reload.no-cache` | Same page revalidated with request `Cache-Control: no-cache` and `Pragma: no-cache` |
| `public.reload.max-age-zero` | Same page with request `Cache-Control: max-age=0` |
| `public.response-expiry` | Prime, no tenant traffic for 17 seconds, first request and five following reads |
| `public.context-idle` | Prime, no tenant traffic for 65 seconds, first request and five following reads |
| `public.edge-restart` | Restart only Edge; global readiness, first page and five following reads |
| `public.provider-edge-restart` | Restart Provider and Edge; persisted Mongo retained; first page and following reads |
| `public.write-invalidation` | Warm two independent Edges, write through MCP/Gateway, measure fresh reads on both |
| `public.styles-after-restart` | Capture exact HTML/CSS URLs, restart Provider/Edge, replay old and new styles |
| `public.private-response` | Authenticated draft/public reads stay private; anonymous draft access is refused |

The expiry/idle scenarios observe HIT/MISS rather than requiring today's short
lifetimes. Restart trials compare exact HTML bytes; differences are findings,
never normalized away. Stylesheet failures are retained and fail the journey.
A failed scenario does not prevent unrelated selected scenarios from running.

Measurements use HTTP/1.1 keep-alive over a loopback TCP relay into the real
Edge/Gateway/Provider/Mongo path. They do not measure Caddy, TLS, internet latency,
full browser loading, production pages, OS cold caches or cold Mongo disk data.
The published fixture uses the existing smoke collection; this is not a claim
about all site sizes, dynamic data, cache invalidations or 24-hour retention.
Authentication and writes use real contracts, without direct persistence edits.
Reload scenarios require `REVALIDATED` after the revision-aware cache change;
the original baseline retains its historical `BYPASS` assertions and measurements.

Each timed attempt retains headers/first-byte/full-body times, status, cache
outcome, exact SHA-256 body identity, and request-correlated internal HTTP/Mongo/log
work. Bodies are bounded; credentials and request cookies are never serialized.
Priming, Docker commands, readiness, work collection and idle waits are outside
client latency. Warm and reload series collect request-correlated counters in
one batch after the series, so Docker inspection does not artificially space
requests until a short-lived reference expires. This timing profile is recorded
as `stable-series-batched-work-v1`; compare matching profiles. Request IDs exclude
unrelated background work. Container memory,
peak/OOM counters and resource limits are observed separately; these are cgroup
observations, not per-process heap attribution or a 24-hour leak test.

P50/P95 are reported per scenario and phase; failed timed attempts remain in the
distributions. Unavailable header/first-byte timings stay unavailable. Fewer than
20 samples carry an explicit small-sample warning. CPU limits do not eliminate
shared-host noise, so these diagnostics are not certified regression references.
No absolute latency budget is invented to make the current code pass.

A unique final JSON/HTML report and SHA-256 seal use the existing supplementary
history under `artifacts/performance/supplementary/<run-id>/`. Raw bodies, readings,
findings, image identities, source digest and scenario selection are retained.
Progress checkpoints under `artifacts/performance/public-cache-progress/` preserve
completed attempts if interrupted; they are explicitly incomplete and unsealed.
Generated reports remain ignored by Git.
