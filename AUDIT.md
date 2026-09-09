# CmsCore Baseline Audit

> Historical snapshot: every finding, count, and use of “current” in sections
> 1–10 refers to commit `dfc00eeccc7a036dc1b0631cf20645508ba478af`, before
> the cleanup implementation that followed it. Consult the current code and
> test suite to determine which findings remain open. Section 11 records
> subsequent product and architecture decisions; it does not change the
> historical finding counts or describe completed implementation.

## 1. Executive summary

CmsCore has a sound high-level architecture and substantially better release machinery than its historical layout suggests. The declared dependency direction is coherent, all architecture, repository-shape, and style checks passed, source integrations now contain only their current source, and the remote repository has careful immutable publication, journaling, fencing, and recovery behavior. The main problem is not a generally disorganized codebase; it is that several important guarantees are split across different implementations and therefore do not hold consistently from local authoring to remote admission and runtime execution.

The strongest simplification opportunities are:

1. establish one shared definition of effective integration dependencies and one shared stateful-change policy;
2. move persistence-independent bloc, integration, dashboard, and trigger rules out of `cms-control` and into their feature owners;
3. replace the editable generic CMS permission graph with the smaller model the product already mostly enforces: Admin, persisted `user` displayed as Member, unauthenticated public access, dashboard assignments, endpoint access modes, and separate machine authority;
4. reduce Mossa to reusable marketplace-specific additions and presets instead of a second generic design system or a client identity package;
5. turn currently static or opt-in integration checks into executable, portable release evidence that runs both locally and remotely;
6. make deployment constraints and development-only in-memory defaults explicit instead of silently selecting them inside surfaces.

The most urgent risks are concrete:

- Mossa's dependency on Ulvia is expressed in theme/resource requirements but omitted by multiple release planners. A local collection audit can pass because it does not run the disposable runtime, while remote verification receives an incomplete package set.
- The required integration CI workflow still names removed pre-flattening paths and a missing generator, so the gate can fail before exercising the intended contracts.
- a startup migration promotes every user whose role is literally `support` or `finance` to Admin, including a role recreated after a previous migration;
- PAT scopes are persisted but discarded during authentication, making a generated Admin PAT effectively unscoped;
- dashboard assignments authorize calls at the CMS proxy, but several official Supabase connectors independently require the literal `admin` role, so delegated Member dashboards fail;
- the server does not independently impose the CLI's migration requirement on changed Edge Function implementations;
- production admission does not require cutover, rollback, or delayed-cleanup evidence, so the current tests demonstrate restartability more strongly than zero downtime.

The authorization hypothesis is **partly correct**. `public` is an unauthenticated policy state, Admin and Member cover ordinary humans, dashboard assignments cover operator workspaces, and endpoint modes cover ordinary direct access. The generic CMS capability catalogue is currently misleading because Control routes use an exact Admin guard rather than those capabilities. However, custom endpoint grants remain a real direct-access mechanism, and PATs, internal/system calls, workers, and service identities remain separate security boundaries. Custom roles therefore cannot be deleted safely until persisted grants and consumers have been inventoried and migrated.

### Confirmed finding count

| Severity | Confirmed confidence | High confidence | Total |
| --- | ---: | ---: | ---: |
| Critical | 3 | 0 | 3 |
| High | 15 | 0 | 15 |
| Medium | 16 | 0 | 16 |
| Low | 2 | 1 | 3 |
| **Total** | **36** | **1** | **37** |

No finding below is based only on the absence of a TypeScript import. Dynamic registrations, custom-element tags, JSON definitions, package exports, tests, scripts, workflows, and possible public-package use were considered. Items for which deletion is not proven are kept in section 9.

## 2. Scope and methodology

### Scope inspected

The audit covered all 33 workspace packages; every package manifest and exported subpath; all root and package `AGENTS.md` files; root, workspace, TypeScript, Biome, Docker, and CI configuration; composition roots; Control, Delivery, repository, management, and verifier routes; Mongo, filesystem, S3, Supabase, in-memory, fake, and fault-injection implementations; official integration definitions and tests; Ulvia and Mossa resource catalogues; foundation, editor, and Control components; the local and remote release lifecycle; authentication, authorization, dashboards, views, bindings, files, and source execution.

Declarative reachability was checked through resource IDs, artifact paths, manifests, bloc directories, custom-element tags, collection requirements, theme dependencies, dashboard/view definitions, generated-registration entry points, HTML/CSS references, workflow command lines, and test fixtures. Exact duplicates were checked by content hashes; source and test inventories used read-only filesystem and `rg` queries. Generated bundles were identified from their generators and were not counted as duplicate handwritten implementations.

### Baseline and commands

- Initial branch and commit: `master` at `dfc00eeccc7a036dc1b0631cf20645508ba478af`.
- Initial Git status: `## master...origin/master`, with no tracked changes.
- `bun run check:architecture`: passed.
- `bun run check:repository-shape`: passed. It reported 658 informational and 451 warning-level file-size observations, and 308 informational directory-fanout observations with zero fanout errors.
- `bun run check:style`: passed across 5,870 files without writing fixes.
- Read-only inspection used `git`, `rg`, `find`, `sed`, `wc`, hashes, and bounded Bun scripts that only parsed files and printed results.

The largest inspected areas were `official-integrations` (5,282 files, approximately 375,025 lines including tests), `cms-control` (900 files, approximately 136,337 lines), `cms-integrations`, `cms-integration-registry`, `cms-editor-system-v2`, and `@bernouy/components`. Size observations were treated as navigation signals, not automatic reasons to split code.

### Intentional limitations

The full test suite, builds, typecheck, formatter, coverage, disposable Mongo/Supabase environments, browser automation, SSH, production endpoints, and external services were intentionally not run. Those actions were either prohibited by the audit brief or could emit artifacts/change external state. Consequently, runtime-only assertions are described as tests to run before implementation, not as already verified outcomes. Static inspection can prove that a gate is absent or a path does not exist; it cannot prove the behavior of an external provider or browser rendering.

## 3. Repository map

The intended dependency direction is:

`runtimes -> surfaces -> resources -> features -> foundation`

`bun run check:architecture` confirms the checked import graph and declared package boundaries currently pass. Feature-to-feature dependencies use published exports. No resource package was found mounting HTTP routes or choosing a database adapter. The important boundary violations in section 4 are responsibility and composition problems that are not expressible by the current static import rule.

### Packages and public boundaries

| Layer | Package | Intended ownership and declared public boundaries |
| --- | --- | --- |
| Foundation | `@bernouy/components` | Generic web components, bindings, composition runtime, and styles; root, `./base`, `./binding`, `./binding-dom`, `./blocs/*`, `./composition-runtime`, `./style.css`, package metadata and README. |
| Foundation | `@bernouy/envelope-crypto` | Envelope encryption contracts/defaults; root and `./mongo`. |
| Foundation | `@bernouy/http-runner` | HTTP execution, HTML, observability, cache/testing support; root, `./html`, `./observability`, `./testing`. |
| Foundation | `@bernouy/rate-limiter` | Limiter contract/default implementation; root and `./mongo`. |
| Features | `@bernouy/cms-analytics` | Analytics domain and persistence; root and `./mongo`. |
| Features | `@bernouy/cms-auth` | Accounts, sessions, credentials, PATs, identity-provider/authentication implementations; root, `./browser`, `./mongo`. |
| Features | `@bernouy/cms-bloc-compile` | Bloc validation, compilation, source preparation, and registration wrappers; root. |
| Features | `@bernouy/cms-content` | Pages, settings, blocs, snapshots, paths, and content repositories; root, `./editor`, `./mongo`, `./page-path`. |
| Features | `@bernouy/cms-dashboards` | Dashboard/view models, validation, execution plans, repositories; root and `./mongo`. |
| Features | `@bernouy/cms-editor-system-v2` | Browser editor system and component shell; root. |
| Features | `@bernouy/cms-files` | File metadata/blob contracts, HTTP delivery, local and optional storage adapters; root, `./mongo`, `./s3`, `./urls`. |
| Features | `@bernouy/cms-functions` | CMS function definitions and persistence; root and `./mongo`. |
| Features | `@bernouy/cms-identities` | Runtime identities and request-scoped decorators; root, `./mongo`, `./requestScope`. |
| Features | `@bernouy/cms-integration-packages` | Immutable integration package sources/resolvers; root, `./fs`, `./http`. |
| Features | `@bernouy/cms-integration-registry` | Catalogue, compatibility, immutable publication and recovery; root and `./fs`. |
| Features | `@bernouy/cms-integration-verification` | Verification protocol, admission plans, policies, SDK, Bun runner and upgrade-fixture API; root, `./bun`, `./sdk/v1`, `./upgrade-fixtures/v1`. |
| Features | `@bernouy/cms-integrations` | Integration definitions, parsing, installation records, resources, and provider connectors; root, `./fs`, `./http`, `./mongo`, `./resources`, `./stripe`, `./supabase`. |
| Features | `@bernouy/cms-notifications` | Notification contracts/default logic; root. |
| Features | `@bernouy/cms-permissions` | Roles and endpoint/CMS grants; root, `./mongo`, `./requestScope`. |
| Features | `@bernouy/cms-relations` | Relation definitions and repositories; root and `./mongo`. |
| Features | `@bernouy/cms-secrets` | Secret store contracts/defaults; root and `./mongo`. |
| Features | `@bernouy/cms-source-images` | Source-image jobs, media indexing, transforms and caches; root, `./browser`, `./browser-host`, `./local-fs`, `./mongo`, `./sharp`. |
| Features | `@bernouy/cms-sources` | Source definitions, endpoint execution, overlays and request scope; root, `./browser`, `./mongo`, `./requestScope`. |
| Features | `@bernouy/cms-triggers` | Trigger models, persistence and request-scoped execution; root, `./mongo`, `./requestScope`. |
| Resources | `@bernouy/official-integrations` | Current-source official collections and source integrations plus publication metadata; root, per-integration wildcard exports, publication export. |
| Surfaces | `@bernouy/cms-control` | Admin/editor HTTP application and browser assets; root, `./component`, `./editor`. |
| Surfaces | `@bernouy/cms-delivery` | Public site rendering, files, source access and runtime composition; root. |
| Surfaces | `@bernouy/cms-repository` | Public catalogue/package/compatibility/release-evidence HTTP surface; root and `./catalog`. |
| Surfaces | `@bernouy/cms-repository-management` | Authenticated candidate/promotion management surface; root and `./gateway`. |
| Runtimes | `@bernouy/cms-integration-verifier` | Sandboxed verification worker; root. |
| Runtimes | `@bernouy/cms-repository-server` | Remote repository process; root plus seven currently private runtime-oriented subpaths. |
| Runtimes | `@bernouy/cms-server` | Production CMS composition root; no package exports. |
| Runtimes | `@bernouy/ulvia-cli` | Local repository, `dev`, pull/audit/release/push orchestration; root and `./release-runtime`. |

### Composition and request flow

- `cms-server` reads environment, opens Mongo, builds local filesystem blob storage and source-image workers, encryption/secrets, authentication, integration clients, and all Mongo-backed feature stores. It mounts `cms-control` and `cms-delivery` and passes most concrete adapters explicitly.
- `cms-control` mounts 103 file-routed Admin APIs behind an exact Admin guard. Dashboard operator routes instead require authentication plus a published dashboard assignment. Source calls made by dashboards are constrained again by the compiled execution plan.
- `cms-delivery` serves pages, public assets/files, and direct source calls. Source authorization combines endpoint access mode with an exact role grant; system endpoints require internal identities.
- `cms-repository-server` composes filesystem-backed immutable registry, candidate, report, evidence, and recovery stores with the public repository and management surfaces, Bun verifier runners, in-process mutation coordination, and rate limiting.
- `cms-integration-verifier` reconstructs the exact workload supplied by the repository, creates disposable PostgreSQL/Supabase and release environments, and runs platform and release suites.
- `ulvia-cli` owns a persistent local filesystem repository. `pull` synchronizes explicit remote history, `audit` evaluates current source against local baselines, `release` records an audited local coordinate, `push` submits its exact digests, and `dev` composes local CMS dependencies.

### Integration and component map

There are 17 official integrations: two collections (Ulvia `4.0.1`, Mossa `3.0.0`) and 15 sources/compositions/providers. The resource/catalogue mapping itself is internally complete: all 131 Ulvia resources and all 152 Mossa resources resolve to artifact tags, paths and manifests; all declared view/composition paths exist; the seven internal controller blocs have incoming requirements. The problems are semantic validation, ownership, duplication, and runtime coverage rather than missing catalogue files in bulk.

Tracked `packages/resources/sites` content is explicitly described as historical migration/visual reference material, not a live template system. The ignored `.p9r` generated tree is not repository source. `<p9r-*>`, `window.p9r`, `p9rExternalsPlugin`, and `P9R_CACHE` remain active runtime/component contracts and are not evidence of the removed CLI.

### Repository and release lifecycle trace

| Stage | Current owner and behavior | Guarantee | Observed boundary/gap |
| --- | --- | --- | --- |
| `ulvia pull` | CLI remote reader fetches immutable definition, package, reviewed schema evidence and content-addressed objects into its persistent local repository | Explicit synchronization; no implicit network lookup during offline work | No persisted assertion that the local catalogue is complete/current (RELEASE-007). |
| `ulvia audit` | CLI prepares the current source candidate, selects locally present baselines, runs author tests and local release verification | Early feedback without publishing | Collections return after static checks; platform suite is weaker than remote; history may be partial. |
| `ulvia release` | CLI rereads/builds source and stores a coordinate only after audit | Local package coordinate and evidence are content-addressed | An existing package digest short-circuits evidence-only corrections (RELEASE-005). |
| `ulvia push` | CLI loads exact local package/evidence, orders latest selected releases, uploads a candidate and polls fenced admission | The submitted digests are explicit and retryable | Ordering uses incomplete dependencies; final round trip checks only package bytes; `--all` wording differs from latest-only behavior. |
| Candidate upload | Repository management surface validates/authenticates and stages immutable candidate data | Remote server—not the CLI—is the trust boundary | Function-change migration policy is not independently equivalent to the CLI policy. |
| Server-side planning | Integration registry snapshots authoritative catalogue/policy and baselines, plans dependencies/platform/release suites | Remote history owns compatibility baselines | Effective collection/theme dependency edges are omitted by the planner. |
| Verifier execution | Fenced workload materializes exact supplied packages and runs mandatory platform plus release suites in disposable services | Workload omission/substitution is rejected; remote checks are materially strong | It cannot test a dependency the planner did not supply; ordinary author suites are empty. |
| Finalization/publication | Filesystem transaction journals moves, manifest/index/snapshot state and evidence-bound activation | Published coordinates and artifacts are immutable | Production evidence policy does not require every downtime/rollback proof. |
| Promotion/recovery | Repository records eligibility/promotion and replays interrupted transactions; catalogue runtime can fall back to last valid snapshot | Publication crash recovery is one of the strongest subsystems audited | Cross-process mutation coordination is not provided by the current production adapter. |

