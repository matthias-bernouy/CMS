# @bernouy/cms-content

CMS-owned pages, Blocs, settings, themes, declarative bindings, persistence, and
published rendering read models.

## Public API

- The root export is the authoring API and includes the in-memory repository.
- `/rendering` is the published-only `ContentReader` boundary.
- `/bindings`, `/browser`, `/browser/dom`, `/theme`, `/page-document` and
  `/page-path` are browser-safe or document-contract entrypoints.
- `/runtime-abi`, `/runtime-assets` and `/runtime-assets/build` own the generated
  Bloc behavior and binding-core runtime contract, serving and build step.
- `/http` exposes mountable Content handlers; `/public-delivery` owns public
  path resolution, Page access analysis and final native resource rendering.
- `/mongo` contains runtime persistence adapters. Collection installation and
  reviewed release-switch orchestration belong to
  `@bernouy/cms-repository/collections/installations`.

File bytes belong to providers implementing `ulvia/cms.files`; this package
stores provider-neutral references only. Provider composition injects Content
delivery and rendering ports. Edge has no Content repository or rendering
dependency and forwards the selected contract's native resources.

See the [workspace package map](../../../docs/architecture/packages.md). Licensed
under the repository [MIT License](../../../LICENSE).
