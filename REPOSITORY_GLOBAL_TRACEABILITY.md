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

Current implementation checkpoint at `e90beaa6`:

- all 116 `@bernouy/cms-integration-packages` tests pass, including HTTP
  retrieval and adversarial, concurrency, restart, repair, and cleanup cache
  coverage;
- 15 focused deployment, download-policy, and storage-root tests pass;
- direct TypeScript checks pass for `@bernouy/cms-integration-packages` and
  `@bernouy/cms-server`; the earlier repository-surface and CLI runtime checks
  remain recorded in their commit evidence;
- the post-cache comparative `bun run check:all` remains exactly 3 passed and 3
  failed, matching the initial baseline with no task-introduced error.

## Lot 0 — Complete Remote Consumption

| ID | Requirement | Intended implementation evidence | Required verification | Status |
| --- | --- | --- | --- | --- |
| L0.1a | Rerun uses the stored snapshot as definition authority. | `@bernouy/cms-integrations` installation execution and Control definition selection. | Stable-channel movement and snapshot-authority regression tests. | Complete |
| L0.1b | Rerun resolves the installed exact version and never rewrites its pin. | Rerun request resolution and successful installation persistence. | Rerun with newer repository default preserves version and snapshot. | Complete |
| L0.1c | A different rerun version is rejected and upgrade is explicit. | Thin Control endpoints plus feature-owned rerun/upgrade contracts. | Endpoint and rollback tests for rejected rerun and failed upgrade. | Complete |
| L0.1d | Repository transport and contract failures have stable typed statuses. | HTTP definition client errors with bounded timeout. | Transport/429/5xx to 503; invalid upstream data to 502. | Complete |
| L0.1e | Embedded reads are anonymous on Delivery, absent from Control, in production and CLI dev. | `cms-server` and `cms-cli` composition roots use Delivery ports. | Composition tests inspect both runners and loopback URLs. | Complete |
| L0.1f | Public reads expose explicit cache and CORS behavior. | `@bernouy/cms-repository` read response helpers. | Anonymous GET/HEAD, cache, ETag, and CORS contract tests. | Complete |
| L0.2a | Repository versions are exact SemVer 2.0 values. | Definition repository parsing using a maintained SemVer package. | Exact, invalid, and prerelease fixtures. | Complete |
| L0.2b | Dependencies accept optional supported `versionRange` values and enforce them. | Integration dependency types, parser, and resolution. | Exact, caret, tilde, bounded-comparator, and legacy fixtures. | Complete |
| L0.3a | Package v1 envelope supports UTF-8/base64 files and release notes. | `@bernouy/cms-integration-packages` contracts, parser, and exact filesystem package source. | Round-trip, malformed encoding, legacy notes, exact identity, cache, invalidation, and replacement-singleflight tests. | Complete |
| L0.3b | RFC 8785 canonical bytes produce the package SHA-256 identity. | Shared canonicalizer and digest service. | JCS ordering, escaping, Unicode, surrogate, and key-order fixtures. | Complete |
| L0.3c | Generic filesystem reader is deterministic, bounded, and symlink-safe. | `@bernouy/cms-integration-packages/fs` reads immutable roots with bounded entry collection, realpath confinement, and actual-byte accounting. | 14 focused filesystem tests plus deterministic reads of all 14 official versions. | Complete |
| L0.4a | Exact package and release-notes GET/HEAD endpoints are public. | Repository routes backed by an injected exact package source and mounted on Delivery in production and CLI dev. | Required-version, source-identity, 404 legacy notes, immutable cache, digest, ETag/304, HEAD, CORS, and Delivery-only composition tests pass. | Complete |
| L0.4b | Public package downloads are limited before origin work. | The repository guard runs before package resolution; production composes a dedicated Mongo limiter, CLI dev uses an in-memory limiter, and standard Compose activates the policy. | 429/Retry-After and no-source-work tests pass; deployment tests prove the one-hop quota is active without a read token. | Complete |
| L0.4c | Client-address modes handle direct, proxy, loopback, disabled, and CDN hops safely. | `@bernouy/http-runner` resolution, strict runtime parsing, production/CLI composition, Compose defaults, and operator documentation. | Resolver, runtime, and deployment tests cover spoofing, malformed-chain 400, IPv4/IPv6, loopback, disabled, one-hop, and CDN two-hop configurations. | Complete |
| L0.5a | CMS package cache has a dedicated durable mount and validated non-overlap. | Runtime environment, image mount-point preparation, dedicated Compose bind mount, host documentation, and canonical root validation. | Deployment tests prove distinct mounts and runtime ownership preparation; storage-root tests reject exact, symlink, nested, and missing roots after realpath/device/inode checks. | Complete |
| L0.6a | Packages materialize atomically into content-addressed durable objects. | Bounded anonymous HTTP package source plus `FsIntegrationPackageCache` with same-filesystem staging, read-only committed objects, repair locks, and quarantine. | The 116-test package suite covers response limits, restart, independent concurrent writers, valid reuse, interrupted modes, corruption, symlink substitution, stale locks, safety-aged cleanup, and source identity disagreement. | Complete |
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
| D1 | Public metadata, definitions, assets, notes, and exact packages need no credential. | Anonymous surface/API evidence exists; canonical public-origin deployment evidence remains. | Partial |
| D2 | Management is reachable only through authenticated Control with a server-only token. | Route/network tests and secret inspection. | Pending |
| D3 | Install, rerun, and remote connector deployment are pinned to immutable content. | Rerun/version pinning is proven; package-digest persistence, cache-backed deployment, and the Lot 0 acceptance scenario remain. | Partial |
| D4 | Minor/patch incompatibility or contract uncertainty fails closed. | Compatibility publication evidence. | Pending |
| D5 | Publication is immutable, atomic, snapshot-based, recoverable, and fault-isolated. | Registry concurrency/recovery evidence. | Pending |
| D6 | Dedicated internal repository image persists data and follows empty-volume seed policy. | Image and deployment evidence. | Pending |
| D7 | Official updates use the publication API after bootstrap. | CI/bootstrap workflow evidence. | Pending |
| D8 | Delivery catalog and Control administration provide the complete public/private UX. | Browser and authorization evidence. | Pending |
| D9 | Final workspace validation has no new task-introduced finding. | Baseline comparison plus final `bun run check:all`. | Pending |

