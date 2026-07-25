# CmsCore Repository Audit

## 1. Executive Summary

This audit covers commit `0c0b0f8a02ad12c7dbf384a22891add7bbdc9707` (`merge: enable immutable public source image caching`, committed on 2026-07-25) and was performed on 2026-07-25 in an isolated worktree.

- **Scope:** all 27 packages below `packages/foundation`, `packages/features`, `packages/resources`, `packages/surfaces`, and `packages/runtimes`.
- **Repository size inspected:** 6,251 tracked package files and 514,083 physical lines in tracked text files. This includes 1,807 test/support files and 179,139 test/support lines, as well as immutable integration resources and the tracked generated Control bundle.
- **Findings:** 37 total: 4 High, 19 Medium, 14 Low; 33 have High confidence and 4 have Medium confidence. No Critical finding was established.
- **Most important results:**
  - `ConsoleEmailer` logs complete verification/reset email bodies, including bearer URLs, despite the package's explicit prohibition on logging those tokens.
  - a legacy Control Source-authoring UI/parser cluster remains bundled and tested although no owned page, route, registrar, or production caller reaches it; the cluster represents about 2,860 source/test lines;
  - Commerce and Photo Albums carry near-complete copies of the same image probing and multipart ingestion implementation, while several Edge functions separately implement the same HTTP/authentication support protocol;
  - five production Mongo auth stores, `MongoDashboardRepository`, and the envelope-encryption Mongo/field layer lack direct or shared adapter contract coverage;
  - the binding authoring contract already differs across `cms-content`, Components, and the compiler facade, and the Components lazy-build manifest omits the publicly exported `Stack` component;
  - three official-integration tests bypass package boundaries by importing Components source files directly.
- **Conservative reduction estimate:** approximately 3,200 lines are high-confidence removal candidates after a final product-owner check. A further 500–800 lines are probable legacy/public-contract candidates. Roughly 1,500–2,200 repetitive implementation lines are credible consolidation targets. These ranges are not additive: some clusters overlap, and public or immutable contracts require review before deletion.
- **Limits:** this is a static repository audit, not production coverage telemetry. Public exports can have consumers outside this monorepo; convention-loaded resources and file-system routes are intentionally treated as reachable; Mongo behavior was inspected from code and tests rather than exercised against a real Mongo instance; and generated/versioned material was not counted as dead merely because it has no TypeScript importer.

## 2. Methodology

### Workspace and validation setup

The audit used branch `codex/repository-audit-20260725` in `/tmp/cmscore-repository-audit-20260725`, created from the latest local `master`. The root `AGENTS.md` and every package-local `AGENTS.md` were read in full. Dependencies were made available with:

```bash
bun install --frozen-lockfile
```

The initial `bun run check:all` was recorded before creating this document. The Components package was subsequently built, without tracked output, to distinguish missing clean-worktree build artifacts from source errors and to inspect its published artifact graph.

### Inventory and static analysis

The following read-only techniques were applied across every package:

- package discovery from every `package.json`, followed by inspection of exports, dependencies, peer dependencies, scripts, and TypeScript project configuration;
- tracked-file and physical-line counts from `git ls-files` and `wc -l`;
- repository-wide `rg` searches for imports, symbols, custom-element tags, route names, registrars, manifest references, feature branches, and package subpaths;
- entrypoint-to-source reachability checks, with separate treatment for dynamic file routes, convention-loaded integrations, browser text assets, `.d.ts` inputs, and composition-root adapters;
- SHA-256 grouping of tracked file blobs: 53 duplicate groups, 181 redundant instances, and 83,120 potential duplicate bytes were found; most are small declarative/versioned files or entrypoint conventions;
- a normalized ten-line sliding-window comparison across 3,709 TypeScript/JavaScript files, excluding the generated Control bundle and declarative generated artifacts, followed by manual inspection of meaningful clusters;
- comparison of Memory/Mongo/local/HTTP implementations and their tests where they implement the same public contract;
- inspection of generated build inputs and outputs, including the Components lazy bundle list and the Control deterministic-build checks;
- manual verification by the primary auditor of every High finding and every proposed high-confidence deletion cluster.

No formatter was run, no dependency was added, and no remediation was implemented.

### Definitions and false-positive policy

- **Exact duplication** means byte-identical files or function bodies.
- **Structural duplication** means the same algorithm or orchestration with local naming/configuration changes.
- **Semantic duplication** means separate public mechanisms representing the same lifecycle or responsibility.
- **High-confidence dead code** requires at least two independent signals, such as no references plus no export/manifest/registrar, or no route plus no owned UI entrypoint.
- **Probable dead code** is internally unused but remains publicly exported or could have an unobserved external consumer.

Public exports, immutable releases, SQL migrations, declarative snapshots, dynamic API routes, integration discovery conventions, build inputs, and composition-root-only adapters were assumed live unless additional evidence disproved reachability. Similar adapters were not marked for consolidation when their storage invariants or lifecycle differ.

## 3. Repository Coverage

Sizes below count tracked package files and all tracked text lines, so they include package metadata and immutable resources. Test counts include support and aggregate entry files under each package's `tests` directory.

| Package | Layer | Approximate size | Tests | Areas inspected | Findings | Coverage |
| --- | --- | ---: | ---: | --- | ---: | --- |
| `@bernouy/components` | foundation | 401 files / 23,580 lines | 56 / 5,048 lines | exports, build manifest, base/composition, binding runtime, all UI families, assets, tests | 4 | Complete |
| `@bernouy/envelope-crypto` | foundation | 19 / 812 | 4 / 202 | primitives, envelope/cache/races, field crypto, Mongo adapter, exports | 2 | Complete |
| `@bernouy/http-runner` | foundation | 35 / 2,012 | 8 / 756 | runner/dispatch, cache/compression/CSP, observability, exports | 3 | Complete |
| `@bernouy/rate-limiter` | foundation | 10 / 315 | 2 / 129 | contract, Memory/Mongo adapters, concurrency semantics, exports | 0 | Complete; no material finding |
| `@bernouy/cms-analytics` | features | 103 / 7,873 | 30 / 2,438 | collection/privacy, reports, HLL, rollups, endpoint performance Memory/Mongo, HTTP | 1 | Complete |
| `@bernouy/cms-auth` | features | 91 / 5,874 | 27 / 2,135 | local/OIDC/PAT/session, email flows, HTTP transports, Memory/Mongo, browser exports | 4 | Complete |
| `@bernouy/cms-bloc-compile` | features | 13 / 1,034 | 6 / 521 | compiler facade, temp build, validation, exports | 1 | Complete |
| `@bernouy/cms-content` | features | 96 / 5,377 | 16 / 1,478 | content/editor contracts, binding syntax, themes, Memory/Mongo, queries | 2 | Complete |
| `@bernouy/cms-dashboards` | features | 53 / 4,190 | 17 / 1,705 | contracts, validators, projections, visibility, Memory/Mongo, exports | 1 | Complete |
| `@bernouy/cms-editor-system-v2` | features | 320 / 26,304 | 82 / 8,132 | runtime, shell/controller/domain, settings, rich text, tree, bundle, tests | 1 | Complete |
| `@bernouy/cms-files` | features | 57 / 4,200 | 20 / 1,603 | lifecycle, variants/queue, HTTP, Memory/local-FS/Mongo/S3, exports | 1 | Complete |
| `@bernouy/cms-functions` | features | 74 / 6,333 | 31 / 3,492 | DSL, execution, request scope, scheduler, projections, Mongo, exports | 2 | Complete |
| `@bernouy/cms-identities` | features | 16 / 779 | 4 / 403 | contracts, request scope, Memory/Mongo, composition consumers | 1 | Complete |
| `@bernouy/cms-integrations` | features | 214 / 17,788 | 79 / 7,635 | definition repositories, parsing, installation/import, deployers, SQL, tests | 6 | Complete |
| `@bernouy/cms-notifications` | features | 11 / 672 | 2 / 256 | durable task, dispatch, endpoint calls, types, runtime mounting | 1 | Complete |
| `@bernouy/cms-permissions` | features | 20 / 977 | 5 / 428 | roles/grants, validation, request scope, Memory/Mongo, exports | 1 | Complete |
| `@bernouy/cms-relations` | features | 22 / 1,471 | 3 / 253 | contracts, validation, reference runtime, paths, Memory/Mongo | 2 | Complete |
| `@bernouy/cms-secrets` | features | 16 / 579 | 2 / 150 | resolution helpers, validation, Memory/Mongo, runtime consumers | 0 | Complete; no material finding |
| `@bernouy/cms-source-images` | features | 80 / 6,243 | 33 / 3,163 | policy, browser activation, interceptor, cache, local-FS/Sharp adapters | 1 | Complete |
| `@bernouy/cms-sources` | features | 127 / 11,149 | 63 / 5,752 | contracts, execution, projection, overlays, request scope, DTOs, adapters | 2 | Complete |
| `@bernouy/cms-triggers` | features | 35 / 2,835 | 8 / 780 | durable scheduling, endpoint runtime, request scope, Memory/Mongo | 1 | Complete |
| `@bernouy/cms-official-integrations` | resources | 3,477 / 265,292 | 1,076 / 110,010 | all integration indexes/releases, blocks, definitions, connectors, SQL, tests | 6 | Complete |
| `@bernouy/cms-control` | surfaces | 727 / 100,655 | 156 / 15,707 | API file routes, mounting, management, components, generated assets, tests | 6 | Complete |
| `@bernouy/cms-delivery` | surfaces | 66 / 4,864 | 23 / 2,569 | endpoint mounting, rendering/assets, binding/component builds, sources/images | 2 | Complete |
| `@bernouy/cms-repository` | surfaces | 7 / 295 | 1 / 121 | facade contracts, composition boundary, exports, tests | 1 | Complete |
| `@bernouy/cms-cli` | runtimes | 132 / 10,124 | 38 / 2,735 | command routing, push/pull, local composition, stores, workers, telemetry | 7 | Complete |
| `@bernouy/cms-server` | runtimes | 29 / 2,456 | 13 / 1,268 | production composition, adapters, workers, telemetry, shutdown | 3 | Complete |

## 4. Critical and High-Priority Findings

No Critical issue was established by static evidence. The following High findings should be handled first.

### SEC-001 — `ConsoleEmailer` exposes authentication bearer links in logs

- **Severity / confidence:** High / High
- **Packages:** `@bernouy/cms-auth`
- **Symbols and locations:** `ConsoleEmailer.send` in `packages/features/cms-auth/src/default-implementation/ConsoleEmailer.ts:5-11`; `verificationEmail` in `DefaultAuthEmailComposer.ts:10-24`; `passwordResetEmail` in the same file at `:28-42`; public export in `src/exports/index.ts:95-103`; security rule in `packages/features/cms-auth/AGENTS.md:17-20`.
- **Evidence:** `ConsoleEmailer.send` logs `input.text` in full. Both default text bodies embed `input.actionUrl`, and those URLs contain single-use email-verification or password-reset bearer tokens. The helper is public, although the repository's current runtime composition uses configured email delivery rather than `ConsoleEmailer`.
- **Why this is not a false positive:** the data flow is direct and requires no runtime inference: `actionUrl` is interpolated into `OutboundEmail.text`, which is passed unchanged to `logger.log`. It also directly contradicts a package-local rule that names both token classes.
- **Impact:** any downstream or future activation of this helper writes usable authentication secrets and recipient PII into application logs, where retention and access are normally broader than in the token store.
- **Recommendation:** deprecate/remove the helper, or limit it to non-sensitive delivery metadata. Provide a local capture mailbox for development rather than logging bodies, HTML, or action URLs.
- **Recommendation risk:** external development workflows may currently recover activation links from console output. A safe replacement must exist before removal.
- **Additional validation before deletion:** search published/downstream consumers and deployment configuration for `ConsoleEmailer`; test that replacement log events cannot contain token values, query strings, message bodies, or recipient addresses.

