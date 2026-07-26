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

Lot 0 implementation checkpoint at `fc6c4d42`:

- all 134 `@bernouy/cms-integration-packages` tests pass, including HTTP
  retrieval, immutable coordinate references, and adversarial concurrency,
  restart, repair, and cleanup cache coverage;
- all 291 `@bernouy/cms-integrations` tests pass, including cache-first exact
  resolution, transactional digest pins, offline legacy fallback,
  package-definition validation, connector schema contracts, and Supabase
  deployment from resolved roots;
- all 140 `@bernouy/cms-cli` tests and all 487 `@bernouy/cms-control` tests
  pass, including package-provenance preservation and public Control views;
- the 60 `@bernouy/cms-server` tests pass, including the seven-test real-process
  remote-only, restart, outage, corruption-repair, and concurrency acceptance
  suite;
- immutable registry snapshot and management-boundary suites pass with 14 and
  17 tests respectively;
- the post-Lot-0 comparative `bun run check:all` reports 4 passed and 2 failed:
  TypeScript is now green, while architecture and repository shape contain only
  the exact pre-existing violations recorded above.

Continuation checkpoint at `85f472d2`:

- the generic Delivery provider supports validated duplicate-preserving query
  context, explicit rendered error statuses, safe cache isolation, HEAD,
  analytics referrer identity, and bounded sitemap contributions; all 89
  Delivery tests and its typecheck pass;
- untrusted release-note Markdown is rendered with raw HTML disabled, safe link
  schemes, external-link isolation, and the existing sanitizer;
- management uploads are bounded and canonicalized before publication; the
  private surface returns immutable operation IDs and all 39 management tests
  pass;
- filesystem publication is immutable and ordered, uses one shared per-kind
  mutation coordinator, swaps one catalog reference, and has deterministic
  crash recovery and quarantine coverage;
- compatibility admission is persisted canonically and report reassessments
  form a bounded, paginated append-only chain whose directory reads are anchored
  against symlink and TOCTOU substitution;
- the production repository runtime now performs recovery and mounts the real
  authenticated publisher; a real two-listener test proves a private
  publication is immediately visible through the public snapshot;
- both repository and CMS management-token readers use bounded descriptor-based
  `O_NOFOLLOW` reads, while CMS management configuration is strictly all-or-none;
- all 22 repository-runtime tests and all 10 repository image/deployment tests
  pass. Promotion, the complete private/public APIs, the CMS gateway, catalog,
  Control console, seed automation, and final global validation remain open.

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
| L0.6b | Installations persist `packageDigest` only after success and support legacy fallback. | Installation contract, resolver, cache, and embedded exact root. | Failure rollback, legacy reconstruction, no-false-provenance, process restart, and corruption rollback tests. | Complete |
| L0.7a | Connector SQL and Edge Functions deploy only from the resolved package root. | Injected package-root resolver replaces hard-coded official root. | A remote-only version absent from the image installs and reruns its unique SQL and Function sources. | Complete |
| L0.8a | The 13-step degraded acceptance scenario passes across a process restart. | CMS runtime, remote fixture, persistent bind mount, cache and deployer. | Real Control, Delivery, repository, persistent state, two CMS PIDs, offline rerun, repair, and concurrent-cache acceptance tests. | Complete |

## Lot 1 — Mutable Filesystem Registry

| ID | Requirement | Intended implementation evidence | Required verification | Status |
| --- | --- | --- | --- | --- |
| L1.1 | Management publication is token-authenticated, rate-limited, bounded, immutable, and returns 201/409/422. | `cms-repository-management` upload/guard/routes plus `FsIntegrationRegistryPublisher`. | 39 surface tests plus registry publication, conflict, compatibility-admission, and limit tests. | Complete |
| L1.2 | Publication writes the version first and atomically replaces `integration.json` last under a per-kind lock. | Filesystem transaction journal, immutable version writer, atomic canonical index replacement, and shared mutation coordinator. | Concurrent publication, snapshot continuity, storage safety, and six crash-boundary fixtures. | Complete |
| L1.3 | Readers use an immutable memory snapshot; corrupt integrations are quarantined independently. | Snapshot builder, diagnostics, quarantine, atomic reference, and snapshot-backed read adapters. | Old-reader continuity, one-corrupt-entry isolation, duplicate quarantine, and zero-rescan tests. | Complete |
| L1.4 | Recovery deterministically handles staging, orphans, interrupted indexes, corruption, and duplicates. | Journal replay, abandoned/orphan quarantine, bounded inventory, and snapshot rebuild under `cms-integration-registry/fs`. | Recovery and corruption fixtures cover every committed publication boundary and hostile registry state. | Complete |
| L1.5 | Declarative schema and HTTP contracts classify compatible, breaking, and unknown changes. | Strict schema/HTTP declarations and `IntegrationCompatibilityEvaluator`. | Admission tests cover patch/minor/major, new kind/major, schema evidence contradictions, implementation-only changes, and lossy HTTP shapes. | Complete |
| L1.6 | Admission reports are immutable; reevaluations append provenance-bearing revisions. | Canonical admission report plus `FsIntegrationCompatibilityReportStore`. | Immutable supersedes-chain, pagination, concurrent branch rejection, reload, symlink, and directory-substitution tests pass; management reevaluation route and public ETag remain. | Partial |
| L1.7 | Stable promotion records the newest completed report revision and never auto-demotes. | Management operation and channel index mutation. | Promotion, adverse reassessment warning, and channel tests. | Pending |

