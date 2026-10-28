# CmsCore Documentation

These guides describe the current workspace and contracts shared by its
packages. Package `AGENTS.md` files supply local implementation rules. Planned
work is identified explicitly; a domain API does not imply a mounted product flow.

## Architecture And Development

- [Install Ulvia](installation/README.md): Ubuntu prerequisites, first local
  instance, public HTTPS, upgrades, backups and troubleshooting.
- [Repository audit](AUDIT.md): the 2026-10-25 verification snapshot, confirmed
  CI defects, measured rendering costs, strengths and the delivery sequence.
- [Workspace architecture](architecture/README.md): layers, dependency rules,
  domain boundaries and runtime composition.
- [Package map](architecture/packages.md): every current workspace package and
  its responsibility.
- [Imports](architecture/imports.md): public exports, local aliases, adapters and
  browser boundaries.
- [Development](development/README.md): local startup, builds and validation.
- [Workspace tests](../tests/README.md): cross-component journeys and image checks.
- [Commit messages](development/commits.md): the recommended message convention.
- [First published Page](product/first-published-page.md): locked MVP decisions,
  the administrator's golden path and its executable completion gate.
- [Open platform work](TODO.md): current correctness and operational gaps,
  trust assumptions and exit conditions.
- [Provider instance initialization](architecture/provider-instance-initialization.md):
  operator API, exact official profile, isolated instance connection, local
  first run, restart and production composition boundaries.

## Providers And Collections

- [Repository and gateway flows](providers/README.md): artifact admission, site
  state, live invocation, identities and remaining integration gaps.
- [Community Repository](architecture/community-repository.md): cryptographic
  namespaces, capability contract, MCP, standalone deployments and limitations.
- [Agent authoring](development/agent-authoring.md): current collection tooling
  and a prioritized proposal for disposable previews and declared tests.
- [Bloc authoring](blocs/README.md): collection Blocs, site-owned content
  contracts, bindings and themes.
- [Collection API and admission](blocs/collections.md): the current administration
  workspace and the separate `ulvia-collection/v1` authored bundle format.
- [Runtime diagnostics](development/README.md#runtime-logs): structured events,
  request correlation, local journals, redaction and CLI inspection.

Use the [repository audit](AUDIT.md), the architecture guides and the referenced
source code to establish current behavior. An implemented API or passing local
suite does not establish a completed browser journey or working CI delivery.
Remaining activation gates are recorded in [Open platform work](TODO.md).

## HTTP Applications

- [Edge routing](surfaces/edge.md): the unified Page, administration,
  capability and asset application.
- [Page languages and routes](surfaces/page-routes.md): localized URLs,
  redirects, deletion and recovery.
- [Dynamic page indexing](surfaces/page-indexing.md): metadata projection and
  sitemap discovery through selected gateway capabilities.
- [Access and authentication](surfaces/access-authentication.md): provider-owned
  identity, account flows, administrator grants and Edge-applied session effects.

## Images And UI Quality

- [Files and responsive images](images/README.md).
- [UI contracts](quality/ui-contracts.md): binding ownership, browser request
  diagnostics, source/form checks and current scanner limitations.

- [Reviewed Release Upgrades](architecture/release-upgrades.md): resource identity,
  usage inventories, reviewed switches, grants and Provider retention.
