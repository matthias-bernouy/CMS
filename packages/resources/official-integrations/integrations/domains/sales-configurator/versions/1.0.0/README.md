# Sales Configurator 1.0.0

Sales Configurator is the official CPQ-style integration for building modular
commercial proposals from a managed catalogue.

The integration separates three audiences:

- CMS administrators manage the catalogue and inspect all proposals.
- Authenticated, integration-approved sales partners manage only their own
  clients and proposals.
- Clients read one published proposal version through a revocable share token.

## V1 scope

V1 includes:

- modules, variants, reusable features, contextual pricing, and simple
  all-of prerequisites;
- partner-owned client profiles and proposals, with optional company identity,
  contact role, and postal details;
- immutable published proposal versions with structured snapshot lines;
- fixed, included, and quote-only prices;
- custom quote-only requests;
- revocable and expiring public share links;
- first/last view tracking and an append-only event timeline;
- integration-owned partner accounts and composable partner capabilities;
- CMS catalogue and proposal dashboards;
- six light-DOM delivery blocs: client directory, catalog browser, proposal
  list, first-draft starter, builder, and client view.

V1 intentionally excludes:

- automated email delivery and reminders;
- electronic signatures;
- attachments;
- a general CRM pipeline;
- discounts, taxes, multi-currency, and recurring billing;
- OR prerequisites, conflicts, recommendations, and arbitrary rule
  expressions.

## Design documents

- [Domain model](docs/domain-model.md)
- [Access model](docs/access-model.md)
- [Sources, dashboards, blocs, and tests](docs/v1-contracts.md)

## Connector boundary

The Supabase schema is private. Browser code never talks to it directly.
CmsCore's source proxy authenticates and authorizes callers, injects the CMS
subject, and calls the Edge Function with a generated integration secret.

The Edge Function uses the Supabase secret key and therefore bypasses RLS.
Ownership is consequently enforced again inside transactional SQL functions;
RLS and revoked grants remain defense in depth for accidental Data API access.

## Commerce boundary

Sales Configurator is not an extension of the Commerce integration:

- Commerce owns a transactional storefront catalogue, marketplace offers,
  orders, settlements, and fulfilment.
- Sales Configurator owns pre-sales packages, contextual options,
  prerequisites, clients, and proposal snapshots.

V1 has no dependency on Commerce and no foreign key into its schema. A future
optional bridge integration may map an accepted proposal snapshot to Commerce
products, a cart, an order, or a payment flow. That bridge must use published
source contracts or events rather than coupling the two schemas.

## Pricing authority

The browser submits selections, never authoritative labels, prices, totals, or
prerequisite results. The server:

1. resolves the published catalogue rows;
2. validates one variant per selected module;
3. expands included features;
4. validates every prerequisite;
5. computes all fixed totals;
6. stores a complete snapshot.

Editing a published proposal creates a new draft version. Existing published
versions and their items are immutable. Each draft save also advances an
optimistic revision checked at publication time.
