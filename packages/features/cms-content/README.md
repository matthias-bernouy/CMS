# @bernouy/cms-content

CMS-owned pages, Blocs, settings, themes, declarative bindings, persistence, and
published rendering read models.

## Public API

- The root export is the authoring API and includes the in-memory repository.
- `/rendering` is the published-only `ContentReader` boundary.
- `/bindings`, `/browser`, `/browser/dom`, `/theme`, and `/page-path` are the
  browser-safe and rendering-focused entrypoints.
- `/mongo` contains runtime persistence adapters; `/migrations` contains the
  collection migration toolchain.

File bytes belong to providers implementing `ulvia.cms.files`; this package
stores provider-neutral references only. Public Delivery code should consume the
rendering entrypoint rather than the authoring root.

See the [workspace package map](../../../docs/architecture/packages.md). Licensed
under the repository [MIT License](../../../LICENSE).
