# @bernouy/cms-kernel

Unified stateless HTTP kernel for Pages, administration, Bloc assets, theme CSS,
browser runtimes and gateway capabilities. Robots and sitemap are injected
Content delivery resources; this package only exposes them at their public URLs.

The root entrypoint exposes `KernelCms` and its injected configuration types.
Content reads and delivery resources, request-actor resolution, caching and
gateway transports are supplied by a runtime. Authentication capabilities,
accounts, credentials and session-token issuance remain Provider-owned. Kernel
only resolves the actor through Access and applies contract-authorized semantic
session effects. Page access is derived from the capabilities used by each Page
and its transitive Blocs.

Rendering is performed on demand, and file bytes are served through selected
provider capabilities. The workspace build emits the Bloc behavior and
binding-core browser runtimes owned by `cms-content`; HTTP requests only read
and cache those artifacts.

See the [workspace package map](../../../docs/architecture/packages.md). Licensed
under the repository [MIT License](../../../LICENSE).
