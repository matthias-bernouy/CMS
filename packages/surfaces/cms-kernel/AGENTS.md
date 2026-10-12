# @bernouy/cms-kernel

Unified CMS kernel. It mounts Page rendering, administration, authentication,
Bloc bundles, theme CSS, capability routes, sitemap and robots onto one provided
`Runner`.

## Boundaries

- Root export exposes `KernelCms`, `KernelCmsConfig`, and rendering helpers.
- Kernel may use the public authoring and rendering boundaries of
  `@bernouy/cms-content`; it must not import Mongo, filesystem implementations or
  runtime composition code.
- Persistence, auth, cache and gateway are injected through config.

## Rules

- Collection text sources are trusted public inputs fixed per instance. Render
  their markers server-side after composition expansion; catalogue changes need
  page-cache invalidation. Never insert actor-specific text into shared pages.
- Rendering is on demand. Do not introduce build-time prerendering or browser
  automation into this package.
- Public rendering reads projected published content. Administrative capability
  handlers receive the injected writable repository through the same kernel.
- Kernel generates and retains sitemap snapshots through dedicated storage.
  File bytes and representations are served through selected gateway capabilities.
- Keep temporary route-updating responses non-cacheable. Draft and
  administrative behavior is authorized from capability access, not from a
  separate surface.
- Preserve `/.cms/*` route semantics for blocs, blocsets, style, generic gateway
  capabilities, and auth. Kernel does not mount public `/.cms/sources` routes.
- Gateway execution uses the selected contract and injected runtime transport.
- Public routes should be careful with cache headers and CSP-related settings.
- Installed collection assets use representation-versioned public URLs and support single HTTP byte ranges for
  progressive media and document reads.