## Commit Log

This section is updated after every task commit with its hash, scope, and test
evidence.

- `bf174fa8` — added the source global-repository plan and its initial
  requirement-to-evidence matrix, including the isolated-worktree baseline.
- `e1c48a32` — pinned reruns, exact legacy resolution, explicit upgrade action,
  and transactional pin rollback. Verified by 26 feature installation tests, 33
  Control integration tests, feature typecheck, and style checks.
- `7e5ad252` — bounded repository requests with typed `502`/`503` failures,
  stable public codes, nullable `404`, and safe Control propagation. Verified by
  73 focused tests and the `cms-integrations`/`http-runner` typechecks.
- `f8070cd9` — moved embedded repository reads from Control to Delivery and
  changed production and CLI loopback URLs to the Delivery listener. Verified
  by 17 runtime/composition tests and both runtime typechecks.
- `f7caa6e3` — added explicit `HEAD` route support to the HTTP runner contract
  and grouped runner implementation. Verified by all 48 foundation HTTP tests
  and the package typecheck.
- `dea44424` — added anonymous GET/HEAD/OPTIONS caching, strong ETags, immutable
  exact-version responses, and CORS to the public repository surface. Verified
  by six repository contract tests and the surface typecheck.
- `9f31326b` — added the documented dependency range subset and enforced it
  against installed exact versions while preserving range-less legacy
  snapshots. Verified by the full 220-test integration feature suite, feature
  typecheck, and focused style checks.
- `d65fefb0` — enforced canonical repository SemVer identities across FS and
  HTTP, validated channel membership, and prevented implicit prerelease
  selection. Verified by 26 focused tests, feature typecheck, and seven
  official-catalog installation scenarios.
- `d99fdd13` — added an inverse-dependency preflight that blocks incompatible
  upgrades before state changes, plus exact/tilde/bounded/optional/legacy range
  coverage. Verified by all 225 integration feature tests and its typecheck.
- `f247e473` — added direct, disabled, and trusted-proxy client-address
  resolution with canonical IP keys, loopback handling, full-chain validation,
  and stable `400` errors. Verified by all 54 HTTP runner tests and typecheck.
- `27763859` — defined the strict package v1 envelope, UTF-8/base64 file
  encoding, release-note references, RFC 8785 canonicalization, and Web Crypto
  SHA-256 identity. Verified by 62 protocol tests and package typecheck.
- `7063a9e7` — bounded hostile raw and programmatic package inputs by canonical
  byte size and JSON nesting depth, with iterative I-JSON validation and stable
  error classes. Verified by all 80 package tests and package typecheck.
- `60f8b430` — added the deterministic filesystem package reader with bounded
  fanout, realpath and symlink checks, actual-byte limits, mutation detection,
  and an official-catalog smoke test. Verified by 80 package tests, 14 official
  version reads, both package typechecks, and frozen install.