### DEAD-001 — A legacy Control Source-authoring subsystem is functionally unreachable but still bundled

- **Severity / confidence:** High / High
- **Packages:** `@bernouy/cms-control`
- **Symbols and locations:** `CmsEndpointsInput` in `packages/surfaces/cms-control/src/components/admin/EndpointsInput/EndpointsInput.ts:9-27,108-122` and the full `EndpointsInput/` tree (1,563 lines); unconditional bundle import in `src/components/index.ts:104-111`; `createSource` in `src/core/gateway/createProvider.ts:1-13`; `updateSource` in `src/core/gateway/updateProvider.ts:1-17`; parser tree under `src/core/validation/gateway/`, particularly `parseSourceDto.ts:36-140`; parser/UI tests under `tests/control/configuration/gateway/gateway.parseShapeField.test.ts:1-85` and `tests/control/configuration/gateway/source-dto/` (643 lines).
- **Evidence:** repository-wide searches find no `<cms-endpoints-input>` markup or programmatic tag use outside the component itself and its parser test. `createSource`, `updateSource`, and `parseSourceDto` have no production callers. The current Control API tree contains identity-provider, connector-provider, overlay, and editor-source routes, but no Source CRUD route invoking this form/parser path. The component is nevertheless imported into the monolithic Control bundle. The isolated cluster is approximately 2,132 source lines plus 728 dedicated parser/UI test lines.
- **Why this is not a false positive:** four independent reachability surfaces were checked: owned HTML, TypeScript call sites, API file routes, and public/package exports. The similarly named gateway proxy and Source authorization tests are live and were explicitly excluded from the cluster.
- **Impact:** about 2,860 lines remain maintained and shipped without an owned workflow; they inflate the Control bundle, trigger shape/fanout pressure, and can mislead tests into protecting a removed authoring model.
- **Recommendation:** confirm that direct Source authoring has been intentionally replaced by integration/overlay workflows, then remove this UI, its two helpers, the dedicated parser, and only the tests whose sole subject is that cluster.
- **Recommendation risk:** the custom element is globally registered inside the private Control bundle, so an untracked downstream admin template could theoretically instantiate it. Removing the live gateway-proxy/security code by association would also be unsafe.
- **Additional validation before deletion:** inspect deployed/custom Control templates and product requirements for direct Source creation; run an asset-size comparison and the full Control/API suite after a narrowly scoped removal.

### DUP-001 — Commerce and Photo Albums copy the same image-ingestion engine

- **Severity / confidence:** High / High
- **Packages:** `@bernouy/cms-official-integrations`
- **Symbols and locations:** Commerce probe files at `packages/resources/official-integrations/integrations/domains/commerce/versions/1.0.0/connectors/supabase/functions/cms-commerce/routes/catalog/media/probe/{avif,bytes,gif,index,jpeg,png,types,webp}.ts:1-end`; Photo Albums copies at `.../domains/photo-albums/versions/1.0.0/connectors/supabase/functions/cms-photo-albums/media/probe/{avif,bytes,gif,index,jpeg,png,types,webp}.ts:1-end`; corresponding `multipart.ts:1-80` and `multipartParser.ts:1-134` in both media directories.
- **Evidence:** the probe trees are 705 lines each. Six of eight corresponding files (`avif`, `gif`, `jpeg`, `png`, `types`, `webp`) are byte-identical; `bytes` and `index` differ only in local imports/naming. The two 80-line multipart wrappers and two 134-line parsers have the same algorithm and differ at integration-specific imports/errors. One redundant copy therefore represents roughly 919 image-parsing lines before the duplicated local HTTP/error support is counted.
- **Why this is not a false positive:** the comparison used hashes and normalized source windows, followed by line-by-line review. Both implementations parse the same formats, enforce the same limits, and have the same deployment lifecycle; this is not merely similarity between different persistence adapters.
- **Impact:** security fixes for malformed images, decompression limits, multipart framing, and media validation must be applied twice in immutable release trees. A one-sided fix would leave an equivalent public upload surface vulnerable or behaviorally inconsistent.
- **Recommendation:** establish one versioned Edge support source for image probing/multipart parsing and generate or vendor the exact output into each immutable release. Prefer authoring-time generation or a separately versioned, explicitly pinned deployable module; do not make an old release import mutable repository-global code.
- **Recommendation risk:** Supabase Edge builds and immutable integration releases are intentionally self-contained. A runtime shared import can break deployment, offline installation, or historical reproducibility.
- **Additional validation before deletion:** execute the same malformed-image and multipart contract corpus against both generated bundles; verify Deno/Supabase bundling and checksum immutability; retain integration-specific policy, storage, and authorization code outside the shared kernel.

### TEST-001 — Sensitive production adapters lack direct contract coverage

- **Severity / confidence:** High / High
- **Packages:** `@bernouy/cms-auth`, `@bernouy/cms-dashboards`, `@bernouy/envelope-crypto`
- **Symbols and locations:** five auth adapters under `packages/features/cms-auth/src/default-implementation/mongo/`: `MongoAuthTokenStore.ts:14-end`, `MongoIdentityProviderRepository.ts:19-end`, `MongoLocalCredentialStore.ts:33-end`, `MongoPatRepository.ts:17-end`, and `MongoUsersRepository.ts:34-end`; exports in `cms-auth/src/exports/mongo.ts:7-23`; production wiring in `packages/runtimes/cms-server/src/runtime/stores/core.ts:4-8,49-55`; `MongoDashboardRepository` in `packages/features/cms-dashboards/src/default-implementation/MongoDashboardRepository.ts:12-83`; `FieldCrypto` and `MongoDekRepository` in `packages/foundation/envelope-crypto/src/core/FieldCrypto.ts:24-87` and `src/default-implementation/MongoDekRepository.ts:25-94`.
- **Evidence:** none of the five auth Mongo classes is referenced by the package's tests. Dashboard tests exercise the in-memory repository and domain validation, but not `MongoDashboardRepository`. Envelope tests cover primitives, envelope caching/races, and `loadKek`, but not the exported field-crypto/Mongo repository integration.
- **Why this is not a false positive:** these adapters are exported and wired by the server, so they are live rather than dead. Test entrypoints and support files were exhaustively searched by class and contract name.
- **Impact:** production-only behavior is unverified for single-use token consumption, unique/TTL indexes, encrypted PII and blind indexes, PAT expiry/`lastUsedAt`, role serialization, dashboard duplicate handling, DEK races, and BSON round-trips. Memory tests cannot establish those guarantees.
- **Recommendation:** introduce shared repository contract suites run against Memory and real ephemeral Mongo adapters, with dedicated concurrency/index tests for behavior that cannot be modeled in memory. Prioritize auth tokens, credentials, PATs, and envelope encryption.
- **Recommendation risk:** real-database suites are slower and can become flaky if collections are not isolated. Pure mapping tests should remain fast, while race/index assertions use a controlled database lifecycle.
- **Additional validation before implementation:** inventory any higher-level end-to-end tests that already cover these adapters, define the production invariants explicitly, and confirm CI can provision an isolated Mongo database without sharing tenant prefixes.

## 5. Duplication Clusters

### Exact duplication

`DUP-001` is the largest exact/near-exact executable cluster and is described in the High findings. The following smaller exact cluster also merits consolidation.

### DUP-006 — Sales proposal blocks maintain identical behavioral modules

- **Severity / confidence:** Medium / High
- **Packages:** `@bernouy/cms-official-integrations`
- **Symbols and locations:** `prepareDraftPayload` and helpers in `packages/resources/official-integrations/integrations/domains/sales-configurator/versions/1.0.0/blocs/sales-proposal-builder/formPayload.ts:1-70` and `sales-proposal-starter/formPayload.ts:1-70`; `formatMoney` in both blocks' `presentation.ts:1-22`.
- **Evidence:** the two `formPayload.ts` files are byte-identical, as are the two `presentation.ts` files: 92 repeated executable lines. Their `Bloc.ts` files also share a larger setup/lifecycle shape while differing in block-specific behavior.
- **Why this is not a false positive:** these modules implement identical selectors, payload schema, quantity/id normalization, hidden-input lifecycle, and currency formatting inside the same release and domain.
- **Impact:** fixes to proposal payload construction or display formatting can diverge between the entry and builder experiences.
- **Recommendation:** use one sales-domain authoring source and emit/copy it into both self-contained block bundles, or add resource-build support for an explicitly shared immutable module. Keep genuinely different block orchestration local.
- **Recommendation risk:** block compilation may intentionally isolate directories. A direct relative import could make a block artifact incomplete when installed independently.
- **Additional validation before consolidation:** build, install, and execute each block separately from its declared artifact path; ensure the emitted artifact contains the shared code and preserves release immutability.

### Structural duplication

### DUP-002 — Two auth transports duplicate the same operation protocol

- **Severity / confidence:** Medium / High
- **Packages:** `@bernouy/cms-auth`
- **Symbols and locations:** direct handlers/routes in `packages/features/cms-auth/src/http/publicAuthHandlers.ts:15-99`; system Source dispatcher and path list in `src/http/systemAuthSource.ts:18-67,86-130`; duplicated `readJsonObject`, `requiredString`, `optionalString`, and `ok` helpers in both files.
- **Evidence:** both adapters dispatch the same eight signup/login/logout/verification/reset operations and repeat request parsing and success projection. `optionalString` at `publicAuthHandlers.ts:94-97` and `systemAuthSource.ts:125-128` has no caller in either file or elsewhere.
- **Why this is not a false positive:** both paths are live transports, but the duplicated part is the same auth application protocol, not transport-specific mounting. Known differences such as Source-specific disabled-signup behavior were identified and must remain adapter policy.
- **Impact:** validation, status mapping, and future auth operations can drift between direct routes and the system Source. Dead helpers already demonstrate copy-forward maintenance.
- **Recommendation:** share operation identifiers and application dispatch/parsing primitives, while retaining distinct HTTP/Source mounting and error presentation. Remove the two unused `optionalString` copies.
- **Recommendation risk:** over-consolidation could erase intentional route/method/error differences.
- **Additional validation before consolidation:** run one table-driven contract corpus against both transports and explicitly snapshot their intentional differences.

### DUP-003 — CLI and server duplicate Source telemetry and trusted-target policy

- **Severity / confidence:** Medium / High
- **Packages:** `@bernouy/cms-cli`, `@bernouy/cms-server`, with contracts from `@bernouy/cms-analytics`, `@bernouy/cms-integrations`, and `@bernouy/cms-sources`
- **Symbols and locations:** `createLocalSourceTelemetry`, `createLocalTrustedConnectorTargetMatcher`, `sourceDiagnosticLog`, `trustedBase`, and `containsTarget` in `packages/runtimes/cms-cli/src/dev-server/runtime/sourceTelemetry.ts:5-87`; corresponding server functions in `packages/runtimes/cms-server/src/runtime/sourceTelemetry.ts:5-103`.
- **Evidence:** roughly 60 lines are exact or structurally identical. The only material differences are whether thresholds/reporters are fixed locally or provided through production configuration.
- **Why this is not a false positive:** both runtimes intentionally compose different adapters, but URL containment, connector preview handling, observation projection, and diagnostic serialization have the same security and analytics invariants.
- **Impact:** a trust-boundary or privacy correction can be applied to production but missed in local preview, reducing fidelity and potentially allowing different connector targets.
- **Recommendation:** move the trusted-target matcher to the integration contract/default implementation and the diagnostic/observation projection to the owning analytics or Sources feature. Keep environment-specific values in each runtime.
- **Recommendation risk:** moving executable helpers into the wrong feature can create a dependency-direction violation or load adapters through a root export.
- **Additional validation before consolidation:** preserve tests in both runtime compositions and add shared cases for credentials, path-prefix boundaries, origins, malformed URLs, and diagnostic redaction.

