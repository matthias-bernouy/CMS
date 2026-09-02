comment on schema sales_configurator is
    'Private catalogue and proposal configurator owned by cms-sales-configurator.';
comment on table sales_configurator.catalog_items is
    'Shared identity and publication state for module, variant, and feature catalogue items.';
comment on table sales_configurator.catalog_variants is
    'Module-scoped commercial variants with authoritative fixed or quote pricing.';
comment on table sales_configurator.variant_features is
    'Contextual inclusion and pricing of one feature within one variant.';
comment on table sales_configurator.catalog_requirements is
    'Acyclic all-of prerequisite edges between catalogue item identities.';
comment on table sales_configurator.partner_accounts is
    'Integration-owned entitlement linked to one trusted immutable CMS user id.';
comment on table sales_configurator.partner_capabilities is
    'Small explicit capability set for partner operations; not a CMS role replacement.';
comment on table sales_configurator.clients is
    'Private partner-owned sales clients selected through the trusted CMS actor.';
comment on table sales_configurator.proposals is
    'Partner-owned proposal aggregate and current lifecycle status.';
comment on table sales_configurator.proposal_versions is
    'Server-priced immutable published snapshots with frozen public and contact fields.';
comment on table sales_configurator.proposal_items is
    'Hierarchical catalogue and custom line snapshots; custom V1 lines are quote-only.';
comment on table sales_configurator.proposal_shares is
    'Revocable public selectors containing only SHA-256 token hashes, never raw tokens.';
comment on table sales_configurator.proposal_events is
    'Append-only proposal lifecycle audit trail.';

comment on function sales_configurator.save_partner_proposal_draft(
    bigint, bigint, bigint, jsonb, jsonb, jsonb
) is
    'Validates ownership and prerequisites, snapshots server prices, and saves one draft atomically.';
comment on function sales_configurator.publish_partner_proposal(
    bigint, bigint, bigint, bigint
) is
    'Publishes exactly the expected draft revision and atomically supersedes the previous version.';
comment on function sales_configurator.read_shared_proposal(text) is
    'Uniform unavailable public lookup that records a valid share view and returns a strict DTO.';
