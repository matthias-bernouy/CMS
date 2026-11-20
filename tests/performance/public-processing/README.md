# Public processing diagnostics

Run `bun run tests/performance/public-processing/run.ts` from the workspace root.
Docker is required for a disposable Mongo 7.0.37 container. No production instance
is accessed. This command is separate from `verify` and capability coverage.

The fixed workload records 100 raw samples after 20 warm-ups, P50/P95, source
identity and exact output identities through sealed supplementary history. It
measures two dependency passes over a 200-Bloc catalogue with 20 used Blocs,
a 1,500-node static text pass, a complete common document render with 20 Cards
and 500 paragraphs, and the real Mongo resource-revision read. Fixture setup and
output verification are outside the timed sections. Every sample validates its
output; every revision sample retains all four Mongo fence reads.

Content uses actual DOM/rendering code with deterministic injected catalogue and
view readers. Mongo uses the real driver and an isolated disposable database.
These component timings are not HTTP endpoint latency. Compare matching workload
and environment across builds; retain every run, including failures and noisy
results. Use the public-cache journey separately for actual HTTP/cache evidence.