## Lot 2 — Repository Runtime And Image

| ID | Requirement | Intended implementation evidence | Required verification | Status |
| --- | --- | --- | --- | --- |
| L2.1 | `@bernouy/cms-repository-server` mounts separate anonymous read and authenticated management surfaces. | Production composition performs recovery and mounts `RepositoryCms` and `RepositoryManagementCms` on distinct runners with one snapshot reference. | 22 runtime tests cover real listeners, auth boundary, private publication, immediate public visibility, health, readiness, degradation, and shutdown. | Complete |
| L2.2 | `infra/images/cms-repository` runs read-only with only bounded writable registry storage. | Dedicated Dockerfile, Compose service, registry bind, bounded noexec tmpfs, and runtime UID preparation. | 10 image/deployment tests, including a real runtime-filesystem permission probe. | Complete |
| L2.3 | Repository is internal-only; CMS Delivery is the canonical public read gateway. | Dedicated internal network, no published repository ports, and CMS Delivery loopback proxy. | Deployment tests prove no host ports and public-vs-management route separation; final merged-stack acceptance remains. | Partial |
| L2.4 | Empty-volume bootstrap uses normal validation and image upgrades never reconcile initialized data. | Runtime seed/import policy. | Empty/non-empty volume and image-upgrade tests. | Pending |
| L2.5 | Valid snapshots remain ready while quarantine produces degraded health and metrics. | Snapshot-backed health/readiness and recovery diagnostics. | Ready/degraded/last-valid-snapshot tests pass; management diagnostics, filesystem-capacity metrics, and restart acceptance remain. | Partial |

## Lot 3 — Public Catalog And Administration

| ID | Requirement | Intended implementation evidence | Required verification | Status |
| --- | --- | --- | --- | --- |
| L3.1 | CMS Delivery renders a searchable public catalog and version detail pages. | Generic injected page-provider seam is complete; repository-specific provider and anonymous HTTP reader are in progress. | Provider priority/fallback/query/status/cache/HEAD/sitemap tests pass; catalog rendering and composition remain. | Partial |
| L3.2 | Public UI shows stable/latest, dependencies, reports, notes, artifacts, and documentation safely. | Maintained Markdown parser plus sanitizer is complete; repository view models/pages remain. | XSS/HTML/link/title/list/code Markdown tests pass; complete catalog unavailable/cache tests remain. | Partial |
| L3.3 | Only the initial CMS administrator can publish versions, reevaluate, and promote stable. | Exact opaque-subject guard, all-or-none gateway env, and descriptor-safe token readers exist. | Unit access matrix and gateway configuration/token tests pass; mounted Control workflows and browser-to-private HTTP acceptance remain. | Partial |
| L3.4 | Control supports explicit installation upgrades without changing pins on failure. | Admin endpoint and UI action over the feature upgrade boundary. | Success, dependency failure, deploy failure, and rollback tests. | Pending |

## Cross-Cutting Definition Of Done

| ID | Requirement | Proof required before completion | Status |
| --- | --- | --- | --- |
| D1 | Public metadata, definitions, assets, notes, and exact packages need no credential. | Anonymous API, CORS/cache/HEAD tests and Delivery proxy composition exist; compatibility history is not yet public. | Partial |
| D2 | Management is reachable only through authenticated Control with a server-only token. | Route/network tests and secret inspection. | Pending |
| D3 | Install, rerun, and remote connector deployment are pinned to immutable content. | Exact version/snapshot/digest persistence, remote SQL and Function deployment, outage rerun, and corruption rollback are proven across process restart. | Complete |
| D4 | Minor/patch incompatibility or contract uncertainty fails closed. | Compatibility evaluator and real publisher admission boundary. | Complete |
| D5 | Publication is immutable, atomic, snapshot-based, recoverable, and fault-isolated. | Publication, concurrency, every crash boundary, quarantine, recovery, and immediate visibility tests. | Complete |
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
- `94e8bfcd` — extracted the exact version-root definition loader so embedded,
  HTTP, and materialized packages share one identity and confinement contract.
  Verified by 47 focused definition tests, the full 228-test integration suite,
  and feature typecheck.