### DUP-004 — Integration import has competing lifecycle entrypoints and repeated surface assembly

- **Severity / confidence:** Medium / High
- **Packages:** `@bernouy/cms-integrations`, `@bernouy/cms-control`, `@bernouy/cms-official-integrations`
- **Symbols and locations:** low-level `importIntegration` in `packages/features/cms-integrations/src/core/importIntegration.ts:11-21`; lifecycle `runIntegrationInstallation` in `src/core/installation/execution/runIntegrationInstallation.ts:38-end`; adjacent public exports in `src/exports/index.ts:99-109`; duplicate `IntegrationImportDeps` construction in `packages/surfaces/cms-control/src/api/_platform/integrations/import.post.ts:15-33` and `installations/rerun.post.ts:15-33`.
- **Evidence:** Control create/rerun production flows use the lifecycle entrypoint, which adds installation persistence, snapshot, secret collision, commit/cleanup, and rerun behavior. Many feature/resource tests call the lower-level importer directly, while others call the full lifecycle. Control also copies the same 19-line dependency projection for both modes.
- **Why this is not a false positive:** the low-level function is useful internally, but exporting both under similarly broad names makes their guarantees ambiguous; test call-site inspection shows real semantic competition rather than a simple private helper chain.
- **Impact:** integration tests can pass without exercising production lifecycle invariants, and create/rerun dependencies can drift when a new repository/deployer is added.
- **Recommendation:** rename/internalize the low-level operation as an artifact import primitive, document which tests intentionally target it, move lifecycle/official contract tests to `runIntegrationInstallation`, and extract one Control dependency assembler.
- **Recommendation risk:** third-party integrations may consume `importIntegration`; changing visibility/name is a public-contract change. Some unit tests should remain low-level for fault localization.
- **Additional validation before change:** inventory downstream imports, categorize every current test by artifact-vs-installation intent, and verify create/rerun behavior through the same assembled dependency object.

### DUP-005 — Endpoint-performance semantics are independently implemented in Memory and Mongo

- **Severity / confidence:** Medium / High
- **Packages:** `@bernouy/cms-analytics`
- **Symbols and locations:** Memory ranges/dashboard projection in `packages/features/cms-analytics/src/default-implementation/memory/endpoint-performance/projectDashboard.ts:26-85,121-123`, staleness in `health.ts:42-52`, sorting in `sortRows.ts:6-25`; Mongo equivalents in `src/default-implementation/mongo/endpoint-performance/readDashboard.ts:24,38-90` and `readOverview.ts:20-31,34-87`.
- **Evidence:** time windows, `partial`/`stale` metadata, timeline ladder, sort mapping, and tie-break semantics are expressed twice. Separate Memory and Mongo tests exist, but no shared fixture/contract suite submits identical observations and compares results.
- **Why this is not a false positive:** Mongo aggregation and Memory iteration are legitimately different and are not proposed for inheritance. The duplicated elements are pure public-report semantics with the same reason to change.
- **Impact:** development and production dashboards can disagree about range boundaries, staleness, bucket assignment, or ordering.
- **Recommendation:** share only pure constants/formulas and add parity fixtures across both adapters. Keep Mongo pipelines and Memory storage independent.
- **Recommendation risk:** Mongo collation and aggregation rounding can legitimately differ from JavaScript behavior.
- **Additional validation before consolidation:** define allowed ordering/rounding differences and run the parity suite against a real Mongo instance, not a fake that reproduces the implementation.

### DUP-008 — `cms-files` repeats query/path semantics and imports another feature for one generic helper

- **Severity / confidence:** Low / High
- **Packages:** `@bernouy/cms-files`, `@bernouy/cms-content`
- **Symbols and locations:** filter/search/sort/pagination in `packages/features/cms-files/src/default-implementation/memory/inMemoryFilesQueries.ts:3-22,62-89` and `local-fs/localFsQueries.ts:8-43,111-135`; three `parentOf` copies in `localFsQueries.ts:106-109`, `localFsMutations.ts:94-97`, and `LocalFsCmsFiles.ts:132-135`; `collectSubtree` forwarding wrapper in `localFsMutations.ts:90-92`; sole `cms-content` import in `mongo/mongoFilesQueries.ts:1,15-16` for `escapeRegex` from `cms-content/src/core/utils/escapeRegex.ts:1-9`.
- **Evidence:** Memory and local-FS implement the same in-process list transformation. The path helper is byte-identical three times. `package.json:14-19` carries a feature-to-feature dependency whose only use is a generic regex escape.
- **Why this is not a false positive:** Mongo query execution is intentionally different and excluded. The shared candidates are pure operations with the same `FilesListOptions` contract.
- **Impact:** adapter result ordering/pagination can drift, and a broad feature dependency exists for a utility unrelated to CMS content.
- **Recommendation:** centralize local pure list/path behavior inside `cms-files`, add Memory/local-FS/Mongo contract fixtures, and localize `escapeRegex` or move it to an existing foundation owner only if multiple real consumers justify that move.
- **Recommendation risk:** undefined sort/collation and search semantics differ in Mongo; do not force its query engine through the in-memory implementation.
- **Additional validation before consolidation:** assert the contract's case sensitivity, stable tie-breaks, pagination bounds, and root-path behavior across all three metadata repositories.

### DUP-007 — Request memoization and dotted-path primitives have multiple owners

- **Severity / confidence:** Low / High
- **Packages:** `@bernouy/cms-functions`, `@bernouy/cms-identities`, `@bernouy/cms-sources`, `@bernouy/cms-triggers`, `@bernouy/cms-relations`
- **Symbols and locations:** Promise memoizers in `packages/features/cms-functions/src/core/execution/support/promiseMemoization.ts:1-19`, `cms-sources/src/core/repositories/requestScopeCache.ts:1-37`, `cms-triggers/src/default-implementation/RequestScopedTriggerRepository.ts:113-130`, and the open-coded cache in `cms-identities/src/default-implementation/RequestScopedIdentityService.ts:15-25`; dotted lookup in `cms-relations/src/core/paths.ts:1-13`, `cms-sources/src/core/validation/parseDataShape.ts:59-75`, and delegation from `cms-functions/src/core/model/expressions.ts:81-83`.
- **Evidence:** all four memoizers cache the pending Promise and evict on rejection. The dotted-path functions traverse the same path shape, but Relations permits inherited properties while Sources requires `Object.hasOwn`, which is an observed semantic drift.
- **Why this is not a false positive:** the recommendation is limited to the pure cache primitive after checking rejection semantics; it does not merge repository-specific cloning/invalidation. The path difference is documented rather than assumed equivalent.
- **Impact:** fixes to single-flight failure behavior are repeated, and expression/relation/source paths can resolve the same payload differently.
- **Recommendation:** place a generic Promise memoizer in an appropriate foundation utility only if its Map/WeakMap lifecycle can be expressed without CMS knowledge. Choose and document one safe own-property path policy, then delegate feature consumers to it.
- **Recommendation risk:** a shared cache can accidentally retain request objects or change mutation isolation; changing inherited-property access can break legacy payloads.
- **Additional validation before consolidation:** add rejection/retry, concurrent-wave, key isolation, weak-reference lifecycle, prototype-pollution, array-index, and missing-segment tests.

### DUP-009 — Responsive image DOM cleanup and test fixtures are copied locally

- **Severity / confidence:** Low / High
- **Packages:** `@bernouy/cms-source-images`
- **Symbols and locations:** canonical `scrubUnresolvedNetworkAttributes` in `packages/features/cms-source-images/src/core/responsive/ownership.ts:51-58`; private copies in `responsive/attributes.ts:156-163` and `responsive/element.ts:156-163`; duplicated `FakeImage` setup in `tests/browser/element-bindings/fixture.ts:1-30` and `tests/browser/domActivation.test.ts:8-39`.
- **Evidence:** the three scrubbers have the same loop and removal condition. The shared version is already consumed by `activation.ts:5,46`, so an owner already exists.
- **Why this is not a false positive:** the network-safety invariant and affected attributes are identical, and no lifecycle-specific behavior exists inside the copied function.
- **Impact:** one responsive activation path can miss a future unsafe-attribute fix; test DOM behavior can diverge between two fake implementations.
- **Recommendation:** import the existing ownership helper in both modules and reuse one `FakeImage` fixture.
- **Recommendation risk:** very low; TypeScript element types differ but are compatible with the `Element` contract.
- **Additional validation before consolidation:** run the browser activation, element-binding, ownership, and unresolved-binding suites together.

### DUP-010 — Outer layers duplicate transport routes, remote resolution, and analytics version literals

- **Severity / confidence:** Low / High
- **Packages:** `@bernouy/cms-integrations`, `@bernouy/cms-repository`, `@bernouy/cms-cli`, `@bernouy/cms-server`
- **Symbols and locations:** HTTP client paths in `packages/features/cms-integrations/src/default-implementation/http-definition/HttpIntegrationDefinitionRepository.ts:31-75` and server routes in `packages/surfaces/cms-repository/src/RepositoryCms.ts:24-64`; CLI `resolveAdmin` copies in `packages/runtimes/cms-cli/src/commands/CLI_push.ts:43-57`, `CLI_pull.ts:31-45`, and `CLI_secrets.ts:17-31`; analytics version literals in `cms-cli/src/commands/dev/servers.ts:67,150` and `packages/runtimes/cms-server/src/runtime/mountSurfaces.ts:70,139`.
- **Evidence:** the repository client and server spell the same five paths independently and their unit tests mock each side separately; there is no producer-to-client contract covering all five routes. The CLI copies URL/token validation and error text three times (plus the dead import command). Each runtime passes its CMS analytics version separately to Control and Delivery.
- **Why this is not a false positive:** the duplicated values form direct producer/consumer or same-runtime contracts and therefore have the same reason to change. The finding does not propose merging runtime composition roots.
- **Impact:** a route rename can break remote catalogs without a failing cross-side test; credential error behavior can drift across commands; Control and Delivery can report different CMS versions within one process.
- **Recommendation:** share a transport-neutral route descriptor or add an end-to-end repository contract; extract one CLI remote resolver; derive each runtime's analytics version once and pass it to both surfaces.
- **Recommendation risk:** a shared route module must not make the resource surface depend upward on an HTTP adapter, and CLI commands may require command-specific diagnostics.
- **Additional validation before consolidation:** execute all five client operations against a mounted `RepositoryCms`, snapshot command-specific errors, and assert identical analytics versions in Control/Delivery composition tests.

### Semantic duplication

`DUP-004` is the principal semantic cluster: artifact import and installation lifecycle are both exposed as broadly named import APIs. `API-001` below also records a duplicated contract whose copies have already diverged.

### Intentional duplication that should remain

