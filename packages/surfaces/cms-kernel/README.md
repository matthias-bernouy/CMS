# @bernouy/cms-kernel

Unified HTTP kernel for Pages, administration, authentication, Bloc assets,
theme CSS, browser runtime, gateway capabilities, sitemap and robots. SEO
domain logic is provided by `@bernouy/cms-seo`; this package mounts it.

The root entrypoint exposes `KernelCms` and its injected configuration types.
Persistence, authentication, caching, collection state and gateway transports
are supplied by a runtime. Page access is derived from the capabilities used by
each Page and its transitive Blocs.

Rendering is performed on demand, and file bytes are served through selected
provider capabilities.

See the [workspace package map](../../../docs/architecture/packages.md). Licensed
under the repository [MIT License](../../../LICENSE).
