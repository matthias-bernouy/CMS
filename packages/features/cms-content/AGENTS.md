# @bernouy/cms-content

Feature package for CMS-owned content: pages, blocs, settings, declarative
bindings, validation, and read models.

## Boundaries

- Root export exposes authoring entity types, `CmsRepository`, in-memory
  repository, validation, and authoring operations.
- `@bernouy/cms-content/rendering` exposes `ContentReader`, its composition
  factory and public rendering helpers. It has published-only page operations,
  rendering settings and renderable bloc artifacts, never editorial queries.
- `@bernouy/cms-content/bindings` exposes browser-safe declarative binding
  syntax and runtime metadata.
- `@bernouy/cms-content/browser` exposes the browser-only `Component` base and
  live declarative binding runtime used by rendered Pages and collection Blocs.
- `@bernouy/cms-content/browser/dom` exposes inert network-binding preparation
  for Control and Delivery renderers.
- `@bernouy/cms-content/theme` exposes browser-safe theme value resolution.
- `@bernouy/cms-content/mongo` exposes `MongoCmsRepository` for composition
  roots.
- `@bernouy/cms-content/migrations` exposes collection migration planning,
  execution, journals and the memory adapter. The Mongo journal adapter is
  exported from `./mongo`.
- File data belongs to providers implementing `ulvia.cms.files`. Content stores
  only provider-neutral file references.
- Do not import surfaces, runtimes, Control internals, or persistence adapters
  into `core/` or `interfaces/`.

## Source Layout

- `pages/`, `blocs/`, `bindings/`, `settings/` and `theme/` are sibling
  domains. Theme owns tokens, modes, values and CSS independently of settings.
- Site-owned Bloc source serialization belongs to Bloc publication in this
  package. Collection Bloc compilation belongs to
  `@bernouy/cms-repository/collections/build`.
- `pages/` owns the surface route registry and the single internal Page-link
  model. Control and Delivery routes share identities but never a path namespace.
- Each domain contains only its needed `interfaces/`, `core/`, `http/` or
  `default-implementation/` layers. Interfaces contain no executable helpers.
- `application/` owns cross-domain contracts, reader composition, aggregate
  validation/error primitives and memory/Mongo repositories. Domain rules stay
  with the domain; do not create a catch-all repository business domain.
- `exports/` contains all declared public entrypoints.
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
  plan read-only and bounded, their page writes revision-checked, their journal
  resumable and batch-readable, and their rollback snapshots separate from
  user-facing page history. Migration writes must retain the exact maintenance
  lease; never let a stale worker release a successor's lease.
- Features persisting references to collection resources must register a
  `CollectionMigrationParticipant`; every mutation of that persisted state must
  use the shared site migration write fence.
- Stored Page/Bloc documents, settings and binding contracts must remain stable;
  authored Blocs depend on them even while no visual editor is mounted.
- When changing repository behavior, update both in-memory and Mongo behavior
  or document why only one implementation changes.
