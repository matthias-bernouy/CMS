# Image performance verification

This harness measures Source image optimization without adding private images to
the repository. It creates deterministic JSON artifacts, compares an original
baseline and the real interceptor with explicit gates, and verifies responsive
selection in real Chromium.

## Representative corpus

Keep the corpus outside the repository and pass an absolute path. The loader
walks nested directories, uses the production Sharp inspection rules, accepts
bounded static raster images, and counts rejections by closed reason. Artifacts
contain anonymous IDs, auto-oriented dimensions, media types, byte counts,
exact-passthrough booleans, and one aggregate corpus fingerprint. They never
contain a path, filename, or per-image digest.

```bash
export IMAGE_CORPUS_DIR=/absolute/private/image-corpus
export IMAGE_PERFORMANCE_SUITE_ID=source-images-release-20260725
# Set these from the audited corpus record and the target runtime budget:
export IMAGE_PERFORMANCE_APPROVED_CORPUS_FINGERPRINT=<lowercase-64-character-sha256>
export IMAGE_PERFORMANCE_MAX_PEAK_RSS_BYTES=<positive-byte-budget>
export IMAGE_PERFORMANCE_MAX_SCENARIO_CPU_MS=<positive-millisecond-budget>

bun run quality/image-performance/benchmark/run.ts \
  --label baseline \
  --adapter original \
  --output /tmp/image-performance-baseline.json

bun run quality/image-performance/benchmark/run.ts \
  --label candidate \
  --adapter module:quality/image-performance/core/sourceImagesAdapter.ts \
  --output /tmp/image-performance-candidate.json

bun run quality/image-performance/browser/run.ts \
  --suite-id "$IMAGE_PERFORMANCE_SUITE_ID" \
  --candidate /tmp/image-performance-candidate.json \
  --output /tmp/image-performance-browser.json

bun run quality/image-performance/compare/run.ts \
  --baseline /tmp/image-performance-baseline.json \
  --candidate /tmp/image-performance-candidate.json \
  --browser /tmp/image-performance-browser.json \
  --output /tmp/image-performance-comparison.json
```

Use exactly the same corpus and CLI configuration for both runs. The comparator
rejects different fingerprints, configurations, suite ids, code revisions, or
listing matrices. It also rejects synthetic corpora, evidence older than six
hours by default, a viewport other than the canonical 1000 px, a corpus whose
anonymous SHA-256 fingerprint was not explicitly approved, and code or
production browser bundles that changed between capture and comparison.

The suite id is an operator-readable correlation id, not a signature. Artifacts
record deterministic hashes of the relevant workspace code, recipe, benchmark
configuration, anonymous corpus fingerprint, adapter identity, candidate
evidence, production component entry, and enabled/disabled bundles. Chromium's
reported version is also recorded. These fields make accidental reuse or
mix-and-match evidence fail closed; they are traceability evidence, not a
cryptographic attestation against a malicious artifact author.
The comparison artifact records hashes of all three input artifacts, the suite,
code and corpus fingerprints, every effective threshold, and its generation
time.

Default gates require:

- at least 80% savings for median and p95 listing bytes;
- zero candidate warm encodes and warm original reads;
- zero image and corpus transformation failures;
- truthful width descriptors;
- exactly one real transform and one original read per distinct derivative key
  in a deliberately overlapping cold wave;
- exact original bytes for every baseline and candidate passthrough probe;
- normalized 64 px sRGB thumbnail MAE at or below 0.15; this is a deliberately
  loose catastrophic-output detector, not a subjective image-quality score;
- a complete Chromium baseline/candidate matrix with truthful `currentSrc`,
  exactly one expected request per image, no double fetch, and safe activation
  order;
- zero fetch and no `src`/`srcset` activation for empty or unresolved bindings;
- safe node recycling that preserves subsequently authored `sizes`, plus a
  flag-off rollback that serves only the immutable original;
- candidate CLS at or below 0.001 and no baseline-relative regression above
  0.001;
- candidate p95-of-scenario-p95 at or below
  `baseline p95 * 1.05 + 10 ms`;
- candidate cache-cold scenario foreground p95 at or below 75 ms.
- peak process RSS and per-scenario CPU at or below the explicit budgets supplied
  for the target release environment.

Override the absolute ceiling only when the environment has a separately
justified budget. Artifacts retain p50, p95, and p99 for every scenario. The
summary and release gate use the p95 of per-scenario p95 values; they do not pool
raw requests from phases whose duration can differ.

The matrix covers 30vw and 100vw layouts at the canonical 1000 px viewport, DPR
1 and 2, configured concurrent users, cache-cold and cache-warm phases, 12 cards,
CPU time, peak RSS, first/all image latency, and normal foreground request
latency. The candidate uses the production
opaque-key local filesystem cache in a temporary directory that is deleted after
the run. A 15 ms local upstream delay deliberately overlaps identical cold
requests so the single-flight counters cannot pass by scheduling luck. Encode
counts wrap actual transformer calls rather than request outcomes. Foreground
samples continuously traverse Source resolution,
authorization, the configured endpoint interceptor, upstream execution, and JSON
projection while image requests remain active; `--foreground-requests` is the
minimum sample count rather than a one-off concurrent burst.

Cache-cold means the disposable derivative cache is recreated. Corpus
inspection has already loaded Sharp/libvips in both adapters, so this harness
does not claim to measure a fresh CMS process start.

Both adapters traverse the real `handleSourceRequest` path, but the representative
image bytes and upstream are local. Latencies measure the local CMS/Sharp/cache
path and must not be presented as Supabase network latency.

## Adapters

`original` is the unoptimized pre-activation baseline and never sends reserved
CMS transform parameters. Release gates use the actual Source image interceptor:

```text
module:quality/image-performance/core/sourceImagesAdapter.ts
```

The release CLI rejects every other module specifier. This prevents a compatible
test double from impersonating the production candidate in release evidence.

## Browser and smoke tests

The browser verifier builds the real Delivery `component.client.ts` production
entry twice: both public and private responsive images disabled for the
baseline, then public enabled and private disabled for the candidate. Every
fixture image is explicitly marked with `data-source-image-access="public"`.
The verifier loads those `component.js` IIFEs and lets the fixture call only
`window.p9r`. Chromium records the public baseline and candidate for 30vw and
100vw at DPR 1 and 2, lazy auto-sizes and the eager 100vw fallback. The artifact
contains each `currentSrc`, network request, activation order, and CLS value.
It also records empty and unresolved source/width/height/sizes probes and a
detached recycled-node probe. Cleanup must preserve `src`, `srcset`, `sizes`,
`width`, and `height` values subsequently owned by other code. The comparator
recomputes browser findings and benchmark summaries from raw samples, rejects
stored-summary drift, and treats a missing browser artifact as a hard error.

```bash
bun test quality/image-performance/tests
```

For a fast harness-only smoke test, use an explicit synthetic corpus:

```bash
bun run quality/image-performance/benchmark/run.ts \
  --label smoke \
  --adapter original \
  --suite-id local-smoke \
  --synthetic 2 \
  --repetitions 1 \
  --users 1 \
  --foreground-requests 4 \
  --output /tmp/image-performance-smoke.json
```

CI additionally captures the real candidate and Chromium artifacts, then runs
`quality/image-performance/compare/smoke.ts` so failed images, warm work,
single-flight, fidelity, and browser evidence cannot be ignored. Synthetic
output proves the harness, not release performance. Activation gates must use
the same explicitly approved representative read-only Commerce corpus for
baseline and candidate.