- `5b242259` — added canonical immutable
  `refs/<kind>/<exact-version>.json` cache references with atomic hard-link
  publication, idempotence, conflict detection, and hostile-file rejection.
  Verified by all 133 integration-package tests and package typecheck.
- `2cd446a2` — persisted optional installation `packageDigest` provenance in
  memory and Mongo while preserving true property absence for legacy records.
  Verified by four focused persistence tests, all 232 integration tests, and
  feature typecheck.
- `e4d4323f` — resolved exact package roots cache-first by digest or immutable
  coordinate, validated package definitions, repaired corrupt cache objects,
  and limited embedded fallback to exact legacy reruns. Verified by all 247
  integration tests and feature typecheck.
- `6e7a0a42` — preserved pulled package provenance in generated CLI state
  without adding it to authoring integration documents. Verified by all 140
  CLI tests and runtime typecheck.
- `0b966aa7` — exposed persisted package provenance through Control list and
  detail views while omitting the field for legacy installations. Verified by
  all 480 Control tests and surface typecheck.
- `6c04ec99` — resolved packages before installation side effects, injected
  their roots into connector imports, and committed digest/version/snapshot
  pins only with successful creates, reruns, and upgrades. Verified by 19 new
  lifecycle tests with 81 assertions and the feature typecheck.
- `640f6c95` — rejected relative package roots from injected resolvers before
  side effects. Verified by the six resolver-contract tests.
- `de7a75c3` — injected the package resolver through Control create, rerun, and
  upgrade actions, allowing snapshot-less exact legacy reruns to avoid an eager
  catalog request. Verified by all 486 Control tests and surface typecheck.
- `f0f4a149` — published the shared no-follow, non-blocking bounded filesystem
  readers through the integration-package filesystem subpath. Verified within
  the full integration-package suite and package typecheck.
- `094750cd` — removed Supabase's embedded-catalog locator and deployed SQL,
  function configs, and deterministic function bundles only from the resolved
  package root, with symlink, special-file, depth, count, and byte defenses.
  Verified by 602 tests across features, runtimes, and the official rollout,
  five package typechecks, and comparative architecture/shape checks.
- `01f48b07` — recorded the package-root deployment checkpoints and the
  remaining process-level Lot 0 acceptance obligations.
- `0591b6ea` — put metadata HEAD and release-note discovery behind a separate
  pre-traversal quota so anonymous metadata cannot force unbounded package
  walks. Verified by 17 repository tests and the surface typecheck.
- `dbbabd21` — composed the HTTP package source, durable cache, resolver, and
  embedded fallback in production and CLI dev without startup fetching.
  Verified by all 198 runtime tests and 589 assertions.
- `340e75f8` — exposed accessible structured repository-outage states in
  Control while retaining already installed integrations and retry behavior.
  Verified by all 487 Control tests and 1,451 assertions.
- `5a33711e` — introduced immutable catalog snapshots, structured diagnostics,
  quarantine entries, and atomic snapshot references.
- `11b5dfa6` — added normalized declarative connector schema compatibility
  contracts while preserving optional legacy snapshots.
- `49dc3c92` — covered schema normalization, constraints, duplicate rejection,
  legacy parsing, and SQL admission requirements. Together with `11b5dfa6`, all
  291 integration tests and 884 assertions pass.
- `069fc3ac` — built bounded filesystem snapshots and snapshot-backed
  definition/package readers that avoid request-path rescans. Together with
  `5a33711e`, 14 tests and 46 assertions pass.
- `33f3a3a5` — created the management surface package and enforced constant-time
  Bearer authentication followed by principal-keyed rate limiting before body
  work, with sanitized 401, 429, and 503 contracts. Verified by 17 tests and 73
  assertions.
- `fc6c4d42` — proved remote-only install and upgrade through real Control,
  durable rerun across a new CMS PID while the repository is offline, public
  Delivery availability, byte-for-byte rollback on corruption, repair and
  quarantine after recovery, and independent cache-writer convergence.
  Verified by seven focused tests with 76 assertions and all 60 CMS-server
  tests with 301 assertions.
- `47cd8099` — recorded the completed Lot 0 acceptance evidence and comparative
  validation without changing runtime behavior.
- `cb6b789c` and `5e00454c` — added declarative connector HTTP contracts and
  shared SemVer release-level primitives used by compatibility admission.
- `d615243c` — bounded streamed management uploads before parsing and mapped
  package/body limits to stable `413` responses.
