# @bernouy/cms-content

Feature package for CMS-owned content: pages, blocs, settings, declarative
bindings, validation, and read models.

## Boundaries

- Root export exposes authoring entity types, `ContentRepository`, in-memory
  repository, validation, and authoring operations.
- `@bernouy/cms-content/delivery` owns the shared named projection types and deep
  codecs used by Provider and Kernel. It validates both sides of the bounded
  transport envelope; it must not depend on cms-repository.
- `@bernouy/cms-content/rendering` exposes `ContentReader`, its composition
  factory and public rendering helpers. It has published-only page operations,
  rendering settings and renderable bloc artifacts, never editorial queries.
- `@bernouy/cms-content/bindings` exposes browser-safe declarative binding
  syntax and runtime metadata.
- `@bernouy/cms-content/browser` exposes the Light DOM Bloc behavior runtime
  and live declarative binding runtime used by rendered Pages and contributed Blocs.
- `@bernouy/cms-content/runtime-assets` exposes the generated system runtime
  entries to server composition; its build subpath owns their generation.
- `@bernouy/cms-content/browser/dom` exposes binding cloak injection and inert
  network-binding preparation for the Kernel renderer.
- `@bernouy/cms-content/http` exposes mountable handlers for the generated
  browser runtimes, Bloc sets and published Page snapshots.
- `@bernouy/cms-content/seo` owns metadata, structured data, dynamic indexing
  and persisted sitemap snapshots; `./seo/http` exposes their HTTP handlers.
- `@bernouy/cms-content/theme` exposes browser-safe theme value resolution.
- `@bernouy/cms-content/mongo` exposes `MongoContentRepository` for composition
  roots.
- `@bernouy/cms-content/page-document` exposes the provider-neutral Page and
  Bloc document grammar shared by site content and external contributions.
- File data belongs to providers implementing `ulvia.cms.files`. Content stores
  only provider-neutral file references.
- Do not import surfaces, runtimes, Kernel internals, or persistence adapters
  into `core/` or `interfaces/`.

## Source Layout

- `pages/`, `blocs/`, `settings/` and `theme/` are sibling domains. Theme owns
  tokens, modes, values and CSS independently of settings. Declarative binding
  grammar belongs to Bloc markup; its live implementation belongs to `browser/`.
- `runtime-assets/` owns the generated technical browser bundles, their build
  entrypoint and the HTTP handlers that serve them. It is infrastructure for
  Content's browser runtime, not part of the cross-domain application layer.
- Site-owned Bloc source serialization belongs to Bloc publication in this
  package. Collection Bloc compilation belongs to
  `@bernouy/cms-repository/collections/build`.
- Effective Bloc grouping, Bloc asset manifests and generic Page asset
  resolution belong to the Bloc domain because they are derived from content,
  not from an HTTP surface.
- `pages/` owns site Page persistence, current/redirect/gone routes and the internal Page-link
  model. Every Page route shares one site namespace. Pages have no contribution
  provenance; this package must not know collection or repository contracts.
- Each domain contains only its needed `interfaces/`, `core/`, `http/` or
  `default-implementation/` layers. Interfaces contain no executable helpers.
- `application/` owns cross-domain contracts, reader composition, aggregate
  validation/error primitives and memory/Mongo repositories. Domain rules stay
  with the domain; do not create a catch-all repository business domain.
- `exports/` contains all declared public entrypoints.
- Tests follow domains; aggregate repository tests live in `tests/application/`.

## Rules

- Domain validation belongs with the relevant domain and is enforced by
  `application/core/ValidatingContentRepository` for authoring writes.
- Public pages must be observed with `visible === true`. Project returned
  fields explicitly and do not return shared mutable authoring objects.
- Keep route migration checks and rereads; do not claim snapshot consistency.
- Rendering settings must not contain initialization state or SMTP settings.
- The Kernel owns authenticated draft preview. Never add a preview mode to the
  public reader.
- Static contributed text and immutable asset substitution run on the server
  through `/rendering`, after composition expansion. Browser binding has no
  i18n or asset filter.
- Stored HTML/SVG must pass through the existing hardening/sanitizing helpers.
- Page bloc references should use the existing content-ref helpers.
- Collection admission, installation, projection and reviewed release upgrades
  belong to `@bernouy/cms-repository`. Content exposes only generic persistence,
  validation and contribution inputs consumed by those projections.
- Stored Page/Bloc documents, settings and binding contracts must remain stable;
  authored Blocs depend on them even while no visual editor is mounted.
- When changing repository behavior, update both in-memory and Mongo behavior
  or document why only one implementation changes.
