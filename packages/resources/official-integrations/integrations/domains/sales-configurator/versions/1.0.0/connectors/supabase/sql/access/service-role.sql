grant usage on schema sales_configurator to service_role;

revoke all on all tables in schema sales_configurator from service_role;
revoke all on all sequences in schema sales_configurator from service_role;
revoke all on all functions in schema sales_configurator from service_role;
alter default privileges in schema sales_configurator
    revoke all on tables from service_role;
alter default privileges in schema sales_configurator
    revoke all on sequences from service_role;
alter default privileges in schema sales_configurator
    revoke execute on functions from service_role;

grant select on
    sales_configurator.catalog_items,
    sales_configurator.catalog_modules,
    sales_configurator.catalog_variants,
    sales_configurator.catalog_features,
    sales_configurator.variant_features,
    sales_configurator.catalog_requirements,
    sales_configurator.partner_accounts,
    sales_configurator.partner_capabilities,
    sales_configurator.clients,
    sales_configurator.proposals,
    sales_configurator.proposal_versions,
    sales_configurator.proposal_items,
    sales_configurator.proposal_shares,
    sales_configurator.proposal_events
to service_role;

grant insert, update on
    sales_configurator.catalog_items,
    sales_configurator.catalog_modules,
    sales_configurator.catalog_variants,
    sales_configurator.catalog_features,
    sales_configurator.variant_features,
    sales_configurator.catalog_requirements,
    sales_configurator.partner_accounts,
    sales_configurator.partner_capabilities,
    sales_configurator.clients,
    sales_configurator.proposals,
    sales_configurator.proposal_versions,
    sales_configurator.proposal_shares
to service_role;

grant insert on
    sales_configurator.proposal_items,
    sales_configurator.proposal_events
to service_role;

grant delete on
    sales_configurator.variant_features,
    sales_configurator.catalog_requirements,
    sales_configurator.partner_capabilities,
    sales_configurator.proposal_items
to service_role;

grant usage, select on all sequences in schema sales_configurator to service_role;

grant execute on function
    sales_configurator.require_json_object(jsonb, text),
    sales_configurator.require_bounded_text(text, text, integer),
    sales_configurator.optional_bounded_text(text, text, integer),
    sales_configurator.json_alias_text(jsonb, text, text),
    sales_configurator.json_has_alias(jsonb, text, text),
    sales_configurator.catalog_item_json(bigint),
    sales_configurator.upsert_catalog_module(bigint, jsonb),
    sales_configurator.upsert_catalog_feature(bigint, jsonb),
    sales_configurator.upsert_catalog_variant(bigint, jsonb),
    sales_configurator.upsert_variant_feature(bigint, bigint, jsonb),
    sales_configurator.delete_variant_feature(bigint, bigint),
    sales_configurator.upsert_catalog_requirement(bigint, bigint),
    sales_configurator.delete_catalog_requirement(bigint, bigint),
    sales_configurator.require_partner(text, text),
    sales_configurator.upsert_partner_account(bigint, text, jsonb),
    sales_configurator.set_partner_capability(bigint, text, boolean),
    sales_configurator.save_partner_client(text, bigint, jsonb),
    sales_configurator.proposal_item_json(bigint),
    sales_configurator.proposal_version_items_json(bigint),
    sales_configurator.partner_proposal_version_json(bigint),
    sales_configurator.proposal_shares_json(bigint),
    sales_configurator.proposal_events_json(bigint),
    sales_configurator.public_proposal_items_json(bigint),
    sales_configurator.partner_proposal_json(bigint, text),
    sales_configurator.read_partner_proposal(text, bigint),
    sales_configurator.admin_proposal_json(bigint),
    sales_configurator.lock_draft_catalog(),
    sales_configurator.assert_draft_selection_shape(jsonb, jsonb),
    sales_configurator.validate_draft_selection(jsonb, jsonb),
    sales_configurator.insert_draft_catalog_snapshot(bigint, jsonb),
    sales_configurator.rebuild_draft_snapshot(bigint, jsonb, jsonb),
    sales_configurator.prepare_partner_proposal_draft(text, bigint, bigint, jsonb),
    sales_configurator.save_partner_proposal_draft(
        text, bigint, bigint, jsonb, jsonb, jsonb
    ),
    sales_configurator.publish_partner_proposal(text, bigint, bigint, bigint),
    sales_configurator.create_partner_proposal_share(
        text, bigint, timestamptz, text
    ),
    sales_configurator.revoke_partner_proposal_share(text, bigint, bigint),
    sales_configurator.read_shared_proposal(text),
    sales_configurator.transition_admin_proposal(text, bigint, text)
to service_role;
