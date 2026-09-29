# CmsCore Documentation

This directory documents contracts that affect several packages. Package-local
implementation notes live in each package's `AGENTS.md`.

## Architecture

- [Structure.md](./Structure.md) explains the monorepo layers, package roles,
  dependency direction, and feature package anatomy.
- [import-rules.md](./import-rules.md) defines allowed import paths, package
  boundaries, and adapter subpath rules.
- [commit-convention.md](./commit-convention.md) records the commit message
  convention used in this repository.

## Surfaces

- [UI contracts](./quality/ui-contracts.md) documents binding ownership,
  browser request diagnostics, source/form checks, and the reviewed inventory.

- [api-folder.md](./api-folder.md) documents the file-routed REST API convention
  used by `@bernouy/cms-control`.
- [static-folder.md](./static-folder.md) documents the static HTML routing and
  template system used by `@bernouy/cms-control`.

## Authoring And Providers

- [Source and provider transition](../TRANSITION_SOURCES.md) records the
  Protocol v1 direction and high-level phase status.
- [Source, provider and collection execution plan](../PLAN_ACTION.md) tracks
  the current wave status, remaining gates and next implementation series.
- [Repository contracts and providers: flow diagrams](../schema/README.md)
  separates current admission, publication and conformance flows in
  `@bernouy/cms-repository` from planned runtime upgrades.
- [Page languages and routes](./page-languages-and-routes.md) describes localized
  paths, redirects, deletion tombstones, and public SEO behavior.
- [Dynamic page indexing](./page-indexing.md) describes gateway capability
  projections for metadata and sitemap discovery.
- [Bloc Authoring](./blocs/README.md) documents how to create blocs, expose
  editor capabilities, bind provider calls, design themeable CSS, test, and publish.
- [Public authentication](./public-auth.md) documents the native Delivery auth routes.

## Images

- [Responsive images](./images/README.md) explains ownership, authoring,
  Delivery optimization, browser selection, caching, and rollout for responsive
  images.

## UI Quality

- [UI contracts](./quality/ui-contracts.md) documents binding ownership and
  browser request diagnostics.
