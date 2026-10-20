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
- `/http` exposes mountable Content handlers; `/kernel` exposes the narrow
  authoring-side contract needed by Kernel composition.
- `/mongo` contains runtime persistence adapters. Collection installation and
  migration orchestration belong to
  `@bernouy/cms-repository/collections/installations`.

File bytes belong to providers implementing `ulvia.cms.files`; this package
stores provider-neutral references only. Kernel rendering code should consume the
rendering entrypoint rather than the authoring root.

See the [workspace package map](../../../docs/architecture/packages.md). Licensed
under the repository [MIT License](../../../LICENSE).
