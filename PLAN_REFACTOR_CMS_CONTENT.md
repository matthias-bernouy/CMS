# CMS content structure and boundary refactoring plan

Status: slices A–D implemented on 2026-09-22; see section 9 for validation and handoff.
The decisions below remain the scope record. Do not restart the refactor from this document; inspect the delivered code before planning further work.

## 1. Objective and decisions

Organize `cms-content` consistently by domain and make the intended use of Delivery's dependencies explicit and difficult to misuse. The concrete problems addressed here are a mixed domain/technical folder layout, a developer choosing an unrestricted page query, a rendering helper receiving editorial configuration, and a composition mistake sending derivative writes to original storage. No incident or customer requirement for process isolation has been established in this discussion.

The initial refactor has these fixed decisions:

- Keep the package name `@bernouy/cms-content`. It owns site content and presentation; do not rename it to `cms-core` or expand it into a generic CMS foundation.
- Organize pages, blocs, author files, site settings, theme, and editor support as sibling domains. Keep theme separate from settings. Cross-domain contracts and composition are technical responsibilities, not a business domain named `repository`.
- Keep HTTP page rendering in Delivery. Adapter implementations belong to the feature; production adapter selection, construction and credentials belong to runtimes.
- Retain one `ContentReader` contract for public rendering. Its page operations return published content; helpers use small structural subsets of that contract.
- Keep current publication semantics: a page has one content field and publication is `visible === true`. Preserve existing site/language rules and authenticated visitor access checks.
- Keep editorial preview in authenticated Control. Public readers never acquire a draft or preview mode.
- Preserve the existing route rereads and migration checks. A global snapshot across pages, routes, and settings is outside this refactor.
- Preserve current author-media access while documenting it explicitly. This does not establish media confidentiality or approve the policy for every future product use.
- Keep the current shared-process deployment and persisted formats. Operational isolation is a separate project with its own requirements.

This task restructures the existing `cms-content` package and its consumer boundaries. [PLAN_ACTION.md](./PLAN_ACTION.md) remains broader context. Collection releases, installations and overrides, provider files/protocol changes, and a general derivative-worker redesign remain outside this task; no new collection package is introduced here.

## 2. Evidence that motivates the changes

These are the pre-refactor findings, with links updated to the current owners. The implementation addresses them as described in section 9.

| Pre-refactor behavior | Current source owner | Required change |
| --- | --- | --- |
| The public reader exposes unrestricted page lookup and listing. | [ContentReader.ts](./packages/features/cms-content/src/application/interfaces/ContentReader.ts) | Remove editorial page operations from Delivery's contract. |
| Bloc grouping scans every stored page. | [blocGroupManifest.ts](./packages/surfaces/cms-delivery/src/core/blocs/blocGroupManifest.ts) | Build public grouping from published pages. This finding alone does not prove disclosure of draft contents. |
| Mongo published enumeration loads all pages and filters in memory. | [MongoContentRepository.ts](./packages/features/cms-content/src/application/default-implementation/mongo/repositories/MongoContentRepository.ts) | Filter in the query and retain memory/Mongo parity. |
| Routes use repeated reads and field comparisons; page visibility is checked by the caller. | [resolvePublishedRoute.ts](./packages/features/cms-content/src/pages/core/queries/resolvePublishedRoute.ts) | Centralize publication checks and preserve the existing concurrency behavior. |
| Rendering receives full system settings, including SMTP configuration and a secret reference. | [settings.ts](./packages/features/cms-content/src/settings/interfaces/settings.ts) | Return an explicit rendering projection. The SMTP password itself is not stored in this object. |
| File serving does not check page references or publication. | [serveFilesRequest.ts](./packages/features/cms-content/src/files/http/serveFilesRequest.ts) | Describe this policy accurately and preserve it during the boundary change. |
| Both surfaces share repositories and local filesystem stores in one process. | [mountSurfaces.ts](./packages/runtimes/cms-server/src/runtime/mountSurfaces.ts), [core.ts](./packages/runtimes/cms-server/src/runtime/stores/core.ts) | Inject restricted objects and verify the actual production wiring; do not claim process confinement. |

## 3. Target source structure

The target groups business behavior by domain. `files/` has the same status as pages, blocs, settings and theme. Each domain contains only the technical layers it actually needs; the tree does not require a new repository class or an empty adapter directory for every domain.

