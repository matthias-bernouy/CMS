# @bernouy/cms-content

CMS-owned pages, Blocs, settings, themes, declarative bindings, persistence, and
published rendering read models.

## Public API

- The root export is the authoring API and includes the in-memory repository.
- `/feature` authors `contentFeature`, its default capability execution and injected ports.
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

`application/feature.ts` is the source for `ulvia/cms.content`. Grouped capabilities
own schemas, HTTP/MCP bindings and execution; package Markdown documents are
scanned at build time. Public Page, Bloc, catalogue and diagnostic DTOs derive
from the schemas. Persistence and rendering records keep their separate types.

`ContentServices` receives the repository, public delivery and host-owned
contribution ports. Contribution snapshots project theme/text data without
additional store reads; collection formats and mutation orchestration remain
outside Content. The Provider retains localized error presentation, including
schema-validated Page diagnostics. Runtime mounting uses generated metadata.

See the [workspace package map](../../../docs/architecture/packages.md). Licensed
under the repository [MIT License](../../../LICENSE).