The intended principles are therefore mostly present: release history belongs to the repository, source integrations are flattened/current-only, pull is explicit, and remote admission is authoritative. The failures are semantic parity and proof completeness, not a return to copied `versions/` directories.

## 4. Findings

### ARCH-001 — Site-bloc domain rules live in the Control surface

- **Severity:** Medium
- **Confidence:** Confirmed
- **Affected files/packages:** `packages/surfaces/cms-control/src/core/content/siteBloc/structure.ts`, `validation/defaultContent.ts`, `validation/dependencies.ts`, `validation/draft.ts`, `siteBloc/service.ts`, `content/bloc/importBlocArtifact.ts`; `@bernouy/cms-content`; `@bernouy/cms-bloc-compile`.
- **Evidence:** `structure.ts:6-182` parses, hardens, serializes and assigns identities to slot trees; `defaultContent.ts:5-107` enforces slot/resource/cardinality rules; `dependencies.ts:3-82` enforces publication, archive, dependency and cycle rules; `service.ts:28-169` owns revisions and publication transitions. These are persistence-independent CMS policies, not HTTP translation.
- **Current behavior:** Control handlers and services define the valid site-bloc aggregate and lifecycle, then call content persistence and the compiler.
- **Why this is a problem:** Other surfaces or tools cannot reuse the same invariants without importing a surface or reimplementing them. The architectural checker cannot detect this semantic inversion because imports still point downward.
- **Recommended action:** Move pure structure/default/dependency validation to `cms-content`; move the persistence-independent site-bloc use case to `cms-content` or a narrowly named feature depending on `cms-content` and `cms-bloc-compile`. Keep request DTO parsing, Control error mapping, routing and cache invalidation in `cms-control`.
- **Expected benefit:** One authoritative aggregate model and reusable tests, with a thinner surface.
- **Behavior/data/security risk:** Medium: publication and identity normalization are data-sensitive. Preserve serialized shapes and error semantics.
- **Tests required before implementation:** Characterization of imports, default insertion, nested slots, cycles, revision transitions, archive/publish rules, compiler failures, cache invalidation, and stored snapshot round trips.
- **Dependencies on other findings:** Coordinate with ARCH-003 and ARCH-006 to avoid creating another executable `interfaces/` module.

### ARCH-002 — Integration installation and upgrade policy lives in the Control surface

- **Severity:** Medium
- **Confidence:** Confirmed
- **Affected files/packages:** `packages/surfaces/cms-control/src/core/management/integrations/definitions.ts`, `installationActions.ts`, `upgrade/preflight.ts`; `@bernouy/cms-integrations`; `@bernouy/cms-integration-verification`.
- **Evidence:** `definitions.ts:38-208` computes eligibility, dependency closure, theme/resource requirements and SemVer choices; `installationActions.ts:58-220` recursively installs dependencies and detects cycles/version conflicts; `upgrade/preflight.ts:21-149` selects migrations and fresh-install/upgrade eligibility.
- **Current behavior:** A surface owns reusable integration lifecycle policy while release planners and repository admission own related but different versions of the same concepts.
- **Why this is a problem:** It contributes directly to RELEASE-001 and RELEASE-003: the CMS installer sees dependency and state transitions that release tooling does not.
- **Recommended action:** Put definition closure and installation lifecycle use cases in `cms-integrations`; put release/migration eligibility shared with admission in `cms-integration-verification`. Keep adapter assembly, HTTP input/output and error mapping in Control.
- **Expected benefit:** CMS installation, local release and remote admission can depend on the same rules.
- **Behavior/data/security risk:** High during migration because an incorrect closure changes which integrations/resources are installed.
- **Tests required before implementation:** Existing install/upgrade characterization plus nested collection/theme/source dependencies, cycles, optional resource selection, version ranges and fresh-versus-upgrade cases.
- **Dependencies on other findings:** RELEASE-001, RELEASE-002, RELEASE-003.

### ARCH-003 — Dashboard and trigger lifecycle rules remain surface-owned

- **Severity:** Medium
- **Confidence:** Confirmed
- **Affected files/packages:** `packages/surfaces/cms-control/src/core/admin/dashboards/input.ts`, `service.ts`, `core/admin/control/workflows/triggerCreation.ts`; `@bernouy/cms-dashboards`; `@bernouy/cms-triggers`.
- **Evidence:** Dashboard `input.ts:19-133` defines tree/limit invariants and `service.ts:14-129` owns revisions, view pinning, compilation and persistence. `triggerCreation.ts:13-96` validates function/endpoint existence, response references and asynchronous blocking behavior before persistence.
- **Current behavior:** Control coordinates repositories but also determines valid dashboard and trigger aggregates.
- **Why this is a problem:** Domain behavior cannot be reused by another surface/runtime without duplicating Control logic, and feature tests cannot fully describe their own contract.
- **Recommended action:** Move dashboard lifecycle/compilation use cases to `cms-dashboards`; move trigger creation validation to `cms-triggers` behind source/function lookup contracts. Keep DTO validation, authentication, HTTP status mapping and mounting in Control.
- **Expected benefit:** Cohesive feature ownership and smaller handlers.
- **Behavior/data/security risk:** Medium, especially for compiled dashboard plans because they are an authorization boundary.
- **Tests required before implementation:** Golden execution-plan tests, revision/view pinning, stale revision rejection, trigger reference validation, async constraints and unchanged HTTP error mappings.
- **Dependencies on other findings:** AUTH-003 and DEAD-001.

### ARCH-004 — Control silently selects volatile adapters

- **Severity:** Medium
- **Confidence:** Confirmed
- **Affected files/packages:** `packages/surfaces/cms-control/src/core/admin/control/state.ts`, `accessors.ts`; `packages/runtimes/cms-server/src/runtime/mountSurfaces.ts`.
- **Evidence:** `state.ts:27-78` constructs in-memory cache, secret, role, integration-provider, dashboard, view, assignment, relation and identity implementations when dependencies are absent. Other missing stores fail later through accessors. Production injects Mongo-backed stores at `mountSurfaces.ts:143-205`.
- **Current behavior:** A host can mount Control successfully with omitted stateful dependencies and silently receive ephemeral state for some features but delayed errors for others.
- **Why this is a problem:** Miscomposition looks like successful startup and can lose data. It also makes the surface select adapters, contrary to the stated composition rule.
- **Recommended action:** Make stateful dependencies required for enabled modules and provide an explicitly named in-memory dev/test harness. An intentional cache default may remain, but it should be documented and bounded.
- **Expected benefit:** Fail-fast production composition and clearer tests.
- **Behavior/data/security risk:** Medium: changing defaults can break small embedding consumers. Introduce a compatibility factory before tightening constructors.
- **Tests required before implementation:** Missing-dependency startup failure, explicit in-memory harness, full production dependency wiring and disabled-feature behavior.
- **Dependencies on other findings:** ADAPTER-001.

### ARCH-005 — Runtime decisions and reusable release machinery cross composition boundaries

- **Severity:** Medium
- **Confidence:** Confirmed
- **Affected files/packages:** `cms-files` HTTP handlers, `@bernouy/http-runner` cache/compression, `cms-delivery` rendering/runtime, `@bernouy/cms-integration-verifier`, `@bernouy/ulvia-cli`.
- **Evidence:** The architecture ratchet explicitly permits eight non-runtime `process.env.MODE` reads in `quality/architecture/repository/repositoryPolicy.ts:9-35`, including file serving, compression, cache and Delivery render/CSP behavior. `cms-delivery/src/runtime/DeliveryCmsContext.ts:26-48` also constructs `BunRunner` and `TtlCache`. The verifier imports `@bernouy/ulvia-cli/release-runtime` (`cms-integration-verifier/src/sandbox/release/index.ts:9-10`).
- **Current behavior:** Environment policy is distributed below runtimes, and one executable runtime package supplies reusable release execution to another runtime.
- **Why this is a problem:** Tests need environment mutation, embedded surfaces inherit surprising behavior, and reusable release semantics are owned by the CLI rather than a feature/test-infrastructure boundary.
- **Recommended action:** Inject explicit mode/policy objects and runner/cache dependencies; reduce the env-read ratchet to zero. Extract the shared release scenario engine from `ulvia-cli` into a feature-level verification package without moving CLI orchestration.
- **Expected benefit:** Deterministic components and a clean single source of release runtime behavior.
- **Behavior/data/security risk:** Medium: MODE affects caching, compression and CSP, so defaults must be characterized.
- **Tests required before implementation:** Production/development policy matrices, CSP/compression/file behavior, cache behavior and identical CLI/verifier scenario results.
- **Dependencies on other findings:** RELEASE-002, RELEASE-004, ADAPTER-001.

### ARCH-006 — Executable behavior is exposed from `interfaces/`

- **Severity:** Low
- **Confidence:** Confirmed
- **Affected files/packages:** `cms-content/src/interfaces/Editor/Editor.ts`, BindingSyntax modules, `cms-content/src/interfaces/settings.ts`, `cms-sources/src/interfaces/SourceOverlay.ts`, `cms-analytics/src/interfaces/AnalyticsPrivacy.ts`.
- **Evidence:** These interface paths contain executable classes, normalizers, validators or helper functions; examples include `Editor.ts:14-96`, `settings.ts:111-113`, `SourceOverlay.ts:147-157`, and `AnalyticsPrivacy.ts:19-22`.
- **Current behavior:** Root exports blur inert contracts with runtime logic despite the workspace convention that executable logic belongs in `core/`, browser, or default-implementation modules.
- **Why this is a problem:** It hides dependency weight and makes public-boundary intent harder to review.
- **Recommended action:** Move executable pieces to `core/` or the relevant browser authoring module, retaining temporary re-exports where public compatibility matters. Leave types and harmless constants in `interfaces/`.
- **Expected benefit:** More legible public APIs and dependency boundaries.
- **Behavior/data/security risk:** Low if re-exports preserve symbols; potential external import breakage if paths are removed immediately.
- **Tests required before implementation:** Public export/type consumer tests and package build/import smoke tests.
- **Dependencies on other findings:** None.

### AUTH-001 — Legacy role migration can promote newly created roles to Admin

- **Severity:** Critical
- **Confidence:** Confirmed
- **Affected files/packages:** `packages/runtimes/cms-server/src/migrateLegacyOperatorRoles.ts`, `runtime/stores/core.ts`; `@bernouy/cms-permissions`.
- **Evidence:** `migrateLegacyOperatorRoles.ts:4-48` finds every user whose role is literally `support` or `finance`, assigns `admin`, then deletes those role definitions. It runs unconditionally on every startup at `runtime/stores/core.ts:69-77`. Role creation still accepts those IDs; the current test only repeats the migration without recreating a role.
- **Current behavior:** A legitimate role named `support` or `finance` created after an earlier startup is promoted on the next restart.
- **Why this is a problem:** This is deterministic privilege escalation through ordinary role administration.
- **Recommended action:** Replace the startup heuristic with a one-time, versioned migration marker. Reserve the legacy IDs while the migration exists, inventory holders, map legitimate duties to dashboard assignments, and require an explicit decision for unresolved users. Never infer Admin from a role name.
- **Expected benefit:** Removes an escalation path and makes authorization migration auditable.
- **Behavior/data/security risk:** High: changing existing users can remove needed access. Produce a dry migration report and backup before execution.
- **Tests required before implementation:** First-run migration, second-run idempotence, recreate-after-marker, unresolved role report, no automatic promotion, and rollback of migration metadata.
- **Dependencies on other findings:** AUTH-004, AUTH-005.

### AUTH-002 — PAT scopes are persisted but not enforced

- **Severity:** High
- **Confidence:** Confirmed
- **Affected files/packages:** `cms-auth/src/interfaces/PatRepository.ts`, `default-implementation/authentication/LocalAuthentication.ts`, Control PAT routes, `MongoPatRepository`.
- **Evidence:** The PAT contract stores `scopes` and optional expiry (`PatRepository.ts:14-27`), but bearer authentication at `LocalAuthentication.ts:74-85` discards scopes and returns only the subject. The create API accepts only a name (`cms-control/src/api/_access/pats/pats.post.ts:6-22`), the list omits scopes/expiry, and Mongo defaults expiry to `null`.
- **Current behavior:** A PAT created by an Admin authenticates as that Admin for every Control capability until manually revoked, normally without expiry.
- **Why this is a problem:** The API communicates least-privilege semantics that do not exist, encouraging unsafe credential use.
- **Recommended action:** Either remove/deprecate scopes until implemented, or propagate credential kind and scopes in the authenticated principal and enforce them at Control, Delivery and dashboard boundaries. Prefer finite default expiry and expose it in management UI/API. Define empty-scope semantics explicitly and fail closed for legacy non-empty scopes during transition.
- **Expected benefit:** Honest and enforceable machine credentials.
- **Behavior/data/security risk:** High: tightening existing tokens can break automation; leaving them unchanged preserves excessive authority.
- **Tests required before implementation:** Scope allow/deny, expiry, revocation, dashboard use, Delivery use, empty scopes, and invalid bearer tokens without cookie fallback.
- **Dependencies on other findings:** AUTH-004; target model in section 5.

### AUTH-003 — Dashboard delegation and connector authorization disagree

- **Severity:** High
- **Confidence:** Confirmed
- **Affected files/packages:** `cms-control` dashboard proxy and source scope; official commerce, Mondial Relay, Stripe Connect, sales-configurator and forms Supabase functions.
- **Evidence:** The dashboard compiler records exact non-system endpoint/method calls (`cms-dashboards/src/core/validateDashboard/shared/executionPlan.ts:11-76`) and the proxy rechecks assignment, revision and plan (`cms-control/src/core/admin/dashboards/proxy.ts:30-79`). It forwards the actor's real role (`sourceProxy/scope.ts:36-52`). Commerce dashboards call Admin C2C endpoints, while the connector requires literal `admin` (`commerce/.../functions/cms-commerce/core/auth.ts:25-29`). Equivalent exact-Admin checks exist in Mondial Relay, Stripe Connect, sales-configurator and forms.
- **Current behavior:** An assigned Member passes the CMS dashboard authorization boundary and then receives a connector denial for actions the compiled dashboard explicitly permits.
- **Why this is a problem:** The declared delegation model is unusable for important official dashboards, and custom endpoint grants behave differently per connector.
- **Recommended action:** Treat the verified dashboard execution plan as a distinct capability. Forward a signed/internal capability context plus original actor identity for audit; make connectors validate that capability. Do not relabel the human actor as Admin.
- **Expected benefit:** Delegated operations work while preserving direct-call denial and audit attribution.
- **Behavior/data/security risk:** Critical if the capability can be forged or replayed. It must be CMS-authenticated, endpoint/method/revision-bound and never authorize system endpoints.
- **Tests required before implementation:** Real local-Supabase Member read/mutation through an assigned dashboard, direct denial, tampered endpoint/method/revision, removed assignment, stale dashboard revision, replay, and system endpoint denial.
- **Dependencies on other findings:** AUTH-004, AUTH-005, ARCH-003.