```text
packages/features/cms-content/
├── package.json
├── tsconfig.json
├── AGENTS.md
├── src/
│   ├── pages/
│   │   ├── interfaces/
│   │   ├── core/                       # Publication, routes, SEO, page validation
│   │   └── http/                       # Published-page snapshot handler
│   ├── blocs/
│   │   ├── interfaces/
│   │   └── core/                       # Catalogue, composition, usage, publication
│   ├── files/
│   │   ├── interfaces/
│   │   ├── core/                       # Lifecycle, validation, media, derivatives
│   │   ├── http/
│   │   └── default-implementation/      # Memory, filesystem, Mongo metadata, S3
│   ├── settings/
│   │   ├── interfaces/
│   │   ├── core/                       # Site configuration and rendering projection
│   │   └── http/                       # Public site-organization system source
│   ├── theme/
│   │   ├── interfaces/
│   │   └── core/                       # Tokens, modes, values, validation, CSS
│   ├── editor/
│   │   ├── interfaces/
│   │   └── core/                       # Editor catalogue and authoring helpers
│   ├── application/
│   │   ├── interfaces/
│   │   │   ├── CmsRepository.ts
│   │   │   └── ContentReader.ts
│   │   ├── core/
│   │   │   ├── createContentReader.ts
│   │   │   ├── ValidatingCmsRepository.ts
│   │   │   └── validation/             # Shared validation primitives/errors
│   │   └── default-implementation/
│   │       ├── memory/
│   │       └── mongo/
│   └── exports/
│       ├── index.ts
│       ├── rendering.ts
│       ├── editor.ts
│       ├── theme.ts
│       ├── page-path.ts
│       ├── mongo.ts
│       └── files/
│           ├── index.ts
│           ├── serving.ts
│           ├── urls.ts
│           ├── local-fs.ts
│           ├── mongo.ts
│           └── s3.ts
└── tests/
    ├── pages/
    ├── blocs/
    ├── files/
    ├── settings/
    ├── theme/
    ├── editor/
    └── application/
```

`application/` owns only cross-domain contracts, orchestration and aggregate persistence composition. For example, `createContentReader` composes domain queries, and `ValidatingCmsRepository` delegates to domain validators. Domain rules stay in their corresponding folders. Memory/Mongo repository implementations may continue to persist pages, blocs and settings together; a folder move does not require splitting the storage model. File metadata/blob adapters remain with the file domain they implement.

`settings/` owns site configuration such as host, enabled languages and system-page references. `theme/` owns the existing theme catalog, tokens, modes, values and CSS generation. `TSystem` may continue to reference theme data in its persisted document; that storage relationship does not make theme logic part of settings. Move existing theme behavior intact, including current contribution handling, without redesigning collection ownership.

Future localized text content would be a distinct responsibility from site-language settings. Do not implement i18n text catalogs, bloc override mechanisms or placeholder directories in this series. Their ownership and source layout will be specified with their actual feature requirements.

`exports/` contains explicit public entry points, with no business logic. Control uses authoring contracts and operations; Delivery uses `/rendering` and `/files/serving` plus the required browser-safe helpers; runtimes import adapter subpaths. Internal folder changes must not force consumers to import implementation paths.

The target `src/` has eight meaningful entries, which is the repository's informational fanout threshold, not a blocking violation. Review descendant fanout while moving files and keep it at eight or fewer. Do not populate `application/` with unrelated utilities; assign helpers to the domain whose behavior they implement. Preserve public type names and existing stable subpaths unless the boundary refactor explicitly replaces their API.

## 4. Contracts and runtime wiring

Use one public-rendering contract and one factory that constructs a fresh reader object. The reader has no repository or configuration back-reference. Control keeps the full authoring repository.

| Reader responsibility | Target API |
| --- | --- |
| Published page lookup and enumeration | `getPublishedPage`, `getPublishedPageById`, `getPublishedPages` |
| Publication-aware route resolution | `resolvePublishedRoute`, returning current/redirect/gone/unavailable/updating/absent outcomes without hidden page records |
| Rendering configuration | `getRenderingSettings`, returning only fields needed by rendering, SEO and public system helpers |
| Renderable bloc artifacts | `getRenderableBlocs` and `getBlocViewJS`, preserving artifacts needed by existing pages |

Remove `getPage`, `getPageById`, `getAllPages`, raw `getPageRoute`, and full `getSystem` from the reader as their consumers migrate. Keep unrestricted operations explicitly declared on `CmsRepository`, including methods currently inherited from `ContentReader`. Decouple that inheritance as necessary; authoring repositories must not implement new rendering operations merely to satisfy the facade.

