# Image performance verification

This harness measures Source image optimization without adding private images to
the repository. It creates deterministic JSON artifacts, compares an original
baseline and the real interceptor with explicit gates, and verifies responsive
selection in real Chromium.

## Representative corpus

Keep the corpus outside the repository and pass an absolute path. The loader
walks nested directories, accepts bounded raster images, and rejects invalid
files and SVG. Artifacts contain anonymous IDs, dimensions, media types, byte
counts, and an aggregate fingerprint; they never contain a path or filename.

```bash
export IMAGE_CORPUS_DIR=/absolute/private/image-corpus

bun run quality/image-performance/benchmark/run.ts \
  --label baseline \
  --adapter original \
  --output /tmp/image-performance-baseline.json

bun run quality/image-performance/benchmark/run.ts \
  --label candidate \
  --adapter module:quality/image-performance/core/sourceImagesAdapter.ts \
  --output /tmp/image-performance-candidate.json

bun run quality/image-performance/compare/run.ts \
  --baseline /tmp/image-performance-baseline.json \
  --candidate /tmp/image-performance-candidate.json \
  --output /tmp/image-performance-comparison.json
```

Use exactly the same corpus and CLI configuration for both runs. The comparator
rejects different fingerprints, configurations, or listing matrices.

Default gates require:

- at least 80% savings for median and p95 listing bytes;
- zero candidate warm encodes and warm original reads;
- zero image and corpus transformation failures;
- truthful width descriptors;
- no excess per-instance cold encodes;
- a working original adapter rollback;
- aggregate candidate foreground p95 at or below
  `baseline p95 * 1.05 + 10 ms`;
- candidate cold-sample foreground p95 at or below 75 ms.

Override the absolute ceiling only when the environment has a separately
justified budget. Artifacts retain p50, p95, and p99 for every sample and the
aggregate report. The explicit release gate uses p95.

The matrix covers 30vw and 100vw layouts, DPR 1 and 2, configured concurrent
users, cold and warm phases, 12 cards, CPU time, peak RSS, first/all image
latency, and normal foreground request latency.

## Adapters

`original` is the unoptimized rollback baseline. Release gates use the actual
Source image interceptor:

```text
module:quality/image-performance/core/sourceImagesAdapter.ts
```

Another implementation may export `createImagePerformanceAdapter()` and satisfy
the contract in `core/adapter.ts`.

## Browser and smoke tests

The browser verifier bundles the real
`@bernouy/cms-source-images/browser` helper, starts a private fixture server, and
runs Chromium. It asserts `currentSrc` for 30vw and 100vw at DPR 1 and 2,
auto-sizes and the eager 100vw fallback, safe activation order, exactly one
derivative request per image, no original-plus-variant fetch, and a CLS ceiling
of 0.001.

```bash
bun run quality/image-performance/browser/run.ts \
  --output /tmp/image-performance-browser.json

bun test quality/image-performance/tests
```

For a fast harness-only smoke test, use an explicit synthetic corpus:

```bash
bun run quality/image-performance/benchmark/run.ts \
  --label smoke \
  --adapter original \
  --synthetic 2 \
  --repetitions 1 \
  --users 1 \
  --foreground-requests 4 \
  --output /tmp/image-performance-smoke.json
```

Synthetic output proves the harness, not release performance. Activation gates
must use the same representative read-only Commerce corpus for baseline and
candidate.