### AUTH-004 — Editable CMS capability grants are largely decorative

- **Severity:** High
- **Confidence:** Confirmed
- **Affected files/packages:** `cms-permissions/src/core/permissions.ts`, `mutateRole.ts`; `cms-control` role editor and route guards.
- **Evidence:** The catalogue exposes `urn:cms:*` permissions (`permissions.ts:27-35`) and the role editor presents them (`cms-control/src/core/management/roles/editorData.ts:25-44`), but Control's 103 Admin routes use exact `role === "admin"` (`adminAccess.ts:6-12`, `mountRoutes/index.ts:77-129`). Non-test uses of effective grants are source endpoint URNs. `Grant.condition` is rejected on mutation and denied during evaluation.
- **Current behavior:** An administrator can grant `pages:edit`, `users:*` or similar permissions to a custom role, but the recipient still cannot enter the protected Control route.
- **Why this is a problem:** The UI promises configurable authority that runtime enforcement ignores. Operators can make unsafe assumptions, while the graph adds substantial model and migration cost.
- **Recommended action:** Remove the CMS capability catalogue, conditions and role editor after persisted-data inventory, unless the product explicitly chooses to guard every Control route with it. Preserve endpoint modes/grants until AUTH-005 is resolved and preserve machine boundaries.
- **Expected benefit:** A smaller, truthful authorization model.
- **Behavior/data/security risk:** High if a custom role or external consumer relies on direct endpoint grants. Inventory before mutation; do not auto-promote.
- **Tests required before implementation:** Authorization matrix tests for every Control route family, persisted-role/grant migration report, direct source access, dashboard assignment, and Admin behavior.
- **Dependencies on other findings:** AUTH-001, AUTH-002, AUTH-003, AUTH-005.

### AUTH-005 — Endpoint modes and stored grants duplicate policy and can drift

- **Severity:** Medium
- **Confidence:** Confirmed
- **Affected files/packages:** `cms-sources/src/core/execution/access.ts`; `cms-integrations/src/core/import/declarative/accessGrants.ts`; Control/Delivery source authorization; `cms-permissions`.
- **Evidence:** Integration parsing rejects per-role endpoint lists, while import seeds exact `public`/`user` grants from endpoint modes (`accessGrants.ts:17-87`) and does not remove obsolete grants when a mode tightens. Runtime requires both an adequate endpoint mode and exact role grant.
- **Current behavior:** The definition is the apparent policy source, but a second persisted representation is required and can retain stale rows or support custom-role exceptions.
- **Why this is a problem:** Two authorities increase migration and debugging complexity. Stale grants currently fail closed after mode tightening, but remain misleading in storage/UI.
- **Recommended action:** Prefer mode-only access for Anonymous/Member/Admin direct calls, exact compiled plans for dashboard delegation, and internal authority for system calls. Retain a narrowly scoped custom direct-access grant mechanism only if the migration inventory proves a real consumer.
- **Expected benefit:** One obvious policy source for normal access and fewer stored artifacts.
- **Behavior/data/security risk:** High if custom-role endpoint access is removed without replacement.
- **Tests required before implementation:** Mode transitions in both directions, reinstall/upgrade cleanup, custom grant inventory, ownership rules and direct/proxied source matrices.
- **Dependencies on other findings:** AUTH-003, AUTH-004.

### AUTH-006 — OIDC administration advertises a provider the production runtime does not mount

- **Severity:** Medium
- **Confidence:** Confirmed
- **Affected files/packages:** `cms-control/src/api/_access/identity/provider.post.ts`; `cms-server/src/runtime/auth.ts`, `mountSurfaces.ts`; `cms-auth`.
- **Evidence:** The Control API creates identity providers and defaults the kind to OIDC (`provider.post.ts:9-46`). Production constructs only `LocalAuthentication` and passes only `{ local }` (`runtime/auth.ts:42-68`, `mountSurfaces.ts:186-205`). Auth method listing filters unsupported methods, so the stored OIDC provider never becomes usable.
- **Current behavior:** Administration accepts configuration that production silently cannot use.
- **Why this is a problem:** It creates dead configuration and a false product promise.
- **Recommended action:** Either compose `OidcAuthentication` with its secrets/routes and end-to-end tests, or hide/reject OIDC management in this runtime until supported.
- **Expected benefit:** Management capabilities match runtime behavior.
- **Behavior/data/security risk:** Medium; existing dormant provider records must be preserved or explicitly migrated.
- **Tests required before implementation:** Provider create/list, advertised login methods, callback/session flow if enabled, and rejection/migration if disabled.
- **Dependencies on other findings:** None.

### AUTH-007 — Logout and password change do not revoke a copied session cookie

- **Severity:** Medium
- **Confidence:** Confirmed
- **Affected files/packages:** `cms-auth/src/core/SignedCookieCodec.ts`, `default-implementation/authentication/LocalAuthentication.ts`, `core/accounts/changeOwnPassword.ts`.
- **Evidence:** The signed cookie carries only `{kind, sub, exp}`; authentication re-reads the user role but no server-side session version. Logout clears the caller's cookie only, and password change updates only the hash. Default lifetime is one hour.
- **Current behavior:** A stolen cookie remains valid until expiry unless the user is deleted or its role changes.
- **Why this is a problem:** This may be acceptable policy, but it is not a true revocation guarantee and is important for an Admin-only Control plane.
- **Recommended action:** Document the one-hour exposure explicitly or add a per-user session version/issued-after check changed on logout-all/password reset. Do not add state unless the security requirement justifies it.
- **Expected benefit:** An explicit, testable session security guarantee.
- **Behavior/data/security risk:** Medium; server-side revocation adds reads/state and can log users out during migration.
- **Tests required before implementation:** Copied cookie after logout, password change, role change, user deletion, expiry and multi-device policy.
- **Dependencies on other findings:** Target authorization model in section 5.

### ADAPTER-001 — Current production adapters impose hidden single-node and single-writer limits

- **Severity:** Medium
- **Confidence:** Confirmed
- **Affected files/packages:** `cms-server` storage/cache composition; `cms-repository-server` production support; `@bernouy/rate-limiter`; `@bernouy/cms-integration-registry`.
- **Evidence:** CMS production uses Mongo metadata with `LocalFsCmsFilesBlob`, local sitemap/source-image derivatives and a process-local `InMemoryCache`. Delivery receives that non-expiring cache although its own default is bounded `TtlCache`. Repository production uses an explicitly single-process `InMemoryIntegrationRegistryMutationCoordinator` and `InMemoryRateLimiter`; the latter never removes expired distinct keys. The local repository manifest uses atomic rename but no inter-process lock/CAS.
- **Current behavior:** One process/node behaves correctly, but multiple CMS nodes can serve different local files/cache state, multiple repository writers are not serialized across processes, and high-cardinality client addresses can grow limiter memory.
- **Why this is a problem:** Deployment topology is a correctness constraint that configuration does not make explicit.
- **Recommended action:** Declare/enforce single-node/single-writer mode now. Before horizontal scale, use shared object storage, bounded/distributed cache and limiter, and a filesystem/distributed registry lock with revision CAS. Keep fault simulators; they test a different concern.
- **Expected benefit:** Predictable deployment and no accidental unsafe scaling.
- **Behavior/data/security risk:** Medium; storage migration and cache semantics affect asset availability and freshness.
- **Tests required before implementation:** Two-instance file/cache visibility, bounded staleness, concurrent registry publication, stale CAS, orphan recovery and high-cardinality limiter expiry.
- **Dependencies on other findings:** ARCH-004, ARCH-005.

### DEAD-001 — Current dashboard validation still round-trips through the legacy model

- **Severity:** Medium
- **Confidence:** Confirmed
- **Affected files/packages:** `cms-dashboards/src/interfaces/dashboard/widgets.ts`, `core/validateDashboard/validateDashboard.ts`, `shared/v2Validation.ts`; `cms-integrations` dashboard parsing/writes.
- **Evidence:** Deprecated legacy widget aliases remain at `widgets.ts:90-105`; current validation constructs/converts legacy widgets in `v2Validation.ts:12-29,98-107`; integration artifact writes convert every current view back to legacy for validation (`dashboardViewWrites.ts:13-59`). Tests actively cover this path.
- **Current behavior:** The compatibility representation is not isolated at an input boundary; it remains part of normal current-definition validation.
- **Why this is a problem:** Every new view pays complexity for an old shape and it obscures the actual authorization-bearing execution plan. `DashboardViewDefinition.requires` is normalized/copied but has no identified enforcement consumer.
- **Recommended action:** Implement one validator over the current view/source-context model, isolate legacy conversion to explicit legacy import only, and retire it when supported repository history permits. Separately prove whether `requires` is needed before removal.
- **Expected benefit:** Smaller dashboard model and easier policy review.
- **Behavior/data/security risk:** Medium because historical definitions and compiled plans must remain readable.
- **Tests required before implementation:** Current and historical fixtures, execution-plan equivalence, repository baseline upgrades and explicit rejection/translation of unsupported legacy input.
- **Dependencies on other findings:** ARCH-003, AUTH-003.

### DEAD-002 — A small set of internal residues has no current production consumer

- **Severity:** Low
- **Confidence:** High
- **Affected files/packages:** `packages/resources/sites/*/p9r.config.json`; `cms-control/.../integrations/definitions.ts`; private `cms-repository-server` subpath exports; `.gitignore`/`.dockerignore` legacy entries.
- **Evidence:** The two tracked `p9r.config.json` files belong to explicitly historical sites; the deprecated `collectionSourceDefinitions` alias at `definitions.ts:211-212` has no repository consumer; seven explicit `cms-repository-server/*` exports have no internal package consumer and the package is private; `.p9r-state`, `.p9r` and `.p9r-dev` ignore entries remain after CLI removal.
- **Current behavior:** These names/configurations remain visible but do not drive the current CLI or production composition.
- **Why this is a problem:** They confuse searches for the removed CLI and widen private API surface.
- **Recommended action:** Remove the unused alias and unnecessary private subpath exports after an import check. Delete or rename the two historical configs only if no migration/visual tool reads them; clean ignore entries only after checking local developer workflows.
- **Expected benefit:** Narrower search space and fewer false architectural leads.
- **Behavior/data/security risk:** Low, but external/local tooling is not visible to repository search.
- **Tests required before implementation:** Package export smoke tests, migration snapshot tests and a documented external-consumer check.
- **Dependencies on other findings:** DOC-001. Do not remove active `<p9r-*>` or `window.p9r` contracts.

### DOC-001 — Documentation contains contradictory or pre-refactor architecture

- **Severity:** Medium
- **Confidence:** Confirmed
- **Affected files/packages:** `docs/Structure.md`, `docs/api-folder.md`, `docs/static-folder.md`, `docs/import-rules.md`, `infra/images/cms/README.md`, integration release/bloc docs.
- **Evidence:** `docs/Structure.md:47-70` omits nine feature packages plus repository management/verifier runtimes and describes official integrations as a versioned local repository. API/static docs point to the old `src/core/registerEndpoints` path; import rules advertise an absent auth `./components` export. `infra/images/cms/README.md:414-419` says to deploy a historical repository-hub site while the repository image README says it is only a migration reference. Release docs overstate local collection/runtime equivalence, and bloc editor guidance contradicts actual compiler requirements.
- **Current behavior:** Developers receive incompatible descriptions depending on which document they read.
- **Why this is a problem:** It drives exactly the unsafe cleanup assumptions this audit was asked to avoid.
- **Recommended action:** Update documentation only after the corresponding behavior decisions, generated from package manifests or checked paths where possible. Label historical documents and unsupported examples explicitly.
- **Expected benefit:** Onboarding and future audits start from accurate boundaries.
- **Behavior/data/security risk:** Low code risk; high process risk if documentation is updated ahead of implementation.
- **Tests required before implementation:** Documentation link/path checks and examples executed in a non-writing verification job.
- **Dependencies on other findings:** RELEASE-002, RELEASE-004, UI-006, DEAD-002.

### DUP-001 — Two exact handwritten duplicates have no semantic reason to diverge

- **Severity:** Low
- **Confidence:** Confirmed
- **Affected files/packages:** `cms-control/src/components/Layout/Analytics/styles/nav.css`, `Layout/SettingsSections/style.css`; `components/src/blocs/Feedback/Dialog/LateralDialog/emit.ts`, `FormDialog/emit.ts`.
- **Evidence:** Each pair has identical content hashes (17 CSS lines and 7 TypeScript lines respectively).
- **Current behavior:** The same navigation style and event helper are maintained twice.
- **Why this is a problem:** Tiny divergence risk and avoidable maintenance, while providing no isolation benefit.
- **Recommended action:** Share a clearly named stylesheet/helper or document why the copies are intentionally frozen. Do not confuse the generated Control bundle with duplicate source.
- **Expected benefit:** One edit location for identical behavior.
- **Behavior/data/security risk:** Low; CSS import order and package bundling are the only material concerns.
- **Tests required before implementation:** Component rendering/event tests and generated asset rebuild in the later implementation goal.
- **Dependencies on other findings:** None.

### RELEASE-001 — Effective collection dependencies are computed differently across the lifecycle