Construct settings and page results with explicit field selection. A smaller TypeScript type does not remove fields from the actual object. Preserve the route, SEO and rendering fields consumers use; exclude editorial-only data and SMTP configuration from rendering settings. Avoid returning shared mutable authoring references in memory implementations.

Use `Pick<ContentReader, ...>` or a small local contract when a helper needs only settings, page lookup, or bloc artifacts. Do not create four independently exported capability APIs without a concrete consumer need. Minimal test doubles should prove these narrower dependencies.

For files, use structural capabilities matching actual operations: metadata lookup by ID/path, original blob `get`, variant `get`/`put`, and sitemap `get`/`put`/`delete`. Narrow shared serving and optimization helpers as well as Delivery's configuration. Preserve full stores for authoring lifecycle operations.

The runtime builds separate reader objects for originals and derivative consumers. Keep the existing original, variant and sitemap destinations. Composition tests must verify where writes and retention cleanup go and that originals remain unchanged. A full store satisfies a narrower interface structurally, so types alone do not check destination identity.

Do not introduce a general filesystem/S3 namespace validator in this series. Test the actual configured local layout and its flat-key operations. When configurable destinations or deployment isolation are introduced, validate their real address spaces, aliases, temporary writes and cleanup scope as part of that change.

## 5. Publication, routing, preview and media behavior

### Required page boundary

Every page record returned by a public reader operation must have been observed as published in the record state used to construct that result. Hidden pages are unavailable by path, ID and enumeration. Delivery cannot call an unrestricted editorial lookup through its injected contract or object.

This is the blocking invariant for the refactor. Later unpublication follows the existing invalidation/cache behavior; this work does not add instantaneous revocation or published revision history.

### Routing behavior to preserve

Move the current publication-aware route algorithm into `cms-content` behind `resolvePublishedRoute`. Preserve migration flags, route/settings rereads, mismatch handling, active-language rules, redirects, gone routes and occupied-route precedence over public-page providers. HTTP status and cache policy remain Delivery responsibilities.

Use deterministic tests for the existing detected-change paths: migration in progress, route reassignment/change between reads, unavailable pages, and system-page fallbacks. Check the public response and cache handling of a temporary updating result so a transient condition does not become a persistent redirect or missing-page response. Fix regressions introduced by the move.

Do not require every successful resolution to represent a global snapshot. Do not add transactions, a global revision counter or a coherent projection here. If testing reveals a publication-boundary failure, fixing it is required; a stronger cross-record consistency requirement is recorded separately with a concrete failing scenario and impact. Select its mechanism and deployment prerequisites before starting that separate work.

### Control owns editorial preview

The existing [editor frame](./packages/surfaces/cms-control/src/api/editor/frame.get.ts) remains mounted by Control behind its authentication boundary. Test that an authenticated author can view a draft there, unauthenticated access is denied, and public Delivery page/snapshot/system-fallback routes do not return hidden page contents. Do not add a new full-site preview feature or widen the public reader to preserve preview.

### Author files remain a public library in this refactor

When public media routes are configured, every author file with metadata and bytes is accessible by ID or tree path, including a file referenced only by a draft or by no page. Unpublishing a page does not make its files private. Opaque IDs are not an access policy.

Keep two characterization cases for this existing behavior: draft-only media and unreferenced media, exercising ID and path access. These tests describe the retained policy and must change if the policy changes.

Confidential draft media is an unresolved product requirement, not a guarantee of this refactor. If unpublished announcements or confidential uploads must remain private, media access control becomes required product work before that use is supported. It does not depend on operational isolation: anonymous access policy and resistance to a compromised server are distinct concerns.

## 6. Engineering checklist applied to every slice

Before slice A, read package instructions and existing edits, inventory callers, and run `bun run check:all` in the task workspace. Use an isolated worktree when other agents are editing concurrently, with `bun install --frozen-lockfile` in a new worktree. Record existing findings, the source-to-target file map, and current routing/cache behavior. Preparation verifies the decisions above; it does not reopen the scope.

### Contract and feature implementation

