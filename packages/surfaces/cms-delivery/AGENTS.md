# @bernouy/cms-delivery

Public rendering surface. It mounts page rendering, bloc bundles, theme CSS,
component runtime, source proxy, file serving, sitemap, robots, public auth,
and analytics collection onto a provided `Runner`.

## Boundaries

- Root export exposes `DeliveryCms`, `DeliveryCmsConfig`, `ContentReader`, and
  `HeadInjector` types.
- Delivery consumes content through `@bernouy/cms-content/rendering` and
  `@bernouy/cms-content/files/serving`, plus browser-safe `/editor`, `/theme`,
  `/page-path` and `/files/urls` helpers. Do not import the authoring root,
  `/files`, Mongo, S3, filesystem implementations or runtime composition code.
- Persistence, auth, files, cache, sources, analytics, and secret resolution are
  injected through config.

## Rules

- Rendering is on demand. Do not introduce build-time prerendering or browser
  automation into this package.
- `ContentReader` returns published pages, projected rendering settings and
  renderable bloc artifacts. Helpers receive only the methods they use.
- Delivery reads original blobs but may write variants and generate/retain
  sitemap snapshots through separate capabilities. Analytics/auth writes are
  independent of editorial content.
- Keep temporary route-updating responses non-cacheable. Editorial draft
  preview belongs to authenticated Control, not public Delivery.
- Preserve `/.cms/*` route semantics for blocs, blocsets, style, files, image
  variants, sources, and auth.
- Source execution must use injected secret resolution.
- Analytics collection must remain server-side and privacy-preserving.
- Public routes should be careful with cache headers and CSP-related settings.