- **Severity:** Critical
- **Confidence:** Confirmed
- **Affected files/packages:** `ulvia-cli` dependency ordering/manifest/publication; `cms-integration-registry` admission planning; `cms-control` installation; Mossa/Ulvia definitions.
- **Evidence:** `ulvia-cli/src/release/source/dependencyOrder.ts:24-40` sees top-level dependencies and resource endpoint sources but omits `resources[].requires.collections` and theme dependencies. `repository/manifestModel.ts:58-73`, `publication/order.ts:27-37`, and remote planning `cms-integration-registry/.../planning/dependencies.ts:21-47,90-111` use only the stored top-level list. In contrast, the CMS resolver and `ulvia-cli/src/release/packages.ts:97-132` understand collection/theme requirements. Mossa has no top-level dependency but its theme (`mossa/definitions/configuration/theme.json:1-8`) and many resources require Ulvia.
- **Current behavior:** Release ordering and remote workload construction can omit Ulvia even though installing selected Mossa resources requires it. Local source resolution can accidentally mask that omission.
- **Why this is a problem:** A valid collection can pass local static checks yet be rejected remotely or fail during fresh installation; dependency order, cycle detection and stored metadata are not authoritative.
- **Recommended action:** Define `effectiveIntegrationDependencies(definition, selectedResources?)` once in `cms-integrations` or verification domain code. Use it in source ordering, manifest creation, push ordering, remote planning, verifier workload construction and CMS installation.
- **Expected benefit:** Identical dependency closure in authoring, publication and runtime.
- **Behavior/data/security risk:** High: changing closure can reveal cycles or install packages previously omitted. Treat the existing catalogue as migration input.
- **Tests required before implementation:** Mossa-to-Ulvia fresh local and remote release, `release --all`, `push --all`, nested collection/theme/source requirements, resource selection, version-range conflicts, cycles and stable/minimum dependency variants.
- **Dependencies on other findings:** ARCH-002, RELEASE-002, RELEASE-004.

### RELEASE-002 — Local collection audit stops after static conformance

- **Severity:** High
- **Confidence:** Confirmed
- **Affected files/packages:** `ulvia-cli/src/release/verification/index.ts`, `collection.ts`; remote verifier; release documentation.
- **Evidence:** `RuntimeLocalReleaseVerifier.verify` returns early for collections (`index.ts:11-21`). `collection.ts:10-48` checks catalogue conformance, compilation and selection only. The remote verifier executes the common disposable release runtime for every type. CLI and release documentation claim fresh-install/upgrade runtime coverage more broadly.
- **Current behavior:** Collection installation, dependency materialization, default content and runtime interactions are not exercised by local `audit`.
- **Why this is a problem:** It creates false confidence and masks RELEASE-001 and UI-001.
- **Recommended action:** Retain static collection preflight, then execute the same release runtime plan used for sources. Make any intentional collection-only omissions explicit in the result.
- **Expected benefit:** Local release failures resemble remote and CMS installation failures.
- **Behavior/data/security risk:** Medium: audits become slower and may expose missing fixtures/dependencies.
- **Tests required before implementation:** A deliberately un-installable collection must fail locally; Mossa with/without Ulvia; resource-selection installation; default-content hydration; parity corpus with remote verifier.
- **Dependencies on other findings:** RELEASE-001, RELEASE-004, UI-001.

### RELEASE-003 — Remote admission does not independently enforce migration policy for changed functions

- **Severity:** High
- **Confidence:** Confirmed
- **Affected files/packages:** `ulvia-cli/src/release/verification/policy.ts`; `cms-integration-registry` compatibility/planning; verifier release planning.
- **Evidence:** Local policy requires a migration-aware connector for function implementation changes, breaking changes or unknown compatibility (`policy.ts:16-45`). Remote stateful planning triggers migration evidence only for schema findings (`planning/stateful/index.ts:36-44`). Function bytes can change while the declared HTTP contract remains compatible (`compatibility/function/index.ts:41-78`), and resilience is added only when a migration is already declared.
- **Current behavior:** The current CLI normally catches this, but a direct authenticated candidate or future CLI regression can submit a function-only change without the evidence the local CLI requires.
- **Why this is a problem:** Remote admission is supposed to be authoritative and cannot trust a client-side policy for Edge Function replacement safety.
- **Recommended action:** Extract a shared stateful-change classifier/policy and enforce it during server planning. Client checks remain early feedback, not authority.
- **Expected benefit:** The trust boundary holds for every publisher.
- **Behavior/data/security risk:** Medium: stricter admission may block historically accepted releases until migration metadata is supplied.
- **Tests required before implementation:** Direct candidate API with same declared HTTP contract but changed function bytes, breaking/unknown variants, migration-present acceptance and unchanged function acceptance.
- **Dependencies on other findings:** ARCH-002, RELEASE-004.

### RELEASE-004 — Local audit is materially weaker than remote platform admission

- **Severity:** High
- **Confidence:** Confirmed
- **Affected files/packages:** `ulvia-cli/src/release/audit.ts`; `cms-integration-verification/src/core/verification/platform/definitions.ts`; `cms-integration-verifier/src/sandbox/postgres.ts`.
- **Evidence:** Local audit prepares a candidate, applies anonymous SQL/static compatibility/migration policy and runs local author/release scenarios. Remote additionally requires materialization, HTTP declaration coverage, minimum/stable dependency execution, PostgreSQL install/reapply/idempotence, owned roots, observed schema, RLS shape and behavior, grants, view security and privileged-function hardening (`definitions.ts:8-118`, `postgres.ts:67-205`).
- **Current behavior:** “Audit passed locally” is not equivalent to “remote admission will pass,” even when local history is complete.
- **Why this is a problem:** Authors reasonably interpret audit as the pre-push guarantee, and remote-only failures are expensive to diagnose.
- **Recommended action:** Expose the platform verifier for local disposable services or add an explicitly named remote-equivalent audit mode. Report which suites ran and which remain authoritative-only.
- **Expected benefit:** Predictable publication and a debuggable parity boundary.
- **Behavior/data/security risk:** Medium: full platform checks are slower and environment-sensitive.
- **Tests required before implementation:** Shared candidate corpus producing identical local/remote decisions; deliberate failures for each platform suite; clear degraded/offline result.
- **Dependencies on other findings:** ARCH-005, RELEASE-001, RELEASE-002, TEST-002.

### RELEASE-005 — Verification-only corrections cannot replace a local release bundle

- **Severity:** High
- **Confidence:** Confirmed
- **Affected files/packages:** `ulvia-cli/src/commands/release.ts`, `release/source/index.ts`, `repository/local.ts`, `publication/candidate.ts`.
- **Evidence:** Source reading rebuilds package and verification bundles, but `releaseOne` returns immediately when coordinate/package digest already exists (`release.ts:44-50`). The local store rejects a different verification digest (`local.ts:120-139`), and push uses the previously stored bundle. A current test enshrines skipping the second verification.
- **Current behavior:** Fixing only `seedBeforeUpgrade`, `assertAfterUpgrade`, a contract, or a test after remote rejection leaves the stale evidence attached to the local coordinate unless the integration version is bumped.
- **Why this is a problem:** Runtime artifacts should be immutable after publication, but rejected/unpublished evidence needs a deliberate correction lifecycle.
- **Recommended action:** Add an explicit evidence rebuild/replace operation allowed only while unpublished or rejected. Keep package bytes immutable and freeze both package and evidence after publication.
- **Expected benefit:** Authors can correct bad tests without fake version bumps while preserving repository immutability.
- **Behavior/data/security risk:** High if evidence could be swapped after admission. Bind replacement to candidate state and audit it.
- **Tests required before implementation:** Fixture-only change before push, after rejection, during pending admission and after publication; concurrent replacement; unchanged package digest with changed verification digest.
- **Dependencies on other findings:** RELEASE-008.

### RELEASE-006 — Production policy does not require cutover, rollback, or delayed-cleanup evidence

- **Severity:** High
- **Confidence:** Confirmed
- **Affected files/packages:** `cms-repository-server/src/core/candidates/policy.ts`; release scenario/resilience execution; migration report policy.
- **Evidence:** Production policy at `policy.ts:37-53` requires fresh-install, migrated-state and equivalence evidence for relevant versions, but sets CMS/provider cutover, rollback and delayed-cleanup requirements to false. Scenario execution is sequential install, seed, upgrade, assert; resilience proves durable identity/journal/PONR restart behavior more than live old/new overlap.
- **Current behavior:** A migration can pass without demonstrating that old and new traffic overlap safely, that rollback works before PONR, or that cleanup is delayed until safe.
- **Why this is a problem:** The test system cannot currently justify a zero-downtime guarantee for risky schema/function/provider changes.
- **Recommended action:** Add risk/strategy-based requirements for old/new traffic probes, backward-compatible payloads, rollback-before-PONR, refusal after PONR, provider callbacks and delayed cleanup. Enable them progressively only where the runner can produce reliable evidence.
- **Expected benefit:** Release guarantees match real downtime and rollback concerns.
- **Behavior/data/security risk:** High complexity and flakiness if applied indiscriminately; reserve the full matrix for stateful/high-risk releases.
- **Tests required before implementation:** Failure injection at every migration phase, concurrent old/new requests, retry/idempotence, provider callback duplication, rollback boundaries and cleanup timing.
- **Dependencies on other findings:** RELEASE-003, TEST-003.

### RELEASE-007 — A local release can silently audit an incomplete history

- **Severity:** Medium
- **Confidence:** Confirmed
- **Affected files/packages:** `ulvia-cli/src/release/audit.ts`, `release/packages.ts`; publication workflow and docs.
- **Evidence:** Candidate preparation and baseline selection only inspect locally pulled records. This is documented, and the official publication workflow correctly runs `pull --all` before audit/release, but no persisted completeness/freshness marker distinguishes an authoritative snapshot from an arbitrary subset.
- **Current behavior:** Offline operation is intentional, yet an ad-hoc local release can report success against fewer historical baselines than the remote repository owns.
- **Why this is a problem:** Future releases can unknowingly omit upgrade compatibility until remote admission, and the local result does not say it is partial.
- **Recommended action:** Preserve explicit pull/offline behavior but record catalogue origin/revision/completeness. Require a current complete-history marker in release CI or label the audit as partial.
- **Expected benefit:** Honest offline results and protection against silently skipped baselines.
- **Behavior/data/security risk:** Low to medium; strict freshness can unnecessarily block offline work if it is not opt-in outside CI.
- **Tests required before implementation:** Partial pull, complete pull, stale remote revision, unavailable remote, first integration and CI enforcement.
- **Dependencies on other findings:** RELEASE-004.

### RELEASE-008 — Push completion checks package bytes but not published verification evidence

- **Severity:** Medium
- **Confidence:** Confirmed
- **Affected files/packages:** `ulvia-cli/src/commands/push.ts`; public repository release-evidence routes; local repository publication state.
- **Evidence:** The final public round trip at `push.ts:121-142` compares the package digest only, despite candidates carrying a verification digest and the public repository exposing the immutable verification bundle endpoint.
- **Current behavior:** The CLI records `published` without independently hashing the public evidence it expects the server to retain.
- **Why this is a problem:** A catalogue/evidence publication inconsistency would be missed at the final client-visible boundary.
- **Recommended action:** Fetch and hash the published verification bundle and compare the public catalogue's `verificationDigest` before recording local publication. Clarify whether `push --all` means every coordinate or only the latest per integration; current implementation selects the latter while documentation says all coordinates.
- **Expected benefit:** End-to-end confirmation of both immutable artifacts and unambiguous publication semantics.
- **Behavior/data/security risk:** Low; extra downloads and old server compatibility must be handled explicitly.
- **Tests required before implementation:** Missing/wrong evidence, correct evidence, latest-only/all semantics, intermediate versions and retry after partial visibility.
- **Dependencies on other findings:** RELEASE-005.

### TEST-001 — The required integration CI workflow references removed paths and a missing generator

- **Severity:** Critical
- **Confidence:** Confirmed
- **Affected files/packages:** `.github/workflows/quality-integration-contracts.yml`, `.github/workflows/quality.yml`, `quality/ci/tests/workflow/quality-workflow.test.ts`, official PostgreSQL helpers, `quality/image-performance/provenance.ts`.
- **Evidence:** The integration workflow names six absent `official-integrations/tests/commerce/...` tests (`quality-integration-contracts.yml:93-101`), invokes a schema-calibration generator that does not exist (`:54-67`), and calls old PostgreSQL helpers that construct deleted version roots. Image provenance contains six deleted `/versions/1.0.0/blocs/...` paths and reads them. The main quality gate requires this job, while workflow tests assert the stale strings rather than filesystem existence.
- **Current behavior:** The required job can fail on setup/path lookup before it validates the intended current integration contracts.
- **Why this is a problem:** A red gate does not distinguish product regressions from obsolete wiring, and a superficially green mocked workflow test protects the wrong configuration.
- **Recommended action:** Rebuild discovery from current integration manifests/roots, remove or recreate the obsolete generator intentionally, update image provenance, and add a test that every workflow-referenced file exists and each command can enumerate its cases.
- **Expected benefit:** CI becomes a trustworthy release prerequisite again.
- **Behavior/data/security risk:** Medium: simply deleting missing steps could silently reduce coverage. Map each old case to its intended current equivalent.
- **Tests required before implementation:** Parse workflow commands, verify all paths, dry enumeration of SQL/image/test cases, affected-path and full manual workflow tests.
- **Dependencies on other findings:** TEST-002, TEST-003.

### TEST-002 — Portable author suites are empty and PostgreSQL proofs are not gating

- **Severity:** High
- **Confidence:** Confirmed
- **Affected files/packages:** `ulvia-cli/src/release/source/verification.ts`, `release/author-tests.ts`; integration verification protocol/server/verifier; `official-integrations/tests/helpers/postgres`; CI.
- **Evidence:** Verification bundle construction hardcodes empty `contracts`, `conformance` and general `fixtures`, packaging only the upgrade-fixture closure. Local audit runs the integration's whole Bun test directory, but those tests are excluded from package bytes and are not remotely portable. The server/verifier already support portable author suites but receive none. There are 54 current `*.pg.sql` files; standard `bun test` does not execute them, and the old CI runner is both path-broken and filtered to only two groups.
- **Current behavior:** Many business tests prove local source behavior only; remote admission reruns platform suites and upgrade fixtures but not the author's ordinary contracts/conformance/SQL corpus.
- **Why this is a problem:** “Tests passed remotely” does not mean the release's authored business contracts were rerun from immutable evidence.
- **Recommended action:** Define a bounded portable suite format and curate high-value contracts/conformance/SQL cases for bundling. Establish one authoritative SQL discovery runner. If the feature is not ready, remove the empty fields from claims/UI rather than implying coverage.
- **Expected benefit:** Evidence is reproducible and bound to the release.
- **Behavior/data/security risk:** Medium: arbitrary test trees are unsafe to execute remotely. Use declared capabilities, time/resource limits and reviewed fixtures.
- **Tests required before implementation:** Bundle integrity, sandbox restrictions, exact suite selection, SQL discovery, failure propagation, timeout and malicious-path rejection.
- **Dependencies on other findings:** TEST-001, RELEASE-004.

### TEST-003 — Business upgrade fixtures cover fewer than half of stateful sources

