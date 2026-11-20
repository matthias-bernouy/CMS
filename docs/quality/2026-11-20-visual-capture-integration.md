# Visual capture integration review — 2026-11-20

The isolated visual-capture implementation was integrated onto `1.0.21` from a
frozen snapshot of `CmsCore-visual-captures` (134 changed paths, starting at
`a44061028582bba577348ac6748784d2cc87e8c4`). The source worktree was preserved.
The integration base is `f3f1ad09e55d1020c2fc1ef77f3e8025a258615b`; the executable
candidate validated below is `d0d62876181eba8fc52fcb014b7d80537e30be8c`.
This is source integration evidence, not a publication or deployment.

## Review findings and corrections

| Priority | Finding | Correction and evidence |
| --- | --- | --- |
| P1 | Replacing current Content and Authoring definitions without retaining their exact previous pins would leave existing sites unsupported. | Retained the original canonical Content `1.2.0` and Authoring `1.2.3` bytes/digests. The SDK retention and runtime compatibility checks pass. |
| P2 | Capturing `/` navigated to `/index.html`, changing `location.pathname` and document identity. | Preserve the empty root entry, including queries and decoded file keys. The regression initially failed; unit and isolated-browser checks now preserve root, query and Unicode URLs. |
| P2 | The new inline-image schema made the URI optional for existing MCP binary resource links. | Inline PNG tools receive their own schema; existing binary tools still require `uri` and `mimeType`. Both opt-in and non-opt-in cases, byte-bound exposure and targeted Gateway dispatch are tested. |
| P2 | The Edge's 15-second first-byte deadline could cut off a capture whose worker/client deadlines are 20/25 seconds. | Only direct administrator calls to the three capture-generation capabilities receive 30 seconds. Three regression cases initially failed. Anonymous, user, system, Provider, delegated, foreign-contract, image-read and command cases remain at 15 seconds; the existing collection review remains at 60 seconds. |

The review retained the recent targeted MCP resolution and compact route handling,
all original animation checks and explicit browser gating. Every cross-contract
capability call still passes through the Gateway. The browser worker is an
independent native process reached through a private Unix socket; it has no CMS
store or credentials. Foundation owns generic capture execution; runtime roots
own adapter and environment composition.

Relevant regression tests:

- [Capture resource identity](../../packages/features/content/tests/pages/captures/resources.test.ts)
- [Isolated browser and original URL](../../packages/foundation/browser-capture/tests/capture.browser.test.ts)
- [MCP binary exposure and schemas](../../packages/platform/gateway/tests/protocol/mcp/exposure.test.ts)
- [Capture response budgets and ordinary dispatch](../../packages/runtimes/cms-edge-server/tests/gateway/preparation/dispatch.test.ts)
- [Exact release compatibility](../../packages/surfaces/ulvia-provider/tests/capabilities/email/releases.test.ts)

## Final validation

`ULVIA_EDGE_SMOKE_PORT_BASE=17100 bun run verify` completed with exit code **0**
in the permanent integration worktree, with Bun `1.4.4`:

| Stage | Result |
| --- | --- |
| Static architecture, style, type, shape and tooling checks | 10 passed, 0 failed |
| Ordinary suite | 4,392 passed, 85 explicitly gated/skipped, 0 failed |
| Explicit animation Chromium suite | 4 passed |
| Explicit native/isolated/compiled capture browser suite | 11 passed |
| Content/MongoDB integration | 15 passed |
| Static performance plan | 231 executors, 1,786 scenarios, no missing definitions/budgets |
| Retained implementation compatibility | Passed; no performance measurement claimed |
| Shared Edge/Docker journey | Passed, including native worker, private PNGs and foreign-instance refusal |
| TLS fresh setup and restart | Both passed |

The earlier animation fixes were committed as `72423fbb6` and `f3f1ad09e`.
Their full verification initially encountered an unrelated existing listener on
port `15103`; the unchanged acceptance flow passed on isolated test ports.
The capture integration makes that port base explicitly configurable for tests.
Both full integration verification passes subsequently succeeded.

Evidence is retained under `artifacts/visual-integration/`, including the input
snapshot, runtime metadata before the upgrade, failing/passing regression logs,
the two full verification logs, source identity and the HTML report. Generated
reports and runtime outputs are not tracked. This dated review is tracked source.
No blocking finding remains in this reviewed scope; automated checks do not prove
absence of all defects.

## Versions, operations and limits

Content and Authoring are `1.3.0`; the Provider manifest is `1.8.0`. There is no
major version. Previous exact implementations remain supported. No contract was
published, no site selection changed and no server was deployed by this task.

See the [runtime guide](../development/visual-captures.md) for the explicit worker
account, Bubblewrap/Chromium dependencies, service activation and optional socket
connection. The external MCP client/model has not been exercised. Native CPU/RSS
at maximum input and measured capture-performance acceptance remain unmeasured.
The functional journeys do not replace those measurements.

## Next public-endpoint performance work

The reported 200 ms must first be measured on the exact public request. Existing
`prepareDelivery` scenarios invoke the signed Content capability with independently
prepared Pages; they do not establish anonymous browser `GET /page` cache-HIT
latency. Historical portfolio measurements also contain shared-host/contamination
flags and are not a current baseline for this candidate.

| Candidate | Code evidence and bounded next step |
| --- | --- |
| Fresh host routing before every cache lookup | `SharedEdge.handle` always resolves the domain. `MongoSiteUpgradeStorage.readResourceRevision` performs four metadata reads. Evaluate parallel maintenance/permit reads between the existing before/after revision fences; keep fresh routing and mutation visibility. |
| Duplicate public Gateway control work | A public miss resolves the delivery contract, invokes the Gateway and prepares signed dispatch. Profile and reuse request-scoped immutable evidence where valid; retain the final live authorization fence and admitted contract calls. |
| Provider HTML cache before full hydration | `getPageRenderInputs` loads text contributions and renderable Blocs before the compressed HTML cache is consulted. Separate bounded route/revision/access checks from expensive inputs needed only on a cache miss. |
| Repeated immutable contract admission in SVG rendering | `inlineSvg.ts` re-admits a release already obtained from an admitted Gateway route. Reuse immutable validation evidence while retaining current selection and authorization. This affects pages with SVG/nested capability work. |
| Compression and event-loop delay | gzip/Brotli are already lazy and memoized, but the first encoding is synchronous. Measure queueing under concurrency before moving equivalent codec work into a bounded asynchronous path. |

Start with a short, isolated baseline splitting routing, control, Provider reads,
cache lookup, rendering and compression. Compare warm/cold and cache HIT/MISS,
plus representative concurrent requests; record P50/P95, operations and loaded
volume. Prioritize the routing read overlap and lazy HTML inputs for limited
changes, then control round trips. Preserve exact output, access, cache keys,
invalidation, failure behavior and Gateway boundaries. No new performance gain
is claimed by this integration report.