- Memory, Mongo, local-FS, and S3 repository implementations should not share persistence orchestration merely because method names align. Their atomicity, indexes, filesystem transactions, cloning, and serialization invariants differ.
- SQL migrations, SQL bundle manifests, integration snapshots, and versioned resources are append-only or immutable release material. No exact SQL blob duplication was found, and historical copies must not be rewritten to reduce line count.
- Fifteen documentation block `Bloc.ts` files use the same short compiler entrypoint convention. Each block artifact must remain independently buildable; generation may reduce authoring repetition, but runtime inheritance is not warranted.
- The identical two-line editor test aggregators and tiny dialog `emit.ts`/`compute.ts` modules are conventions or cohesive local behavior; extracting them would add indirection without meaningful maintenance reduction.
- Empty/light-DOM templates and small repeated declarative schema nodes are intentional shape markers, not executable duplication.

## 6. Dead-Code Candidates

### Confirmed or high-confidence candidates

### DEAD-004 — Several small source files have two or more independent orphan signals

- **Severity / confidence:** Low / High
- **Packages:** `@bernouy/components`, `@bernouy/cms-cli`, `@bernouy/cms-control`, `@bernouy/cms-official-integrations`
- **Symbols and locations:** `HorizontalNavbar` and `NavItem` trees at `packages/foundation/components/src/ui/Navigation/HorizontalNavbar/{HorizontalNavbar.ts:1-28,style.css:1-82,template.html:1-18}` and `Navigation/NavItem/{NavItem.ts:1-57,style.css:1-65,template.html:1-9}`; foundation `BubblesEvent` at `components/src/base/BubblesEvent.ts:1-8`; `CLI_importBloc` at `packages/runtimes/cms-cli/src/commands/CLI_importBloc.ts:1-57`; `buildRequestUrl` at `packages/surfaces/cms-control/src/core/dom/buildRequestUrl.ts:1-13`; `CustomHTMLElement` at `cms-control/src/components/CustomHTMLElement.ts:1-19`; `requirePublicSeller` at `packages/resources/official-integrations/integrations/domains/commerce/versions/1.0.0/connectors/supabase/functions/cms-commerce/routes/offer/public-seller.ts:1-20`.
- **Evidence:** the two navigation components have no import, export, build-manifest entry, test, tag use, or bundle reachability. Foundation `BubblesEvent` is unreferenced and byte-identical to the live Control copy. `CLI_importBloc` has no command routing/caller, and `cms-cli/tests/push/blocs.run.test.ts:62-70` explicitly asserts that current push does not use it. Both Control files have no import/export. A graph from all ten Commerce Edge function entrypoints reaches every connector TypeScript file except `public-seller.ts`, which also has no definition/test reference.
- **Why this is not a false positive:** every item has at least absence of references plus absence from its relevant public/build/route/manifest entry mechanism. The Components package export map blocks unsupported deep imports. The Commerce check started at actual deployed function entries rather than a generic TypeScript barrel.
- **Impact:** approximately 376 executable/style/template lines add search noise and create misleading alternative owners or abandoned policy.
- **Recommendation:** remove each item in a dedicated, independently reviewable change after an owner confirms abandonment. Keep the live Control `BubblesEvent` unless a broader event primitive is deliberately designed.
- **Recommendation risk:** unsupported historical deep imports or an untracked integration deployment script could still reference these paths.
- **Additional validation before deletion:** search downstream repositories/published package usage, build every affected artifact, and run CLI push plus the complete Commerce connector contract suite.

### DEAD-005 — The concrete `RuntimeEditor` is production-source test scaffolding

- **Severity / confidence:** Low / High
- **Packages:** `@bernouy/cms-editor-system-v2`
- **Symbols and locations:** `RuntimeEditor` in `packages/features/cms-editor-system-v2/src/runtime/RuntimeEditor/RuntimeEditor.ts:1-12`; internal barrel at `src/runtime/index.ts:10-17`; live dynamic path in `src/runtime/EditorRuntime/createRuntimeEditor.ts:1-20`; test usages under `tests/runtime/runtime-editor/`.
- **Evidence:** all concrete-class consumers outside its definition are tests. Production creates a runtime subclass of each catalog entry's editor through `createRuntimeEditorClass`. The package's declared root export (`src/exports/index.ts:1-9`) does not export the internal runtime barrel; the public bundle retains the factory but tree-shakes the concrete class.
- **Why this is not a false positive:** call graph, package export, and emitted-bundle reachability all agree. The factory and runtime types are live and are not part of the candidate.
- **Impact:** production source exposes a second construction model that is not used by production and makes tests less representative of catalog-specific runtime creation.
- **Recommendation:** move the concrete class to test support and exercise the factory directly, retaining its lifecycle contract tests.
- **Recommendation risk:** an out-of-repository build could deep-import a non-exported source path.
- **Additional validation before deletion:** search downstream tooling for `src/runtime/RuntimeEditor`, and confirm generated declarations/bundles remain unchanged except for the removed internal artifact.

### Probable candidates requiring public-contract review

### DEAD-002 — The process-local function scheduler appears superseded by durable triggers

- **Severity / confidence:** Medium / Medium
- **Packages:** `@bernouy/cms-functions`, with runtime replacement in `@bernouy/cms-triggers`, `@bernouy/cms-cli`, and `@bernouy/cms-server`
- **Symbols and locations:** `createScheduledSystemFunctionRunner` and exports in `packages/features/cms-functions/src/core/scheduled/index.ts:25-148`; `runScheduledSystemFunctionOnce` in `src/core/scheduled/runOnce.ts:16-73`; scheduler types in `src/core/scheduled/types.ts:4-51`; public exports in `src/exports/index.ts:53-63`; sole internal consumer suite `tests/scheduled/scheduledFunctionRunner.test.ts:1-147`.
- **Evidence:** no production composition calls the process-local runner. Both CLI and server start durable trigger scheduling through their `scheduledTriggers.ts` composition, while the old subsystem is reached only by its own tests and public export. The candidate is about 286 source lines plus 147 test lines.
- **Why this may be a false positive:** it is a documented public export and could be used by external embedders that do not use the repository's runtimes.
- **Impact:** two scheduling models expose different locking, durability, restart, and observability guarantees; users can choose the weaker one without a clear lifecycle distinction.
- **Recommendation:** document the durable scheduler as canonical, survey consumers, deprecate the process-local API, then remove it in an appropriate contract release if unused.
- **Recommendation risk:** immediate deletion could break an embedded external runtime.
- **Additional validation before deletion:** inspect package-download/downstream usage, release notes, and any supported embedding examples; compare every old capability with durable triggers.

### DEAD-003 — Flat/canonical Source DTO projections no longer serve the active workflow

- **Severity / confidence:** Medium / Medium
- **Packages:** `@bernouy/cms-sources`
- **Symbols and locations:** `sourceToFlatDto` and `sourceToCanonicalDto` in `packages/features/cms-sources/src/core/overlays/sourceDto.ts:35-41`; `flattenSourceDto` and `canonicalizeSourceDto` in `sourceDtoViews.ts:3-80`; associated public types in `sourceDtoTypes.ts:47-58`; public exports in `src/exports/index.ts:77-87`; remaining coverage in `tests/overlays/sourceDto.test.ts:79-117`.
- **Evidence:** repository-wide symbol search finds no production consumer for either projection; active workflows use `sourceDtoToSource` and `sourceToDto`. Their only internal consumers are the two wrappers and their tests. Git history shows that the earlier CLI gateway push workflow was removed in commit `100781d5`.
- **Why this may be a false positive:** the functions/types are public and could be used by an external Source authoring UI.
- **Impact:** the public DTO surface preserves two display/form representations and their defaults even though no owned workflow depends on them, increasing compatibility burden.
- **Recommendation:** confirm the Source authoring product direction, mark these views deprecated, and remove them together with the legacy Control authoring cluster if no external contract exists.
- **Recommendation risk:** downstream form serialization can break even though the monorepo is clean.
- **Additional validation before deletion:** search published docs and downstream clients for `SourceFlatDto`, `CanonicalSourceDto`, `sourceToFlatDto`, and `sourceToCanonicalDto`.

### DEAD-006 — Synchronous HTTP cache helpers are likely legacy public APIs

- **Severity / confidence:** Low / Medium
- **Packages:** `@bernouy/http-runner`
- **Symbols and locations:** `getOrGenerateEntry` in `packages/foundation/http-runner/src/core/cacheGeneration.ts:12-20`; `cachedResponse` in `src/core/compression/response.ts:15-24`; root exports in `src/exports/index.ts:35-46`.
- **Evidence:** all production consumers in Control and Delivery use `getOrGenerateEntryAsync`/`cachedResponseAsync`; synchronous variants occur only in their implementation, exports, and focused tests. The async path also provides request single-flight behavior.
- **Why this may be a false positive:** both helpers are public and are valid for purely synchronous external handlers.
- **Impact:** two cache-generation APIs expand documentation/test surface and make the non-single-flight path easy to choose accidentally.
- **Recommendation:** document async generation as canonical; verify external consumers; deprecate sync helpers before a breaking removal rather than deleting them as internal dead code.
- **Recommendation risk:** published consumers may rely on synchronous return types.
- **Additional validation before deletion:** search downstream packages and release artifacts, then provide a migration example showing the Promise-returning equivalent.

### Externally or dynamically reachable and therefore uncertain

- `resolveSecretRefs` has no monorepo consumer, but `packages/features/cms-secrets/AGENTS.md` explicitly defines it as a public helper. It is not a dead-code finding.
- Browser/package exports, dynamic Control API file routes, integration definitions, connector manifests, and adapters imported only by composition roots were treated as reachable.
- `linkTable` relations and the legacy `{ path: "*.sql" }` schema form are not classified as dead here because both are public contracts; their lifecycle inconsistencies are documented below.

## 7. Dependency and Boundary Findings

### API-001 — The binding contract is copied three times and already disagrees

- **Severity / confidence:** Medium / High
- **Packages:** `@bernouy/cms-content`, `@bernouy/components`, `@bernouy/cms-bloc-compile`, `@bernouy/cms-editor-system-v2`
- **Symbols and locations:** canonical authoring constants in `packages/features/cms-content/src/interfaces/Editor/BindingSyntax/types.ts:1-37`, especially `CMS_SOURCE_TRIGGERS` at `:33`; runtime copy in `packages/foundation/components/src/binding/core/attrs.ts:1-22`; virtual compiler facade in `packages/features/cms-bloc-compile/src/core/p9rExternalsPlugin.ts:44-83`, especially `:67`; editor emission in `packages/features/cms-editor-system-v2/src/components/Settings/SettingsView/internals/endpointBinding.ts:84-86`; runtime behavior test in `components/tests/binding/source/submit-trigger/lifecycle.test.ts:9-35`.
- **Evidence:** `cms-content` and Components accept `auto`, `submit`, and `change`; the compiler's virtual `@bernouy/cms-content/editor` module exposes only `auto` and `submit`. Attributes, states, and other constants are also manually repeated. Existing compiler tests only establish that compiled editor code emits a `cms-source`, not constant parity.
- **Why this is not a false positive:** `change` is emitted by the current editor and executed by the current runtime, so it is not a speculative future value. Compiled block editor code importing the constant sees a different public value set.
- **Impact:** authoring code can reject or omit a valid runtime trigger, and future additions require synchronized edits across three layers.
- **Recommendation:** create one layer-safe generated/pure contract source, or at minimum add a parity test that evaluates every virtual facade constant against the canonical/runtime values. Do not introduce a reverse dependency from foundation to features.
- **Recommendation risk:** compiler facades may intentionally expose a subset to sandboxed code; if so, that subset must be explicit and documented rather than silently stale.
- **Additional validation before change:** compile and execute a fixture for every binding constant and trigger, including `change`, in both editor and Delivery runtime contexts.

### API-002 — `Stack` is public at the root but missing from the lazy block build

