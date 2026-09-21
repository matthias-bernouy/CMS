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

## Authoring And Sources

- [Page languages and routes](./page-languages-and-routes.md) describes localized
  paths, redirects, deletion tombstones, and public SEO behavior.
- [Bloc Authoring](./blocs/README.md) documents how to create blocs, expose
  editor capabilities, bind Sources, design themeable CSS, test, and publish.
- [Legacy integration documentation](./integrations/README.md) is retained only
  as migration evidence for the removed package/install/repository system.
- [auth-system-source.md](./auth-system-source.md) documents the readonly
  system auth source exposed through `/.cms/sources/system-auth/*`.

## Images

- [Responsive images](./images/README.md) explains ownership, authoring,
  Delivery optimization, browser selection, caching, and rollout for responsive
  images.

## Dashboard Implementation

- [Dashboard detail forms](./integrations/dashboard-views.md) documents current
  authoring contracts, creation, operations and related-resource panels.
- [Dashboard binding verification](./quality/dashboard-widget-binding.md) explains
  rendering ownership and the browser validation checklist.
- [Integration migration status](./quality/integration-views/all-integrations.md)
  records migrated views, remaining legacy consumers and validation limits.
