# CmsCore Documentation

These guides describe the current workspace and contracts shared by its
packages. Package `AGENTS.md` files supply local implementation rules. Planned
work is identified explicitly; a domain API does not imply a mounted product flow.

## Architecture And Development

- [Repository audit](AUDIT.md): verified strengths, production risks, current
  limits and the recommended delivery sequence.
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
- [Control Pages and provider-managed CMS instances](todo/control-pages-and-provider-managed-cms-instances.md):
  design for replacing the removed static admin and collection View models with
  surface-specific Pages, with local, cloud or third-party instance providers;
  provider-owned local discovery, immutable collection Pages, site-owned
  surface routes and mounted shared rendering are implemented. Autonomous
  provisioning and complete Control parity remain planned.
- [Local provider and CMS initialization](todo/local-provider-initialization.md):
  proposed offline first-run, bootstrap collection, Control Page, restart and
  recovery flow for the official local provider; durable discovery of the
  existing local instance is implemented, while autonomous provisioning remains
  planned.

## Providers And Collections

- [Repository and gateway flows](providers/README.md): artifact admission, site
  state, live invocation, identities and remaining integration gaps.
- [Bloc authoring](blocs/README.md): existing compiled Blocs, editable site
  compositions, editor contracts, bindings and themes.
- [Collection API and admission](blocs/collections.md): the current Control
  workspace and the separate `ulvia-collection/v1` authored bundle format.
- [Site health](providers/README.md): provider observations, selected sources,
  and collection versions in the admin Health page.

The root [transition document](../TRANSITION_SOURCES.md) and
[execution plan](../PLAN_ACTION.md) track direction and implementation phases.
Use the guides here and the referenced source code to establish current behavior.

## HTTP Surfaces

- [Control API routing](surfaces/control-api.md).
- [Control kernel routing](surfaces/control-kernel.md).
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