- **Severity / confidence:** Medium / High
- **Packages:** `@bernouy/components`
- **Symbols and locations:** root export at `packages/foundation/components/src/index.ts:64-69`; manual `blocEntries` in `src/tooling/build.ts:7-72`; wildcard public export in `package.json:63-66`; one-way manifest test in `tests/tooling/build.test.ts:6-14`.
- **Evidence:** the root has 61 concrete UI entry paths while the manual lazy list has 60; `Stack` is the only omitted concrete root export. A fresh Components build produces no `dist/blocs/stack.mjs` or `.d.ts`, although `@bernouy/components/blocs/stack` resolves through the wildcard export.
- **Why this is not a false positive:** source export, build input list, package export pattern, and emitted artifacts were all compared. `Stack` itself is live through the monolithic Control bundle.
- **Impact:** consumers can import `Stack` from the package root but the advertised lazy subpath fails at runtime/type resolution.
- **Recommendation:** add `Stack` to the manifest or explicitly declare that it has no lazy entry; add reverse-completeness validation from concrete root UI exports to `blocEntries`.
- **Recommendation risk:** the expected lazy basename/tag must be confirmed to avoid publishing the wrong subpath.
- **Additional validation before change:** build the package, import `@bernouy/components/blocs/stack` through Bun and a standard ESM resolver, and assert emitted declaration/runtime parity.

### ARCH-001 — Official integration tests import another package's private source

- **Severity / confidence:** Medium / High
- **Packages:** `@bernouy/cms-official-integrations`, `@bernouy/components`
- **Symbols and locations:** `BindingRuntime` import in `packages/resources/official-integrations/tests/commerce/selling/blocs/offer-filter-editor-runtime.integration.cases.ts:2`; `ParamSync` import in `offer-filter-list.integration.cases.ts:2`; `BindingRuntime` import in `offer-filter-range-bookmark.integration.cases.ts:2`.
- **Evidence:** all three paths traverse directly into `packages/foundation/components/src/...`. They are the only current errors from `bun run check:architecture`; package imports elsewhere follow declared exports.
- **Why this is not a false positive:** these are literal relative source imports across package roots and violate both the root architecture rules and the Components export map.
- **Impact:** tests compile against private layout and can continue passing when the published API/artifact is broken; refactoring Components internals breaks a resource package.
- **Recommendation:** expose the minimum stable test capability under an explicit `@bernouy/components/testing` subpath, or drive the scenarios through public `cms-binding-core` behavior.
- **Recommendation risk:** a testing subpath can accidentally become a broad backdoor to internals.
- **Additional validation before change:** define exactly which public contract the offer-filter tests require and ensure the replacement tests the shipped entrypoint rather than a second internal harness.

### DEP-001 — `cms-cli` uses `cms-dashboards` without declaring it

- **Severity / confidence:** Medium / High
- **Packages:** `@bernouy/cms-cli`, `@bernouy/cms-dashboards`
- **Symbols and locations:** import in `packages/runtimes/cms-cli/src/dev-server/stores/dashboards.ts:4`; dependency list in `packages/runtimes/cms-cli/package.json:18-38`.
- **Evidence:** `@bernouy/cms-dashboards` is imported in runtime source but absent from dependencies. It resolves in the monorepo only because the workspace install makes another package's dependency available.
- **Why this is not a false positive:** package manifest and source import were compared directly; unlike adapter peers, this is executable runtime code.
- **Impact:** a packed/isolated CLI can fail to resolve its dashboard store, and dependency tooling cannot model the package accurately.
- **Recommendation:** declare `@bernouy/cms-dashboards` as a workspace runtime dependency and add an isolated package-resolution or pack smoke test.
- **Recommendation risk:** negligible beyond lockfile/package metadata churn; do not move it to a peer unless consumers are expected to supply the implementation.
- **Additional validation before change:** run the packed CLI in an empty temporary project rather than relying on root workspace hoisting.

### DEP-002 — Published package manifests contain stale dependency/file entries

- **Severity / confidence:** Low / High
- **Packages:** `@bernouy/cms-control`, `@bernouy/cms-cli`
- **Symbols and locations:** `mongodb` peer declaration in `packages/surfaces/cms-control/package.json:46-48`; Control `files` entries for `.claude/skills/` and `CLAUDE.md` in the same manifest; CLI `files` entry for `README.md` in `packages/runtimes/cms-cli/package.json:13-16`.
- **Evidence:** repository-wide search finds no Control reference to `mongodb`. The surface receives repositories through `ControlCms`, and its architecture rules prohibit selecting concrete persistence adapters. The two Control paths and the CLI README named by their publish manifests do not exist in their package directories.
- **Why this is not a false positive:** full tracked source/build inputs and the filesystem were checked. Missing `files` entries are literal; transitive Control type exposure does not currently mention Mongo types.
- **Impact:** consumers are told to install/version a driver the surface does not own, and published-package expectations/documentation are stale or silently omitted.
- **Recommendation:** remove the peer and nonexistent file entries, or add the intended package documentation if it is genuinely part of the publication contract.
- **Recommendation risk:** generated declarations could indirectly name a Mongo type under a different build, and publishing intended missing documentation may require separate content review.
- **Additional validation before change:** inspect emitted `.d.ts`, run `bun pm pack --dry-run` (or equivalent) for both packages, test an isolated consumer, and search downstream manifests.

### PACK-001 — The Components `binding` ESM subpath resolves to the entire root bundle

- **Severity / confidence:** Low / High
- **Packages:** `@bernouy/components`, `@bernouy/cms-delivery`
- **Symbols and locations:** `./binding` conditional export in `packages/foundation/components/package.json:44-48`; Delivery workaround in `packages/surfaces/cms-delivery/src/core/assets/buildBindingCore.ts:13-24`.
- **Evidence:** the `types` and `bun` conditions point to binding-specific files, while `import`/`default` point to `dist/index.js`. Delivery explicitly forces the `bun` source condition to obtain an approximately 18 KB tree-shaken engine instead of pulling the approximately 60 KB root bundle.
- **Why this is not a false positive:** the asymmetry is in the published manifest and the consumer documents its measured consequence.
- **Impact:** standard ESM consumers of a narrowly named subpath load the whole UI toolkit; the workaround also makes Delivery depend on a resolver condition and live source layout.
- **Recommendation:** emit a dedicated `dist/binding.js`, align runtime/type conditions, and add artifact-size plus resolver smoke tests.
- **Recommendation risk:** conditional export changes can behave differently in Node, Bun, and bundlers.
- **Additional validation before change:** test Bun, Node ESM, and the Delivery bundle; compare public symbols and bundle size before publishing.

### CONTRACT-001 — `linkTable` is accepted and imported but always fails at runtime

- **Severity / confidence:** Medium / High
- **Packages:** `@bernouy/cms-relations`, `@bernouy/cms-integrations`
- **Symbols and locations:** public kind/type in `packages/features/cms-relations/src/interfaces/Relation.ts:4-5,28-46`; validation in `src/core/validation/relation.ts:48-59`; integration parsing in `packages/features/cms-integrations/src/core/parsing/artifacts/relations/relation.ts:74-123`; runtime rejection in `cms-relations/src/core/resolveRelationPage.ts:29-37`.
- **Evidence:** definitions containing `linkTable` pass parsing and validation, can be installed, and then receive an unconditional HTTP-style 501 from the only page resolver. No official definition or test fixture uses the kind.
- **Why this is not a false positive:** the branch is explicitly implemented as “not implemented yet,” not inferred unreachable. Public third-party definitions remain the uncertainty.
- **Impact:** installation success falsely suggests an executable relation contract; failure occurs only when a page requests data.
- **Recommendation:** either reject `linkTable` during import until implemented, implement it behind a complete contract suite, or remove/deprecate it if external usage is absent.
- **Recommendation risk:** changing import validation can reject an existing third-party definition that currently installs, even if it later fails.
- **Additional validation before change:** survey stored integration definitions and downstream SDKs, then decide whether compatibility requires a staged deprecation.

### CONTRACT-002 — File-system and HTTP integration index parsers have already drifted

- **Severity / confidence:** Medium / High
- **Packages:** `@bernouy/cms-integrations`
- **Symbols and locations:** FS `parseIntegrationDefinitionIndex` in `packages/features/cms-integrations/src/default-implementation/fs-definition/repositorySupport.ts:24-50`; HTTP `parseIndex`/`parseVersions` in `src/default-implementation/http-definition/httpDefinitionParsing.ts:15-39`; FS summary projection in `fs-definition/repository.ts:31-45`.
- **Evidence:** both adapters rebuild the same metadata/version model. The FS parser rejects an empty `versions` array at `repositorySupport.ts:36-38`; HTTP only requires an array and accepts empty at `httpDefinitionParsing.ts:25-39`. Metadata and summary projection are also duplicated.
- **Why this is not a false positive:** both implement `IntegrationDefinitionRepository` and parse the same wire shape; the concrete empty-array behavior differs.
- **Impact:** the same repository is valid over HTTP and invalid from disk, and future schema fields require edits in multiple parsers/projections.
- **Recommendation:** extract a persistence-neutral index/summary parser and execute one contract suite against FS and HTTP repositories.
- **Recommendation risk:** HTTP responses may intentionally be more permissive for remote partial catalogs; that would need an explicit separate response type.
- **Additional validation before change:** document whether empty catalogs are valid, test malformed/missing metadata on both adapters, and preserve error context appropriate to each transport.

### CONTRACT-003 — The legacy single-SQL schema branch has no first-party release consumer

- **Severity / confidence:** Low / Medium
- **Packages:** `@bernouy/cms-integrations`, `@bernouy/cms-official-integrations`
- **Symbols and locations:** public union in `packages/features/cms-integrations/src/interfaces/IntegrationConnectorDeployer.ts:3-5`; legacy loading branch in `src/default-implementation/supabase/sql/schemaLoader.ts:15-41,58-75`; connector template selection in `src/core/parsing/templates/connectorTemplates.ts:29`.
- **Evidence:** all 33 first-party schema declarations use manifest bundles; none uses `{ path: "*.sql" }`. The legacy branch is otherwise preserved by targeted tests and the public type.
- **Why this may be a false positive:** third-party connectors can use the public `{ path }` form. Tests deliberately cover it, so it is not internally unreachable.
- **Impact:** deployment, path-security, errors, and documentation maintain two schema models although first-party releases standardized on checksummed manifests.
- **Recommendation:** measure external usage, label `{ path }` legacy, provide a manifest migration tool/example, then remove only in a contract-breaking release.
- **Recommendation risk:** silent third-party breakage and loss of simple connector support.
- **Additional validation before deletion:** inspect stored connector definitions, published docs, and downstream repositories; test migration preserves SQL order and path boundaries.

### ARCH-002 — Delivery still reads mutable process environment inside a surface

- **Severity / confidence:** Medium / High
- **Packages:** `@bernouy/cms-delivery`, with the policy enforced by repository quality tooling
- **Symbols and locations:** `process.env.MODE` reads in `packages/surfaces/cms-delivery/src/core/assets/buildBindingCore.ts:24`, `core/assets/buildComponent.ts:33`, `core/head/buildMetaCsp.ts:28`, and `runtime/DeliveryCmsContext.ts:33`; explicit ratchet in `quality/architecture/repository/repositoryPolicy.ts:9-35`.
- **Evidence:** the surface independently chooses minification, enforcing CSP behavior, and cache bypass from a global environment value. The architecture checker freezes exactly these four reads “until runtime configuration is injected,” confirming they are known exceptions rather than intended surface ownership.
- **Why this is not a false positive:** paths/counts are codified in the architecture ratchet, and Delivery's package layer is supposed to receive dependencies/configuration rather than read runtime environment.
- **Impact:** behavior depends on a mutable global, tests can influence one another through `MODE`, and CLI/server composition cannot independently or explicitly configure minification, CSP, and caching.
- **Recommendation:** add explicit immutable Delivery configuration for build mode/cache/CSP behavior, inject it from both runtimes, and reduce the ratchet to zero.
- **Recommendation risk:** collapsing several booleans into one mode can preserve accidental coupling; changing defaults can alter caching or CSP enforcement.
- **Additional validation before change:** define each behavior independently, test concurrent contexts with different configuration, and compare DEV/preview/server response headers and bundles.

