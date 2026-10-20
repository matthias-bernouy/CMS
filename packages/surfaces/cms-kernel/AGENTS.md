# @bernouy/cms-kernel

Unified CMS HTTP surface. It mounts Page rendering, feature handlers and public
fallbacks onto one provided `Runner`.

## Boundaries

- Root export exposes `KernelCms`, `KernelCmsConfig`, reserved-path detection and
  rendering helpers.
- Kernel consumes the projected `ContentReader` boundary of
  `@bernouy/cms-content`; it must not receive a writable content repository or
  import Mongo, filesystem implementations or runtime composition code.
- Content projection, request-actor resolution, cache and gateway handlers are
  injected through config. Authentication remains Provider-owned.
- Domain HTTP behavior stays in its owning feature. Kernel supplies request
  context and mounts those handlers; it does not reimplement collection asset,
  capability invocation, browser runtime or SEO behavior.

## Rules

- Collection text sources are trusted public inputs fixed per instance. Render
  their markers server-side after composition expansion; catalogue changes need
  page-cache invalidation. Never insert actor-specific text into shared pages.
- Rendering is on demand. Do not introduce build-time prerendering or browser
  automation into this package.
- Public rendering reads projected published content. Page access is derived
  by static capability analysis, including administration Pages. This analysis
  is not a live gateway grant.
- `cms-seo` generates and retains sitemap snapshots. Kernel only mounts its
  injected HTTP handlers. File bytes and representations are served through
  selected gateway capabilities.
- Keep temporary route-updating responses non-cacheable. Draft and
  administrative behavior is authorized from capability access, not from a
  separate surface.
- Preserve `/.cms/*` route semantics for blocsets, style, generic gateway
  capabilities and runtime assets. There is no auth route family, per-Bloc or public
  `/.cms/sources` route.
- Gateway execution uses the selected contract and injected runtime transport.
- Public routes should be careful with cache headers and CSP-related settings.
- Installed collection assets use representation-versioned public URLs and support single HTTP byte ranges for
  progressive media and document reads.
