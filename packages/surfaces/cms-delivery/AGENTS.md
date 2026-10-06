# @bernouy/cms-delivery

Public rendering surface. It mounts page rendering, bloc bundles, theme CSS,
component runtime, gateway capability routes, file serving, sitemap, robots and public auth
onto a provided `Runner`.

## Boundaries

- Root export exposes `DeliveryCms`, `DeliveryCmsConfig`, `ContentReader`, and
  `HeadInjector` types.
- Delivery consumes content through `@bernouy/cms-content/rendering` and
  `@bernouy/cms-content/files/serving`, plus the browser-safe `/browser`,
  `/browser/dom`, `/bindings`, `/theme`, `/page-path` and `/files/urls`
  capabilities. Do not import the authoring root, `/files`, Mongo, S3,
  filesystem implementations or runtime composition code.
- Persistence, auth, files, cache and gateway are injected through config.

## Rules

- Collection text sources are trusted public inputs fixed per instance. Render
  their markers server-side after composition expansion; catalogue changes need
  page-cache invalidation. Never insert actor-specific text into shared pages.
- Rendering is on demand. Do not introduce build-time prerendering or browser
  automation into this package.
- `ContentReader` returns published pages, projected rendering settings and
  renderable bloc artifacts. Helpers receive only the methods they use.
- Delivery reads original blobs but may write variants and generate/retain
  sitemap snapshots through separate capabilities. Auth writes are independent
  of editorial content.
- Keep temporary route-updating responses non-cacheable. Editorial draft
  preview belongs to authenticated Control, not public Delivery.
- Preserve `/.cms/*` route semantics for blocs, blocsets, style, files, image
  variants, gateway capabilities, and auth. Delivery does not mount public
  `/.cms/sources` routes.
- Gateway execution uses the selected contract and injected runtime transport.
- Public routes should be careful with cache headers and CSP-related settings.
- Installed collection assets use representation-versioned public URLs and support single HTTP byte ranges for
  progressive media and document reads.