- **Severity:** High
- **Confidence:** Confirmed
- **Affected files/packages:** Official integration tests; release fixture executor and admission plan.
- **Evidence:** Only commerce, consent, photo-albums, mondial-relay and stripe-connect declare business upgrade fixtures. Stateful Supabase sources without one are forms, newsletter, sales-configurator, user-account, commerce-negotiation and emailer; high-risk commerce-stripe-payments also has no fixture. Collections Mossa/Ulvia and stateless/composition sources have none, which is not automatically an error. Without a fixture, scenario execution performs no business seed/assert step.
- **Current behavior:** Schema/runtime checks can pass while submitted forms, subscriptions, proposals, account metadata, negotiation state, email queues or payment saga state are semantically corrupted.
- **Why this is a problem:** Structural compatibility is not business-state preservation.
- **Recommended action:** Require `seedBeforeUpgrade`/`assertAfterUpgrade` based on state ownership and release risk, not indiscriminately by package. Prioritize payment and externally coordinated workflows, then the six state-owning sources.
- **Expected benefit:** Upgrades prove the data users care about survives.
- **Behavior/data/security risk:** Low implementation risk, but fixtures can encode accidental behavior. Keep assertions contract-focused and deterministic.
- **Tests required before implementation:** Every historical baseline for each stateful integration; success, partial migration, retry, duplicate callback, ownership/RLS and meaningful post-upgrade domain queries.
- **Dependencies on other findings:** RELEASE-006, TEST-002.

#### Official upgrade-fixture inventory

| Integration | Type/risk classification | Current version | Business upgrade fixture |
| --- | --- | ---: | --- |
| `ulvia` | Collection | `4.0.1` | No; collection runtime is also skipped locally. |
| `mossa` | Collection | `3.0.0` | No; collection runtime is also skipped locally. |
| `commerce` | Stateful source | `3.1.0` | Yes. |
| `consent` | Stateful source | `4.1.0` | Yes. |
| `forms` | Stateful source | `3.1.0` | No. |
| `newsletter` | Stateful source | `3.1.0` | No. |
| `photo-albums` | Stateful source | `3.1.0` | Yes. |
| `sales-configurator` | Stateful source | `3.1.0` | No. |
| `user-account` | Stateful source | `3.1.0` | No. |
| `commerce-negotiation` | Stateful source | `3.1.0` | No. |
| `emailer` | Stateful source | `3.1.0` | No. |
| `mondial-relay` | Stateful/provider source | `4.0.0` | Yes, currently database-focused. |
| `stripe-connect` | Stateful/provider source | `3.1.0` | Yes, but narrower than the full payment/account lifecycle. |
| `commerce-stripe-payments` | High-risk external-state orchestrator | `4.1.0` | No. |
| `commerce-mondial-relay-delivery` | Composition/stateless source | `3.1.0` | No; not automatically required. |
| `commerce-mondial-relay-fulfillment` | Composition/stateless source | `3.1.0` | No; not automatically required. |
| `ban` | Stateless provider/source | `3.1.0` | No; not automatically required and has no tests. |

### TEST-004 — The full `ulvia dev` persistence/render/upgrade E2E is never enabled in CI

- **Severity:** Medium
- **Confidence:** Confirmed
- **Affected files/packages:** `ulvia-cli/tests/cli/dev-local.e2e.test.ts`; CI workflows.
- **Evidence:** The only end-to-end test of persistent local CMS orchestration, collection selection, page render, restart and upgrade is gated by `ULVIA_RUN_LOCAL_E2E=1` (`dev-local.e2e.test.ts:24-150`). No workflow sets that variable.
- **Current behavior:** Normal CI skips the behavior developers rely on to test local integrations.
- **Why this is a problem:** Unit-level success does not detect service wiring, persistence or restart regressions.
- **Recommended action:** Add a dedicated affected-path or scheduled job with bounded disposable services, logs and deterministic teardown. Keep provider-live tests separately gated.
- **Expected benefit:** Confidence in the primary local development workflow.
- **Behavior/data/security risk:** Low product risk; CI flakiness/resource cost must be controlled.
- **Tests required before implementation:** Existing E2E enabled in a clean environment, failure cleanup, port collision, repeated run and artifact-free completion.
- **Dependencies on other findings:** RELEASE-002, RELEASE-004.

#### Coverage confidence by required scenario

| Scenario | Current evidence | Assessment |
| --- | --- | --- |
| Fresh installation | Remote platform suite materializes and installs packages; local source runtime does so | Strong remotely for correctly planned packages; weak locally for collections and vulnerable to missing dependency closure. |
| Every historical upgrade | Remote planner supplies authoritative baselines; runtime iterates planned baselines | Structurally strong when history/dependencies are complete; local history can be partial. |
| Business-state preservation | `seedBeforeUpgrade`/`assertAfterUpgrade` supported and bundled for five integrations | Insufficient for six stateful sources and the payment orchestrator. |
| Migration crash recovery | Registry publication has extensive journaling/replay; release resilience injects selected migration failures | Strong for publication/restart identity; incomplete for live traffic, provider cutover and rollback semantics. |
| Rollback/PONR | Report model can express evidence; production policy disables several requirements | Insufficient for a zero-downtime/rollback claim. |
| Runtime configuration | Numerous unit/composition tests; verifier reconstructs exact workloads | Broad static/test coverage, but MODE reads and silent defaults reduce determinism. |
| Authorization | Route guards, source grants/modes and dashboard plans have focused tests | Strong for isolated CMS boundaries; missing real delegated Member-to-connector flow and PAT scope enforcement. |
| Bindings | Foundation bindings have implementations/tests | Incomplete at collection boundary because direct fetches are neither declared nor linted. |
| Component rendering | Mapping/compilation checks are broad | Behavior, hydration/default-root, accessibility and Mossa runtime state are weak. |
| `ulvia dev` | One substantial E2E covers persistence/restart/render/upgrade | Opt-in only and absent from CI. |
| Mongo adapters | Every production repository family has contract/focused tests in source | Broad by inspection; not executed during this read-only audit. |
| PostgreSQL/RLS | Remote platform suite checks schema, RLS shape/behavior, grants, views and privileged functions | Strong remote framework; authored 54-file SQL corpus is not reliably gated by current CI. |
| Edge Functions | Declaration/materialization checks and many integration tests exist | Function-only migration policy is weaker remotely; external/runtime traffic is not fully proven. |
| Supabase Auth/Storage | Disposable Supabase and integration-specific tests/fixtures exist | Partial; no evidence that every relevant Auth/Storage flow is in the required CI/admission matrix. |
| Repository admission | Candidate state, fencing, immutable publication, journal and recovery tests are extensive | Strongest audited lifecycle, subject to planner/policy gaps above. |
| Dashboards/views | Validation, compilation, revision, assignment and proxy tests are broad | CMS boundary strong; connector delegation mismatch and legacy conversion remain. |

### UI-001 — `forms-renderer` default content cannot instantiate its declared custom element

- **Severity:** High
- **Confidence:** Confirmed
- **Affected files/packages:** Ulvia forms renderer; `cms-bloc-compile`; editor insertion.
- **Evidence:** `ulvia/blocs/domains/forms/form-renderer/manifest.json:2-5` declares tag `forms-renderer`, while `default.html:1-10` contains two sibling `<div>` elements and no `<forms-renderer>` root. Editor insertion writes `entry.defaultContent` verbatim (`cms-editor-system-v2/.../Mutations/insertion.ts:67-76`). Documentation requires root/tag equality, but `validateBloc.ts:10-19,47-65` never validates default HTML.
- **Current behavior:** Compilation/catalogue checks pass, but selecting this bloc inserts markup that cannot hydrate the registered class.
- **Why this is a problem:** It is a current user-visible broken catalogue item and proves a systemic validator gap.
- **Recommended action:** Fix the default wrapper in the implementation goal and add release conformance that parses default content, requires one compatible root, and exercises catalogue insertion/hydration.
- **Expected benefit:** Selectable means renderable for every bloc.
- **Behavior/data/security risk:** Low for the wrapper; migration risk exists for already saved malformed instances.
- **Tests required before implementation:** Default parser over every resource, editor insert, browser hydration, saved legacy content and error reporting.
- **Dependencies on other findings:** RELEASE-002, UI-005.

### UI-002 — Declared endpoint requirements do not govern actual collection data access

- **Severity:** High
- **Confidence:** Confirmed
- **Affected files/packages:** 23 authored collection TypeScript files (13 Ulvia, 10 Mossa); component bindings; collection conformance.
- **Evidence:** Static closure inspection found 26 direct `fetch()` calls. Representative Ulvia files include commerce offer price (`Bloc.ts:696,716`), sale detail (`:206`), forms renderer (`:47,119`), newsletter (`:118`), Stripe payment (`:632`) and provider onboarding (`:724,774`). Representative Mossa files include checkout (`:795`), sell flow (`:564`), public-offer controller (`:233`) and `base-form` (`:224`). `assertCollectionConformance` validates declared endpoint URNs/shapes but never links runtime calls to those declarations. `base-form` reimplements source observation, abort, status, submit and serialization already owned by `@bernouy/components` Source bindings.
- **Current behavior:** A bloc can declare one dependency and call another URL, and simpler forms/lists maintain a second transport lifecycle.
- **Why this is a problem:** Dependency/resource selection cannot be trusted, and loading/error/cancellation behavior diverges.
- **Recommended action:** Use existing Source bindings for ordinary list/form/subscription cases. Add a small declared-capability Source client for legitimate imperative state machines. Keep provider SDK calls and complex checkout/payment/multi-step orchestration in TypeScript, but route CMS endpoint access through the declared client.
- **Expected benefit:** Enforceable data contracts and less duplicated transport code without over-constraining complex UI.
- **Behavior/data/security risk:** High: request serialization, abort, credentials and error handling must remain identical.
- **Tests required before implementation:** Static declaration-to-call validation, binding behavior, cancellation/disconnect, retry, concurrent requests, provider SDK exceptions and end-to-end selected-resource installs.
- **Dependencies on other findings:** UI-005, TEST-002.

### UI-003 — Mossa mixes reusable specialization, generic primitives, duplicates and site identity

- **Severity:** High
- **Confidence:** Confirmed
- **Affected files/packages:** Mossa collection definitions/blocs; Ulvia; site-owned content.
- **Evidence:** Mossa ships 152 opt-in resources: 80 `base-*`, 64 `cs-*`, and 8 other resources. Its header/footer templates embed client labels, logo, and organization details, while category descriptions name a specific customer, despite the integration model saying collection identity should remain reusable. Content hashing found 16 `cs-*`/`base-*` pairs sharing at least two core files; nine pairs share all runtime/editor/template/style files, including step-section, form-card, stat-tile, CTA card, hero-editorial and avatar-uploader.
- **Current behavior:** Mossa is simultaneously a customer site package, a second generic design system and a marketplace specialization. Defaults often create a second tag for otherwise identical implementations.
- **Why this is a problem:** Every fix/theme change must be repeated, resource choice is noisy, and Mossa cannot be reused independently from the original client despite its intended name.
- **Recommended action:** Move generic primitives to Ulvia; represent alternate defaults as compositions/presets rather than duplicate implementations; keep only reusable marketplace-specific blocs in Mossa; move logo, organization, site navigation and page composition into site-owned data/configuration. Preserve saved `cs-*` tags through explicit aliases or content migration.
- **Expected benefit:** One coherent design system and a small meaningful Mossa layer usable by multiple sites.
- **Behavior/data/security risk:** High for saved page content and CSS selectors. Do not delete tags before an inventory/migration.
- **Tests required before implementation:** Saved-content tag inventory, visual golden pages, alias/migration round trip, resource selection, Ulvia-only and Ulvia+Mossa theme matrices.
- **Dependencies on other findings:** UI-004, UI-005, DEAD-002 site decision.

### UI-004 — Theme conformance validates metadata, not actual token usage

- **Severity:** High
- **Confidence:** Confirmed
- **Affected files/packages:** Ulvia/Mossa bloc styles and scripts; `cms-integrations/src/core/resources/conformance.ts`.
- **Evidence:** Conformance only confirms that declared metadata token names exist (`conformance.ts:14-39,279-284`). Import-closure analysis found three Ulvia resources and 49 Mossa resources using undeclared `--ulvia-*` tokens. Twelve Ulvia and 25 Mossa resources contain hard-coded hex colors in runtime closure with no Ulvia token. The Mossa contract concatenates the whole collection and checks that some desired strings exist, allowing compliant resources to mask others.
- **Current behavior:** A release can be declared theme-compatible while individual resources depend on undeclared tokens or fixed legacy palettes.
- **Why this is a problem:** Combining collections or changing theme modes produces unpredictable colors/contrast and breaks portability.
- **Recommended action:** Validate each resource's full import closure: every `--ulvia-*` usage must be declared/available, semantic colors must use Ulvia roles unless explicitly collection-specific, and private collection variables must be namespaced. Test multiple token sets rather than one concatenated string corpus.
- **Expected benefit:** Real cross-collection theme compatibility.
- **Behavior/data/security risk:** Medium: blindly replacing colors can change brand intent and accessibility.
- **Tests required before implementation:** Per-resource token lint, light/dark/alternate themes, missing-token failure, fallback behavior, contrast and visual regression.
- **Dependencies on other findings:** UI-003.

### UI-005 — Mossa has broad compilation coverage but almost no behavior coverage

- **Severity:** High
- **Confidence:** Confirmed
- **Affected files/packages:** `mossa/tests/contract.test.ts`; 152 Mossa resources.
- **Evidence:** The single suite checks catalogue mapping, selection, aggregate strings and that sources build. It does not exercise DOM state, cleanup or accessibility for critical controllers such as the roughly 1,139-line checkout, 798-line sell flow, 726-line order detail, 645-line base form, 472-line public-offer controller or 423-line profile.
- **Current behavior:** Syntax and declarations can pass while loading, empty, error, retry, mutation, disconnect or keyboard behavior is broken.
- **Why this is a problem:** These blocs implement revenue- and account-sensitive workflows.
- **Recommended action:** Add prioritized behavior tests, starting with checkout/sell/order/profile and shared form/list infrastructure. Add browser visual acceptance for representative page compositions after deterministic DOM tests.
- **Expected benefit:** Failures are caught at the component contract rather than during local site testing.
- **Behavior/data/security risk:** Low; avoid brittle pixel-only tests and production credentials.
- **Tests required before implementation:** Loading/empty/error/retry, concurrency/abort/disconnect, mutation idempotence, keyboard/focus/accessibility, source errors and representative responsive visuals.
- **Dependencies on other findings:** UI-002, UI-003, UI-004, TEST-002.

### UI-006 — Official blocs retain multiple overlapping authoring conventions

