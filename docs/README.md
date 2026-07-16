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

- [api-folder.md](./api-folder.md) documents the file-routed REST API convention
  used by `@bernouy/cms-control`.
- [static-folder.md](./static-folder.md) documents the static HTML routing and
  template system used by `@bernouy/cms-control`.

## Authoring And Sources

- [cms-bloc-development.md](./cms-bloc-development.md) documents the contracts
  for authored blocs and editor-facing bloc code.
- [auth-system-source.md](./auth-system-source.md) documents the readonly
  system auth source exposed through `/.cms/sources/system-auth/*`.

## Design Plans

- [Newsletter Broadcast Plan](../BROADCAST_PLAN.md) describes the durable
  campaign architecture that should replace the smoke-test newsletter emailer
  function for large sends.
- [Stripe Connect C2C Protected Buyer Plan](../STRIPE_CONNECT_C2C_PROCTED_BUYER.md)
  defines mandatory protected C2C settlement, Commerce-owned fee policy,
  marketplace claims, refunds, and Stripe reconciliation.
