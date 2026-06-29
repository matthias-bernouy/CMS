# @bernouy/cms-delivery

Public rendering surface. It mounts page rendering, bloc bundles, theme CSS,
component runtime, gateway proxy, file serving, sitemap, robots, public auth,
and analytics collection onto a provided `Runner`.

## Boundaries

- Root export exposes `DeliveryCms`, `DeliveryCmsConfig`, `ContentReader`, and
  `HeadInjector` types.
- Delivery consumes contracts from feature packages. It should not import Mongo,
  S3, or runtime composition code.
- Persistence, auth, files, cache, gateway, analytics, and secret resolution are
  injected through config.

## Rules

- Rendering is on demand. Do not introduce build-time prerendering or browser
  automation into this package.
- `ContentReader` is the read side; avoid write operations from Delivery.
- Preserve `/.cms/*` route semantics for blocs, blocsets, style, files, image
  variants, gateway, and auth.
- Gateway execution must use injected secret resolution.
- Analytics collection must remain server-side and privacy-preserving.
- Public routes should be careful with cache headers and CSP-related settings.
