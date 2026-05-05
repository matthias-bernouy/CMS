# Perf suite

End-to-end browser-based perf regression tests. Each run spins up a fresh
MongoDB database (`p9r_perf_test`, dropped at start), boots the Cms
server in-process, launches Playwright's chromium, opens a blank editor page,
and runs each scenario.

## Running

```bash
bun run perf                          # run all scenarios, compare to baseline
bun run perf -- --save                # overwrite baseline with current results
bun run perf -- --only=hover-cost     # run a subset (comma-separated)
bun run perf -- --headed              # show the browser window
```

Exits with code 1 when at least one REGRESSION is flagged.

Requirements: local MongoDB on 27017, and `bunx playwright install chromium`
(one-time).

## Adding a scenario

Scenarios live in `scenarios.ts`. Each one is a self-contained string that
evaluates to an `async () => ({ [metric]: number })`. The runner wraps it as
`(fn)()` and serializes the returned metrics into the report.

```ts
const myScenario = () => `
async () => {
    const now = () => performance.now();
    const t = now();
    // …do stuff…
    return { myMetricMs: +(now() - t).toFixed(3) };
}
`;

export const SCENARIOS: Scenario[] = [
    // …
    { name: "my-scenario", run: myScenario() },
];
```

Optional per-metric tolerance override:

```ts
{ name: "my-scenario", run: myScenario(), tolerances: { myMetricMs: 0.50 } }
```

## Regression detection

A metric flags REGRESSION when **both** are true:

- it is more than `tolerance` (default 30 %) slower than the baseline
- the absolute delta is ≥ 1 ms (`MIN_ABS_DELTA_MS` in `run.ts`)

The absolute floor avoids flagging noise on already-cheap operations
(sub-ms timings jitter by 50–100 %).
