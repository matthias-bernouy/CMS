# Thirty Cold Initialization Calls — 2026-11-17

All 30 sequential Mossa initialization-plan calls succeeded, with no 502,
timeout, declared business error or failed state postcondition. Latency was not
uniformly five seconds: the first four calls took 9.53, 9.94, 10.64 and 7.26 seconds.
The following 26 calls were between 5.13 and 5.52 seconds.

No application code was changed or deployed for this test. It reused the retained
images from the [cold optimization campaign](initialization-plan-cold-optimization-2026-11-17.md),
not the rejected [document-reuse experiment](admission-document-reuse-2026-11-17.md).

## Protocol And Latency

The run used pinned `ulvia/mossa@1.18.0`, bootstrap `administration`, digest
`sha256:c9e14a512f09aa4f680ff4447cb5253040533d9e17c3756738696089535de41a`.
It executed 15 HTTP calls followed by 15 MCP calls to
`ulvia/cms.installations:initialization.plan`, without plan warm-ups.

The Provider restarted before every measured call. Invocation evidence confirms
30 distinct process epochs and 30 successful first-in-process target invocations,
with complete response consumption and instrumentation. Setup includes separate,
unmeasured restart calibration and fixture restoration. Restart time is outside
client invocation latency. The same review assertions and business-state checks
as the ordinary scenarios ran for every sample; the site remained pending with
no Pages or collections installed. Only calibrated runtime revision changes were
permitted across restarts.

The Edge, MongoDB and host/filesystem caches remained active across the series.
This is Provider-cold testing, not 30 brand-new deployments. The fixed HTTP-then-MCP
order also prevents attributing every difference between bindings to transport.

| Client sample set | Count | Minimum | Median | p95 | Maximum |
| --- | --- | --- | --- | --- | --- |
| HTTP | 15 | 5.13 s | 5.30 s | 10.64 s | 10.64 s |
| MCP | 15 | 5.17 s | 5.38 s | 5.52 s | 5.52 s |
| Combined ordered series | 30 | 5.13 s | 5.35 s | 9.94 s | 10.64 s |

Percentiles use nearest rank; with 15 samples, p95 equals the maximum. All four
calls above six seconds are included in these statistics. One exceeded ten
seconds. Thirty successes provide useful local evidence, not a production
availability or tail-latency guarantee. Concurrency was not exercised here.

The slow early samples showed increased metadata admission, bundle-read and
Content-preview times while work counts stayed near 235 MongoDB operations and
251 internal requests for HTTP. For example, the first call recorded about
1.66 s in `verify.metadata`, 2.57 s in `verify.metadataJson` and 2.03 s in preview;
call five recorded approximately 0.68 s, 1.68 s and 1.04 s. Inclusive phase times
overlap and must not be added. These observations do not establish the cause of
the early slowdown.

## Memory Observations

Cgroup-v2 current usage, peak usage, configured limit and OOM-kill counters were
read after each response and trace collection, outside client timing. All 90
component observations were available, and limits matched the declared profile.
These counters include the container's processes, file cache and instrumentation;
they are not application heap/RSS or request-only allocation measurements.

| Component | First / last current | Current min–max | Highest observed peak | Limit |
| --- | --- | --- | --- | --- |
| Provider | 1,369.8 / 671.6 MiB | 662.4–1,814.9 MiB | 1,907.4 MiB | 2,048 MiB |
| Edge | 87.1 / 78.6 MiB | 57.9–95.5 MiB | 143.8 MiB | 1,024 MiB |
| MongoDB | 239.3 / 388.4 MiB | 239.3–484.0 MiB | 651.0 MiB | 1,024 MiB |

No OOM kill was observed. The Provider peak reached about 93% of its test limit
(1.86 GiB of 2 GiB), so this run does not demonstrate generous memory headroom.
Its restarts prevent a conclusion about long-lived Provider heap growth. The
shared Edge/Mongo observations likewise do not constitute a leak diagnosis.
The early calls also had higher Provider memory usage; causality between memory
and latency was not established.

## Artifacts And Reproduction

```sh
bun run tests/performance/assessment/stability.ts 0.1.0-initialization-cold-2
```

- Invocation report:
  `artifacts/performance/runs/20261117T181311Z-4b12e777358e-ab4bb576/`.
- Memory companion:
  `artifacts/performance/stability/20261117T181311Z-4b12e777358e-ab4bb576/`.

The normal report seal and separate memory SHA-256 seal were verified. Memory
records link to the invocation report by run ID and trace ID. The captured
source fingerprint is
`17631b15e8ff5dab9fa68244138988de418d163165ffb6802b9a3312ff664690`;
no source changes were detected during the run. Revision:
`4b12e777358e302d23d0d6647a6445e5ed3530a6`, with a dirty checkout.

Exact reused images:

- Edge: `sha256:2b8f97257dcbf32abba5afe00486eabefc363ad015f68ce537b70624e67c6771`.
- Provider: `sha256:f28c784f62212f204419cdeda31a5b54918af36e66c5561307bc5e0f9ff0185e`.

The profile remained Bun 1.4.4/MongoDB 7.0.37 on a Ryzen 7 6800H, with Provider
two CPUs/2 GiB, Edge one CPU/1 GiB and MongoDB two CPUs/1 GiB.

Both scenario business results passed. The assessment remains failed: this
focused run covers only the two cold obligations out of ten, has no compatible
30-sample reference, and exceeds six existing budgets. No budget was relaxed.
The runner's exit status follows that assessment status, not just the 30/30
business-success count. It does not certify the paused exhaustive assessment.

The test-only runner reuses the ordinary scenario implementation with an optional
cold sample count and measurement observer. Default campaigns keep three cold
samples and their original collector. The shared factory remains cohesive at
187 lines despite the file-size advisory. Static checks and performance-harness
typechecking passed. Global `verify` was attempted but remained unsuccessful in
the sandbox, including unit/performance failures and a Docker stage unable to
access the daemon. The actual 30-call campaign used the required local Docker
access. A separate performance-harness test run completed with 79 passes and
one failure: the existing pinned DELETE transport test received an empty body
instead of 45 bytes. That path is unrelated to these initialization-plan calls;
no transport correction was made in this measurement-only task.