- **Severity:** Medium
- **Confidence:** Confirmed
- **Affected files/packages:** Ulvia/Mossa Bloc sources; compiler registration compatibility; bloc authoring docs.
- **Evidence:** Sixteen official TS files embed `<style>` blocks, including Stripe payment/onboarding and basic form controls. Forty-five Mossa HTML sites repeat inline `--cms-button-*` bridges. 103 of 125 Ulvia `Bloc.ts` files self-register the `BE5_TAG_TO_BE_REPLACED` placeholder, while the compiler now auto-registers exported classes; Mossa already uses the newer convention. Conversely, 122 Ulvia and 145 Mossa editors call `registerEditor()`, which current compilation actually requires although docs say not to. Raw manifest fields described as unconsumed (`runtime`, icon, author, categories) remain widespread.
- **Current behavior:** Runtime compatibility, editor requirements, static source layout and metadata conventions differ by generation of bloc.
- **Why this is a problem:** Mechanical cleanup is dangerous because some apparent legacy code is still required, while genuine static duplication makes files very large.
- **Recommended action:** Define one compiler-owned contract first. Then migrate static templates/styles out of TS, add a semantic public basic-button appearance contract, migrate Ulvia view self-registration while retaining external-history compatibility, correct editor docs before touching `registerEditor`, and remove inert metadata only after checking external raw-bundle tooling.
- **Expected benefit:** Smaller, more consistent components and safer future generation.
- **Behavior/data/security risk:** Medium: registration and CSS loading are runtime-critical.
- **Tests required before implementation:** Compiler fixtures for old/new view and editor conventions, package/history compatibility, style order, custom-element registration, and raw manifest consumer inventory.
- **Dependencies on other findings:** DOC-001, UI-002.

### UI-007 — Ulvia's category taxonomy still reflects the former package split

- **Severity:** Medium
- **Confidence:** Confirmed
- **Affected files/packages:** `ulvia/definitions/configuration/categories.json` and resource category assignments.
- **Evidence:** Ulvia has 28 valid categories, including five `Documentation · ...` groups, separate `form` and `forms`, and several workspace-prefixed sections. All references resolve, but the labels preserve boundaries that disappeared when blocs were consolidated.
- **Current behavior:** The editor shows verbose/redundant prefixes and near-duplicate groups rather than a concise design-system catalogue.
- **Why this is a problem:** Resource discovery is harder and collection ownership appears fragmented.
- **Recommended action:** Design a stable concise taxonomy (for example Actions, Brand, Feedback, Forms, Layout, Content, Commerce, Media) and migrate category metadata without changing resource IDs/tags.
- **Expected benefit:** Cleaner editor navigation with no runtime component change.
- **Behavior/data/security risk:** Low; user familiarity and saved category preferences, if any, need checking.
- **Tests required before implementation:** Every resource maps to an existing category, deterministic order, no empty categories and editor snapshot/interaction tests.
- **Dependencies on other findings:** UI-003.

## 5. Authorization model audit

### Current model and actual enforcement

The persisted human role IDs are open strings. `admin` is a virtual all-powerful role, `user` is the ordinary authenticated role, and `public` supplies inherited anonymous endpoint grants rather than representing a signed-in user. Custom roles may inherit other roles and hold endpoint or CMS capability grants. In practice, three different authorization systems operate side by side:

1. **Control administration:** an exact `role === "admin"` guard protects the Admin API and assets. Generic `urn:cms:*` grants do not grant entry.
2. **Dashboard operation:** an authenticated subject must be assigned the published dashboard. Its compiled plan then permits exact source, endpoint and HTTP method calls and forbids system endpoints.
3. **Direct Delivery/source operation:** endpoint access mode establishes a public/auth/admin/system floor, then exact/inherited role grants are checked. Individual connector code may add ownership or literal-role checks.

This explains why the generic permission graph is only **partially redundant**: CMS capabilities are largely decorative, but endpoint grants and custom-role data may still affect direct Delivery calls. It also exposes the missing bridge between dashboard capability and connector authorization described by AUTH-003.

### Authorization matrix

| Actor | Authentication state | Stored role or identity | Requested resource/action | Policy source | Enforcement location | Persistence involved | Expected current outcome |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Anonymous visitor | None | No user; effective `public` policy | Public page/static asset | Page publication/routing | `cms-delivery` render routes | Content/settings repositories | Allow published content. |
| Anonymous visitor | None | Effective `public` grant set | Addressable CMS file | File route; no per-file ACL in metadata contract | `cms-files` delivery handler mounted by Delivery | Mongo metadata + local blob | Allow when the URL resolves; current store must be treated as public-media-only. |
| Anonymous visitor | None | Effective `public` grant set | Source endpoint with mode `public` | Endpoint mode plus exact public endpoint grant | Delivery source authorization | Source definitions + roles/grants | Allow only when both checks pass. |
| Anonymous visitor | None | None | `auth`, `admin` or `system` endpoint | Endpoint access rank | Delivery source authorization | Source definitions | Deny. |
| Member | Local session | Persisted role ID `user` (recommended UI label: Member) | Protected Control API or Admin assets | Exact Admin guard | `cms-control` `adminAccess` / route mount | User repository/session cookie | Deny, regardless of `urn:cms:*` grants. |
| Member | Local session | `user`, inheriting public/user grants | Direct source endpoint with mode `public` or `auth` | Mode plus exact endpoint grant; connector ownership may narrow | Delivery source authorization then connector | Source definitions, roles/grants, connector data | Allow only with matching grant and connector policy. |
| Member | Local session | `user` subject | Open assigned published dashboard | Subject-to-dashboard assignment | Control dashboard access | Dashboard/view/assignment repositories | Allow; deny when unassigned/unpublished. |
| Assigned Member | Local session | `user` subject plus dashboard context | Dashboard source action in compiled plan | Exact source/endpoint/method plan | Control dashboard proxy, then connector | Dashboard revision/assignment + source definition | CMS proxy allows; several official connectors then deny literal non-Admin role (AUTH-003). |
| Member/Anonymous | Session/none | User ID if present | Owned business resource | Integration-defined ownership/strategy and trusted user ID | Supabase RLS/Edge Function/source logic | Integration PostgreSQL/Auth data | Allow only according to the integration; generic CMS roles do not replace ownership. |
| Custom-role user | Local session | Arbitrary persisted role and inheritance | Protected Control API | Exact Admin guard | Control | User/role repositories | Deny even if CMS capability grants are present. |
| Custom-role user | Local session | Custom endpoint grants | Direct non-system source endpoint | Authenticated rank plus exact/inherited endpoint grant; connector may check literal role | Delivery plus connector | Roles/grants and connector data | Potentially allow at CMS boundary; outcome is connector-dependent and inconsistent. |
| Custom-role user | Local session | Subject assignment | Assigned dashboard | Assignment and compiled plan | Control dashboard routes/proxy | Dashboard assignments | Same CMS-level allowance as a Member; connector mismatch still applies. |
| Administrator | Local session | Exact role `admin` | Any Control administration, integration configuration/upgrade, secret configuration or upload | Exact Admin guard | Control route boundary | Relevant feature stores | Allow. |
| Administrator | Local session | `admin` | Published dashboards | Admin dashboard bypass | Control dashboard access | Dashboard repositories | Allow without assignment. |
| Administrator | Local session | `admin` | Direct source endpoint below `system` | Admin bypass plus endpoint mode | Control/Delivery source authorization; connector | Source definitions/connector data | Allow unless connector/business validation rejects. |
| Administrator | PAT bearer | User is Admin; PAT scopes discarded | Control/source/dashboard action | Same resolved user role as cookie session | `LocalAuthentication`, then ordinary guards | PAT + user repositories | Same broad Admin authority until expiry/revocation; current generated PAT usually has no expiry. |
| Internal CMS call | Trusted request scope | `system-auth` or `system-site` identity | Internal/system source endpoint | Internal identity and endpoint mode | Request-scoped source wrappers/authorization | Identity/source stores as applicable | Allow only through internal path; normal human direct/proxy calls are denied. |
| Integration connector | CMS-provisioned machine context | Connector/provider identity and secrets | Provider API, migration, deployment, webhook provisioning | Integration strategy and runtime configuration | Connector adapters/Edge Functions | Encrypted secrets + provider/install records | Separate from human roles; preserve this boundary. |
| Repository publisher | Authenticated management client | Repository service/publisher authority, not CMS role | Candidate upload/promotion | Repository management gateway and immutable candidate state | Repository management surface | Filesystem candidate/catalog/journal stores | Allow only through repository credentials/policy; unrelated to CMS custom roles. |
| Verifier worker | Fenced server-issued workload | Verification worker/capability | Fetch exact packages and submit report | Workload digest, token/fence and suite policy | Repository server + verifier protocol | Workload/report/evidence stores | Limited to the exact candidate/baselines; must never inherit human Admin semantics. |

### Redundant and necessary concepts

**Redundant or misleading after migration**

- editable `urn:cms:*` capabilities that never pass the exact-Admin Control guard;
- grant conditions, which cannot be created and always deny;
- treating `public` as if it were an assignable human role;
- custom human roles used only to approximate dashboard jobs that are already modeled by assignments;
- duplicated public/user endpoint grant rows when endpoint modes can be the normal policy source;
- the `support`/`finance` role-name migration after its one-time data transition.

**Necessary boundaries to retain**

- the persisted `admin` distinction and ordinary authenticated `user` identity;
- unauthenticated public state;
- dashboard subject assignments, published revisions and exact compiled execution plans;
- endpoint modes, ownership rules, RLS and integration-specific business authorization;
- a temporary/narrow custom direct-endpoint grant facility if persisted usage exists;
- PAT credential identity, scopes/expiry/revocation once made real;
- internal/system request scopes, service principals, repository publishers and verifier workers;
- encrypted secret storage and provider-specific machine credentials.

### Recommended smallest safe target model

1. Keep the wire/storage IDs `admin` and `user` initially; display `user` as **Member**. Renaming the wire ID immediately would break connectors/tests that compare literal values.
2. Model **Anonymous** as absence of authentication plus endpoint/page publication policy, not an assignable stored role.
3. Let endpoint access modes define ordinary direct access: public, authenticated Member, Admin, or internal system.
4. Let dashboard assignment plus an immutable compiled plan define delegated operator actions. Carry a signed capability context to connectors while retaining original actor identity for ownership and audit.
5. Keep resource ownership/RLS in each source integration. A dashboard grant does not imply ownership and a direct endpoint mode does not bypass it.
6. Keep Admin as the only general Control administrator unless a future product decision introduces real per-route capabilities.
7. Treat PATs and machine identities as distinct principal kinds, with explicit scopes/audience, expiry and revocation. Never map them to editable human roles implicitly.
8. Remove custom human roles and the generic CMS catalogue only after the migration inventory shows that all real duties are represented by Member/Admin, dashboard assignments or an explicit direct-source exception.

### Data migration implications

The migration must be report-first and reversible:

1. snapshot users, role definitions/inheritance/grants, PATs, dashboard assignments, integration endpoint definitions, and any persisted page/source bindings that contain role IDs;
2. mark the current authorization-schema migration version so startup never repeats name-based logic;
3. retain Admin users exactly; label existing `user` users as Member without changing the wire ID;
4. for each custom role, classify every holder and every effective grant as dashboard duty, direct endpoint access, obsolete CMS capability, or unresolved;
5. create/verify dashboard assignments for operator duties and explicit endpoint exceptions only where direct access is truly required;
6. stop and report unresolved custom grants—never auto-promote them to Admin;
7. remove the role editor/CMS capability rows and then delete role definitions only after equivalence checks;
8. rotate or constrain PATs whose intended scope cannot be reconstructed; keep service/machine principals separate;
9. retain a migration ledger and before/after authorization matrix for rollback/audit.

### Security invariants

- No role name, label, missing dependency or default adapter may increase authority.
- A Member never gains general Control access through a CMS capability row.
- A dashboard capability is bound to subject, dashboard, published revision, source, endpoint and method; it cannot invoke system endpoints or be forged by the browser.
- Direct endpoint access requires the declared mode and applicable ownership/business policy.
- Original actor identity is retained through delegated connector calls.
- PAT scope/audience/expiry is enforced at every relevant boundary or is not advertised.
- Internal/system, repository and verifier credentials never collapse into human Admin.
- Tightening a definition removes or invalidates obsolete persisted grants deterministically.
- File storage remains explicitly public-only until an ACL/signed-delivery model exists.

## 6. Components and bindings audit

### Declarative consistency inventory

| Check | Result |
| --- | --- |
| Ulvia resources to artifact tags/paths/manifests | 131/131 resolve. |
| Mossa resources to artifact tags/paths/manifests | 152/152 resolve. |
| Declared views/compositions | Ulvia 125 views + 6 compositions; Mossa 148 views + 4 compositions; paths resolve. |
| Internal controller reachability | All seven internal controllers have incoming parent requirements. |
| Missing/orphan bulk mappings | None found. |
| Selectable but semantically unrenderable default | One confirmed: `forms-renderer` (UI-001). |
| Collection dependency closure | Individual references resolve in source, but lifecycle planners omit theme/collection edges (RELEASE-001). |
| Generated Control bundle | `cms-control/src/static/assets/control-components.js` is a tracked generated artifact from `prebuildControl.ts`; intentional, not handwritten duplication. |

### Direct data access and binding bypasses

Exactly 23 authored collection TypeScript files contain 26 direct `fetch()` calls:

| Collection | Files | Assessment |
| --- | --- | --- |
| Ulvia | `commerce-notification-preferences/Bloc.ts`; `commerce-offer-filter/schema/schema-loader.ts`; `commerce-offer-price-form/controller/Bloc.ts`; `commerce-offer-price-form/stripe-account-token.ts`; `commerce-sale-detail/Bloc.ts`; `forms/form-renderer/Bloc.ts`; `newsletter-subscription/Bloc.ts`; `commerce-mondial-relay-sale-fulfillment/Bloc.ts`; negotiation form and list controllers; `commerce-stripe-payment/Bloc.ts`; Mondial Relay picker `runtime/operations.ts`; Stripe Connect onboarding `Bloc.ts` | Ordinary preferences/list/form/schema requests should use Source bindings or a declared Source client. Stripe account-token/Elements and Mondial widget requests are legitimate third-party imperative calls. Payment, negotiation and onboarding state machines may remain imperative, but CMS calls must be declaration-bound. |
| Mossa | profile controller; order detail; purchase list; cote table; checkout flow; club lookup; service withdrawal form; public-offer controller; sell flow; `base-form/Bloc.ts` | Simple reads/forms should use bindings. Checkout/sell are legitimate state machines. `base-form` is a high-value consolidation target because it duplicates Source status, abort, serialization and submit behavior. |

