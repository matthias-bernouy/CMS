# @bernouy/cms-delivery

Public rendering surface. It mounts page rendering, bloc bundles, theme CSS,
component runtime, gateway capability routes, sitemap, robots and public auth
onto a provided `Runner`.

## Boundaries

- Root export exposes `DeliveryCms`, `DeliveryCmsConfig`, `ContentReader`, and
  `HeadInjector` types.
- Delivery consumes content through `@bernouy/cms-content/rendering`, plus the
  browser-safe `/browser`, `/browser/dom`, `/bindings`, `/theme` and `/page-path`
  capabilities. Do not import the authoring root, Mongo, filesystem
  implementations or runtime composition code.
- Persistence, auth, cache and gateway are injected through config.

## Rules

- Collection text sources are trusted public inputs fixed per instance. Render
  their markers server-side after composition expansion; catalogue changes need
  page-cache invalidation. Never insert actor-specific text into shared pages.
- Rendering is on demand. Do not introduce build-time prerendering or browser
  automation into this package.
- `ContentReader` returns published pages, projected rendering settings and
  renderable bloc artifacts. Helpers receive only the methods they use.
- Delivery generates and retains sitemap snapshots through dedicated storage.
  File bytes and representations are served through selected gateway capabilities.
- Keep temporary route-updating responses non-cacheable. Editorial draft
  preview belongs to authenticated Control, not public Delivery.
- Preserve `/.cms/*` route semantics for blocs, blocsets, style, generic gateway
  capabilities, and auth. Delivery does not mount public `/.cms/sources` routes.
- Gateway execution uses the selected contract and injected runtime transport.
- Public routes should be careful with cache headers and CSP-related settings.
- Installed collection assets use representation-versioned public URLs and support single HTTP byte ranges for
  progressive media and document reads.