- Move the slice's domain code and tests into the target structure, updating local aliases and internal imports. Separate mechanical moves from behavior edits in reviewable commits within the slice; keep intermediate states buildable.
- Place aggregate contracts and composition under `application/`; keep domain contracts, validation and queries with their domain. Keep executable code out of `interfaces/`.
- Implement the slice's reader behavior in memory and Mongo, including projections and filtering. Keep editorial operations available to Control.
- Preserve stored formats, file URLs, original bytes, renderable inactive blocs, native-element mappings and composition dependencies.
- Add focused behavioral tests and minimal consumer doubles.

### Consumer migration

- Migrate all affected Delivery calls and feature-owned public helpers, including snapshots, system fallbacks, login redirects, sitemap and analytics lookups.
- Remove the replaced unrestricted usages in the same slice. Keep authenticated source/page checks and Control preview working.
- Limit temporary bridges to the operations still needed by later slices.

### Runtime composition

- Inject the slice's restricted facade in production and development composition roots.
- Test the configured objects and storage destinations. Derivative generation must work with a get-only original store.
- Preserve existing cache invalidation for content, settings and media updates.

### Export and architecture enforcement

- Introduce `@bernouy/cms-content/rendering` for the rendering reader and pure content helpers used by Delivery, and `@bernouy/cms-content/files/serving` for its file-serving/derivative APIs.
- Centralize entry-point files under `src/exports/`, including `src/exports/files/`. Expose filesystem implementations through `@bernouy/cms-content/files/local-fs` for composition roots.
- Keep existing browser-safe `/editor`, `/theme`, `/page-path` and `/files/urls` subpaths. Persistence adapters remain composition-root imports.
- Declare entry points in `package.json`, migrate relevant imports, and add architecture checks with each slice. Delivery must not import authoring contracts/mutations, persistence adapters or filesystem implementations.
- Update package instructions, `docs/Structure.md` and public API tests to describe the domain layout and consumer boundaries. Remove obsolete broad exports only after their consumers migrate; do not pre-create an exhaustive tree of future subpaths.

## 7. Sequential delivery slices

Each slice includes its domain moves, feature behavior, consumers, runtime wiring, exports and tests. Keep intermediate changes buildable. The first two slices deliver the main value independently of the file-boundary cleanup. Complete the source restructuring across these same slices rather than scheduling an unrelated repository-wide move.

| Slice | Work | Exit criterion |
| --- | --- | --- |
| A — Published pages and routes | Establish `pages/` and the cross-domain `application/` contracts/composition; narrow page operations; add published ID lookup; filter Mongo queries; centralize route publication checks; migrate manifest, snapshots, page/system rendering and related lookups; inject the reader facade. | No unrestricted Delivery page reads; hidden pages excluded; existing route/migration and Control preview behavior covered. No new database protocol or deployment requirement. |
| B — Settings, theme, blocs and editor | Establish distinct `settings/`, `theme/`, `blocs/` and `editor/` domains; project settings; expose renderable descriptors/view bundles; migrate theme, SEO and rendering helpers with minimal dependencies. | Theme logic is independent of settings storage; editor exports remain stable; no full system object or editorial catalogue operation in Delivery; SMTP fields absent at runtime; inactive artifacts needed by published pages still render. |
| C — Original files and derivatives | Align the existing file domain with the target layout and shared exports; narrow metadata/blob contracts throughout serving and optimization; inject reader/store facades; test configured destinations and media policy. | Get-only originals suffice; variant/sitemap writes and cleanup leave originals unchanged; file URLs/storage formats are preserved; public-library behavior is explicit. |
| D — Structure and public API cleanup | Finish ownership of remaining helpers and tests; remove emptied legacy technical directories and obsolete exports/bridges; complete import checks, browser graphs and documentation. | The target domain structure is in place; package name remains `@bernouy/cms-content`; no `repository` business domain or collection machinery is introduced; public API, shape, architecture and build checks pass. |

Move existing feature tests with their domain, keeping memory/Mongo coverage together where practical and aggregate-composition tests under `tests/application/`. Extend Delivery page/localization/rendering/media/gateway suites, runtime composition tests and architecture tests. Browser checks should inspect dependency graphs: Sharp is dynamically imported today, so do not report eager loading without bundle evidence.

After JS/TS edits, run `bun run format` and inspect the diff. Run focused behavioral tests, `bun run typecheck`, relevant builds, and final `bun run check:all` in the same workspace as the baseline. Resolve introduced errors, including blocking fanout findings; preserve unrelated work and explain justified new shape warnings.

Completion means A–D pass those gates with the target domain organization, theme separate from settings, explicit cross-domain contracts/composition, the required page boundary, restricted original-file access, explicit media semantics and preserved routing/preview behavior. No production-isolation milestone is implied.

