# CmsCore Documentation

These guides describe the current workspace and contracts shared by its
packages. Package `AGENTS.md` files supply local implementation rules. Planned
work is identified explicitly; a domain API does not imply a mounted product flow.

## Architecture And Development

- [Install Ulvia](installation/README.md): prerequisites, automatic empty Control,
  shared services, public HTTPS, upgrades and backups.
- [Workspace architecture](architecture/README.md): layers, dependency rules,
  domain boundaries and runtime composition.
- [Events and Workflow manifests](architecture/events-workflows.md): typed business events, resource schemas, portable installations and suspension/recovery.
- [Contract documentation](architecture/contract-documentation.md): versioned
  Markdown, capability links, hybrid search and agent verification guidance.
- [Package map](architecture/packages.md): every current workspace package and
  its responsibility.
- [Imports](architecture/imports.md): public exports, local aliases, adapters and
  browser boundaries.
- [Resolved schemas](development/resolved-schemas.md): shared event/capability typing, typed resolvers and host guarantees.
- [Development](development/README.md): local startup, builds and validation.
- [Phased distribution publication](development/publication.md): publish the exact runtime before catalogue admission and promote the npm channel after completion.
- [Shared hosting validation](development/shared-hosting-validation.md): requirement
  evidence, reproducible checks and deployment limits for the fresh baseline.
- [Infrastructure tooling](../infra/README.md): release packaging, images, models
  and optional host operations.
- [Workspace tests](../tests/README.md): cross-component journeys and image checks.
- [Commit messages](development/commits.md): the recommended message convention.
- [First published Page](product/first-published-page.md): the current setup-to-publication API
  journey, its checks and the visual editing boundary.
- [Provider instance initialization](architecture/provider-instance-initialization.md):
  Control bootstrap, admitted Hosting management, exact system plans, isolated
  instance contexts, native setup and recovery.

## Providers And Collections

- [Resource identities and release channels](architecture/repository-resources.md):
  official names, stable/beta discovery, exact pins and the fresh baseline.

- [Repository and gateway flows](providers/README.md): artifact admission, site
  state, live invocation, identities and remaining integration gaps.
- [Community Repository](architecture/community-repository.md): CMS-hosted Registry,
  account-owned namespaces, PAT publication, discovery and deployment limits.
- [Agent authoring](development/agent-authoring.md): current collection tooling,
  compiler boundaries and executable verification.
- [Bloc authoring](blocs/README.md): collection Blocs, site-owned content
  contracts, bindings and themes.
- [Collection API and admission](blocs/collections.md): the generic collection
  lifecycle and the `ulvia-collection/v1` authored bundle format.
- [Runtime diagnostics](development/README.md#runtime-logs): structured events,
  request correlation, local journals, redaction and CLI inspection.

Use the architecture guides and their referenced source code to establish
current behavior. An implemented API or passing local suite does not establish a
completed browser journey or deployment.

## HTTP Applications

- [Edge routing](surfaces/edge.md): the unified Page, administration,
  capability and asset application.
- [Page languages and routes](surfaces/page-routes.md): localized URLs,
  redirects, deletion and recovery.
- [Dynamic page indexing](surfaces/page-indexing.md): metadata projection and
  sitemap discovery through selected gateway capabilities.
- [Email templates](architecture/email-templates.md): immutable publications, account
  associations, selected Providers and explicit default installation.
- [Access and authentication](surfaces/access-authentication.md): provider-owned
  identity, account flows, administrator grants and Edge-applied session effects.

## Images And UI Quality

- [Files and responsive images](images/README.md).
- [UI contracts](quality/ui-contracts.md): binding ownership, browser request
  diagnostics, source/form checks and current scanner limitations.
- [npm publication confirmation (2026-11-25)](quality/2026-11-25-npm-publication-confirmation.md): delayed availability, bounded read retries and immutable recovery.
- [Docker publication identity correction (2026-11-25)](quality/2026-11-25-docker-publication-identity.md): real registry publication and exact-build retry coverage.
- [Phased publication verification (2026-11-25)](quality/2026-11-25-publication-phases.md)
- [Publication refusal diagnostics (2026-11-25)](quality/2026-11-25-publication-diagnostics.md)
- [Default HTTP error documents — 2026-11-25](quality/2026-11-25-default-error-pages.md): unbranded offline design, French/English negotiation, host isolation and maintenance fallbacks.
- [System upgrade maintenance Pages — 2026-11-25](quality/2026-11-25-system-upgrade-maintenance-pages.md): independent proxy snapshots, public capture, TLS and crash recovery evidence.
- [Access business Events review — 2026-11-24](quality/2026-11-24-access-business-events.md): opaque account references, ADMIN profile reads, optional email workflows, atomic capture and recovery evidence.
- [Events and Workflow end-to-end verification — 2026-11-24](quality/2026-11-24-workflows-e2e.md): functional journeys, corrections, browser evidence and unresolved measured-performance failures.
- [Shared resolved schemas review — 2026-11-24](quality/2026-11-24-resolved-schemas.md): shared Event/capability typing, durable authority, explicit filters and validation evidence.
- [Events and Workflow reliability review — 2026-11-24](quality/2026-11-24-events-workflows-reliability.md): trigger generations, source identity, publication recovery, batched fanout, schema seals and retention evidence.
- [Events and Workflow implementation review — 2026-11-23](quality/2026-11-23-events-workflows-review.md): scope, tested authority/recovery boundaries and full verification evidence.
- [Email Templates upgrade and rendering review — 2026-11-21](quality/2026-11-21-email-templates-upgrade-review.md):
  previous-release upgrades, durable initialization, disabled email and render allocation bounds.
- [Email Templates storage review — 2026-11-21](quality/2026-11-21-email-templates-storage-review.md):
  removal of total count quotas, separate publications and interrupted-write recovery.
- [Email Templates implementation review — 2026-11-21](quality/2026-11-21-email-templates-review.md):
  account integration, isolation, storage bounds and complete validation evidence.
- [Content correction evidence — 2026-11-18](quality/2026-11-18-content-recovery.md):
  dated review fixes, regression coverage and verification limits.

- [Reviewed Release Upgrades](architecture/release-upgrades.md): resource identity,
  usage inventories, reviewed switches, grants and Provider retention.
