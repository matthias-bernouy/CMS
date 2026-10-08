# @bernouy/cms-delivery

Public rendering surface for published pages, Bloc assets, theme CSS, browser
runtime, gateway capabilities, sitemap, robots, favicon, and public auth flows.

The root entrypoint exposes `DeliveryCms` and its injected configuration types.
Delivery consumes the published-only `@bernouy/cms-content/rendering` boundary;
persistence, authentication, caching, and gateway transports are supplied by a
runtime.

Rendering is performed on demand. Editorial preview belongs to authenticated
Control, and file bytes are served through selected provider capabilities.

See the [workspace package map](../../../docs/architecture/packages.md). Licensed
under the repository [MIT License](../../../LICENSE).