## 8. Separate work with explicit entry conditions

These are excluded from A–D rather than hidden prerequisites:

- **Collections and localized-text features:** collection releases, installations and overrides remain separate work. Localized text catalogs and new bloc-default override behavior are not prerequisites for organizing the existing content domains; do not create speculative modules for them.
- **Confidential media:** start when author uploads must not be anonymously available before publication or authorization. Define explicit visibility, Control preview access, original/derivative serving, cache revocation and existing-file treatment. Never infer privacy solely from a file's current page references.
- **Published revisions:** start when editing a live page must leave the previous version online until explicit publication. Define publication of dependent routes, blocs/settings and media, conflicts and rollback together.
- **Stronger navigation consistency:** start from a demonstrated anomaly or an explicit snapshot requirement. Decide between a suitable snapshot read, coherent projection or fully specified optimistic protocol before implementation; include every relevant writer, storage/deployment constraints, tests and recovery.
- **Operational confinement:** start when isolation from a compromised Delivery workload is required. Separate execution identities and credentials, restrict database reads to approved public data, mount originals read-only and derivatives separately, review all other injected authorities, and replace shared-memory invalidation. Validate actual permissions and configurable storage aliases under deployed identities. If this is a release requirement, it becomes a required project with its own plan.

None of these extensions is established by narrow TypeScript types or an in-process facade. Their implementation must preserve editorial records and original files and define migration/recovery before changing persistence or deployment.

## 9. Implementation and validation record

Slices A–D are delivered in the working tree:

- The domain structure in section 3 is implemented. Public imports do not depend on the internal moves; package naming and persisted formats are unchanged.
- [createContentReader](./packages/features/cms-content/src/application/core/createContentReader.ts) exposes a fresh object with published page reads and publication-aware route resolution. Memory results are detached, Mongo filters publication in its queries, and Delivery no longer calls editorial page or system reads.
- [Rendering settings](./packages/features/cms-content/src/settings/core/renderingSettings.ts) use an explicit runtime projection. SMTP, initialization, route-migration state and authoring-only language lists are excluded. Renderable bloc descriptors retain inactive artifacts and composition/native mappings without returning the editorial catalogue.
- [File capabilities](./packages/features/cms-content/src/files/core/serving/capabilities.ts) and [production composition](./packages/runtimes/cms-server/src/runtime/stores/authorFiles.ts) expose get-only originals and separate writable derivative facades. Composition tests generate variants and delete sitemap objects without modifying original bytes.
- [Architecture policy](./quality/architecture/repository/repositoryPolicy.ts) restricts Delivery's content imports to the curated subpaths. Type-only and dynamic imports are checked too. Browser graphs reject persistence, filesystem and Sharp dependencies.
- [Compiled contract fixtures](./packages/surfaces/cms-delivery/tests/contracts/publicReader.fixture.ts) prove that minimal content readers and get-only originals satisfy Delivery, while editorial operations and original writes do not compile. These fixtures run through TypeScript, not only Bun's transpiler.
- [Public API tests](./packages/features/cms-content/tests/application/publicApi.test.ts) build the browser-safe entrypoints. [Control preview](./packages/surfaces/cms-control/tests/editor/frame/publicationBoundary.test.ts), [route rereads](./packages/features/cms-content/tests/pages/routing/resolvePublishedRoute.test.ts) and [public media policy](./packages/features/cms-content/tests/files/http/publicLibrary.test.ts) have focused regression coverage.

Validation in the isolated task workspace: `bun run build` passed; `bun run check:all` passed all seven gates; `bun test --timeout 30000` passed 2,494 tests with no failures. The initial generated-asset drift was resolved by the build. After integration, the main workspace independently passes the build, all seven `check:all` gates and all 2,494 tests. Concurrent quality changes, including removal of the generated Control bundle from Git tracking, were preserved rather than overwritten.

Directory-fanout checks report no errors. Eight-entry directories such as the domain root are intentional. Existing cohesive aggregate repositories and the Delivery configuration remain together despite file-size guidance; they were not split solely to meet a line count.

Implementation used one Terra worker sequentially for the content-reader slices and an independent read-only review. No Sol escalation was needed. Changes were validated in isolated worktrees and then applied without staging unrelated main-workspace edits.

The exclusions in section 8 still apply: this is an application boundary, not process/credential isolation; author files remain a public library; published revisions and transactional navigation were not added.
