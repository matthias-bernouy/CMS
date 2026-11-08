# @bernouy/cms-edge

Unified stateless HTTP edge for Pages, administration, Bloc assets, theme CSS,
browser runtimes and gateway capabilities. Robots and sitemap are injected
Content delivery resources; this package only exposes them at their public URLs.

The root entrypoint exposes `EdgeCms` and its injected configuration types.
Content reads and delivery resources, request-actor resolution, caching and
gateway transports are supplied by a runtime. Authentication capabilities,
accounts, credentials and session-token issuance remain Provider-owned. Edge
only resolves the actor through Access and applies contract-authorized semantic
session effects. Page access is derived from the capabilities used by each Page
and its transitive Blocs.

Rendering is performed on demand, and file bytes are served through selected
provider capabilities. The workspace build emits the Bloc behavior and
binding-core browser runtimes owned by `content`; HTTP requests only read
and cache those artifacts.

See the [workspace package map](../../../docs/architecture/packages.md). Licensed
under the repository [MIT License](../../../LICENSE).

Native setup at `/.cms/setup` calls selected `ulvia/cms.resources` capabilities.
It offers empty/base initialization, renders the exact reviewed resource counts,
Page visibility and browser authority, then sends explicit consent for queued
application. A stopped copy returns through review before resuming. Access owns
login/logout; the Edge holds no resource store, import service or administrator
bypass. Missing-home redirects add one public pending query only.
