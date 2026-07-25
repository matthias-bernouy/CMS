# Global Integration Repository Traceability

This matrix tracks implementation evidence for
[`REPOSITORY_GLOBAL.md`](REPOSITORY_GLOBAL.md). A requirement is complete only
when both implementation and verification evidence exist in this worktree.

## Status Legend

- `Pending`: no sufficient implementation evidence yet.
- `Partial`: reusable behavior exists, but the planned contract is incomplete.
- `Complete`: implementation and direct verification evidence both exist.
- `Baseline`: pre-existing behavior or failure recorded before task changes.

## Worktree And Baseline

- Branch: `feat/global-integration-repository`
- Base commit: `13bf129b6c15e9b32978b8ed6cc21d87aa565f9e`
- Source-plan SHA-256:
  `b832f67a784aad79bb2e9253b0efc092299f72c593dbc83ce71f09b808eb29f5`
- Frozen install: `bun install --frozen-lockfile` succeeded with Bun `1.3.9`.
- Initial `bun run check:all`: 3 passed, 3 failed.

Pre-existing baseline failures:

- architecture: three cross-package `src/` imports in official-integration
  commerce offer-filter tests;
- repository shape: 18-entry commerce-offer-filter directory and 19-entry
  commerce selling-blocs test directory;
- typecheck: unresolved built `@bernouy/components` subpaths cascade into
  Delivery, editor, and Control types in a fresh worktree.

Style, architecture-tooling, and CI-tooling passed. Task validation must not add
new findings relative to this baseline.

## Lot 0 — Complete Remote Consumption

| ID | Requirement | Intended implementation evidence | Required verification | Status |
| --- | --- | --- | --- | --- |
| L0.1a | Rerun uses the stored snapshot as definition authority. | `@bernouy/cms-integrations` installation execution and Control definition selection. | Stable-channel movement and snapshot-authority regression tests. | Complete |
| L0.1b | Rerun resolves the installed exact version and never rewrites its pin. | Rerun request resolution and successful installation persistence. | Rerun with newer repository default preserves version and snapshot. | Complete |
| L0.1c | A different rerun version is rejected and upgrade is explicit. | Thin Control endpoints plus feature-owned rerun/upgrade contracts. | Endpoint and rollback tests for rejected rerun and failed upgrade. | Complete |
| L0.1d | Repository transport and contract failures have stable typed statuses. | HTTP definition client errors with bounded timeout. | Transport/429/5xx to 503; invalid upstream data to 502. | Pending |
| L0.1e | Embedded reads are anonymous on Delivery, absent from Control, in production and CLI dev. | `cms-server` and `cms-cli` composition roots use Delivery ports. | Composition tests inspect both runners and loopback URLs. | Pending |
| L0.1f | Public reads expose explicit cache and CORS behavior. | `@bernouy/cms-repository` read response helpers. | Anonymous GET/HEAD, cache, ETag, and CORS contract tests. | Pending |
| L0.2a | Repository versions are exact SemVer 2.0 values. | Definition repository parsing using a maintained SemVer package. | Exact, invalid, and prerelease fixtures. | Pending |
| L0.2b | Dependencies accept optional supported `versionRange` values and enforce them. | Integration dependency types, parser, and resolution. | Exact, caret, tilde, bounded-comparator, and legacy fixtures. | Pending |
| L0.3a | Package v1 envelope supports UTF-8/base64 files and release notes. | New `@bernouy/cms-integration-packages` contracts and parser. | Round-trip, malformed encoding, legacy notes, and identity tests. | Pending |
| L0.3b | RFC 8785 canonical bytes produce the package SHA-256 identity. | Shared canonicalizer and digest service. | JCS ordering, escaping, Unicode, surrogate, and key-order fixtures. | Pending |
| L0.3c | Generic filesystem reader is deterministic, bounded, and symlink-safe. | Filesystem subpath of the package feature. | Traversal, symlink, special-file, depth, count, size, and binary tests. | Pending |
| L0.4a | Exact package and release-notes GET/HEAD endpoints are public. | Repository surface with required exact version. | 404 legacy notes, immutable cache, ETag, HEAD, and CORS tests. | Pending |
| L0.4b | Public package downloads are limited before origin work. | Delivery-injected limiter and generic HTTP client-address resolver. | 429/Retry-After and proof no upstream/walk occurs first. | Pending |
| L0.4c | Client-address modes handle direct, proxy, loopback, disabled, and CDN hops safely. | `@bernouy/http-runner` resolver plus runtime configuration. | Spoofing, malformed-chain 400, IPv4/IPv6, loopback, one-hop and two-hop tests. | Pending |
| L0.5a | CMS package cache has a dedicated durable mount and validated non-overlap. | Runtime env, image, Compose, host docs, canonical path validation. | Deployment and alias/symlink/device-inode overlap tests. | Pending |
| L0.6a | Packages materialize atomically into content-addressed durable objects. | Package filesystem cache with same-filesystem staging. | Restart, concurrent rename, existing-valid, corrupt-target, and cleanup tests. | Pending |
| L0.6b | Installations persist `packageDigest` only after success and support legacy fallback. | Installation contract, resolver, cache, and embedded exact root. | Failure rollback, legacy reconstruction, and no-false-provenance tests. | Pending |
| L0.7a | Connector SQL and Edge Functions deploy only from the resolved package root. | Injected package-root resolver replaces hard-coded official root. | Remote-only version absent from image installs and reruns. | Pending |
| L0.8a | The 13-step degraded acceptance scenario passes across a process restart. | CMS runtime, remote fixture, persistent bind mount, cache and deployer. | End-to-end process/repository outage acceptance test. | Pending |

