# @bernouy/cms-content

Feature package for CMS-owned content: pages, blocs, settings, the author file
library, declarative bindings, validation, and read models.

## Boundaries

- Root export exposes authoring entity types, `CmsRepository`, in-memory
  repository, validation, and authoring operations.
- `@bernouy/cms-content/rendering` exposes `ContentReader`, its composition
  factory and public rendering helpers. It has published-only page operations,
  rendering settings and renderable bloc artifacts, never editorial queries.
- `@bernouy/cms-content/bindings` exposes browser-safe declarative binding
  syntax and runtime metadata.
- `@bernouy/cms-content/theme` exposes browser-safe theme value resolution.
- `@bernouy/cms-content/mongo` exposes `MongoCmsRepository` for composition
  roots.
- `@bernouy/cms-content/migrations` exposes collection migration planning,
  execution, journals and the memory adapter. The Mongo journal adapter is
  exported from `./mongo`.
- `@bernouy/cms-content/files` exposes authoring metadata/blob contracts,
  lifecycle, validation and in-memory implementations.
- `@bernouy/cms-content/files/serving` exposes public metadata lookup, get-only
  originals, variant get/put, sitemap get/put/delete, and serving/optimization
  helpers. Fresh facade objects restrict the methods exposed at runtime.
- `@bernouy/cms-content/files/local-fs` exposes filesystem implementations to
  composition roots.
- `@bernouy/cms-content/files/urls` is the browser-safe file URL surface.
- `@bernouy/cms-content/files/mongo` and `./files/s3` expose composition-root
  adapters.
- Provider-owned files and collection-release assets do not belong to the CMS
  author file tree.
- Do not import surfaces, runtimes, Control internals, or persistence adapters
  into `core/` or `interfaces/`.

## Source Layout

- `pages/`, `blocs/`, `bindings/`, `files/`, `settings/` and `theme/` are sibling
  domains. Theme owns tokens, modes, values and CSS independently of settings.
- Each domain contains only its needed `interfaces/`, `core/`, `http/` or
  `default-implementation/` layers. Interfaces contain no executable helpers.
- `application/` owns cross-domain contracts, reader composition, aggregate
  validation/error primitives and memory/Mongo repositories. Domain rules stay
  with the domain; do not create a catch-all repository business domain.
- `exports/` contains all declared public entrypoints, including `exports/files/`.
- Tests follow domains; aggregate repository tests live in `tests/application/`.

## Rules

- Domain validation belongs with the relevant domain and is enforced by
  `application/core/ValidatingCmsRepository` for authoring writes.
- Public pages must be observed with `visible === true`. Project returned
  fields explicitly and do not return shared mutable authoring objects.
- Keep route migration checks and rereads; do not claim snapshot consistency.
- Rendering settings must not contain initialization state or SMTP settings.
- Control owns authenticated draft preview. Never add a preview mode to the
  public reader.
- Static collection text and immutable asset substitution run on the server through
  `/rendering`, after composition expansion. Browser binding has no i18n or asset filter.
- Stored HTML/SVG must pass through the existing hardening/sanitizing helpers.
- Page bloc references should use the existing content-ref helpers.
- Collection migrations are maintenance-mode operations. Keep their impact
  plan read-only, their page writes revision-checked, their journal resumable,
  and their rollback snapshots separate from user-facing page history.
- Features persisting references to collection resources must register a
  `CollectionMigrationParticipant`; every mutation of that persisted state must
  use the shared site migration write fence.
- Editor contracts must remain stable; authored blocs depend on them.
- When changing repository behavior, update both in-memory and Mongo behavior
  or document why only one implementation changes.
- File metadata and blob mutations must stay consistent. Upload/update/delete
  flows should roll back where possible.
- Preserve `/.cms/files`, image-variant URL semantics, and the local
  `.cms-files-registry.json` format unless a task explicitly changes their
  external contract.
- Generated variants are cacheable and reconstructible; original author files
  are not disposable.
- Image byte transforms use `@bernouy/image-processing/sharp`; keep author-file
  variant keys, manifests, and serving policy in this package.
- Media publication is independent of pages: files with metadata and bytes
  remain public by ID/path even when draft-only or unreferenced. This refactor
  provides no confidential-media policy or process/credential isolation.
- Validate file names, sizes, and tree operations through the file core helpers.