### RUNTIME-001 — Listener host configuration is parsed or expected but never reaches `Bun.serve`

- **Severity / confidence:** Medium / High
- **Packages:** `@bernouy/http-runner`, `@bernouy/cms-cli`, `@bernouy/cms-server`
- **Symbols and locations:** CLI `host` flag in `packages/runtimes/cms-cli/src/commands/dev/flags.ts:8-15,22-48` and advertised URLs in `commands/dev/index.ts:67-83`; listener calls in `commands/dev/servers.ts:126,155`; expected-failure test in `tests/CLI_dev.composition.test.ts:58-63`; production environment in `packages/runtimes/cms-server/src/runtimeEnv.ts:14-56`, calls in `src/runtime/mountSurfaces.ts:159-160`, and expected-failure tests in `tests/runtimeEnv.test.ts:41-55` and `tests/prod-composition.test.ts:13-21`; `Runner.start` contract in `packages/foundation/http-runner/src/interfaces/Runner.ts:86-96` and `BunRunner.start` in `src/default-implementation/BunRunner.ts:129-138`.
- **Evidence:** CLI parses and prints `--host`, but passes only numeric ports. Production has no host fields and also passes only ports. Three `test.failing` cases describe the missing behavior. `Runner.start` cannot accept a hostname, so neither runtime can forward one. A local probe of the installed Bun returned `hostname: "localhost"` when omitted; behavior is therefore the runtime default, not the requested/advertised contract.
- **Why this is not a false positive:** the tests explicitly encode the intended behavior, and the value is visibly dropped between parsing and the listener API.
- **Impact:** `--host` can print an address that is not bound; container/production reachability depends implicitly on the Bun version/default; operators cannot explicitly restrict or expose either surface.
- **Recommendation:** add a typed listener-options overload, parse production host values, pass them through both runtimes, and convert the expected-failure tests into normal behavioral tests.
- **Recommendation risk:** changing the default bind address can expose a development/admin listener or make an existing container unreachable.
- **Additional validation before change:** decide secure defaults separately for local development and production, test IPv4/IPv6/wildcard hosts, and verify actual socket reachability rather than source-text matching alone.

### CLI-001 — `p9r pull` promises push symmetry but cannot pull files

- **Severity / confidence:** Medium / High
- **Packages:** `@bernouy/cms-cli`, with the remote file contract owned by `@bernouy/cms-control`/`@bernouy/cms-files`
- **Symbols and locations:** user help in `packages/runtimes/cms-cli/src/index.ts:23-34`; package responsibility in `packages/runtimes/cms-cli/AGENTS.md:7-12`; `TYPES`, `ORDER`, imports, and dispatch in `src/commands/CLI_pull.ts:1-15,47-58`; pull implementations under `src/push/{system,integrations,blocs,templates,pages}/pull.ts`.
- **Evidence:** help describes pull as the inverse of push with the same type set, and package instructions explicitly include files. `CLI_pull` omits `files` from both accepted types and stage order, imports no file puller, and has no dispatch branch. No file-pull implementation or media pull test exists.
- **Why this is not a false positive:** the promised behavior and implementation were compared directly; this is not a hidden dynamic stage because the closed `Stage` union enumerates all dispatchable values.
- **Impact:** a user bootstrapping `site/` receives pages/blocks that can reference media which was never materialized; `--type=files` is rejected despite being advertised as part of the same type set.
- **Recommendation:** either implement binary/metadata pull with registry IDs, safe paths, bounded/atomic writes, overwrite policy, and tests, or correct the public contract/help if remote media is deliberately not pullable.
- **Recommendation risk:** implementing file pull introduces potentially large and destructive filesystem writes; changing only the help acknowledges a real product limitation.
- **Additional validation before change:** specify conflict/content-hash semantics, symlink/path traversal protection, partial-download cleanup, pagination, and behavior when a page references a missing remote file.

## 8. Test-Suite Findings

`TEST-001` documents the most consequential coverage gap, while `ARCH-001` shows tests bypassing a package boundary. Expected-failure listener tests are covered by `RUNTIME-001`.

### TEST-002 — Several large suites duplicate scenarios or setup without adding a second contract

- **Severity / confidence:** Low / High
- **Packages:** `@bernouy/cms-integrations`, `@bernouy/cms-control`
- **Symbols and locations:** dependency scenarios in `packages/features/cms-integrations/tests/declarative/declarativeDependencies.test.ts:16-82` and `tests/declarative/import/dependencies.test.ts:13-89`; access-grant scenario in `tests/declarative/declarativeAccessGrants.test.ts:9-61` and `tests/declarative/import/triggers-and-access.test.ts:92-165`; repeated Control W-detail registration/cleanup in `packages/surfaces/cms-control/tests/admin/w-detail/derived-tables.test.ts:1-end`, `tables.test.ts:1-end`, `lifecycle/presentation.test.ts:1-end`, `lifecycle/table-presentation.test.ts:1-end`, and `lookups/table-lookups.test.ts:1-end`.
- **Evidence:** the integration pairs build the same in-memory repositories/definitions and assert the same dependency or grant contract, accounting for roughly 120–140 consolidable lines. At least five W-detail files repeat 20–30 lines registering the same `P9rInput`, `Button`, `Combobox`, `P9rSelect`, and `TokenInput` elements plus fetch/body cleanup.
- **Why this is not a false positive:** assertion sets and fixtures were compared, not only test names. Tests that exercise different installation-vs-parser layers should remain; the finding targets cases whose inputs and outcomes overlap without identifying a distinct layer.
- **Impact:** contract changes require synchronized test edits and increase suite volume while obscuring which layer owns the guarantee.
- **Recommendation:** keep one table-driven contract per behavior and explicitly parameterize it over the intended entrypoint/adapter when parity is valuable. Extract the W-detail custom-element environment into focused test support.
- **Recommendation risk:** careless deletion can remove rollback/idempotency coverage that is adjacent but not identical.
- **Additional validation before consolidation:** map each assertion to a named invariant and compare mutation/branch coverage before removing any case.

Other test observations:

- the repository has substantial focused coverage: 1,807 test/support files and 179,139 lines. High test volume is not itself duplication; the audit retained split `.cases.ts` suites when aggregate entrypoints genuinely reach them;
- Mongo endpoint-performance has dedicated write/projection/report tests, but a shared Memory/Mongo fixture is still warranted for the pure semantics in `DUP-005`;
- the Components build test validates every manifest entry points to a source, but not the reverse, which allowed `API-002`;
- auth Memory repository tests do not currently mutate arrays/dates returned by stores, which allowed `COR-001` below;
- expected failures are useful debt markers here, but the three listener-host expectations represent an advertised configuration gap, not speculative future tests.

## 9. Complexity and Repository-Shape Findings

### COR-001 — The in-memory PAT store exposes mutable authorization state by reference

- **Severity / confidence:** Medium / High
- **Packages:** `@bernouy/cms-auth`
- **Symbols and locations:** mutable `Pat.scopes` contract in `packages/features/cms-auth/src/interfaces/PatRepository.ts:14-27`; `InMemoryPatRepository.create`, `verify`, and `list` in `src/default-implementation/memory/InMemoryPatRepository.ts:15-44`; tests in `tests/repositories/PatRepository.memory.test.ts:6-48`.
- **Evidence:** `create` stores `input.scopes` directly and returns only a shallow object clone, so the returned `pat.scopes` is the stored array. `list` also shallow-clones. A read-only reproduction that appended `admin` to the scopes returned by `create` caused `verify(token)` to return `['read', 'admin']`. Current tests do not check mutation isolation.
- **Why this is not a false positive:** the behavior was confirmed by execution and follows directly from reference identity. Mongo serialization does not share the caller's array, so this is an adapter-parity defect.
- **Impact:** dev/test code holding a returned PAT can alter effective token authority without a repository method, producing misleading security behavior and potentially hiding production-only defects.
- **Recommendation:** copy scopes on input, storage, and every output; add a repository contract test that mutates returned/input arrays and dates. Audit `InMemoryIdentityProviderRepository` for the same shallow-clone pattern.
- **Recommendation risk:** low; only code relying on undocumented shared mutation would change.
- **Additional validation before change:** run the contract against Memory and Mongo for scopes, dates, nested provider metadata, and concurrent verification updates.

### HTTP-001 — `Accept-Encoding` negotiation ignores quality values and explicit refusal

- **Severity / confidence:** Medium / High
- **Packages:** `@bernouy/http-runner`
- **Symbols and locations:** `responseEncoding` in `packages/foundation/http-runner/src/core/compression/response.ts:64-71`; current cases in `tests/compression.test.ts:22-44`.
- **Evidence:** selection is `accept.includes('br')`, then `includes('gzip')`. Consequently `br;q=0, gzip` selects Brotli despite explicit refusal, and `gzip;q=1, br;q=0.1` still selects Brotli. Wildcards, weights, case, and identity refusal are not parsed. Tests cover only absent encoding, `br, gzip`, and gzip.
- **Why this is not a false positive:** behavior is deterministic from the implementation and conflicts with the standard meaning of HTTP quality weights.
- **Impact:** a client/proxy can receive a representation it marked unacceptable or a lower-preference encoding; caches can store a surprising variant.
- **Recommendation:** implement token/q-value negotiation for the supported encodings and add cases for `q=0`, weighted order, `*`, whitespace/case, identity, and total refusal.
- **Recommendation risk:** the selected representation/ETag can change for existing unusual headers.
- **Additional validation before change:** verify status behavior when no representation is acceptable and test conditional requests for every encoding.

### SHAPE-001 — Edge entrypoint monoliths and two blocking fanout directories obscure ownership

- **Severity / confidence:** Medium / High
- **Packages:** `@bernouy/cms-official-integrations`
- **Symbols and locations:** `packages/resources/official-integrations/integrations/providers/emailer/versions/1.0.0/connectors/supabase/functions/cms-emailer/index.ts:1-1343`; user account `.../domains/user-account/.../cms-user-account/index.ts:1-1228`; negotiation `.../extensions/commerce-negotiation/.../cms-commerce-negotiation/index.ts:1-793`; newsletter `.../domains/newsletter/.../cms-newsletter/index.ts:1-515`; `.../domains/commerce/versions/1.0.0/blocs/commerce-offer-filter/` (18 immediate entries); `packages/resources/official-integrations/tests/commerce/selling/blocs/` (19 immediate entries).
- **Evidence:** the first two entrypoints contain roughly 95 and 71 function declarations respectively and mix routing, authorization, environment validation, REST access, domain transformations, and response/error handling. Normalized clone analysis also finds repeated `json`, `handleError`, `optionsResponse`, `requiredEnv`, `requireCmsRequest`, and `safeEqual` families across Edge functions. Repository-shape reports the two listed directories as its only blocking fanout errors.
- **Why this is not a false positive:** large size alone is not the finding; multiple independent reasons to change are present in the same files, and the repeated support functions correlate with those mixed responsibilities.
- **Impact:** security and HTTP changes are difficult to review, reusable policy remains copied, and high-fanout block/test directories are hard to navigate. The current baseline remains red because of the two directory errors.
- **Recommendation:** split each Edge implementation into internal route/domain/auth/transport modules while preserving one self-contained deployment entry. Introduce a versioned/generated Edge support kit only after its common security contract is tested. Group the offer-filter files and tests by editor/runtime/range/list responsibility.
- **Recommendation risk:** module splitting can change Deno bundling, cold-start characteristics, and immutable release checksums; directory moves can break manifest-relative paths.
- **Additional validation before change:** build and deploy each connector from its release root, compare bundled exports/permissions, run full connector contracts, and update manifests only through an explicit release-safe process.

