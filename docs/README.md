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

- [Bloc Authoring](./blocs/README.md) documents how to create blocs, expose
  editor capabilities, bind Sources, design themeable CSS, test, and publish.
- [Integration development](./integrations/README.md) documents local-first
  integration versioning, audits, upgrade fixtures, releases, and the remote
  publication contract.
- [Integration settings and Health](./integrations/management.md) documents
  integration-owned configuration, scoped references, declared actions, and
  read-only health observations after installation.
- [auth-system-source.md](./auth-system-source.md) documents the readonly
  system auth source exposed through `/.cms/sources/system-auth/*`.

## Images

- [Responsive images](./images/README.md) explains ownership, authoring,
  Delivery optimization, browser selection, caching, and rollout for responsive
  images.

## Design Plans

- [Commerce Notifications](../NOTIFICATIONS.md) documents the native,
  replaceable buyer notification queue, template contract, and delivery modes.
- [Scheduled Triggers](../SCHEDULED_TRIGGERS_PLAN.md) documents declarative
  recurring integration work, distributed claims, runtime defaults, and
  operational controls.
- [Newsletter Broadcast Plan](../BROADCAST_PLAN.md) describes the durable
  campaign architecture that should replace the smoke-test newsletter emailer
  function for large sends.
- [Stripe Connect C2C Protected Buyer Plan](../STRIPE_CONNECT_C2C_PROCTED_BUYER.md)
  defines mandatory protected C2C settlement, Commerce-owned fee policy,
  marketplace claims, refunds, and Stripe reconciliation.