- `cdc05877`, `11abb06f`, and `0d52107a` — preserved exact persisted encodings,
  shared resolved-package validation, and wrote immutable version roots.
- `f4618f2` and `e0e1bc0` — hardened immutable-writer special-file, permission,
  collision, and cleanup behavior with real-filesystem tests.
- `28412a16`, `a912258a`, `932cabab`, and `9fc779a3` — implemented release
  admission and strict HTTP request/response-shape comparison, including lossy
  and unknown-contract rejection.
- `61a6a8fe` — introduced the isolated two-listener repository runtime with
  snapshot health, readiness, degradation, and graceful shutdown.
- `f2c0f94e`, `fc81107f`, and `c18be34e` — added the repository image, internal
  CMS topology, dedicated volume, secret, read-only filesystem, and corrected
  writable-mount ownership. Ten current image/deployment tests pass.
- `05600016` — persisted canonical digest-bound version manifests.
- `ab9c465a` and `f1f57ac9` — selected embedded/remote read sources explicitly
  and made CMS Delivery the canonical public proxy for the global repository.
- `f00f8baf`, `551a948c`, and `d26d8a9e` — bounded snapshot discovery, made
  package reads singleflight, and grouped filesystem reads without request-path
  rescans.
- `84d2a9d4` — defined the adapter-light registry publication contract.
- `9511dc1e` — introduced injected dynamic public pages in Delivery with
  precedence, fallback, cache identity, HEAD, sitemap, and analytics support.
- `417f0758` — rendered untrusted Markdown through a maintained parser with raw
  HTML disabled, safe schemes, external-link isolation, and sanitization.
- `53429680` — answered exact package HEAD from immutable snapshot metadata
  without invoking a filesystem walker.
- `f519e820` — added the exact opaque-subject repository access guard, including
  `404` when capability is absent and `403` for another administrator.
- `753b60a0` — exposed bounded package publication with canonical digest,
  `201`, structured `409`/`422`, and sanitized failures.
- `ae4d430d`, `4d70bfda`, and `9a63b6d0` — added durable journals/manifests,
  atomic immutable publication, ordered index replacement, and hardened
  privileged cleanup against path substitution.
- `cfafe2e1` — recovered every journal boundary and quarantined abandoned,
  corrupt, and orphaned publication state before rebuilding the snapshot.
- `a72b2582` — extended Delivery providers with bounded duplicate-preserving
  query context, explicit error statuses, and query/error cache isolation.
  All 89 Delivery tests and its typecheck pass.
- `843d0be3` — shared one per-kind mutation coordinator across registry writes
  and added immutable publication operation IDs.
- `b0291a46` — exposed the operation ID in the allowlisted `201` management DTO.
  All 39 management-surface tests pass.
- `659ac327` — persisted bounded compatibility history as an immutable admission
  plus append-only, paginated supersedes revisions with branch rejection.
- `d097cda5` — anchored compatibility-history directory iteration and reads on
  an `O_DIRECTORY | O_NOFOLLOW` descriptor and added a substitution regression
  test.
- `3e030dbe` — made the repository runtime read its management secret through a
  bounded `O_NOFOLLOW` descriptor without path-bearing failures.
- `0777405d` — exposed the runtime's single snapshot reference for public reads,
  recovery, publication, reevaluation, and promotion.
- `e1e933ab` and `22e9afd0` — validated the CMS management gateway's all-or-none
  environment, exact administrator identifier, URL, timeout, and descriptor-safe
  token file while keeping token bytes out of `RuntimeEnv`.
- `85f472d2` — composed recovery, compatibility evaluation, atomic publication,
  and the real management surface in production. A real two-listener test proves
  authenticated publication and immediate anonymous visibility; all 22 runtime
  tests and 83 assertions pass.

The post-Lot-0 `bun run check:all` at `fc6c4d42` reports 4 passed and 2 failed.
TypeScript, style, architecture tooling, and CI tooling pass. Architecture still
contains exactly the three recorded official-integration cross-package `src/`
imports, and repository shape still contains exactly the recorded 18-entry and
19-entry fanout errors. The new 198-line `Integration.ts` warning was reviewed:
the file remains a cohesive declarative contract, while extracting a ninth
immediate `interfaces/` entry would create a blocking fanout error.

Lot 0 is proven end to end, including its remote-only and degraded process
scenario. Lot 1 now has immutable atomic publication, compatibility admission,
snapshot visibility, recovery, quarantine, and append-only report storage;
promotion and the HTTP reevaluation/read projections remain in progress. The
Lot 2 runtime and image boundaries are operational, while the management CMS
gateway, seed automation, Lot 3 catalog/console, and final global validation are
still required before this initiative can be called complete.
