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
- [First published Page](product/first-published-page.md): locked MVP decisions,
  the administrator's golden path and its executable completion gate.
- [Deferred platform work](TODO.md): explicit trust assumptions and work that
  must be completed before those assumptions change.
- [Local provider and CMS initialization](todo/local-provider-initialization.md):
  offline first-run, bootstrap collection, administration Page, restart and recovery
  flow for the official local provider; durable local discovery and the bundled
  Docker repository/Ulvia Provider/Kernel bootstrap are implemented, while provider-owned
  instance lifecycle mutations remain planned.

## Providers And Collections

- [Repository and gateway flows](providers/README.md): artifact admission, site
  state, live invocation, identities and remaining integration gaps.
- [Bloc authoring](blocs/README.md): collection Blocs, site-owned content
  contracts, bindings and themes.
- [Collection API and admission](blocs/collections.md): the current administration
  workspace and the separate `ulvia-collection/v1` authored bundle format.
- [Site health](providers/README.md): provider observations, selected sources,
  and collection versions in the admin Health page.

Use the [repository audit](AUDIT.md), the architecture guides and the referenced
source code to establish current behavior. Deliberately deferred activation
gates remain recorded in [Deferred platform work](TODO.md).

## HTTP Applications

- [Kernel routing](surfaces/kernel.md): the unified Page, administration,
  authentication, capability and asset application.
- [Page languages and routes](surfaces/page-routes.md): localized URLs,
  redirects, deletion and recovery.
- [Dynamic page indexing](surfaces/page-indexing.md): metadata projection and
  sitemap discovery through selected gateway capabilities.
- [Public authentication](surfaces/public-auth.md): the Kernel's CMS-owned auth routes.

## Images And UI Quality

- [Files and responsive images](images/README.md).
- [UI contracts](quality/ui-contracts.md): binding ownership, browser request
  diagnostics, source/form checks and current scanner limitations.