The current collection conformance check validates that declared endpoint URNs and shapes exist; it does not prove that runtime requests use only those declarations. This is the missing link between source dependencies and executable UI. A safe solution is not “no TypeScript”: it is a typed, declared Source client for imperative controllers, plus bindings for ordinary reactive cases.

### Mixed HTML/CSS/TypeScript inventory

Sixteen official TypeScript files embed static `<style>` blocks: Stripe Connect onboarding, Stripe payment, basic select, file input, chip group, input, checkbox, textarea, newsletter subscription, Mondial rendered picker, basic card, notification preferences, skeleton, chip, redirect and button. The largest provider/payment files exceed 1,000 lines, while even `basic-button/Bloc.ts` carries static style text. Static markup/styles should be separate source inputs; interaction/provider state belongs in TypeScript.

Mossa also repeats the same inline `--cms-button-*` bridge in 45 HTML locations. This is evidence for a small public semantic appearance/tone API on Ulvia's button, not for copying a style bridge into every consumer. Ulvia's sales client directory contains eight full inline layout rules that should likewise become static CSS.

### Exact and semantic duplicates

- Nine Mossa `cs-*`/`base-*` pairs share all four runtime/editor/template/style files: step section, page-header actions, form card, toggle row, prominent search card, stat tile, CTA card, editorial hero and avatar uploader.
- Seven more families share multiple core files: empty state, back-link/menu-item, chip toggle, chip-toggle group, checkbox-with-badge, feature strip and brands row.
- In most of these cases defaults or labels are the meaningful difference. A composition/preset/variant is preferable to a new implementation and custom-element tag.
- The two small cross-package exact duplicates are documented in DUP-001.
- Similar source structure is not automatically duplication: complex checkout, payment and provider blocs have distinct state machines and should not be collapsed merely because they issue similar requests.

### Ownership and source-specific coupling

Mossa currently contains 80 generic `base-*` resources, 64 `cs-*` resources and eight other resources. Its shipped header/footer/category text embeds site-specific identity in at least 110 files/path or content occurrences. The intended layering is instead:

- Ulvia owns generic primitives and common official-source blocs;
- Mossa owns only reusable marketplace-specific additions and carefully scoped variables that Ulvia does not provide;
- a site owns its logo, organization, navigation, content and page compositions;
- sources own data/endpoints/business behavior, not a customer collection;
- blocks declare the endpoint capabilities they need; source-provider substitution is a future contract design, not required for this cleanup.

### Registration, reachability and potentially obsolete UI surface

- Every `cms-control`-owned custom element has at least one production literal consumer.
- Eight public foundation components are imported/registered only by `cms-control/src/components/index.ts` and have no other repository production reference: Badge, LateralDialog, PhotoAlbum, TableHeaderCell, TagSuggest, Stat, LineChart and BarList. This is insufficient evidence for deletion because they are public exports; the data-visualization trio is the strongest deprecation candidate after external-consumer review.
- Toast/ToastStack are dynamically constructed by `showToast` and are not dead despite the lack of a static tag in ordinary templates.
- Stack is heavily used from the root export but is the only root UI export without a lazy `blocEntries` entry; this requires a product/API decision, not automatic cleanup.
- 103/125 Ulvia view classes still self-register through the placeholder compatibility convention; no Mossa view does. This compatibility can be migrated internally but may still be needed for old/external packages.
- Almost every official editor explicitly calls `registerEditor()`. Current compilation requires this for provided editor source, so the contradictory documentation—not the calls—is presently wrong.
- Raw `runtime`, icon, author and category manifest metadata is widespread even though current scanner documentation says it is unconsumed. External tooling must be checked before removal.

### Theme and style consistency

The audit found three Ulvia resources and 49 Mossa resources that use undeclared `--ulvia-*` tokens, plus 12 Ulvia and 25 Mossa resources with hard-coded runtime hex colors and no Ulvia token. These counts are per resource import closure, not a grep-only claim. Representative gaps include `font-heading`, `page-background`, `surface-border`, `surface-text`, `secondary-base` and larger spacing tokens in common Mossa cards/flows. Current aggregate Mossa tests can be satisfied by one compliant resource and therefore do not validate portability.

### Runtime confirmation required

Static evidence cannot safely decide:

- whether the eight foundation exports have external consumers;
- how many persisted pages still contain duplicate `cs-*` tags or malformed forms-renderer content;
- whether hard-coded colors are intentional brand assets or accidental legacy values;
- whether any raw-manifest tool consumes fields marked inactive;
- exact browser accessibility, focus, hydration and cleanup behavior;
- whether third-party SDK calls can be mediated without violating provider constraints.

These are listed again in section 9 with the evidence required.

## 7. Adapter and simulator audit

The inventory below classifies implementation **families**, which is more reliable than calling every test class separately. No broad class of in-memory/fake implementation is dead: most are heavily used as contract or failure-test seams.

| Family | Implementations / examples | Actual consumers | Classification | Recommended disposition |
| --- | --- | --- | --- | --- |
| Mongo CMS feature stores | Content; file metadata; users/providers/credentials/PAT/tokens; roles; rate limits; secrets; source-image jobs/index; sources/overlays; functions; triggers; identities; dashboards/views/assignments; relations; analytics/performance; installation/provider records | `cms-server` production composition | Required production adapters | Keep. Maintain contract tests per feature and keep adapter imports at the runtime root. |
| Envelope secret storage | Mongo DEK repository, local KEK provider, envelope crypto, encrypted Mongo secret store | `cms-server` production | Required production security adapters | Keep; document key rotation/backup and test unreadable/rotated data. |
| Local file blobs | `LocalFsCmsFilesBlob`, sitemap paths, source-image cache/derivatives | `cms-server` production and `ulvia dev` | Required current production/development adapters with single-node constraint | Keep now; explicitly document shared-volume/single-node requirement. Add object storage before horizontal scale. |
| Source-image processing | Mongo job/index stores, Local source-image cache, Sharp workers and transformers | `cms-server` worker/runtime | Required production adapters | Keep. Do not confuse local derivative files with old CLI snapshots. |
| Integration network/deployment | HTTP definition/package/compatibility/evidence clients; FS package cache/resolver; Supabase deploy/migration/function/baseline clients; Stripe webhook provisioner | `cms-server`, CLI, verifier and repository flows | Required production/development adapters | Keep; unify policy above adapters rather than merge transport implementations. |
| Filesystem integration definitions/packages | `FsIntegrationDefinitionRepository`, `FsIntegrationPackageSource` | Official source release, CLI/local publishing, tests/composition fixtures | Required development/release adapters; useful reference implementation | Keep. These are current-source inputs, not embedded repository history. |
| Local Ulvia repository | Content-addressed package/evidence objects, manifest/catalogue and local HTTP bridge | `ulvia pull/audit/release/push/dev` | Required development adapter | Keep. Add inter-process locking/completeness metadata; document that the HTTP bridge is a CMS-dev subset, not a full remote mirror. |
| Remote filesystem registry | Catalogue, immutable packages/evidence, candidates, reports, journals, snapshots, promotion/recovery stores | `cms-repository-server` production | Required production adapter | Keep. Publication/recovery design is a strength; add cross-process coordination before multiwriter deployment. |
| Process caches | `InMemoryCache`, `TtlCache` | CMS production, Delivery defaults, tests | Required runtime utility, currently inconsistently composed | Keep but inject explicitly; use bounded TTL/distributed strategy for multi-instance Delivery. |
| Process rate limiting | `InMemoryRateLimiter` | Repository production; tests | Required only for current single-process deployment | Bound/evict entries or use shared limiter before scale. Mongo limiter remains the CMS production option. |
| Request-scoped wrappers | Functions, triggers, identities/source request scope | Control and Delivery request execution | Required production security/context decorators | Keep. They are not mocks despite their lightweight shape. |
| Authentication email | `ConfiguredEmailer` selecting SMTP from settings/secrets; `InMemoryEmailer` | Production auth; contract tests | Required production adapter and required test double | Keep both. |
| Console email | `ConsoleEmailer` | Definition/export only found | Useful development reference or obsolete; unclear externally | Decide explicitly; do not delete solely from internal search. |
| Combined filesystem file store | `LocalFsCmsFiles`, with sibling `.registry` metadata | Tests, old Control docs, public export; not current production | Obsolete candidate internally, possible public reference | Deprecate first. Keep `LocalFsCmsFilesBlob`; remove combined store only after public-consumer decision. |
| S3 file blob | `S3CmsFilesBlob` | Public export and a negative-key test; no current runtime selector | Optional public adapter, under-tested | Either support with positive CRUD/contract tests and runtime selection, or deprecate in a major boundary. Not proven dead. |
| In-memory feature repositories | Auth stores, content, files, roles, secrets, sources, functions, triggers, identities, dashboards, relations, integrations, source images, analytics | Unit/contract/failure tests; explicit dev harness candidates; some silent Control defaults | Required test implementations; some useful dev implementations | Keep. Stop selecting stateful ones silently inside surfaces. |
| Fake Mongo/session/collection families | Bounded fake collections, transaction/session failures | Adapter and recovery tests | Required test doubles | Keep close to tests; consolidate only when behavior contracts are identical. |
| Fake Supabase/migration/provider families | Fake deployer, schema/function/migration clients and provider callbacks | Local release, admission and migration tests | Required test implementations | Keep; extend for cutover/rollback/provider evidence. |
| Worker/transformer/browser fakes | Fake image transformer/workers, browser hosts, runners | Source-image/component/runtime tests | Required test implementations | Keep; verify they model cancellation/failure, not only success. |
| Registry crash hooks/simulators | Publication transaction crash stages, journal-boundary exceptions | Registry recovery tests | Required fault injection | Keep. They exercise immutable publication recovery and must never be enabled by untrusted production input. |
| Local migration audit fault | Development/local-Supabase guarded audit fault | Migration resilience tests/dev | Required guarded fault injection | Keep with DEV + local-provider guard; test that production configuration cannot activate it. |
| Repository mutation coordinator | In-memory single-process coordinator | Repository production | Required current implementation with deployment limit | Keep for one process; add distributed/file coordination before multiple writers. |

Additional adapter observations:

- The full `LocalFsCmsFiles` implementation's private `.registry` is not evidence that source integrations contain repository snapshots. It is a combined file-store implementation distinct from the current Mongo-metadata + local-blob production composition.
- The local repository's persisted package/version history is intentional and lives outside source packages. Source `.registry` and `versions/` directories are absent from tracked official integrations.
- Production file metadata has no ACL field and Delivery exposes addressable files. The safe current contract is public media only; private uploads require a separate ACL/signed URL design.
- No whole workspace package or production dependency was proven unused. Several public subpaths lack internal consumers, but this repository cannot see external package consumers.

## 8. Proposed cleanup plan

The category order below is the requested cleanup sequence. In an implementation program, the critical release/CI items in batches 5 and 7 should be treated as release gates before broad component migration, even though they remain listed in their architectural categories.

### 1. Confirmed dead code

- **Exact scope:** Remove the unused deprecated `collectionSourceDefinitions` alias after one final public-export search. Remove no historical site content, active P9R web contracts, simulator, or compatibility converter in this batch.
- **Prerequisites:** Confirm the alias is not in a declared public export consumed by a separately versioned package; record the current master baseline.
- **Risk:** Low.
- **Validation required:** Architecture/style checks, package import smoke test and targeted integration-definition tests.
- **Suggested commit boundaries:** One commit for the alias; a separate later commit for any historical config proven unused. Do not mix deletion with behavior refactors.

### 2. Unused exports and dependencies

- **Exact scope:** Audit and potentially collapse the seven private `cms-repository-server` subpath exports; decide the fate of `ConsoleEmailer`, `LocalFsCmsFiles`, `S3CmsFilesBlob`, `cms-sources/browser`, and package metadata/README component exports. No runtime dependency is currently proven removable.
- **Prerequisites:** Search external applications/registries or publish a deprecation window; add positive contract tests for anything retained as supported.
- **Risk:** Medium because static workspace search cannot see public consumers.
- **Validation required:** Consumer build matrix, package export resolution, semver policy and migration notes.
- **Suggested commit boundaries:** One commit per package public-boundary decision; dependency removals in a separate manifest/lockfile commit after proof.

### 3. Component cleanup

- **Exact scope:** First fix/validate `forms-renderer` default insertion. Introduce declaration-bound Source access; migrate simple direct-fetch blocs. Establish compiler-owned registration/editor conventions, then extract static HTML/CSS. Design Ulvia category and button appearance contracts. Inventory saved tags, then replace Mossa generic/duplicate pairs with Ulvia primitives and presets and move client identity to site-owned content.
- **Prerequisites:** UI characterization and browser harness; persisted page/tag inventory; effective collection dependencies fixed; theme-token lint; compatibility policy for old packages.
- **Risk:** High for saved content, checkout/payment flows, CSS and custom-element registration.
- **Validation required:** Per-resource default/render/hydration, DOM state, accessibility, responsive visual tests, source request/cancellation tests, old saved-page migration and Ulvia-only/Ulvia+Mossa matrices.
- **Suggested commit boundaries:** (a) validator + forms-renderer; (b) declared Source client/bindings; (c) registration/docs; (d) static source extraction by component family; (e) token lint/fixes; (f) each Mossa duplicate family with its migration; (g) taxonomy/identity move.

### 4. Adapter and simulator cleanup

- **Exact scope:** Replace silent Control in-memory fallbacks with required dependencies plus an explicit dev/test harness. Make cache/storage/single-writer topology explicit. Add bounded repository rate limiting and local-repository locking. Decide optional combined FS/S3/console adapters. Preserve request wrappers, in-memory contract stores, fake providers, crash hooks and local guarded migration faults.
- **Prerequisites:** Runtime composition tests, public-adapter decision, documented supported deployment topology.
- **Risk:** Medium; constructor changes affect embedders and storage changes affect deployed files.
- **Validation required:** Fail-fast composition, dev harness, two-instance visibility/cache tests, concurrent writer/CAS/recovery tests, adapter contracts and production fault-disable test.
- **Suggested commit boundaries:** (a) explicit Control dependency object/factory; (b) cache policy; (c) repository coordination/limiter; (d) each adapter deprecation/support decision; (e) optional shared-object-storage implementation.

### 5. Package-boundary refactors

- **Exact scope:** Introduce one effective integration dependency function and one stateful-change/migration policy; use them in CLI, CMS install, registry planner and verifier. Move site-bloc rules to `cms-content`, integration lifecycle to `cms-integrations`/verification, dashboard/trigger use cases to their features. Extract release scenario runtime from the CLI. Inject MODE/cache/runner policy and reduce the env ratchet.
- **Prerequisites:** Characterization tests before moves; fix TEST-001 so CI can evaluate changes; define public feature APIs to avoid cycles.
- **Risk:** High because release/install/authorization-bearing dashboard behavior changes.
- **Validation required:** Shared dependency corpus, direct remote candidate tests, local/remote decision parity, all lifecycle characterization, architecture/export checks and runtime composition matrices.
- **Suggested commit boundaries:** (a) pure dependency API with existing callers unchanged; (b) caller-by-caller adoption; (c) shared stateful policy and server enforcement; (d) release runtime extraction; (e) one domain move per feature; (f) environment injection per subsystem.