## Lot 1 — Mutable Filesystem Registry

| ID | Requirement | Intended implementation evidence | Required verification | Status |
| --- | --- | --- | --- | --- |
| L1.1 | Management publication is token-authenticated, rate-limited, bounded, immutable, and returns 201/409/422. | New registry feature and management surface packages. | Auth, limiter-before-body, duplicate, validation, and size tests. | Pending |
| L1.2 | Publication writes the version first and atomically replaces `integration.json` last under a per-kind lock. | Filesystem registry adapter and lock. | Concurrent publication and every crash-boundary test. | Pending |
| L1.3 | Readers use an immutable memory snapshot; corrupt integrations are quarantined independently. | Snapshot builder, diagnostics, and quarantine. | Old-reader continuity and one-corrupt-entry isolation tests. | Pending |
| L1.4 | Recovery deterministically handles staging, orphans, interrupted indexes, corruption, and duplicates. | Registry recovery service. | Restart fixtures for each recovery state. | Pending |
| L1.5 | Declarative schema and HTTP contracts classify compatible, breaking, and unknown changes. | Integration connector contracts and registry comparator. | Patch/minor/major, legacy baseline, and contradiction tests. | Pending |
| L1.6 | Admission reports are immutable; reevaluations append provenance-bearing revisions. | Report store keyed by package/baseline digests. | History immutability and changing collection ETag tests. | Pending |
| L1.7 | Stable promotion records the newest completed report revision and never auto-demotes. | Management operation and channel index mutation. | Promotion, adverse reassessment warning, and channel tests. | Pending |

## Lot 2 — Repository Runtime And Image

| ID | Requirement | Intended implementation evidence | Required verification | Status |
| --- | --- | --- | --- | --- |
| L2.1 | `@bernouy/cms-repository-server` mounts separate anonymous read and authenticated management surfaces. | New runtime composition root. | Listener, authentication-boundary, health, and readiness tests. | Pending |
| L2.2 | `infra/images/cms-repository` runs read-only with only bounded writable registry storage. | Dockerfile and Compose service. | Image/deployment tests and runtime user ownership checks. | Pending |
| L2.3 | Repository is internal-only; CMS Delivery is the canonical public read gateway. | Dedicated Docker network and proxy routing. | Public ingress cannot reach management; reads remain public. | Pending |
| L2.4 | Empty-volume bootstrap uses normal validation and image upgrades never reconcile initialized data. | Runtime seed/import policy. | Empty/non-empty volume and image-upgrade tests. | Pending |
| L2.5 | Valid snapshots remain ready while quarantine produces degraded health and metrics. | Runtime operational endpoints and structured telemetry. | Ready/degraded/restart and filesystem-capacity tests. | Pending |

## Lot 3 — Public Catalog And Administration

| ID | Requirement | Intended implementation evidence | Required verification | Status |
| --- | --- | --- | --- | --- |
| L3.1 | CMS Delivery renders a searchable public catalog and version detail pages. | Management CMS content/resources and anonymous repository client. | Browser-level search, detail, history, metadata, SEO, and download tests. | Pending |
| L3.2 | Public UI shows stable/latest, dependencies, reports, notes, artifacts, and documentation safely. | Delivery components and sanitized Markdown renderer. | Rendering, unsafe-Markdown, cache, and unavailable-state tests. | Pending |
| L3.3 | Only the initial CMS administrator can publish versions, reevaluate, and promote stable. | Authenticated Control workflows and server-held management token. | Authorization, no-browser-token, upload-limit, and structured-error tests. | Pending |
| L3.4 | Control supports explicit installation upgrades without changing pins on failure. | Admin endpoint and UI action over the feature upgrade boundary. | Success, dependency failure, deploy failure, and rollback tests. | Pending |

## Cross-Cutting Definition Of Done

| ID | Requirement | Proof required before completion | Status |
| --- | --- | --- | --- |
| D1 | Public metadata, definitions, assets, notes, and exact packages need no credential. | Public API and deployment evidence. | Pending |
| D2 | Management is reachable only through authenticated Control with a server-only token. | Route/network tests and secret inspection. | Pending |
| D3 | Install, rerun, and remote connector deployment are pinned to immutable content. | Lot 0 acceptance evidence. | Pending |
| D4 | Minor/patch incompatibility or contract uncertainty fails closed. | Compatibility publication evidence. | Pending |
| D5 | Publication is immutable, atomic, snapshot-based, recoverable, and fault-isolated. | Registry concurrency/recovery evidence. | Pending |
| D6 | Dedicated internal repository image persists data and follows empty-volume seed policy. | Image and deployment evidence. | Pending |
| D7 | Official updates use the publication API after bootstrap. | CI/bootstrap workflow evidence. | Pending |
| D8 | Delivery catalog and Control administration provide the complete public/private UX. | Browser and authorization evidence. | Pending |
| D9 | Final workspace validation has no new task-introduced finding. | Baseline comparison plus final `bun run check:all`. | Pending |

## Commit Log

This section is updated after every task commit with its hash, scope, and test
evidence.