### TYPE-001 — Notification result/logger types promise states the implementation never produces or uses

- **Severity / confidence:** Low / High
- **Packages:** `@bernouy/cms-notifications`
- **Symbols and locations:** `NotificationDispatchResult.status` and `NotificationLogger` in `packages/features/cms-notifications/src/core/types.ts:5-19`; `dispatchNotificationsOnce` result paths and logging in `src/core/dispatch.ts:7-37`.
- **Evidence:** dispatch returns only `missing`, `succeeded`, or `failed`; no path returns `already_running`. Only `logger.error` is invoked; `info` and `warn` are never used, and current runtime compositions do not provide a logger.
- **Why this is not a false positive:** all return statements and logger calls in the small package were enumerated. The durable task itself is live and is not a dead-code candidate.
- **Impact:** callers must handle an impossible state and implement an unnecessarily broad logger interface, suggesting a locking behavior that does not exist here.
- **Recommendation:** narrow the result/logger contracts or implement/document the missing state at the actual locking owner.
- **Recommendation risk:** external callers may already exhaustively branch on the public union.
- **Additional validation before change:** inspect downstream consumers and decide whether `already_running` belongs to a wrapper task result rather than the dispatcher.

### TYPE-002 — Control duplicates the canonical open role type

- **Severity / confidence:** Low / High
- **Packages:** `@bernouy/cms-permissions`, `@bernouy/cms-control`
- **Symbols and locations:** canonical `CMS_ROLES` in `packages/features/cms-permissions/src/core/roles.ts:1-2` and export `src/exports/index.ts:32`; local copy in `packages/surfaces/cms-control/types/roles.d.ts:1-5`, used throughout Control management/components.
- **Evidence:** both aliases are exactly `string`; Control already depends on `@bernouy/cms-permissions`, and its comment describes the same manager-defined/built-in role contract.
- **Why this is not a false positive:** this is a contract identity, not two storage implementations, and there is already an owning feature package.
- **Impact:** future branding, nominal typing, or documentation can diverge between feature and surface.
- **Recommendation:** import the published permission type in Control or generate the ambient declaration from that owner if the browser build requires an ambient name.
- **Recommendation risk:** ambient browser compilation may not accept a normal module import in every current file.
- **Additional validation before change:** inspect Control declaration inclusion and browser bundle output; typecheck all 17+ current uses under both source and generated builds.

### CRYPTO-001 — `loadKek` accepts non-canonical strings despite promising strict base64

- **Severity / confidence:** Low / High
- **Packages:** `@bernouy/envelope-crypto`
- **Symbols and locations:** `loadKek` contract/implementation in `packages/foundation/envelope-crypto/src/core/loadKek.ts:1-29`; tests in `tests/loadKek.test.ts:5-19`.
- **Evidence:** `Buffer.from(value, 'base64')` is permissive and the implementation validates only decoded length. Bun/Node can ignore invalid extra characters while still yielding 32 bytes, so such a string passes. The existing invalid example decodes to the wrong length and does not test canonical syntax.
- **Why this is not a false positive:** the behavior was reproduced and the doc comment explicitly says any non-base64 form is rejected.
- **Impact:** malformed deployment configuration may be silently normalized rather than failing at boot. This is primarily fail-fast/configuration integrity, not a demonstrated cryptographic downgrade when decoded bytes are unchanged.
- **Recommendation:** validate alphabet/padding or perform a normalized round-trip before accepting the key; add invalid-character and padding tests.
- **Recommendation risk:** previously tolerated whitespace/non-canonical secrets would stop booting.
- **Additional validation before change:** decide whether surrounding whitespace is intentionally accepted and document a precise canonical environment format.

### Repository-shape baseline

The initial shape scan reported 397 file-size informational findings, 159 file-size warnings, 189 directory-fanout informational findings, and the two blocking fanout errors in `SHAPE-001`. These totals are diagnostic rather than 558 independent defects. Most large files are immutable SQL/JSON resources, generated assets, or cohesive test contracts. The audit recommends splitting only the Edge entrypoints above, whose mixed responsibilities were manually confirmed.

## 10. Package-by-Package Notes

### Foundation

#### `@bernouy/components`

Findings: `API-001`, `API-002`, `DEAD-004`, `PACK-001`. The base/composition and UI graph is otherwise well exercised. `default.css`, initially suspicious because it has no import, is deliberately copied by `src/tooling/build.ts:132`. Form/Lateral dialog micro-files and empty light-DOM templates are cohesive conventions, not useful extraction targets.

#### `@bernouy/envelope-crypto`

Findings: `TEST-001`, `CRYPTO-001`. Root versus `/mongo` exports preserve adapter boundaries, and `createFieldCrypto` is intentionally available only with the Mongo-facing surface. Envelope primitives, cache, and race behavior are tested; field encryption/repository integration needs the additional coverage described above.

#### `@bernouy/http-runner`

Findings: `HTTP-001`, `DEAD-006`, `RUNTIME-001`. `/html`, `/testing`, and `/observability` are all consumed; `bunRequestDispatch` is live through `BunRunner`; stop/dispatch/async cache logic is cohesive. The listener contract and encoding parser are the material correctness gaps.

#### `@bernouy/rate-limiter`

No material dead code, duplication, dependency, or boundary issue was confirmed. Memory and Mongo are intentionally different implementations: Mongo owns an atomic update pipeline and TTL behavior. A real-Mongo concurrency suite would be useful, but the current split is not a consolidation finding.

### Features

#### `@bernouy/cms-analytics`

Finding: `DUP-005`. Collection privacy, HLL, referrers, rollups, reports, and both endpoint-performance stores are live. `tests/hll/stripeBenchmark.ts` is an explicit manual benchmark rather than an orphan. The opportunity is parity for pure report semantics, not shared persistence code.

#### `@bernouy/cms-auth`

Findings: `SEC-001`, `COR-001`, `DUP-002`, `TEST-001`. Local, OIDC, PAT, session, configured/SMTP/templated email, browser, public route, and system Source paths are all mounted or exercised. This is the highest-priority feature package because token secrecy, mutable scopes, and production-only Mongo behavior intersect authorization.

#### `@bernouy/cms-bloc-compile`

Finding: `API-001`. The package is small and cohesive. Unique temp directories, `finally` cleanup, path traversal checks, and compiler validation are sound. The virtual facade can intentionally be narrow, but its missing live `change` value must be deliberate or corrected.

#### `@bernouy/cms-content`

Findings: `API-001`, `DUP-008`. Content and editor contracts, Memory/Mongo repositories, theme migration, query parsing, and exports are live. Theme migration is explicit compatibility behavior. `escapeRegex` remains used internally; only the broad dependency created when `cms-files` imports it is questioned.

#### `@bernouy/cms-dashboards`

Finding: `TEST-001`. Validation is split by field/widget responsibility rather than mechanically fragmented. The in-memory repository deep-clones intentionally; Mongo is live and exported but lacks its own/shared repository contract suite.

#### `@bernouy/cms-editor-system-v2`

Finding: `DEAD-005`. Although large, the Shell, runtime, controllers, pickers, settings, rich-text, and tree modules are reachable through the public bundle and extensive `.cases.ts` aggregation. A global split based only on line count is not recommended.

#### `@bernouy/cms-files`

Finding: `DUP-008`. Lifecycle, responsive variants, optimization queue, HTTP serving, and Memory/local-FS/Mongo/S3 adapters are all live. Native `@img/sharp-*` packages are likely intentionally pinned deployment binaries despite no direct import; do not remove them without packaging/image verification. Encoding is not performed on GET in the audited flow.

#### `@bernouy/cms-functions`

Findings: `DEAD-002`, `DUP-007`. All DSL, execution, projection, repository, and request-scoped paths are reachable. The process-local scheduler is the main probable legacy surface; durable scheduling belongs to Triggers in both owned runtimes.

#### `@bernouy/cms-identities`

Finding: `DUP-007`. This compact package's Memory/Mongo/request-scoped services are used by Control and Delivery, with no dead module or layer violation found. Only the pure single-flight implementation is a consolidation candidate.

#### `@bernouy/cms-integrations`

Findings: `DUP-004`, `DUP-010`, `CONTRACT-001`, `CONTRACT-002`, `CONTRACT-003`, `TEST-002`. All source files are reachable and declared dependencies are used. The package is well divided for its size; priorities are clarifying lifecycle entrypoints, unifying repository wire parsing/routes, and deciding the status of accepted-but-noncanonical public contracts.

#### `@bernouy/cms-notifications`

Finding: `TYPE-001`. The durable task is mounted in CLI and server and is not dead. Its implementation is compact; only the result/logger type surface overstates current behavior.

#### `@bernouy/cms-permissions`

Finding: `TYPE-002`. Memory/Mongo/validation/request-scope behavior is active and coherent. The package correctly owns open role identifiers; the duplicate sits in Control.

#### `@bernouy/cms-relations`

Findings: `CONTRACT-001`, `DUP-007`. Reference relations and their Memory/Mongo repositories are active. `linkTable` is premature at the runtime boundary, and dotted path behavior should align with the Sources-owned execution policy.

#### `@bernouy/cms-secrets`

No material finding. Memory/Mongo stores, validation, and resolver composition are coherent. `resolveSecretRefs` has no internal monorepo call site but is explicitly documented as a public helper by the package's instructions; `createSecretResolver` is active in both runtimes.

#### `@bernouy/cms-source-images`

Finding: `DUP-009`. All browser, browser-host, interceptor, cache, local-FS, and Sharp subpaths are used, and the test suite covers authorization, persistence, concurrency, and variants. Making Sharp optional might improve adapter packaging, but its current mandatory status is not proven wrong and is therefore not a finding.

#### `@bernouy/cms-sources`

Findings: `DEAD-003`, `DUP-007`. Core execution, authorization, response projection, overlays, compatibility response mode, adapters, and request scope are all live. Compatibility mode remains required for user-authored/third-party Sources. Only the old DTO projections and generic helper ownership are candidates.

#### `@bernouy/cms-triggers`

Finding: `DUP-007`. Durable scheduling and endpoint runtime are mounted in both runtimes; all source paths are reachable. Repository-specific cloning/locking must remain local even if the pure Promise memoizer is shared.

### Resources

#### `@bernouy/cms-official-integrations`

Findings: `DUP-001`, `DUP-006`, `DEAD-004`, `ARCH-001`, `SHAPE-001`, `TEST-002`. Exhaustive manifest traversal reached all 1,082 definition JSON fragments, all 446 SQL files through 33 manifests, all 180 TypeScript/JavaScript files in 72 blocks, and all 10 declared Edge functions. The sole unreachable Edge file was Commerce `routes/offer/public-seller.ts`. Immutable releases, schemas, migrations, blocks, and dynamic connectors were otherwise treated correctly as resources, not dead TypeScript modules.

### Surfaces

#### `@bernouy/cms-control`