### 6. Roles and permissions simplification

- **Exact scope:** Stop repeated name-based promotion; build migration inventory/report; resolve dashboard delegation capability; decide/enforce PAT scopes and expiry; map ordinary humans to Admin/Member, operator duties to dashboard assignments, and direct visitor/member access to endpoint modes; remove decorative CMS capabilities/conditions/UI only after equivalence; decide OIDC and session revocation explicitly.
- **Prerequisites:** Full persisted custom-role/grant/PAT inventory, connector capability design, backup/rollback and migration marker.
- **Risk:** Critical: either privilege escalation or accidental access removal is possible.
- **Validation required:** The section 5 matrix as executable tests, real local-Supabase dashboard operations, direct-call denial, PAT scope/expiry, migration dry run, unresolved-user stop, and no auto-promotion.
- **Suggested commit boundaries:** (a) close startup escalation; (b) capability propagation/connector enforcement; (c) PAT principal/scopes; (d) read-only migration report; (e) data migration; (f) remove CMS catalogue/editor; (g) optional OIDC/session decision. Never combine data migration and UI deletion in one commit.

### 7. Test strengthening

- **Exact scope:** Repair stale integration workflow paths/generator/image provenance first. Enable current SQL discovery. Make collection audit execute runtime. Add remote-equivalent platform audit mode and portable author suites. Fill stateful business upgrade fixtures. Add downtime/rollback/provider probes and a bounded `ulvia dev` CI E2E. Verify public evidence digest on push.
- **Prerequisites:** Current manifest-driven test discovery; disposable service budget; sandbox contract; stable failure diagnostics.
- **Risk:** Medium operational cost/flakiness; no reason to weaken assertions to obtain green CI.
- **Validation required:** Workflow path self-test, deliberately failing corpus for each suite, all historical baselines, restart/crash phase matrix, old/new concurrent requests, CI cleanup and local/remote evidence equality.
- **Suggested commit boundaries:** (a) CI path repair without changing coverage intent; (b) SQL authoritative runner; (c) collection runtime audit; (d) portable suites; (e) one integration fixture per commit/family; (f) resilience matrix; (g) dev E2E; (h) push evidence round trip.

### 8. Documentation updates

- **Exact scope:** Regenerate/update package map and exports; correct API/static/import paths; state that historical sites are references; describe local versus remote audit suites and explicit pull completeness; correct bloc view/editor registration rules; document Mossa/Ulvia/site ownership, adapter topology, file-publicity policy and target authorization model.
- **Prerequisites:** Corresponding behavior decisions landed; do not document planned behavior as current.
- **Risk:** Low code risk, medium onboarding risk if changes are premature.
- **Validation required:** Link/path checker, executable command snippets and review against manifests/composition roots.
- **Suggested commit boundaries:** One commit for factual stale paths; one per landed architecture/release/auth model; generated package-map updates separately if automation is introduced.

## 9. Deferred and uncertain findings

The following are deliberately **not** deletion recommendations:

| Item | Current evidence | Evidence still required |
| --- | --- | --- |
| `S3CmsFilesBlob` | Publicly exported, tested only for an invalid key, no current runtime selection | External consumer inventory and product decision: supported backend with positive CRUD/contract tests, or formal deprecation. |
| Combined `LocalFsCmsFiles` | Tests/docs/public export use it; production uses Mongo metadata + `LocalFsCmsFilesBlob` | External package consumers and dev/onboarding scripts. Do not remove the blob adapter with it. |
| `ConsoleEmailer` | Definition/export found, no internal consumer | External consumer search and explicit developer-experience decision. |
| `cms-sources/browser`, `cms-files/s3`, package README/metadata exports | No workspace production consumer | Published-package telemetry/consumer builds; absence of internal imports is insufficient. |
| Private repository-server subpath exports | No internal consumers; package is private | Container/scripts outside the workspace and image entrypoints. |
| Badge, LateralDialog, PhotoAlbum, TableHeaderCell, TagSuggest, Stat, LineChart, BarList | Registration import but no other repository production reference | External UI consumers and runtime DOM/tag telemetry. Dataviz hard-coded locale/fetch behavior warrants deprecation review, not immediate deletion. |
| Stack lazy entry | Public and heavily used from root, absent from lazy `blocEntries` | Decide whether root-only use is intentional or consumers need lazy loading. |
| Historical sites | README/AGENTS explicitly preserve migration/visual fixtures; one snapshot is used by native-navigation tests | Named retention owner, fixture coverage and whether two `p9r.config.json` files are read by tooling outside the repository. |
| Active P9R names | `<p9r-*>`, `window.p9r`, externals plugin and cache are runtime contracts; `P9R_INTEGRATION_REPOSITORY_URL` is active configuration | Compatibility/renaming plan across deployed sites and environment management. They are not deleted-CLI residue. |
| Raw bloc manifest metadata | Scanner docs call several fields inactive, but packages are distributable | External authoring/catalogue tooling inventory and a manifest schema version/deprecation window. |
| Legacy dashboard conversion and `requires` | Conversion is actively used and tested; no current enforcement consumer for `requires` was found | Supported historical repository baseline policy and external view authors; prove execution-plan equivalence before removal. |
| Custom roles/direct endpoint grants | CMS capabilities are inert, but custom endpoint grants can affect Delivery | Production database inventory of users, inheritance and effective endpoint grants; consumer interviews for direct-access roles. |
| OIDC | Management accepts it but cms-server does not compose it | Product decision and any external runtime that supplies `OidcAuthentication`. |
| Server-side session revocation | Current one-hour stateless behavior is clear | Security requirement, threat model and performance budget; it may be an accepted trade-off. |
| File privacy | Metadata has no ACL and Delivery serves addressable files | Product requirement and upload inventory; keep public-media-only contract until designed otherwise. |
| Local repository HTTP parity | Bridge intentionally supplies catalogue/definition/package/assets for CMS dev, not evidence/reviewed-schema routes | Decide whether “local repository” promises a full remote mirror or only a development package source. |
| Multi-node CMS/repository support | Current adapters are correct for one node/process but unsafe to assume horizontally shared | Deployment roadmap and infrastructure topology before adding distributed systems. |
| Live provider tests | Mondial Relay live tests are intentionally environment-gated | Dedicated non-production credentials and an accepted scheduled-test policy. Never use production keys. |
| Whole package/dependency deletion | Every workspace package has at least one repository consumer; no runtime dependency was proven unused | External consumer analysis and runtime tracing before any package removal. |

Acceptable/intentional implementations that should not be “cleaned up” based on this audit include the generated Control component bundle, request-scoped security wrappers, Mongo persistence adapters, current local filesystem blob/source-image storage for a declared single-node deployment, content-addressed local release history, in-memory contract repositories, fake provider/Mongo workers, registry crash simulators, and guarded local migration fault injection.

## 10. Final verification

- Final branch: `master`, tracking `origin/master`.
- Final Git status immediately before completing this report: `?? AUDIT.md` and no other tracked or untracked repository change shown by `git status --short --branch`.
- Only `/home/matthias/Documents/Company/Softwares/CmsCore/AUDIT.md` was created. No source, test, manifest, lockfile, configuration, workflow, generated asset, integration definition, or other documentation file was modified.
- `git diff --check` passed. (Because `AUDIT.md` is intentionally untracked during the audit, the content itself was also checked structurally through read-only field/headings queries.)
- `bun run check:architecture` passed in the final verification pass.
- `bun run check:repository-shape` passed in the final verification pass with 658 file-size informational observations, 451 file-size warnings, 308 directory-fanout informational observations and zero fanout errors.
- `bun run check:style` passed in the final verification pass: 5,870 files checked, no fixes applied.
- A read-only structural check found exactly 37 stable finding IDs, and every finding contains all required fields: severity, confidence, affected files/packages, evidence, current behavior, problem, recommendation, benefit, risk, tests and dependencies.
- Full tests, build, typecheck, formatter, coverage, disposable services, browsers, SSH, production access and external-provider tests were intentionally not run because the audit brief prohibited state-producing/external operations. Their absence is reflected as a limitation and as explicit pre-implementation validation throughout this report.

## 11. Subsequent product and architecture decisions

Recorded on 2026-09-08 following review of email ownership and the Functions/Triggers feature. These are agreed implementation directions, not additional baseline findings or completed changes. The workflow retirement below supersedes the earlier recommendation to invest in moving trigger use cases into their existing feature package.

### Centralize email delivery and template management in CmsCore

- **Decision:** Make transactional email delivery and template management a native CmsCore capability used by authentication and integrations. Consolidate the existing authentication email path and the shared responsibilities currently implemented by the `emailer` integration and `@bernouy/cms-notifications`.
- **Inspected evidence:** `cms-auth` owns `ConfiguredEmailer`, `SmtpEmailer`, and `TemplatedAuthEmailComposer`; `cms-server/src/runtime/auth.ts` composes them from system email settings. The `emailer` integration declares template installation, editing, rendering, test-send, and send endpoints, plus message history and campaign operations. `cms-notifications/src/core/dispatch.ts` bridges integration-owned notification records to Emailer endpoints. The Emailer template dashboard currently edits HTML and plain text through textarea fields.
- **Core ownership:** Shared template storage and rendering, sender configuration, transport adapters, a durable send queue, retry and idempotency handling, delivery diagnostics, previews, and test sends. Put the feature behind published contracts, mount its administration in Control, and select persistence and transport adapters in the runtime composition root.
- **Integration ownership:** Business rules deciding when to send, recipients, message data, default templates, and declared variable schemas. Integrations request email delivery through an authorized Core operation; they do not need a separate generic workflow interpreter. Newsletter audiences and campaign orchestration may remain integration-owned while using the shared email service.
- **Template lifecycle:** Preserve the distinction between integration-provided defaults and local customizations. Version templates and their variable contracts; installation and upgrades must not silently overwrite customized content. Authentication templates must be available without installing Emailer. Keep authentication message delivery responsive during bulk campaigns and exclude authentication tokens and sensitive message bodies from ordinary diagnostic logs.
- **Editor direction:** Reuse suitable property panels, media selection, composition mechanisms, and theme values. Provide a bounded email component catalogue, such as text, images, buttons, columns, separators, headers, and footers, compiled server-side into email-compatible HTML and plain text. Existing browser custom elements and their JavaScript runtime are not an email rendering target. Evaluate a dedicated renderer such as MJML before choosing the compilation implementation.
- **Authoring flow:** Select a template, edit its blocks, preview with sample data, send a test, and publish. Validate required variables and preserve a published version independently of drafts.
- **Migration and validation:** First consolidate transport and template contracts, then migrate authentication and transactional integration sends, and then add visual authoring. Preserve customized templates, sender settings, pending deliveries, and idempotency records during cutover. Verify authentication fallback templates, variable validation and escaping, authorization, retries after process interruption, duplicate submission handling, campaign isolation, and rendering in representative email clients. SMTP acceptance must not be reported as confirmed inbox delivery.

### Retire generic Functions and Triggers in favor of integration-owned behavior

- **Decision:** Remove the generic `@bernouy/cms-functions` and `@bernouy/cms-triggers` systems, including their declarative DSL, persisted resources, integration artifact types, and manual administration. Integrations own their data, migrations, and business workflows and communicate through declared public operations. This decision covers the engines as well as the unused Functions/Triggers tabs.
- **Inspected evidence:** The function model includes calls, expressions, assertions, conditions, loops, and error policies. Integration manifests install function and trigger artifacts, management contracts reference function IDs, and lifecycle execution consumes function steps. Existing triggers cover blocking signup consent checks, reactions to endpoint responses, and periodic reconciliation or dispatch. These behaviors require explicit replacements before package deletion.
- **Communication contract:** Expose named, versioned integration operations with input/output contracts and declared dependencies. Reuse the existing Source endpoint mechanism where suitable. Core resolves installation targets and enforces caller authority and identity propagation. Cross-integration access goes through public operations rather than direct writes to another integration's storage.
- **Workflow replacement:** Move business orchestration into integration-owned code executed by its runtime. Replace generic HTTP request/response interception with explicit business calls or domain events. Keep blocking lifecycle requirements, such as signup consent validation, as explicit synchronous extension points with defined failure and recovery behavior. Introduce durable asynchronous delivery only where required, with idempotent consumers and retry handling.
- **Scheduled work:** Assign each recurring task to its owning integration or native Core feature. Provide execution through that owner's runtime or a shared scheduling service with explicit task contracts. Preserve necessary leasing, timeout, recovery, and diagnostic behavior without retaining the generic Trigger DSL. Centralized email dispatch is owned by the native email service.
- **Removal scope:** Delete the two feature packages after migrating consumers; remove their artifact parsing, validation, installation writes, rollback/cleanup branches, management references, and lifecycle dependencies. Update Control and Delivery proxy wiring, runtime stores and scheduling, manifests, exports, TypeScript references, documentation, and tests. Migrate existing dashboard and bloc references to replacement operations.
- **UI scope:** Remove `Resources/Functions`, `Resources/Triggers`, their dedicated `Resources/WorkflowEditor` helpers, related API routes and server use cases, static pages under `static/admin/_operations/functions*` and `triggers*`, menu entries, component registrations, and integration resource presentation branches. Regenerate the Control component bundle. Keep actionable task status, failures, and explicit business retry actions in the owning integration or native feature's administration.
- **Measured scope:** The subsequent inventory identified 23,095 physical lines in 324 dedicated tracked files, including 5,126 test lines. This includes 7,960 lines of integration function/trigger definitions and 5,353 lines of dedicated Control code and tests; the UI, templates, styles, and static pages alone account for 4,170 of those Control lines. Generated bundles were excluded. A further 150 files contained direct package or system-source references; their full contents were not counted as removable code. These figures describe the inspected footprint, not the net deletion achievable after replacements.
- **Migration and validation:** Inventory installed resources and public consumers, implement the operation contract, and migrate one complete workflow before generalizing. Preserve business authorization, blocking consent behavior, reconciliation, pending work, and retry semantics. Migrate management endpoints and persisted references before removing engines and UI. Verify replay and recovery behavior, installation/upgrade/rollback, dashboard and bloc calls, dependency compatibility, and absence of stale runtime or declarative references. Retain business regression coverage while replacing tests that only exercise the retired DSL.
