# Cold Initialization Plan Optimization — 2026-11-17

This local assessment follows the [warm-path optimization](initialization-plan-optimization-2026-11-17.md).
It covers `ulvia/cms.installations:initialization.plan` using the pinned
`ulvia/mossa@1.18.0` fixture and real Edge, Provider and MongoDB containers.
No public contract, timeout or concurrent-operation policy changed. Nothing was
published or deployed to a production site.

## Measured Result

| Client scenario | Before p50 / p95 | Final p50 / p95 |
| --- | --- | --- |
| Cold HTTP | 6,397 / 6,402 ms | 5,205 / 5,789 ms |
| Cold MCP | 6,449 / 6,481 ms | 5,324 / 5,500 ms |
| Warm HTTP | 206 / 220 ms | 197 / 257 ms |
| Warm MCP | 243 / 287 ms | 268 / 280 ms |

Cold medians improved by about 19% over HTTP and 17% over MCP. Each Mossa row
contains three measured requests per run. These small samples do not establish
production tail-latency guarantees. Cold scenarios restart the Provider before
each request; restart time itself is outside client invocation latency.
The subsecond cold target is not achieved.

Cold HTTP MongoDB work fell from 332 to 235 operations per invocation, including
a reduction from 265 to 168 business operations. Examined documents fell from
446 to 349. Instrumented contract lookups fell from 94 to 24. MCP totals fell
from 341 to 244 MongoDB operations. The 21 Pages still use 42 ordinary updates;
no publication, link or capability validation was removed.

The median observed HTTP preview phase fell from 1,419 to 1,037 ms. Its final
three durations were 1,037, 1,301 and 1,010 ms. Inclusive phases overlap and must
not be added. Internal transport work remains: cold HTTP still made 251 internal
requests and recorded 10,025,768 response bytes across hops; MCP made 264 requests.
These are hop counts/bytes, not unique payloads or external bandwidth.

## Changes And Trust Boundaries

- Page and Bloc grammar validation reuse their already checked DOM for root and
  managed-native checks. The asynchronous capability pass checks binding schemas
  without repeating the complete structural validation. Stored-markup refusal,
  sanitization, normalized parsing and expanded-document checks remain in place.
- CSS color classification reuses repeated identifier results within one
  validation, bounded to 256 names of at most 256 characters. It still uses the
  same CSS grammar. Each alias declaration is checked once before graph traversal.
- A verified singleton collection with no dependencies reuses its local admission
  evidence for resource isolation. Admission already checked its unique resources,
  local uses, examples, states, theme references and SVG declarations. This path
  requires the exact immutable object known to the verification scope. Copied or
  unverified input, duplicate releases and every graph with dependencies retain
  ordinary graph validation. Artifact bytes are still checked independently.
- Each disposable preview shares one selection read and at most 64 exact contract
  records. Failed or missing contract loads are not retained. This evidence lives
  only for that preview; current execution is still checked before and after it.
- The private preview shares its fixed Bloc catalogue within an 8 MiB serialized
  payload budget. Oversized or failed loads are not retained. Metadata is frozen;
  Pages, routes and system reads/writes remain live. Other projections bypass this
  reuse. This wrapper is used only after the preview's collections are fixed, and
  never around the durable repository. JavaScript overhead is additional to the
  logical payload budget.
- Composition expansion uses a depth-first work list rather than rescanning the
  entire Page after every expanded host. It preserves expansion order, slot
  projection, ID remapping, origins and the existing recursion/node/byte limits.
  The browser bundles were rebuilt with this change.

## Reproducible History

All runs use the same 52 scenario definitions, fixture hashes, instrumentation
and resource profile. The host used Bun 1.4.4, MongoDB 7.0.37 and a Ryzen 7 6800H.
Provider limits were two CPUs/2 GiB; Edge one CPU/1 GiB; MongoDB two CPUs/1 GiB.

| Run | Artifact directory |
| --- | --- |
| Before cold changes | `artifacts/performance/runs/20261117T161228Z-4b12e777358e-b0ee32ba/` |
| First candidate | `artifacts/performance/runs/20261117T164538Z-4b12e777358e-ce978950/` |
| Final candidate | `artifacts/performance/runs/20261117T170519Z-4b12e777358e-62708888/` |

The first candidate's cold medians were about 5.7 seconds. It also flagged two
nominal latency regressions; the final run flags none on its 38 complete
comparisons. These are separate measurements, not proof that every timing change
was caused by one code change. The global comparison remains incomplete because
the 14 concurrent reference scenarios lack complete successful samples.

Each ignored artifact directory contains sealed results, comparison and HTML
reports. All three seals were verified with `readRun`. Final source fingerprint:
`91bb50a8c9b089180775c8f76b783ad85e9b1ca165486a22f0b8a522064f929a`.
No source changes were detected during either candidate campaign. All use Git
revision `4b12e777358e302d23d0d6647a6445e5ed3530a6` with a dirty checkout; the revision
alone does not identify the measured implementation.

Final local images use version `0.1.0-initialization-cold-2`:

- Edge: `sha256:2b8f97257dcbf32abba5afe00486eabefc363ad015f68ce537b70624e67c6771`.
- Provider: `sha256:f28c784f62212f204419cdeda31a5b54918af36e66c5561307bc5e0f9ff0185e`.

## Validation And Limits

The final Docker campaign recorded 408 measured attempts, 282 validated business
results and no 502. All 38 non-concurrent scenarios passed their business/state
assertions, including settings invalidation and 25-/100-Page recipes. The 14
concurrent scenarios retain nine refusals out of ten attempts each, using HTTP
423 or MCP `UPGRADE_IN_PROGRESS`. Their refusal latency is not success latency.

The assessment remains failed: 52 budget findings remain and only eight of ten
required obligations are covered. In particular, cold latency and shared
transport costs still exceed budgets. No regression threshold or budget was
relaxed to make this pass.

Validation completed:

- Workspace `build` and the ten `check` stages passed; generated bundles stay
  ignored. The cohesive composition expander remains 294 lines and the Bloc
  validator 203 lines; they were retained together rather than mechanically split.
  Directory fanout has no blocking finding.
- Content, collection and runtime-store regressions: 1,394 passing tests across
  238 files, with 4,616 assertions. Tests include immutable admission evidence,
  unresolved dependencies, tampering, scope isolation, revocation, cache bounds,
  failed-load retries and live Page reads/writes.
- `packages/features/content/tests/blocs/composition/mossaExpansion.test.ts`
  preserves exact HTML and origin hashes captured from the previous algorithm
  for all 117 examples in both modes. `expansionWork.test.ts` verifies that 500
  nested host pairs require no complete-Page Bloc rescans and retains work limits.
- `packages/runtimes/ulvia-cli/tests/stack/edge-smoke.browser.test.ts` passed in
  Chromium with the final images: 142 assertions covering site isolation,
  publication, persisted restart and two Edges (about 111 seconds).

Full `verify` was attempted again but is not green: its sandboxed unit stage
reported 3,606 passes, 56 skips, 154 failures and one error. Docker construction
then failed because that process could not access the Docker socket. Separate
targeted tests, browser smoke and Docker measurements ran with required local
access; they do not certify all delivery/TLS stages of global verification.

Remaining cold costs include full metadata admission on both sides of the
Registry/CMS boundary, ordinary Content preview and the individual asset requests.
The API remains synchronous; these results do not claim subsecond cold execution
or resolution of a production site's incident before deployment and measurement.
