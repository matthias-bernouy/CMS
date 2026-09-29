# Provider image performance verification

This harness compares original provider files with the production gateway image
recipe. It measures the real gateway HTTP handlers, image service, Sharp
transformer, and local derivative store. Chromium loads the Delivery production
component bundle and verifies its `/.cms/media` and `/.cms/image` URLs.

## Representative corpus

Keep the corpus outside the repository and pass an absolute directory. The
loader accepts bounded static raster images using the gateway inspection
rules. Artifacts contain anonymous IDs, dimensions, byte counts, and an
aggregate corpus fingerprint; they do not contain paths or original bytes.

```bash
export IMAGE_CORPUS_DIR=/absolute/private/image-corpus
export IMAGE_PERFORMANCE_SUITE_ID=provider-images-release
export IMAGE_PERFORMANCE_APPROVED_CORPUS_FINGERPRINT=<lowercase-64-character-sha256>
export IMAGE_PERFORMANCE_MAX_PEAK_RSS_BYTES=<positive-byte-budget>
export IMAGE_PERFORMANCE_MAX_SCENARIO_CPU_MS=<positive-millisecond-budget>

bun run quality/image-performance/benchmark/run.ts \
  --label baseline \
  --adapter original \
  --output /tmp/image-performance-baseline.json

bun run quality/image-performance/benchmark/run.ts \
  --label candidate \
  --adapter module:quality/image-performance/benchmark/adapters/gatewayImagesAdapter.ts \
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

Run both benchmark commands with the same corpus and configuration. Release
comparison requires at least 12 approved images, the canonical width ladder,
five repetitions, both one and four concurrent users, and explicit resource
budgets. The comparison checks code and recipe fingerprints, the exact candidate
artifact used by Chromium, raw sample matrices, and evidence age.

The gateway reauthorizes and rereads provider bytes before each derivative
cache lookup. The read gate therefore expects one provider invocation per image
request, including warm requests. The encode gate expects one cold transform per
distinct derivative key and no warm transforms. Other gates cover response
formats and dimensions, exact original passthrough, byte savings, image
failures, foreground latency, CPU, RSS, and browser request/response evidence.

The browser matrix covers 30vw and 100vw layouts, DPR 1 and 2, eager and lazy
loading, unresolved bindings, image element recycling, and the original-file
baseline. A baseline page uses direct original URLs; a candidate page activates
the same production bundle with `data-cms-src` provider media URLs. Both paths
must avoid duplicate requests and layout shifts.

For a quick synthetic smoke run, use the gateway adapter with `--synthetic 2`,
`--repetitions 1`, `--users 1`, and `--foreground-requests 4`, then run the
Chromium command above and `bun run quality/image-performance/compare/smoke.ts`
with the candidate and browser artifact paths. CI runs this profile. Synthetic
evidence cannot satisfy the release comparison.