- `8cedce2f` — refreshed package-protocol traceability and recorded the
  comparative post-Lot-0.3 validation; this commit changes no runtime behavior.
- `fa1df1e5` — added the exact immutable filesystem package source with
  successful-read caching, request singleflight, explicit invalidation, and no
  negative or failed-read caching. Verified by the focused package-source tests
  and the package typecheck.
- `8fe78e14` — kept an invalidated pending source read from evicting its newer
  replacement, closing the source-cache concurrency race. Verified by the
  replacement-singleflight regression test and the package typecheck.
- `056a8ba4` — served canonical exact packages and UTF-8 release notes through
  public GET/HEAD routes with required identities, digest metadata, immutable
  caching, ETag revalidation, and CORS. Verified by the four exact-package route
  tests and the repository surface typecheck.
- `aa490d8e` — exposed a confined exact-version locator which validates the
  catalog index and definition identity before returning the version root,
  definition path, and release-notes metadata. Verified by the filesystem
  definition repository tests and the integration feature typecheck.
- `90644e8f` — made active client-address policies fail closed with a stable
  `503 client_address_unavailable` response when no TCP peer was recorded.
  Verified by the client-address and package-download guard regression tests.
- `44716a5b` — applied public package-download limiting after exact identity
  parsing but before package-source or filesystem work, with `429`,
  `Retry-After`, CORS, loopback, malformed-forwarding, and exempt HEAD behavior.
  Verified by six focused guard tests and the repository surface typecheck.
- `656e646c` — added strict runtime parsing for disabled, direct, one-hop, and
  CDN two-hop client-address policies plus positive package-download quotas.
  Verified by four focused environment tests and the runtime typecheck.
- `98e11aa6` — moved the HTTP client-address tests under a responsibility-named
  support directory so the foundation package remains within the directory
  fanout policy; this commit changes no runtime behavior.
- `7d088e5e` — composed the exact embedded package source on CMS Delivery,
  injected a dedicated Mongo rate-limit namespace in production and a direct
  in-memory limiter in CLI dev, and emitted the explicit disabled-policy
  warning. Verified by runtime service, store, environment, Delivery-mount,
  repository-read, and CLI composition tests plus both runtime typechecks.
- `8ab10f94` — activated the one-hop trusted-proxy package-download policy and
  quota in standard Compose, documented two-hop CDN operation and the accepted
  disabled-mode risk, and kept read credentials absent. Verified by three
  focused rendered-Compose and source-contract tests.
- `a3774f6d` — provisioned the dedicated durable package-cache bind mount and
  runtime environment, prepared both writable image mount points, documented
  host ownership and lifecycle, and rejected canonical storage-root overlap.
  Verified by deployment tests, four realpath/device/inode storage-root tests,
  and the CMS server typecheck.
- `08694530` — added anonymous exact HTTP package retrieval with HEAD
  preflight, bounded streaming, canonical-byte, identity, and digest
  verification, request timeouts, and stable `502`/`503` errors. Verified by 14
  HTTP source, failure, and limit tests plus the package typecheck.
- `0df240b6` — rejected file/directory path collisions before filesystem
  materialization, preventing one package entry from becoming another entry's
  parent. Verified by adversarial envelope-limit tests and the package
  typecheck.
- `e93413ee` — grouped shared package path-layout validation without changing
  its protocol behavior. Verified by the full package suite and package
  typecheck.
- `e90beaa6` — materialized canonical packages into durable read-only
  content-addressed objects through same-filesystem staging, collision-safe
  publication, repair leases, verification, quarantine, and safety-aged
  cleanup. Verified by 16 cache tests covering restart, two independent
  writers, reuse, corruption, symlinks, interrupted modes, stale/heartbeating
  locks, and cleanup, within the 116-test package suite.

The post-cache `bun run check:all` at `e90beaa6` remained exactly 3 passed and 3
failed. The failures match the recorded baseline: the same three official
integration cross-package `src/` imports, the same 18-entry and 19-entry fanout
errors, and the same unresolved built `@bernouy/components` typecheck cascade.
There is no new file-size warning; the cache layout adds one non-blocking
8-entry directory-fanout `INFO`.

Lots 0.4, 0.5, and the standalone materializer in 0.6 are directly proven.
Lot 0.6 is not complete end to end: installation `packageDigest` persistence,
cache-first exact resolution, embedded legacy fallback, and runtime wiring
remain pending under L0.6b, followed by deployer inversion and the degraded
acceptance scenario.
