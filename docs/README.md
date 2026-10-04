# CmsCore Documentation

These guides describe the current workspace and contracts shared by its
packages. Package `AGENTS.md` files supply local implementation rules. Planned
work is identified explicitly; a domain API does not imply a mounted product flow.

## Architecture And Development

- [Workspace architecture](architecture/README.md): layers, dependency rules,
  domain boundaries and runtime composition.
- [Package map](architecture/packages.md): every current workspace package and
  its responsibility.
- [Imports](architecture/imports.md): public exports, local aliases, adapters and
  browser boundaries.
- [Development](development/README.md): local startup, builds and validation.
- [Commit messages](development/commits.md): the recommended message convention.
- [Deferred platform work](TODO.md): explicit trust assumptions and work that
  must be completed before those assumptions change.

## Providers And Collections

- [Repository and gateway flows](providers/README.md): artifact admission, site
  state, live invocation, identities and remaining integration gaps.
- [Bloc authoring](blocs/README.md): existing compiled Blocs, editable site
  compositions, editor contracts, bindings and themes.
- [Collection API and admission](blocs/collections.md): the current Control
  workspace and the separate `ulvia-collection/v1` authored bundle format.
- [Dashboards and views](dashboards/README.md): site dashboards, collection HTML
  views, member access and current binding limits.
- [Site health](providers/README.md): provider observations, selected sources,
  collection versions and dashboard activation in the admin Health page.

The root [transition document](../TRANSITION_SOURCES.md) and
[execution plan](../PLAN_ACTION.md) track direction and implementation phases.
Use the guides here and the referenced source code to establish current behavior.

## HTTP Surfaces

- [Control API routing](surfaces/control-api.md).
- [Control static routing](surfaces/control-static.md).
- [Page languages and routes](surfaces/page-routes.md): localized URLs,
  redirects, deletion and recovery.
- [Dynamic page indexing](surfaces/page-indexing.md): metadata projection and
  sitemap discovery through selected gateway capabilities.
- [Public authentication](surfaces/public-auth.md): Delivery's CMS-owned auth routes.

## Images And UI Quality

- [Responsive images](images/README.md): [authoring](images/authoring.md),
  [delivery](images/delivery.md) and [operations](images/operations.md).
- [UI contracts](quality/ui-contracts.md): binding ownership, browser request
  diagnostics, source/form checks and current scanner limitations.