Findings: `DEAD-001`, `DEAD-004`, `DUP-004`, `DEP-002`, `TYPE-002`, `TEST-002`. API file routes and their mounting convention were inspected as dynamic entrypoints. The tracked generated bundle is deterministic and has an auditable source; it is not a second hand-edited implementation. The main simplification is removing the abandoned direct Source-authoring cluster after product confirmation.

#### `@bernouy/cms-delivery`

Findings: `PACK-001`, `ARCH-002`. All route registrars, page/assets rendering paths, binding/component client text inputs, analytics, Source proxying, and image activation are reachable. `bindingCore.client.ts` and `component.client.ts` are read as build entry text and are not graph orphans.

#### `@bernouy/cms-repository`

Finding: `DUP-010`. The package is a compact, correctly layered HTTP surface over `IntegrationDefinitionRepository`. Its five-route contract is live; the improvement is an end-to-end producer/client test or shared neutral descriptor, not a broader abstraction.

### Runtimes

#### `@bernouy/cms-cli`

Findings: `DUP-003`, `DUP-010`, `DEAD-004`, `DEP-001`, `DEP-002`, `RUNTIME-001`, `CLI-001`. Dev/preview, push/pull, secrets, file reindexing, local adapters, integration discovery, workers, and shutdown are otherwise connected. The user-visible pull and host gaps deserve fixes before cosmetic helper consolidation.

#### `@bernouy/cms-server`

Findings: `DUP-003`, `DUP-010`, `RUNTIME-001`. The server is a clear production composition root: environment parsing, Mongo/files/adapters, Control/Delivery mounting, workers, and graceful shutdown are connected. It should remain the owner of environment reads and inject the resulting listener/Delivery configuration downward.

## 11. Prioritized Remediation Roadmap

No remediation is performed by this audit. The ordering below minimizes risk and keeps public/immutable contracts explicit.

### Safe deletions and quick wins

1. **Stop sensitive email logging (`SEC-001`).** Redact/remove `ConsoleEmailer` body output before any broader refactor; add a token-leak assertion.
2. **Fix isolated correctness defects.** Copy PAT scopes on every boundary (`COR-001`), implement standards-compliant encoding negotiation (`HTTP-001`), and make `loadKek` validation match its documented contract (`CRYPTO-001`).
3. **Repair manifest/build facts.** Declare the CLI dashboards dependency (`DEP-001`), remove or supply stale publish entries (`DEP-002`), and make the Components lazy manifest explicitly include/exclude `Stack` (`API-002`).
4. **Remove tiny high-confidence orphans one package at a time (`DEAD-004`).** First confirm downstream deep imports/deployments, then keep each deletion independently revertible.
5. **Collapse exact local helpers.** Reuse the existing Source-image scrubber/fixture (`DUP-009`), remove both unused auth `optionalString` helpers (`DUP-002`), and centralize `cms-files` path helpers (`DUP-008`).
6. **Correct test boundaries and setup.** Replace three cross-package source imports (`ARCH-001`) and extract the repeated W-detail environment without deleting unique assertions (`TEST-002`).

### Low-risk consolidations

1. Add parity tests and share only pure endpoint-performance formulas (`DUP-005`).
2. Share request Promise memoization after locking down lifecycle/rejection behavior; standardize safe dotted-path access separately (`DUP-007`).
3. Extract CLI remote resolution, runtime-local analytics version constants, and a repository producer/client contract (`DUP-010`).
4. Centralize integration dependency assembly inside Control and clearly name artifact import versus installation lifecycle (`DUP-004`) without removing the lower-level test seam.
5. Generate the two identical Sales block behavior modules into self-contained artifacts (`DUP-006`).
6. Add real Mongo contract coverage in priority order: auth token/credential/PAT, envelope DEK/field crypto, then dashboards (`TEST-001`).

### Changes requiring contract review

1. Decide whether direct Source authoring is removed product functionality, then delete `DEAD-001` together with the corresponding flat/canonical DTOs (`DEAD-003`) only if downstream consumers are absent.
2. Deprecate the process-local function scheduler (`DEAD-002`) after surveying embedders; keep durable Triggers as the documented runtime model.
3. Decide whether `linkTable` must be implemented or rejected at import (`CONTRACT-001`).
4. Define one FS/HTTP catalog wire contract (`CONTRACT-002`) and establish whether empty version indexes are valid.
5. Measure third-party use before retiring legacy single-file SQL deployment (`CONTRACT-003`) or synchronous HTTP cache APIs (`DEAD-006`).
6. Decide whether `p9r pull` must truly mirror file push; if yes, design bounded atomic media synchronization before implementing it (`CLI-001`).
7. Review removal of test-only `RuntimeEditor` against any unsupported internal downstream imports (`DEAD-005`).
8. Narrow notification and role types only after checking public/ambient consumers (`TYPE-001`, `TYPE-002`).

### Architectural work requiring dedicated design

1. **Versioned Edge support source (`DUP-001`, `SHAPE-001`).** Design authoring-time generation or a pinned deployable support module for image/multipart and common HTTP/auth primitives while preserving immutable release self-containment.
2. **Binding contract source of truth (`API-001`, `PACK-001`).** Align canonical values, compiler facade, runtime attributes, and a dedicated published binding artifact without reversing layer dependencies.
3. **Runtime-owned configuration (`ARCH-002`, `RUNTIME-001`).** Extend the Runner listener contract, choose secure host defaults, and inject Delivery cache/CSP/build behavior from composition roots.
4. **Auth adapter assurance (`TEST-001`).** Treat real-database contract/race/index testing as security infrastructure rather than a one-off test addition.
5. **Edge monolith decomposition (`SHAPE-001`).** Split internals by routing, security, persistence, and domain behavior while retaining single release/deployment entrypoints and checksums.

## 12. Confirmed Non-Issues

The following suspicious shapes were inspected and should not be treated as cleanup by default:

- **Tracked Control bundle:** `packages/surfaces/cms-control/src/static/assets/control-components.js` is 48,567 lines and about 1.55 MB, but it is generated from `src/components/index.ts` by `src/prebuildControl.ts:3-25`. `.github/workflows/quality.yml:40-41` runs deterministic build checks, and `quality/ci/determinism/deterministic-build.sh:9-18` builds twice, compares manifests, and requires a clean Git diff. The source of truth is not ambiguous.
- **Official integration reachability:** manifest traversal reached 1,082/1,082 definition JSON fragments, 446/446 SQL files through 33 manifests, 180/180 block TypeScript/JavaScript files, and 10/10 declared Edge functions. `DEAD-004` records the single unreachable connector file. Integration discovery is convention-based and was not judged by TypeScript imports alone.
- **Immutable/versioned data:** SQL migrations, schema manifests, snapshots, integration `versions/1.0.0` trees, and declarative resources are release records. They must remain immutable even where authoring inputs resemble one another.
- **Dynamic route mounting:** Control and Repository file routes are discovered/mounted by path convention. Absence of an import is not evidence of dead code for those trees.
- **Browser build inputs:** Delivery's `bindingCore.client.ts` and `component.client.ts` are loaded as text entrypoints by `buildBindingCore.ts`/`buildComponent.ts`; they are not orphans.
- **Adapter separation:** Memory/Mongo/local-FS/S3 implementations generally encode different atomicity, persistence, and cloning behavior. The audit recommends shared contracts and pure helpers, not implementation inheritance.
- **Source compatibility mode and overlays:** both remain reachable and necessary for user-authored/third-party Sources. No evidence supports removing them.
- **Secrets helper:** `resolveSecretRefs` is intentionally public according to package instructions despite no internal caller.
- **Native Sharp packages:** `@img/sharp-libvips-linux-x64` and `@img/sharp-linux-x64` look unused to an import scanner but are deployment binaries. Their removal needs package/container verification.
- **Components assets/conventions:** `default.css` is copied by build tooling; empty light-DOM templates, tiny dialog-local modules, and short test aggregation entrypoints are intentional.
- **Documentation block boilerplate:** identical compiler entry files keep each block independently buildable. A generator may improve authoring, but the emitted copies are not runtime inheritance debt.
- **Analytics benchmark:** `cms-analytics/tests/hll/stripeBenchmark.ts` is explicitly a manual benchmark rather than an unmounted production module.
- **Declaration input:** `cms-integrations/src/default-implementation/supabase/types.d.ts` is imported by the Supabase management/deployer implementation; it is not generated debris, although declaration emission should continue to be smoke-tested.
- **Layer graph:** apart from the three test-only imports in `ARCH-001`, the architecture check found no inverse cross-layer source import in the audited package set. Root exports generally keep Mongo/S3/browser adapters behind explicit subpaths.
- **Exact duplicate scan:** most of the 53 blob groups are tiny schema/root JSON nodes, versioned assets, empty templates, or conventional entry files. Their aggregate potential duplicate size (83,120 bytes) is not evidence that 181 files should be deleted.
- **File-size diagnostics:** immutable JSON/SQL, generated assets, and cohesive contract tests account for much of the size report. No mechanical 150-line splitting is recommended.

## 13. Baseline and Final Validation

### Initial baseline

The baseline was run in the isolated worktree immediately after `bun install --frozen-lockfile` and before `AUDIT.md` existed.

| Check | Initial result | Detail |
| --- | --- | --- |
| `bun run check:architecture` | Failed | Three pre-existing cross-package source imports, exactly those in `ARCH-001`. |
| `bun run check:repository-shape` | Failed | 397 file-size INFO, 159 file-size WARNING, 189 fanout INFO, and two blocking fanout ERROR findings, exactly the directories in `SHAPE-001`. |
| `bun run check:style` | Passed | No style finding. |
| `bun run typecheck` | Failed | 384 TypeScript diagnostics: TS18046 ×4, TS2307 ×72, TS2339 ×225, TS2345 ×49, TS2352 ×7, TS2677 ×1, TS2740 ×1, TS4112 ×18, TS4113 ×1, TS7006 ×6. Inspection traced the cascade to missing ignored `@bernouy/components/dist` declarations/artifacts in a fresh worktree. |
| architecture tooling typecheck | Passed | No finding. |
| CI tooling typecheck | Passed | No finding. |
| **`check:all` summary** | **3 passed / 3 failed** | Architecture, repository shape, and workspace typecheck failed. |

The clean-worktree artifact issue was isolated by running:

```bash
bun run --cwd packages/foundation/components build
```

It completed successfully and created only ignored `dist` output. This was not a source remediation and no tracked artifact changed.

### Final comparison

After completing this document, `bun run check:all` was run again in the same worktree.

| Check | Final result | Comparison with baseline |
| --- | --- | --- |
| architecture | Failed | Unchanged: the same three imports from `ARCH-001`; no new violation. |
| repository shape | Failed | Unchanged: 397 file-size INFO, 159 WARNING, 189 fanout INFO, and the same two fanout ERROR findings. `AUDIT.md` is outside package/quality shape scope. |
| style | Passed | Unchanged. Biome checked 3,822 files with no fix applied. |
| typecheck | Passed | Improved after the Components build bootstrap; no source file was edited. |
| architecture tooling | Passed | Unchanged. |
| CI tooling | Passed | Unchanged. |
| **`check:all` summary** | **4 passed / 2 failed** | No new failure; one environment/artifact failure was eliminated. |

Final repository checks:

- `git diff --check`: passed;
- coverage assertions: 27 package rows, 27 package-note sections, 37 findings, and 37 matching severity/confidence records;
- `git status --short --untracked-files=all`: only `AUDIT.md` was present before the dedicated audit commit;
- no source, test, configuration, existing documentation, lockfile, generated tracked artifact, or integration resource was modified.
