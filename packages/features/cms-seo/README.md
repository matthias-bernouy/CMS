# @bernouy/cms-seo

Provider-neutral Page metadata, structured data, dynamic entity indexing and
persisted sitemap snapshots.

## Public API

- `@bernouy/cms-seo` exposes metadata projection, indexing resolution and
  discovery, sitemap materialization and refresh services.
- `/http` exposes mountable robots, sitemap-index and sitemap-chunk handlers.

The package consumes projected published content, an injected capability
executor and an injected snapshot store. It does not choose providers, resolve
browser authentication, create an HTTP runner or own Page persistence. Dynamic
discovery runs only through selected public query capabilities and never emits
provider response bodies in public failures.

See [dynamic Page indexing](../../../docs/surfaces/page-indexing.md), the
[workspace package map](../../../docs/architecture/packages.md), and the
repository [MIT License](../../../LICENSE).
